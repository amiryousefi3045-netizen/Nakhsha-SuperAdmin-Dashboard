/**
 * NotificationService — outbound buyer notifications (Phase 18).
 *
 * The pipeline is fire-and-forget by contract: a status transition in
 * OrderService records a PENDING notification on the order (same save), then
 * kicks deliverOrderNotifications off-loop. Delivery state is observable on
 * the order (`notifications[]`) and retryable — `delivered: false` is exactly
 * the set of notifications a future scheduler should re-attempt.
 *
 * Invariants pinned by tests:
 *   - Only STOREFRONT orders with a real buyer get notifications; seller
 *     hand-entered orders never do.
 *   - Notified statuses: confirmed, processing, shipped, delivered, cancelled,
 *     returned. A fresh `pending` order is never announced.
 *   - A delivery failure NEVER throws out of this service (the notification
 *     record's `error` carries the failure; the caller's reply is unaffected).
 */
const Order = require("../models/Order");
const logger = require("../utils/logger");
const { sendSms } = require("./sms/melipayamakSms");

const STATUS_MESSAGES = {
  confirmed: "سفارش شما تأیید شد",
  processing: "سفارش شما در حال آماده‌سازی است",
  shipped: "سفارش شما ارسال شد",
  delivered: "سفارش شما تحویل داده شد",
  cancelled: "سفارش شما لغو شد",
  returned: "سفارش شما مرجوع شد",
};

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

/** Only real storefront buyers with a deliverable phone get notified. */
function hasNotificationTarget(order) {
  return (
    order.origin === "storefront" &&
    Boolean(order.buyerUserId) &&
    Boolean(order.customer && order.customer.phone)
  );
}

/**
 * Drain every PENDING sms notification on one order (idempotent). Each record
 * is updated atomically by its subdocument _id, so concurrent dispatch cannot
 * clobber other records. Never rejects.
 */
async function deliverOrderNotifications(orderId) {
  try {
    const order = await Order.findById(orderId);
    if (!order || !hasNotificationTarget(order)) return;

    for (const n of order.notifications) {
      if (n.delivered || n.channel !== "sms") continue;
      const message = buildOrderStatusMessage(order, n.status, n.reason);

      const mark = (patch) =>
        Order.updateOne(
          { _id: order._id, "notifications._id": n._id },
          { $set: { "notifications.$.message": message, ...patch } },
        );

      try {
        await sendSms(n.to, message, { kind: "order-status", orderId: String(order._id) });
        await mark({ "notifications.$.delivered": true, "notifications.$.error": "" });
      } catch (err) {
        logger.warn("Order notification SMS failed", {
          orderId: String(order._id),
          status: n.status,
          error: err.message,
        });
        await mark({ "notifications.$.error": String(err.message || "ارسال ناموفق").slice(0, 500) });
      }
    }
  } catch (err) {
    logger.error("deliverOrderNotifications failed", { orderId: String(orderId), error: err.message });
  }
}

/**
 * Retry seam for a future scheduler: drain all pending sms notifications in the
 * system (orders with at least one undelivered storefront notification).
 */
async function flushPendingNotifications() {
  const orders = await Order.find({
    origin: "storefront",
    "notifications.delivered": false,
  })
    .select("_id")
    .lean();
  await Promise.all(orders.map((o) => deliverOrderNotifications(o._id)));
}

module.exports = {
  STATUS_MESSAGES,
  buildOrderStatusMessage,
  hasNotificationTarget,
  deliverOrderNotifications,
  flushPendingNotifications,
};