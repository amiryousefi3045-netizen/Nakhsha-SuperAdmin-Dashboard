/**
 * OTP metrics and monitoring service
 */

const logger = require("../utils/logger");

class OtpMetrics {
  constructor() {
    this.stats = {
      // Request metrics
      totalOtpRequests: 0,
      totalOtpVerifications: 0,
      successfulVerifications: 0,
      failedVerifications: 0,

      // SMS metrics
      smsAttempts: 0,
      smsSuccesses: 0,
      smsFailures: 0,

      // Rate limiting metrics
      rateLimitHits: 0,
      suspiciousActivityBlocks: 0,

      // Time metrics
      averageVerificationTime: 0,
      totalVerificationTime: 0,

      // Error metrics
      errors: [],

      // Performance
      slowRequests: 0,

      // Daily stats
      dailyStats: new Map(),

      // Reset time
      startTime: Date.now(),
      lastResetTime: Date.now(),
    };

    // Keep only last 24 hours of daily stats
    setInterval(() => {
      this.cleanOldDailyStats();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Record OTP request
   */
  recordOtpRequest(phone, clientIP, userAgent) {
    this.stats.totalOtpRequests++;
    this.updateDailyStats("requests");

    logger.debug("OTP request recorded", {
      phone,
      clientIP,
      totalRequests: this.stats.totalOtpRequests,
    });
  }

  /**
   * Record SMS attempt
   */
  recordSmsAttempt(phone, success, error = null, duration = 0) {
    this.stats.smsAttempts++;

    if (success) {
      this.stats.smsSuccesses++;
      this.updateDailyStats("smsSuccess");
    } else {
      this.stats.smsFailures++;
      this.updateDailyStats("smsFailure");

      if (error) {
        this.recordError("sms", error, { phone, duration });
      }
    }

    logger.debug("SMS attempt recorded", {
      phone,
      success,
      successRate: this.getSmsSuccessRate(),
      duration,
    });
  }

  /**
   * Record OTP verification attempt
   */
  recordVerificationAttempt(phone, success, duration, clientIP, attempts = 1) {
    const startTime = Date.now();
    this.stats.totalOtpVerifications++;

    if (success) {
      this.stats.successfulVerifications++;
      this.updateDailyStats("verificationSuccess");
    } else {
      this.stats.failedVerifications++;
      this.updateDailyStats("verificationFailure");
    }

    // Update average verification time
    this.stats.totalVerificationTime += duration;
    this.stats.averageVerificationTime =
      this.stats.totalVerificationTime / this.stats.totalOtpVerifications;

    // Track slow requests (> 2 seconds)
    if (duration > 2000) {
      this.stats.slowRequests++;
    }

    logger.debug("OTP verification recorded", {
      phone,
      clientIP,
      success,
      duration,
      attempts,
      successRate: this.getVerificationSuccessRate(),
    });
  }

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(type, identifier, clientIP) {
    this.stats.rateLimitHits++;
    this.updateDailyStats("rateLimitHits");

    logger.warn("Rate limit hit recorded", {
      type,
      identifier,
      clientIP,
      totalHits: this.stats.rateLimitHits,
    });
  }

  /**
   * Record suspicious activity
   */
  recordSuspiciousActivity(indicators, phone, clientIP, userAgent) {
    this.stats.suspiciousActivityBlocks++;
    this.updateDailyStats("suspiciousBlocks");

    logger.warn("Suspicious activity recorded", {
      indicators,
      phone,
      clientIP,
      userAgent,
      totalBlocks: this.stats.suspiciousActivityBlocks,
    });
  }

  /**
   * Record error
   */
  recordError(type, error, context = {}) {
    const errorRecord = {
      timestamp: new Date(),
      type,
      message: error.message || error,
      stack: error.stack,
      context,
    };

    this.stats.errors.push(errorRecord);

    // Keep only last 100 errors
    if (this.stats.errors.length > 100) {
      this.stats.errors = this.stats.errors.slice(-100);
    }

    logger.error("OTP error recorded", errorRecord);
  }

  /**
   * Update daily statistics
   */
  updateDailyStats(metric) {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    if (!this.stats.dailyStats.has(today)) {
      this.stats.dailyStats.set(today, {
        requests: 0,
        smsSuccess: 0,
        smsFailure: 0,
        verificationSuccess: 0,
        verificationFailure: 0,
        rateLimitHits: 0,
        suspiciousBlocks: 0,
      });
    }

    this.stats.dailyStats.get(today)[metric]++;
  }

  /**
   * Clean old daily stats (keep last 7 days)
   */
  cleanOldDailyStats() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString().split("T")[0];

    for (const [date, stats] of this.stats.dailyStats.entries()) {
      if (date < cutoffDate) {
        this.stats.dailyStats.delete(date);
      }
    }
  }

  /**
   * Calculate success rates
   */
  getSmsSuccessRate() {
    if (this.stats.smsAttempts === 0) return 100;
    return ((this.stats.smsSuccesses / this.stats.smsAttempts) * 100).toFixed(
      2
    );
  }

  getVerificationSuccessRate() {
    if (this.stats.totalOtpVerifications === 0) return 100;
    return (
      (this.stats.successfulVerifications / this.stats.totalOtpVerifications) *
      100
    ).toFixed(2);
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    const uptime = Date.now() - this.stats.startTime;
    const lastReset = Date.now() - this.stats.lastResetTime;

    return {
      summary: {
        totalOtpRequests: this.stats.totalOtpRequests,
        totalVerifications: this.stats.totalOtpVerifications,
        verificationSuccessRate: this.getVerificationSuccessRate() + "%",
        smsSuccessRate: this.getSmsSuccessRate() + "%",
        averageVerificationTime:
          Math.round(this.stats.averageVerificationTime) + "ms",
        rateLimitHits: this.stats.rateLimitHits,
        suspiciousActivityBlocks: this.stats.suspiciousActivityBlocks,
        uptime: Math.round(uptime / 1000) + "s",
        lastResetTime: new Date(this.stats.lastResetTime).toISOString(),
      },
      details: {
        sms: {
          attempts: this.stats.smsAttempts,
          successes: this.stats.smsSuccesses,
          failures: this.stats.smsFailures,
          successRate: this.getSmsSuccessRate() + "%",
        },
        verification: {
          total: this.stats.totalOtpVerifications,
          successful: this.stats.successfulVerifications,
          failed: this.stats.failedVerifications,
          successRate: this.getVerificationSuccessRate() + "%",
          averageTime: Math.round(this.stats.averageVerificationTime) + "ms",
          slowRequests: this.stats.slowRequests,
        },
        security: {
          rateLimitHits: this.stats.rateLimitHits,
          suspiciousActivityBlocks: this.stats.suspiciousActivityBlocks,
          recentErrors: this.stats.errors.slice(-10), // Last 10 errors
        },
      },
      dailyStats: Object.fromEntries(this.stats.dailyStats),
      health: {
        status: this.getHealthStatus(),
        issues: this.getHealthIssues(),
      },
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const issues = this.getHealthIssues();
    if (issues.length === 0) return "healthy";
    if (issues.some((issue) => issue.severity === "critical"))
      return "critical";
    if (issues.some((issue) => issue.severity === "warning")) return "warning";
    return "healthy";
  }

  /**
   * Get health issues
   */
  getHealthIssues() {
    const issues = [];

    // Check SMS success rate
    const smsRate = parseFloat(this.getSmsSuccessRate());
    if (smsRate < 95 && this.stats.smsAttempts > 10) {
      issues.push({
        severity: smsRate < 80 ? "critical" : "warning",
        message: `Low SMS success rate: ${smsRate}%`,
        metric: "sms_success_rate",
        value: smsRate,
      });
    }

    // Check verification success rate
    const verificationRate = parseFloat(this.getVerificationSuccessRate());
    if (verificationRate < 70 && this.stats.totalOtpVerifications > 10) {
      issues.push({
        severity: verificationRate < 50 ? "critical" : "warning",
        message: `Low verification success rate: ${verificationRate}%`,
        metric: "verification_success_rate",
        value: verificationRate,
      });
    }

    // Check for too many rate limit hits
    if (this.stats.rateLimitHits > 100) {
      issues.push({
        severity: "warning",
        message: `High rate limit hits: ${this.stats.rateLimitHits}`,
        metric: "rate_limit_hits",
        value: this.stats.rateLimitHits,
      });
    }

    // Check for too many slow requests
    const slowRequestRate =
      this.stats.totalOtpVerifications > 0
        ? (this.stats.slowRequests / this.stats.totalOtpVerifications) * 100
        : 0;
    if (slowRequestRate > 20) {
      issues.push({
        severity: "warning",
        message: `High slow request rate: ${slowRequestRate.toFixed(2)}%`,
        metric: "slow_requests",
        value: slowRequestRate,
      });
    }

    return issues;
  }

  /**
   * Reset all metrics
   */
  reset() {
    const oldStats = { ...this.stats };
    this.stats = {
      ...this.constructor().stats,
      startTime: this.stats.startTime, // Keep original start time
      lastResetTime: Date.now(),
    };

    logger.info("OTP metrics reset", {
      previousStats: {
        totalRequests: oldStats.totalOtpRequests,
        totalVerifications: oldStats.totalOtpVerifications,
        smsSuccessRate:
          ((oldStats.smsSuccesses / (oldStats.smsAttempts || 1)) * 100).toFixed(
            2
          ) + "%",
        verificationSuccessRate:
          (
            (oldStats.successfulVerifications /
              (oldStats.totalOtpVerifications || 1)) *
            100
          ).toFixed(2) + "%",
      },
    });
  }
}

// Create singleton instance
const otpMetrics = new OtpMetrics();

module.exports = otpMetrics;
