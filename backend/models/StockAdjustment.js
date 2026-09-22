const mongoose = require("mongoose");

const StockAdjustmentSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
      index: true,
    },
    delta: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["receipt", "sale", "return", "adjustment", "correction", "count"],
      required: true,
    },
    reason: {
      type: String,
      maxlength: 500,
    },
    before: {
      onHand: Number,
      reserved: Number,
    },
    after: {
      onHand: Number,
      reserved: Number,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    source: {
      type: String,
      enum: ["seller_ui", "admin", "system", "api"],
      default: "seller_ui",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for seller's product history (most recent first)
StockAdjustmentSchema.index({ productId: 1, createdAt: -1 });
StockAdjustmentSchema.index({ sellerId: 1, createdAt: -1 });
StockAdjustmentSchema.index({ productId: 1, sellerId: 1, createdAt: -1 });

module.exports = mongoose.model("StockAdjustment", StockAdjustmentSchema);