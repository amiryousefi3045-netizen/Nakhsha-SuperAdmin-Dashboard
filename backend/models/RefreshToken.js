const mongoose = require("mongoose");

/**
 * RefreshToken Schema
 * Stores refresh tokens for session management and token rotation
 *
 * Why separate from User?
 * - Allows multiple active sessions per user
 * - Enables device tracking & session management
 * - Supports immediate revocation on logout
 * - Enables detecting compromised tokens (rotation)
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    // User who owns this refresh token
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The actual refresh token (hashed)
    tokenHash: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },

    // Device/browser identification (for "Remember this device")
    deviceId: {
      type: String,
      default: null,
      index: true,
    },

    // Device information for session management UI
    deviceInfo: {
      userAgent: String,
      ipAddress: String,
      lastUsedAt: { type: Date, default: Date.now },
    },

    // Token expiry (after which it must be refreshed again)
    expiresAt: {
      type: Date,
      required: true,
      index: true,
      // TTL index: auto-delete expired tokens after 30 days + expiry
    },

    // Revocation for logout or security events
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },

    // Rotation tracking (for detecting token reuse attacks)
    rotationCount: {
      type: Number,
      default: 0,
    },

    // Previous token hash (to detect if someone tries to reuse an old token)
    previousTokenHash: {
      type: String,
      default: null,
    },

    // Reason for revocation (security audit trail)
    revocationReason: {
      type: String,
      enum: [
        "LOGOUT",
        "EXPIRED",
        "SECURITY_INCIDENT",
        "PASSWORD_CHANGE",
        "ADMIN_REVOKE",
      ],
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// TTL Index: Auto-delete expired refresh tokens 30 days after expiry
refreshTokenSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 2592000, // 30 days
    name: "expireAfterSeconds",
  },
);

// Composite indexes for common queries
refreshTokenSchema.index({ userId: 1, revokedAt: 1 });
refreshTokenSchema.index({ userId: 1, expiresAt: -1 });
refreshTokenSchema.index({ deviceId: 1, revokedAt: 1 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
