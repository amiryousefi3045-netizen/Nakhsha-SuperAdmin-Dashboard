const mongoose = require("mongoose");

/**
 * OTP Code Model - Secure OTP storage with abuse prevention
 *
 * Security Features:
 * - TTL index: Auto-delete expired codes
 * - Resend tracking: Prevent SMS flooding
 * - Attempt tracking: Prevent brute-force verification
 * - IP tracking: Detect distributed attacks
 * - Temporary blocking: Auto-block after abuse
 */

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true }, // Hashed OTP code (never store plaintext)
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }, // Verification attempts
    resendCount: { type: Number, default: 0 }, // Resend attempts counter
    lastSentAt: { type: Date },
    lastAttemptAt: { type: Date }, // Last verification attempt time
    blockedUntil: { type: Date }, // Temporary block time for abuse
    ipAddresses: [{ type: String }], // Track IPs for this phone number
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// PRODUCTION INDEXES
// ============================================================================

// Index on phone for fast OTP lookups during verification
otpSchema.index({ phone: 1 });

// TTL index: MongoDB automatically deletes documents after `expiresAt` timestamp
// This prevents storage bloat and ensures expired codes cannot be used
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for checking blocked status
otpSchema.index({ phone: 1, blockedUntil: 1 });

// Index for cleanup queries (find expired or old OTPs)
otpSchema.index({ createdAt: 1 });

// Normalize phone before save (ensure consistent format like '09xxxxxxxxx')
otpSchema.pre("save", function (next) {
  if (this.phone && typeof this.phone === "string") {
    this.phone = this.phone.trim();
  }
  next();
});

module.exports = mongoose.model("OtpCode", otpSchema);
