const mongoose = require("mongoose");

/**
 * A place a seller keeps stock.
 *
 * This is deliberately a small, boring document. The numbers that decide
 * whether an order can be placed do NOT live here: they live on
 * `Product.stock`, because the deployment runs a standalone MongoDB where
 * multi-document transactions are unavailable, and an order must be guarded by
 * a single atomic update. This collection answers "where", not "whether".
 *
 * A location therefore never holds an authoritative quantity of its own — the
 * per-product breakdown lives inside `Product.stock.locations[]` so that
 * aggregate and breakdown are written by the same document update and cannot
 * drift apart.
 */
const InventoryLocationSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 20,
      match: /^[A-Z0-9-]+$/,
    },
    kind: {
      type: String,
      enum: ["warehouse", "storefront", "marketplace", "transit"],
      default: "warehouse",
    },
    address: {
      province: { type: String, default: "" },
      city: { type: String, default: "" },
      line: { type: String, default: "" },
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// The code is a lookup key the seller types into CSV imports and transfers, so
// it must be unique per seller but may repeat across sellers.
InventoryLocationSchema.index({ sellerId: 1, code: 1 }, { unique: true });
InventoryLocationSchema.index({ sellerId: 1, isDefault: -1 });

module.exports = mongoose.model("InventoryLocation", InventoryLocationSchema);
