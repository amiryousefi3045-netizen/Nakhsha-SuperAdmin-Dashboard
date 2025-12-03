const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// TTL index: Mongo will remove documents once `expiresAt` is reached.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Normalize phone before save (ensure consistent format like '09xxxxxxxxx')
otpSchema.pre("save", function (next) {
  if (this.phone && typeof this.phone === "string") {
    this.phone = this.phone.trim();
  }
  next();
});

module.exports = mongoose.model("OtpCode", otpSchema);
