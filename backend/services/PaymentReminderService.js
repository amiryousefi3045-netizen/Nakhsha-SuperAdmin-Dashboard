/**
 * PaymentReminderService — single SMS nudge for abandoned checkouts (Phase 20).
 *
 * A bounded periodic worker (mirroring NotificationQueueService) that finds
 * STOREFRONT orders still `pending` past their grace period and enqueues ONE
 * payment-reminder record on them. Enqueueing is idempotent and atomic: the
 * update guards on `status: "pending"` AND `paymentReminderAt: null`, so
 * overlapping ticks can never double-schedule, and an order that paid or was
 * cancelled in between is skipped.
 *
 * The reminder record rides the existing delivery queue — Notification-
 * QueueService sweeps it like any other `delivered:false` sms record, so
 * attempts/backoff/failure handling are free. Once the order leaves `pending`
 * any undelivered reminder is dropped by OrderService.transitionOrder.
 *
 * Runtime policy is env-driven so tests stay hermetic:
 *   PAYMENT_REMINDER_ENABLED    "false" disables auto-start in server.js
 *   PAYMENT_REMINDER_INTERVAL_MS tick period (default 60s)
 *   PAYMENT_REMINDER_AGE_MS     order age before a reminder is due (default 24h)
 *   PAYMENT_REMINDER_RUN_LIMIT  orders capped per run (default 50)
 */
const Order = require("../models/Order");
const logger = require("../utils/logger");
const NotificationService = require("./NotificationService");

const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RUN_LIMIT = 50;

class PaymentReminderService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.stats = {
      runs: 0,
      lastRunAt: null,
      lastRunStats: null,
    };
  }

  get intervalMs() {
    const v = Number.parseInt(process.env.PAYMENT_REMINDER_INTERVAL_MS || "", 10);
    return Number.isInteger(v) && v >= 1000 ? v : DEFAULT_INTERVAL_MS;
  }

  get ageMs() {
    const v = Number.parseInt(process.env.PAYMENT_REMINDER_AGE_MS || "", 10);
    return Number.isInteger(v) && v >= 0 ? v : DEFAULT_AGE_MS;
  }

  get runLimit() {
    const v = Number.parseInt(process.env.PAYMENT_REMINDER_RUN_LIMIT || "", 10);
    return Number.isInteger(v) && v >= 1 ? v : DEFAULT_RUN_LIMIT;
  }

  /** Storefront orders still pending past the grace period, never nudged yet. */
  findReminderDue({ now = new Date(), limit = this.runLimit } = {}) {
    const cutoff = new Date(now.getTime() - this.ageMs);
    return Order.find({
      origin: "storefront",
      status: "pending",
      buyerUserId: { $ne: null },
      paymentReminderAt: null,
      createdAt: { $lte: cutoff },
      "customer.phone": { $exists: true, $ne: "" },
    })
      .select("_id orderNumber customer.phone")
      .limit(limit)
      .lean();
  }

  /**
   * Atomically enqueue the reminder record (guarded, so it can only ever
   * happen once per order). Returns true when this call OWNED the enqueue.
   */
  async enqueueReminder(row, { now = new Date() } = {}) {
    const claim = await Order.updateOne(
      { _id: row._id, status: "pending", paymentReminderAt: null },
      {
        $set: { paymentReminderAt: now },
        $push: {
          notifications: {
            channel: "sms",
            status: "pending",
            to: row.customer.phone,
            message: NotificationService.buildPaymentReminderMessage(row),
            reason: NotificationService.REMINDER_REASON,
            delivered: false,
            error: "",
            at: now,
          },
        },
      },
    );
    return claim.matchedCount > 0;
  }

  /**
   * One bounded sweep: enqueue reminders (delivery itself happens through the
   * notification queue).
   * @returns {Promise<{scanned:number, reminded:number, skipped:number, durationMs:number}>}
   */
  async runOnce({ limit = this.runLimit, now = new Date() } = {}) {
    const start = Date.now();

    let rows;
    try {
      rows = await this.findReminderDue({ now, limit });
    } catch (err) {
      logger.error("Payment reminder scan failed", { error: err.message });
      throw err;
    }

    let reminded = 0;
    for (const row of rows) {
      if (await this.enqueueReminder(row, { now })) {
        reminded += 1;
        logger.info("Payment reminder enqueued", {
          orderId: String(row._id),
          orderNumber: row.orderNumber,
          to: row.customer.phone,
        });
      }
    }

    const summary = {
      scanned: rows.length,
      reminded,
      skipped: rows.length - reminded,
      durationMs: Date.now() - start,
    };
    this.stats.runs += 1;
    this.stats.lastRunAt = new Date();
    this.stats.lastRunStats = summary;
    logger.info("Payment reminder run completed", summary);
    return summary;
  }

  /** One immediate sweep (tests / manual operators). */
  async triggerRun() {
    logger.info("Manual payment reminder run triggered");
    return this.runOnce();
  }

  start() {
    if (this.isRunning) {
      logger.warn("Payment reminder service is already running");
      return;
    }
    logger.info("Starting payment reminder service", { intervalMs: this.intervalMs });
    this.isRunning = true;
    this.interval = setInterval(() => {
      void this.runOnce().catch((err) =>
        logger.error("Payment reminder tick failed", { error: err.message }),
      );
    }, this.intervalMs);
    setImmediate(() => {
      void this.runOnce().catch((err) =>
        logger.error("Payment reminder initial run failed", { error: err.message }),
      );
    });
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info("Payment reminder service stopped");
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      config: {
        intervalMs: this.intervalMs,
        runLimit: this.runLimit,
        ageMs: this.ageMs,
      },
    };
  }
}

const paymentReminderService = new PaymentReminderService();
module.exports = paymentReminderService;
module.exports.PaymentReminderService = PaymentReminderService;