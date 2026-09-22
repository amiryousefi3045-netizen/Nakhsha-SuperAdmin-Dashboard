const mongoose = require("mongoose");

/**
 * TOTP (2FA) credential — stored SEPARATELY from the User document so that
 * 2FA state never mixes with identity/profile data and enabling/disabling it
 * requires an explicit update on this collection only.
 *
 * One document per user (userId is unique). `enabled=false` means the secret
 * was provisioned but not yet verified (setup in progress) OR 2FA was turned
 * off but the secret is kept to avoid forcing a re-scan on re-enable.
 */
const totpCredentialSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    secret: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("TotpCredential", totpCredentialSchema);