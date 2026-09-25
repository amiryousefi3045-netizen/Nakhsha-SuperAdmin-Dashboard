/**
 * Review — buyer feedback on a storefront product (Phase 14).
 *
 * Invariants:
 *   - One published review per (productId, buyerUserId): the unique compound
 *     index backs an upsert in StorefrontReviewService, so the same buyer can
 *     edit their review forever but can never create a second one.
 *   - A review may only exist for a PAID, DELIVERED, storefront-origin order
 *     that contained the product — enforced by the service, not the schema.
 *   - `buyerName` is snapshotted at write time (no join on read) and is only
 *     meant to be shown when `isAnonymous` is false. No other buyer identity
 *     (phone, handle) is ever stored here.
 *   - `status` reserves a moderation seam (hidden) for later admin tooling;
 *     the public list and the aggregates only ever count `published`.
 */
const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
      index: true,
    },
    sellerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    buyerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    buyerName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: Number.isInteger,
    },
    comment: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["published", "hidden"],
      default: "published",
    },
    // One seller reply (Phase 17). The owner may set or update it freely; it is
    // exposed on the PUBLIC surface only while the review itself is `published`.
    sellerReply: {
      comment: { type: String, trim: true, default: null, maxlength: 500 },
      createdAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// INDEXES
// ============================================================================

ReviewSchema.index({ productId: 1, buyerUserId: 1 }, { unique: true });
ReviewSchema.index({ productId: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ sellerId: 1, status: 1, createdAt: -1 });

const Review = mongoose.model("Review", ReviewSchema);
module.exports = Review;