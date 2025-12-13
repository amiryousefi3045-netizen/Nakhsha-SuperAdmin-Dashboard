/**
 * Background cleanup service for OTP system
 */

const OtpCode = require("../models/OtpCode");
const logger = require("../utils/logger");

class OtpCleanupService {
  constructor() {
    this.isRunning = false;
    this.cleanupInterval = null;
    this.failedAttemptsInterval = null;
    this.stats = {
      totalCleaned: 0,
      lastRunAt: null,
      lastRunStats: null,
    };
  }

  /**
   * Start the cleanup service
   */
  start() {
    if (this.isRunning) {
      logger.warn("OTP cleanup service is already running");
      return;
    }

    logger.info("Starting OTP cleanup service");
    this.isRunning = true;

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      await this.runCleanup();
    }, 5 * 60 * 1000); // 5 minutes

    // Run cleanup on failed attempts every hour
    this.failedAttemptsInterval = setInterval(async () => {
      await this.cleanupFailedAttempts();
    }, 60 * 60 * 1000); // 1 hour

    // Run initial cleanup
    setImmediate(() => this.runCleanup());

    logger.info("OTP cleanup service started successfully");
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (!this.isRunning) {
      logger.warn("OTP cleanup service is not running");
      return;
    }

    logger.info("Stopping OTP cleanup service");

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.failedAttemptsInterval) {
      clearInterval(this.failedAttemptsInterval);
      this.failedAttemptsInterval = null;
    }

    this.isRunning = false;
    logger.info("OTP cleanup service stopped");
  }

  /**
   * Run the main cleanup process
   */
  async runCleanup() {
    const startTime = Date.now();
    let cleanedCount = 0;
    let errors = 0;

    try {
      logger.debug("Running OTP cleanup...");

      // Clean expired OTP codes
      const expiredResult = await OtpCode.deleteMany({
        expiresAt: { $lt: new Date() },
      });
      cleanedCount += expiredResult.deletedCount || 0;

      // Clean old OTP codes (older than 24 hours, regardless of expiration)
      const oldCodesResult = await OtpCode.deleteMany({
        createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
      cleanedCount += oldCodesResult.deletedCount || 0;

      // Update statistics
      this.stats.totalCleaned += cleanedCount;
      this.stats.lastRunAt = new Date();
      this.stats.lastRunStats = {
        cleanedCount,
        expiredCount: expiredResult.deletedCount || 0,
        oldCount: oldCodesResult.deletedCount || 0,
        duration: Date.now() - startTime,
        errors,
      };

      if (cleanedCount > 0) {
        logger.info("OTP cleanup completed", this.stats.lastRunStats);
      } else {
        logger.debug("OTP cleanup completed - no records to clean");
      }
    } catch (error) {
      errors++;
      logger.error("OTP cleanup failed", {
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime,
      });

      this.stats.lastRunStats = {
        cleanedCount,
        duration: Date.now() - startTime,
        errors,
        error: error.message,
      };
    }
  }

  /**
   * Clean up records with excessive failed attempts
   */
  async cleanupFailedAttempts() {
    const startTime = Date.now();
    let cleanedCount = 0;

    try {
      logger.debug("Cleaning up failed OTP attempts...");

      // Reset attempts for codes older than 1 hour with failed attempts
      const resetResult = await OtpCode.updateMany(
        {
          attempts: { $gte: 5 },
          lastSentAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) },
        },
        {
          $set: { attempts: 0 },
        }
      );

      // Delete codes with excessive attempts (more than 10) that are older than 2 hours
      const deleteResult = await OtpCode.deleteMany({
        attempts: { $gte: 10 },
        lastSentAt: { $lt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });

      cleanedCount =
        (resetResult.modifiedCount || 0) + (deleteResult.deletedCount || 0);

      if (cleanedCount > 0) {
        logger.info("Failed attempts cleanup completed", {
          resetCount: resetResult.modifiedCount || 0,
          deletedCount: deleteResult.deletedCount || 0,
          duration: Date.now() - startTime,
        });
      }
    } catch (error) {
      logger.error("Failed attempts cleanup failed", {
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime,
      });
    }
  }

  /**
   * Get cleanup statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      intervals: {
        cleanup: !!this.cleanupInterval,
        failedAttempts: !!this.failedAttemptsInterval,
      },
    };
  }

  /**
   * Manual cleanup trigger (for testing or maintenance)
   */
  async triggerCleanup() {
    logger.info("Manual OTP cleanup triggered");
    await this.runCleanup();
    await this.cleanupFailedAttempts();
  }
}

// Create singleton instance
const otpCleanupService = new OtpCleanupService();

module.exports = otpCleanupService;
