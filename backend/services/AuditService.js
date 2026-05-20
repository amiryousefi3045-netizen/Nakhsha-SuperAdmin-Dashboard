/**
 * Audit Service
 * Centralized audit logging for all sensitive operations
 *
 * Usage:
 *   await auditService.log({
 *     userId: req.user.id,
 *     action: 'USER_UPDATED',
 *     resource: { type: 'USER', id: targetUserId },
 *     changes: { before: {...}, after: {...} },
 *     result: 'SUCCESS',
 *     requestContext: req,
 *     riskLevel: 'HIGH'
 *   });
 */

const AuditLog = require("../models/AuditLog");
const logger = require("../utils/logger");

class AuditService {
  /**
   * Log an audit event
   */
  static async log(params) {
    try {
      const {
        userId,
        action,
        resource,
        changes,
        result = "SUCCESS",
        error,
        requestContext,
        riskLevel = "LOW",
        metadata = {},
        compliance = {},
      } = params;

      // Extract request context
      const context = {
        ip: requestContext?.ip || "unknown",
        userAgent: requestContext?.get?.("user-agent") || "unknown",
        referer: requestContext?.get?.("referer") || null,
        endpoint: requestContext?.originalUrl || null,
        method: requestContext?.method || null,
        statusCode: requestContext?.statusCode || null,
      };

      // Build changes object
      const changesObj = changes || {};

      // Assess risk if not provided
      let assessedRiskLevel = riskLevel;
      if (!riskLevel || riskLevel === "LOW") {
        assessedRiskLevel = this._assessRiskLevel(action, resource);
      }

      // Compliance assessment
      const complianceData = {
        gdprRelevant: this._isGdprRelevant(action),
        dataCategories: this._getDataCategories(action, resource),
        retentionRequired: this._isRetentionRequired(action),
        retentionUntil: this._calculateRetentionDate(action),
        ...compliance,
      };

      // Create audit log entry
      const auditLog = new AuditLog({
        userId,
        action,
        resource,
        changes: changesObj,
        result,
        error: error
          ? {
              code: error.code || "UNKNOWN",
              message: error.message,
              // Only include stack in dev/staging
              stack: process.env.NODE_ENV !== "production" ? error.stack : null,
            }
          : null,
        requestContext: context,
        riskLevel: assessedRiskLevel,
        metadata,
        compliance: complianceData,
      });

      // Save to database
      await auditLog.save();

      // Log high-risk events immediately
      if (assessedRiskLevel === "CRITICAL" || assessedRiskLevel === "HIGH") {
        logger.warn(`🚨 HIGH-RISK AUDIT EVENT: ${action}`, {
          auditId: auditLog._id,
          userId,
          action,
          resource,
          riskLevel: assessedRiskLevel,
          ip: context.ip,
          result,
        });
      }

      return auditLog;
    } catch (error) {
      logger.error("Failed to create audit log", {
        error: error.message,
        params: {
          userId: params.userId,
          action: params.action,
        },
      });
      // Don't throw - audit logging failure shouldn't break the operation
    }
  }

  /**
   * Assess risk level for an action
   */
  static _assessRiskLevel(action, resource) {
    const criticalActions = [
      "ADMIN_USER_DELETED",
      "ADMIN_USER_BANNED",
      "ADMIN_ROLE_ASSIGNED",
      "USER_DELETED",
      "SUSPICIOUS_ACTIVITY_DETECTED",
      "BRUTE_FORCE_ATTEMPT",
      "IP_BLOCKED",
    ];

    const highRiskActions = [
      "ADMIN_CONTENT_REMOVED",
      "USER_VERIFIED",
      "USER_ROLE_CHANGED",
      "VERIFICATION_REVOKED",
      "PAYMENT_FAILED",
      "TRANSACTION_DISPUTED",
    ];

    if (criticalActions.includes(action)) {
      return "CRITICAL";
    }
    if (highRiskActions.includes(action)) {
      return "HIGH";
    }
    if (
      ["USER_CREATED", "LOGIN", "SESSION_CREATED", "DATA_EXPORTED"].includes(
        action,
      )
    ) {
      return "MEDIUM";
    }
    return "LOW";
  }

  /**
   * Check if action is GDPR-relevant
   */
  static _isGdprRelevant(action) {
    const gdprActions = [
      "USER_CREATED",
      "USER_UPDATED",
      "USER_DELETED",
      "DATA_EXPORTED",
      "DATA_BULK_OPERATION",
      "LOGIN",
    ];
    return gdprActions.includes(action);
  }

  /**
   * Get data categories for compliance
   */
  static _getDataCategories(action, resource) {
    const categories = [];

    if (action.includes("USER") || action.includes("PAYMENT")) {
      categories.push("PERSONAL_DATA");
    }
    if (action.includes("PAYMENT") || action.includes("TRANSACTION")) {
      categories.push("FINANCIAL_DATA");
    }
    if (action.includes("VERIFIED") || action.includes("VERIFICATION")) {
      categories.push("VERIFICATION_DATA");
    }

    return categories;
  }

