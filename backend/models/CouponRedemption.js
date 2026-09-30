/**
 * CouponRedemption — one row per order that spent a coupon (Phase 35, P1-07).
 *
 * Why this is a document and not a count on the coupon: "one use per buyer" is
 * a statement about a *pair* (buyer × coupon), and a single `usedCount` integer
 * cannot answer it. It is also the audit trail behind "this seller gave away
 * 1.2M in discounts this month" and behind a chargeback-style dispute about
 * whether a code was honoured.
 *
 * Invariants:
 *   - `sellerId` is denormalised from the coupon so usage stats never need a
 *     join, and so a row can never be filed against another store's coupon.
 *   - `discount` is the integer actually taken off that order — the snapshot,
 *     because the coupon's own `value` may be edited afterwards.
 *   - Rows are removed when an order is cancelled before it is settled, so a
 *     failed checkout does not permanently burn a one-use-per-buyer allowance.
 */
const mongoose = require("mongoose");

const CouponRedemptionSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "SellerProfile", required: true },
    // Null for an anonymous checkout (no logged-in buyer), which is why the
    // per-buyer cap is enforced on a nullable key rather than assumed present.
    buyerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    // Snapshotted so a coupon listing renders its own usage without a join.
    code: { type: String, required: true, maxlength: 32 },
    discount: { type: Number, required: true, min: 0 },
    // Denormalised from the coupon AT REDEMPTION TIME. When true (the default
    // cap of one use per buyer), the partial unique index below makes a second
    // redemption by the same buyer impossible in the database itself — a
    // read-then-write count in application code loses a race two concurrent
    // checkouts can easily create.
    singleUse: { type: Boolean, default: false },
    redeemedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Per-buyer counting: the hot path for the "has this buyer already used it?"
// guard, and the composite unique below stops a double-submit from spending one
// allowance twice.
CouponRedemptionSchema.index({ couponId: 1, buyerUserId: 1 });
// The hard single-use guarantee. A partial index, so coupons that deliberately
// allow N>1 uses per buyer keep working under the same count-based guard.
CouponRedemptionSchema.index(
  { couponId: 1, buyerUserId: 1 },
  { unique: true, partialFilterExpression: { singleUse: true } },
);
// One coupon per order — a cart cannot stack two codes on the same purchase.
CouponRedemptionSchema.index({ orderId: 1 }, { unique: true });
// Seller usage report.
CouponRedemptionSchema.index({ sellerId: 1, redeemedAt: -1 });

const CouponRedemption = mongoose.model("CouponRedemption", CouponRedemptionSchema);

module.exports = CouponRedemption;
