/**
 * NotificationQueueService — bounded periodic retry scheduler (Phase 19).
 *
 * A singleton worker (mirroring otpCleanupService) that drains the delivery
 * ledger: every tick it finds records in "pending" state (not delivered,
 * attempts left, retry time passed) and re-attempts them through
 * NotificationService.deliverOrderNotifications. Running is idempotent —
 * each attempt is claimed atomically, so overlapping ticks/manual retries
 * can never send the same SMS twice.
 *
 * Runtime policy is env-driven so tests stay hermetic:
 *   NOTIFICATION_QUEUE_INTERVAL_MS  tick period (default 60s)
 *   NOTIFICATION_QUEUE_RUN_LIMIT    orders capped per run (default 50)
 *   NOTIFICATION_MAX_ATTEMPTS       retry budget per record (default 3)
 *   NOTIFICATION_RETRY_BACKOFF_MS   linear backoff step (default 60s)
 *
 * In the test environment the worker is NOT auto-started (server.js guards
 * on NODE_ENV), but runOnce()/triggerRun() stay fully usable for tests and
 * the admin "retry now" endpoint.
 */
const Order = require("../models/Order");
const logger = require("../utils/logger");
const NotificationService = require("./NotificationService");

const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_RUN_LIMIT = 50;

class NotificationQueueService {
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
    const v = Number.parseInt(process.env.NOTIFICATION_QUEUE_INTERVAL_MS || "", 10);
    return Number.isInteger(v) && v >= 1000 ? v : DEFAULT_INTERVAL_MS;
  }

  get runLimit() {
    const v = Number.parseInt(process.env.NOTIFICATION_QUEUE_RUN_LIMIT || "", 10);
    return Number.isInteger(v) && v >= 1 ? v : DEFAULT_RUN_LIMIT;
  }

  /** Orders carrying at least one pending (retry-eligible) deliverable record. */
  findPendingOrders({ now = new Date(), limit = this.runLimit } = {}) {
    const max = NotificationService.maxAttemptsOf();
    return Order.find({
      origin: "storefront",
      notifications: {
        $elemMatch: {
          channel: { $in: ["sms", "email"] },
          delivered: false,
          attempts: { $lt: max },
          $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
        },
      },
    })
      .select("_id")
      .limit(limit)
      .lean();
  }

  /**
   * One bounded sweep of the queue.
   * @returns {Promise<{scanned:number, attempted:number, delivered:number, failed:number, skipped:number}>}
   */
  async runOnce({ limit = this.runLimit, now = new Date() } = {}) {
    const max = NotificationService.maxAttemptsOf();
    const backoff = NotificationService.backoffMsOf();
    const start = Date.now();

    let rows;
    try {
      rows = await this.findPendingOrders({ now, limit });
    } catch (err) {
      logger.error("Notification queue scan failed", { error: err.message });
      throw err;
    }

    let attempted = 0;
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    for (const row of rows) {
      const partial = await NotificationService.deliverOrderNotifications(row._id, {
        now,
        maxAttempts: max,
        backoffMs: backoff,
      });
      attempted += partial.attempted;
      delivered += partial.delivered;
      failed += partial.failed;
      skipped += partial.skipped;
    }

    const summary = {
      scanned: rows.length,
      attempted,
      delivered,
      failed,
      skipped,
      durationMs: Date.now() - start,
    };
    this.stats.runs += 1;
    this.stats.lastRunAt = new Date();
    this.stats.lastRunStats = summary;
    logger.info("Notification queue run completed", summary);
    return summary;
  }

  /** One drain + retry immediately (also used by the admin "retry now"). */
  async triggerRun() {
    logger.info("Manual notification queue run triggered");
    return this.runOnce();
  }

  start() {
    if (this.isRunning) {
      logger.warn("Notification queue service is already running");
      return;
    }
    logger.info("Starting notification queue service", { intervalMs: this.intervalMs });
    this.isRunning = true;
    this.interval = setInterval(() => {
      void this.runOnce().catch((err) =>
        logger.error("Notification queue tick failed", { error: err.message }),
      );
    }, this.intervalMs);
    setImmediate(() => {
      void this.runOnce().catch((err) =>
        logger.error("Notification queue initial run failed", { error: err.message }),
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
    logger.info("Notification queue service stopped");
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      config: {
        intervalMs: this.intervalMs,
        runLimit: this.runLimit,
        maxAttempts: NotificationService.maxAttemptsOf(),
        backoffMs: NotificationService.backoffMsOf(),
      },
    };
  }
}

const notificationQueueService = new NotificationQueueService();
module.exports = notificationQueueService;
module.exports.NotificationQueueService = NotificationQueueService;