  /**
   * Check if retention is required
   */
  static _isRetentionRequired(action) {
    const retentionRequired = [
      "PAYMENT_RECEIVED",
      "PAYMENT_FAILED",
      "REFUND_ISSUED",
      "TRANSACTION_DISPUTED",
      "USER_DELETED",
      "ADMIN_USER_DELETED",
    ];
    return retentionRequired.includes(action);
  }

  /**
   * Calculate retention date
   */
  static _calculateRetentionDate(action) {
    // Default: 3 years for financial transactions, 1 year for others
    const isFinancial =
      action.includes("PAYMENT") || action.includes("TRANSACTION");
    const retentionYears = isFinancial ? 7 : 3; // 7 years for financial, 3 for others

    const date = new Date();
    date.setFullYear(date.getFullYear() + retentionYears);
    return date;
  }

  /**
   * Get audit logs for a user
   */
  static async getUserAuditLogs(userId, options = {}) {
    const { limit = 100, skip = 0, action, startDate, endDate } = options;

    const query = { userId };

    if (action) {
      query.action = action;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    try {
      const logs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select("-changes.before"); // Don't send old values by default

      const total = await AuditLog.countDocuments(query);

      return { logs, total, limit, skip };
    } catch (error) {
      logger.error("Failed to get audit logs", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get audit logs for a resource
   */
  static async getResourceAuditLogs(resourceType, resourceId, options = {}) {
    const { limit = 100, skip = 0 } = options;

    try {
      const logs = await AuditLog.find({
        "resource.type": resourceType,
        "resource.id": resourceId,
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      const total = await AuditLog.countDocuments({
        "resource.type": resourceType,
        "resource.id": resourceId,
      });

      return { logs, total, limit, skip };
    } catch (error) {
      logger.error("Failed to get resource audit logs", {
        resourceType,
        resourceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get high-risk events
   */
  static async getHighRiskEvents(options = {}) {
    const { limit = 100, skip = 0, startDate, endDate } = options;

    const query = {
      riskLevel: { $in: ["HIGH", "CRITICAL"] },
    };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    try {
      const logs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      const total = await AuditLog.countDocuments(query);

      return { logs, total, limit, skip };
    } catch (error) {
      logger.error("Failed to get high-risk events", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get failed operations
   */
  static async getFailedOperations(options = {}) {
    const { limit = 100, skip = 0, startDate, endDate } = options;

    const query = { result: "FAILURE" };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    try {
      const logs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      const total = await AuditLog.countDocuments(query);

      return { logs, total, limit, skip };
    } catch (error) {
      logger.error("Failed to get failed operations", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get logs by action type
   */
  static async getLogsByAction(action, options = {}) {
    const { limit = 100, skip = 0, startDate, endDate } = options;

    const query = { action };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    try {
      const logs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      const total = await AuditLog.countDocuments(query);

      return { logs, total, limit, skip };
    } catch (error) {
      logger.error("Failed to get logs by action", {
        action,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get audit trail for compliance report
   */
  static async getComplianceReport(options = {}) {
    const { startDate, endDate, gdprOnly = false } = options;

    const query = {};

    if (gdprOnly) {
      query["compliance.gdprRelevant"] = true;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    try {
      const logs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .select(
          "userId action resource changes result requestContext.ip createdAt",
        );

      return {
        reportDate: new Date(),
        periodStart: startDate,
        periodEnd: endDate,
        gdprOnly,
        totalEvents: logs.length,
        logs,
      };
    } catch (error) {
      logger.error("Failed to generate compliance report", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Detect suspicious patterns
   */
  static async detectSuspiciousPatterns(timeWindowMinutes = 60) {
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

    try {
      // Multiple failed logins from same IP
      const failedLogins = await AuditLog.aggregate([
        {
          $match: {
            action: "LOGIN",
            result: "FAILURE",
            createdAt: { $gte: cutoffTime },
          },
        },
        {
          $group: {
            _id: "$requestContext.ip",
            count: { $sum: 1 },
            users: { $push: "$userId" },
          },
        },
        { $match: { count: { $gte: 5 } } }, // 5+ failed attempts
      ]);

      // Multiple users from same IP (credential stuffing?)
      const multiUserFromIp = await AuditLog.aggregate([
        {
          $match: {
            action: { $in: ["LOGIN", "SESSION_CREATED"] },
            result: "SUCCESS",
            createdAt: { $gte: cutoffTime },
          },
        },
        {
          $group: {
            _id: "$requestContext.ip",
            userCount: { $addToSet: "$userId" },
          },
        },
        {
          $project: {
            _id: 1,
            userCount: { $size: "$userCount" },
          },
        },
        { $match: { userCount: { $gte: 5 } } }, // 5+ different users from same IP
      ]);

      return {
        timeWindowMinutes,
        suspiciousPatterns: {
          failedLogins,
          multiUserFromIp,
        },
      };
    } catch (error) {
      logger.error("Failed to detect suspicious patterns", {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = AuditService;
