/**
 * Coupon — a seller-scoped discount code (Phase 35, P1-07).
 *
 * Why a first-class document and not a boolean on the order: a coupon is a
 * liability with a lifetime. It can be scheduled, limited, capped, paused and
 * spent, and the seller needs to see what it cost them. Collapsing that into
 * `order.discount` would answer "how much was taken off" but never "how many
 * times may this still be used", which is the whole point of a campaign.
 *
 * Invariants:
 *   - `sellerId` is authoritative and never accepted from the client; a code is
 *     valid only inside the store that minted it, so one seller can never apply
 *     another's discount (or burn their quota).
 *   - `code` is stored upper-cased and unique per seller. The unique index is
 *     the real guard against two sellers racing to mint the same code.
 *   - `value` is an integer in the SAME unit as `Order.subtotal` / `Order.total`
 *     (the app-wide price convention). There is no conversion anywhere in the
 *     stack — inventing one here would silently 10x every discount.
 *   - `usedCount` is only ever moved by the guarded atomic reservation in
 *     CouponService, never by read-modify-write, so two simultaneous checkouts
 *     can never both spend the last use.
 */
const mongoose = require("mongoose");

const COUPON_TYPES = ["percent", "fixed"];
const COUPON_STATUSES = ["active", "paused"];

const CouponSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
      index: true,
    },
    // The acting account, snapshotted for the audit trail (a manager may create
    // a coupon; the seller still owns it).
    sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Upper-cased on write so lookup is case-insensitive without a collation.
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
    // Internal label for the seller's own dashboard only; never shown at
    // checkout, so it cannot leak a campaign that is still being prepared.
    description: { type: String, default: "", maxlength: 300 },
    type: { type: String, enum: COUPON_TYPES, required: true },
    // percent → 1..100 (%) ; fixed → integer amount off.
    value: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator(v) {
          if (this.type === "percent") return Number.isInteger(v) && v >= 1 && v <= 100;
          return Number.isInteger(v) && v >= 1;
        },
        message: "مقدار کوپن نامعتبر است",
      },
    },
    // Ceiling for a percentage coupon (0 = no ceiling). Ignored for fixed.
    maxDiscount: { type: Number, default: 0, min: 0 },
    minPurchase: { type: Number, default: 0, min: 0 },
    // 0 = unlimited.
    maxUses: { type: Number, default: 0, min: 0 },
    // Defaults to one use per buyer — the safe default against a leaked code.
    maxUsesPerBuyer: { type: Number, default: 1, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    status: { type: String, enum: COUPON_STATUSES, default: "active" },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Unique per store: the index, not application code, is what makes a duplicate
// code impossible when two requests race.
CouponSchema.index({ sellerId: 1, code: 1 }, { unique: true });
// Dashboard listing: newest first within a store, optionally filtered by status.
CouponSchema.index({ sellerId: 1, status: 1, createdAt: -1 });

const Coupon = mongoose.model("Coupon", CouponSchema);

module.exports = Coupon;
module.exports.COUPON_TYPES = COUPON_TYPES;
module.exports.COUPON_STATUSES = COUPON_STATUSES;
