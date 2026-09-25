/**
 * NotificationService — outbound buyer notification engine (Phases 18-19).
 *
 * The pipeline is fire-and-forget by contract: a status transition in
 * OrderService records notifications (sms + optional email) on the order
 * (same save), then kicks deliverOrderNotifications off-loop. The queue
 * scheduler (NotificationQueueService) later re-attempts records that still
 * have `delivered: false`.
 *
 * Delivery ledger per record (subdocument):
 *   - delivered      true once the provider accepted the send.
 *   - error          last failure text ("" on success).
 *   - attempts       incremented atomically on every CLAIM (unique across
 *                    concurrent dispatchers thanks to an atomic inc on the
 *                    matched position).
 *   - lastAttemptAt  when the last attempt ran; nextAttemptAt  when the next
 *                    retry is allowed (exponential-ish linear backoff).
 *
 * Invariants pinned by tests:
 *   - Only STOREFRONT orders with a real buyer get notified; seller-entered
 *     orders never do. SMS needs a phone, email needs an address.
 *   - Notified statuses: confirmed, processing, shipped, delivered, cancelled,
 *     returned. A fresh `pending` order is never announced.
 *   - A delivery failure NEVER throws out of this service.
 *   - Records past `maxAttempts` are given up on (silently skipped), so a
 *     permanently failing recipient cannot burn the queue forever.
 */
const Order = require("../models/Order");
const logger = require("../utils/logger");
const { sendSms } = require("./sms/melipayamakSms");
const { sendEmail } = require("./email/emailSender");
const { sendTelegram } = require("./telegram/telegramSender");
const { buildInvoiceText, buildInvoiceHtml } = require("./email/invoiceHtml");

const STATUS_MESSAGES = {
  confirmed: "سفارش شما تأیید شد",
  processing: "سفارش شما در حال آماده‌سازی است",
  shipped: "سفارش شما ارسال شد",
  delivered: "سفارش شما تحویل داده شد",
  cancelled: "سفارش شما لغو شد",
  returned: "سفارش شما مرجوع شد",
};

/**
 * `reason` marker for the payment-reminder record (Phase 20). The scheduler
 * enqueues it while an order is still `pending`; it is neither a status-change
 * SMS nor ever re-sent once the order leaves pending.
 */
const REMINDER_REASON = "payment_reminder";

/**
 * `reason` marker for the invoice email (Phase 23). Emitted on the payment
 * SUCCESS callback for storefront orders with an email address; delivered as
 * rich HTML through the email channel.
 */
const INVOICE_REASON = "invoice";

/** Email subject for the invoice record. */
function buildInvoiceSubject(order) {
  return `نخشا | فاکتور سفارش ${order.orderNumber}`;
}

/**
 * Compose the buyer-facing SMS body for one transition. Returns "" for statuses
 * we never announce (pending) or unknown ones.
 */
function buildOrderStatusMessage(order, status, reason = "") {
  const template = STATUS_MESSAGES[status];
  if (!template) return "";
  let message = `نخشا | ${template}\nشماره سفارش: ${order.orderNumber}`;
  if (reason) message += `\nدلیل: ${reason}`;
  return message;
}

/** Body of the single payment reminder for a `pending` storefront order. */
function buildPaymentReminderMessage(order) {
  return (
    `نخشا | سفارش شما در انتظار پرداخت است\n` +
    `شماره سفارش: ${order.orderNumber}\n` +
    `برای تکمیل خرید، لطفاً به پروفایل خود مراجعه کنید.`
  );
}

/**
 * Message for one ledger record: status-change templates first; the
 * payment-reminder nudge second; anything else is not announced ("").
 */
function buildNotificationMessage(order, status, reason = "") {
  if (STATUS_MESSAGES[status]) return buildOrderStatusMessage(order, status, reason);
  if (reason === REMINDER_REASON) return buildPaymentReminderMessage(order);
  return "";
}

function maxAttemptsOf() {
  const v = Number.parseInt(process.env.NOTIFICATION_MAX_ATTEMPTS || "", 10);
  if (Number.isInteger(v) && v >= 1) return v;
  return 3;
}

function backoffMsOf() {
  const v = Number.parseInt(process.env.NOTIFICATION_RETRY_BACKOFF_MS || "", 10);
  if (Number.isInteger(v) && v >= 0) return v;
  return 60 * 1000;
}

/** Only real storefront buyers with a deliverable phone get notified. */
function hasNotificationTarget(order) {
  return (
    order.origin === "storefront" &&
    Boolean(order.buyerUserId) &&
    Boolean(order.customer && order.customer.phone)
  );
}

/** Email counterpart: same storefront/buyer rule, but the address must exist. */
function hasEmailTarget(order) {
  return (
    order.origin === "storefront" &&
    Boolean(order.buyerUserId) &&
    Boolean(order.customer && order.customer.email)
  );
}

/** Telegram counterpart: shipping relies on the buyer's linked chat id. */
function hasTelegramTarget(order) {
  return (
    order.origin === "storefront" &&
    Boolean(order.buyerUserId) &&
    Boolean(order.customer && order.customer.telegram)
  );
}

/** Email subject line mirroring the Persian SMS template of the status. */
function buildEmailSubject(order, status, reason = "") {
  const template = STATUS_MESSAGES[status];
  if (!template) return `نخشا | سفارش ${order.orderNumber}`;
  let subject = `نخشا | ${template} — سفارش ${order.orderNumber}`;
  if (reason) subject += ` (${reason})`;
  return subject;
}

