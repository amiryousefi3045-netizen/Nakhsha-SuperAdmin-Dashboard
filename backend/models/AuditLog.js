const mongoose = require("mongoose");

/**
 * Audit Log Schema
 * Records all sensitive operations for security compliance and investigation
 *
 * Purpose:
 * - GDPR/CCPA compliance (data access tracking)
 * - Security incident investigation
 * - Fraud detection (pattern analysis)
 * - Admin accountability (who changed what)
 * - Regulatory requirements (financial/healthcare)
 */
const auditLogSchema = new mongoose.Schema(
  {
    // Who performed the action
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // What action was performed
    action: {
      type: String,
      enum: [
        // User actions
        "USER_CREATED",
        "USER_UPDATED",
        "USER_DELETED",
        "USER_VERIFIED",
        "USER_ROLE_CHANGED",
        "USER_SUSPENDED",
        "USER_REACTIVATED",

        // Auth actions
        "LOGIN",
        "LOGOUT",
        "LOGOUT_ALL",
        "PASSWORD_CHANGED",
        "TOKEN_REVOKED",
        "SESSION_CREATED",

        // Listing/Content actions
        "LISTING_CREATED",
        "LISTING_UPDATED",
        "LISTING_PUBLISHED",
        "LISTING_DELETED",
        "LISTING_STATUS_CHANGED",
        "LISTING_FLAGGED",
        "LISTING_UNFLAGGED",

        // Craft actions
        "CRAFT_CREATED",
        "CRAFT_UPDATED",
        "CRAFT_DELETED",

        // Admin actions
        "ADMIN_USER_DELETED",
        "ADMIN_USER_BANNED",
        "ADMIN_USER_UNBANNED",
        "ADMIN_CONTENT_REMOVED",
        "ADMIN_VERIFICATION_ISSUED",
        "ADMIN_VERIFICATION_REVOKED",
        "ADMIN_ROLE_ASSIGNED",
        "ADMIN_ROLE_REMOVED",

        // Payment/Financial actions
        "PAYMENT_RECEIVED",
        "PAYMENT_FAILED",
        "REFUND_ISSUED",
        "TRANSACTION_DISPUTED",

        // Data access
        "DATA_EXPORTED",
        "DATA_BULK_OPERATION",
        "REPORT_ACCESSED",

        // Security events
        "SUSPICIOUS_ACTIVITY_DETECTED",
        "BRUTE_FORCE_ATTEMPT",
        "IP_BLOCKED",
      ],
      required: true,
      index: true,
    },

    // What resource was affected
    resource: {
      type: {
        type: String,
        enum: ["USER", "LISTING", "CRAFT", "POST", "ARTISAN", "TRANSACTION"],
        required: true,
      },
      id: mongoose.Schema.Types.ObjectId, // Resource ID
    },

    // State before/after for comparison
    changes: {
      before: mongoose.Schema.Types.Mixed, // Old values
      after: mongoose.Schema.Types.Mixed, // New values
    },

    // Request context
    requestContext: {
      ip: String, // Client IP address
      userAgent: String, // Browser/app identifier
      referer: String, // HTTP referer
      endpoint: String, // API endpoint called
      method: String, // HTTP method (GET, POST, etc)
      statusCode: Number, // HTTP response code
    },

    // Result of the action
    result: {
      type: String,
      enum: ["SUCCESS", "FAILURE", "PARTIAL"],
      default: "SUCCESS",
    },

    // Error details if failed
    error: {
      code: String,
      message: String,
      stack: String, // Only for development/debugging
    },

    // Risk level assessment
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "LOW",
    },

    // Additional context
    metadata: {
      reason: String, // Why the action was performed
      approvedBy: mongoose.Schema.Types.ObjectId, // If admin action, who approved
      batch: String, // For bulk operations, batch identifier
      affectedCount: Number, // For bulk ops, how many items affected
      duration: Number, // How long action took (ms)
    },

    // Compliance fields
    compliance: {
      gdprRelevant: { type: Boolean, default: false },
      dataCategories: [String], // e.g., ["PERSONAL_DATA", "FINANCIAL", "HEALTH"]
      retentionRequired: Boolean, // Must keep for regulatory period
      retentionUntil: Date, // GDPR right to be forgotten
    },
  },
  {
    timestamps: true,
    collection: "auditLogs",
  },
);

// Indexes for common queries
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ "resource.id": 1, createdAt: -1 });
auditLogSchema.index({ "requestContext.ip": 1, createdAt: -1 });
auditLogSchema.index({ riskLevel: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 }); // For timeline queries
auditLogSchema.index({ result: 1, createdAt: -1 }); // Failed operations

// TTL Index: Auto-delete logs after retention period (3 years default)
// Can be overridden per log via retentionUntil field
auditLogSchema.index(
  { "compliance.retentionUntil": 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { "compliance.retentionUntil": { $exists: true } },
  },
);

// Ensure sensitive operations are indexed for quick flagging
auditLogSchema.index(
  { action: 1, riskLevel: 1, createdAt: -1 },
  { name: "riskAssessment" },
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