/**
 * Machine state of one ledger record at a moment in time:
 *   - "delivered"  → success.
 *   - "pending"    → not delivered, attempts left, retry time passed (or never
 *                   attempted) → eligible for dispatch right now.
 *   - "waiting"    → not delivered, attempts left, retry time in the future
 *                   (backoff not elapsed yet).
 *   - "failed"     → gave up (attempts >= maxAttempts), stays visible to ops.
 */
function notificationRecordState(record, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const max = opts.maxAttempts ?? maxAttemptsOf();
  if (record.delivered) return "delivered";
  const attempts = record.attempts ?? 0;
  if (attempts >= max) return "failed";
  const nxt = record.nextAttemptAt ? new Date(record.nextAttemptAt) : null;
  if (nxt && nxt > now) return "waiting";
  return "pending";
}

/**
 * Deliver every eligible outbound record on one order (idempotent, safe to
 * call from the transition hook AND the scheduler — claims are atomic, so the
 * same record never fires twice). sms → sendSms, email → sendEmail.
 *
 * @param {string} orderId
 * @param {object} [opts] { now, maxAttempts, backoffMs } — now/maxAttempts/backoffMs
 *   override the env-backed defaults (used by the queue scheduler).
 * @returns {Promise<{attempted:number, delivered:number, failed:number, skipped:number}>}
 *   Never rejects.
 */
async function deliverOrderNotifications(orderId, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const max = opts.maxAttempts ?? maxAttemptsOf();
  const backoff = opts.backoffMs ?? backoffMsOf();

  const summary = { attempted: 0, delivered: 0, failed: 0, skipped: 0 };
  try {
    const order = await Order.findById(orderId);
    if (!order || !hasNotificationTarget(order)) return summary;

    for (const n of order.notifications) {
      if (n.delivered) continue;
      if (n.channel !== "sms" && n.channel !== "email" && n.channel !== "telegram") continue;
      // Payment-reminder records are only actionable while the order is still
      // pending. The transition drops them once the order moves on; this guard
      // is the belt-and-suspenders that keeps a stale record from ever firing.
      if (n.status === "pending" && order.status !== "pending") continue;
      const message =
        n.reason === INVOICE_REASON ? buildInvoiceText(order) : buildNotificationMessage(order, n.status, n.reason);

      // CLAIM — atomic inc guards concurrent runners: whoever bumps the count
      // first owns this attempt; a runner that lost the race matches 0 rows.
      // Timing (nextAttemptAt) and the retry budget (attempts) are enforced
      // HERE too, so the engine behaves identically when called directly or
      // through the scheduler.
      const claim = await Order.updateOne(
        {
          _id: order._id,
          notifications: {
            $elemMatch: {
              _id: n._id,
              channel: n.channel,
              delivered: false,
              attempts: { $lt: max },
              $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
            },
          },
        },
        {
          $inc: { "notifications.$.attempts": 1 },
          $set: {
            "notifications.$.lastAttemptAt": now,
            "notifications.$.nextAttemptAt": null,
          },
        },
      );
      if (claim.matchedCount === 0) {
        summary.skipped += 1;
        continue;
      }
      summary.attempted += 1;

      const mark = (patch) =>
        Order.updateOne(
          { _id: order._id, "notifications._id": n._id },
          { $set: { "notifications.$.message": message, ...patch } },
        );

      try {
        if (n.channel === "email" && n.reason === INVOICE_REASON) {
          await sendEmail(
            n.to,
            buildInvoiceSubject(order),
            message,
            { kind: "invoice", orderId: String(order._id), html: buildInvoiceHtml(order) },
          );
        } else if (n.channel === "email") {
          await sendEmail(
            n.to,
            buildEmailSubject(order, n.status, n.reason),
            message,
            { kind: "order-status", orderId: String(order._id) },
          );
        } else if (n.channel === "telegram") {
          await sendTelegram(n.to, message, {
            kind: "order-status",
            orderId: String(order._id),
          });
        } else {
          await sendSms(n.to, message, {
            kind: "order-status",
            orderId: String(order._id),
          });
        }
        await mark({ "notifications.$.delivered": true, "notifications.$.error": "" });
        summary.delivered += 1;
      } catch (err) {
        summary.failed += 1;
        logger.warn("Order notification failed", {
          orderId: String(order._id),
          status: n.status,
          attempts: (n.attempts ?? 0) + 1,
          error: err.message,
        });
        const nextRetry = new Date(now.getTime() + ((n.attempts ?? 0) + 1) * backoff);
        await mark({
          "notifications.$.delivered": false,
          "notifications.$.error": String(err.message || "ارسال ناموفق").slice(0, 500),
          "notifications.$.nextAttemptAt": nextRetry,
        });
      }
    }
  } catch (err) {
    logger.error("deliverOrderNotifications failed", {
      orderId: String(orderId),
      error: err.message,
    });
  }
  return summary;
}

module.exports = {
  STATUS_MESSAGES,
  REMINDER_REASON,
  INVOICE_REASON,
  maxAttemptsOf,
  backoffMsOf,
  buildOrderStatusMessage,
  buildPaymentReminderMessage,
  buildNotificationMessage,
  buildInvoiceSubject,
  buildInvoiceText,
  buildInvoiceHtml,
  hasNotificationTarget,
  hasEmailTarget,
  hasTelegramTarget,
  buildEmailSubject,
  notificationRecordState,
  deliverOrderNotifications,
};