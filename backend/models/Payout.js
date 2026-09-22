/**
 * Payout — the seller balance-settlement domain.
 *
 * Ownership invariants (mirror Order/Product):
 *   - `sellerId` / `sellerUserId` are authoritative; client-supplied values
 *     are never accepted.
 *   - All seller queries filter by `sellerId`; another seller's payout is
 *     indistinguishable from a missing one (404).
 *
 * Money safety: `amount` is an integer in minor units (Rial), never a float.
 *
 * Lifecycle (the companion FinanceService enforces validity):
 *   requested -> processing -> paid      (forward, admin/settlement engaged)
 *   requested -> cancelled               (seller retracts before engagement)
 *   requested -> rejected                (admin declines, future surface)
 *
 * Only `requested` payouts count toward "in-flight" — cancelled/rejected
 * release the balance back to the seller.
 */
const mongoose = require("mongoose");

const PAYOUT_STATUSES = ["requested", "processing", "paid", "cancelled", "rejected"];

const PAYOUT_METHODS = ["bank_transfer", "card", "wallet", "other"];

const PayoutTimelineEntrySchema = new mongoose.Schema(
  {
    status: { type: String, enum: PAYOUT_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { _id: false },
);

const PayoutSchema = new mongoose.Schema(
  {
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
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "مبلغ تسویه باید عدد صحیح (ریال) باشد",
      },
    },
    currency: { type: String, default: "IRR", maxlength: 10 },
    status: {
      type: String,
      enum: PAYOUT_STATUSES,
      default: "requested",
    },
    method: {
      type: String,
      enum: PAYOUT_METHODS,
      default: "bank_transfer",
    },
    note: { type: String, default: "", maxlength: 1000 },
    decisionNote: { type: String, default: "", maxlength: 1000 },
    reference: { type: String, default: "", maxlength: 200 },
    timeline: { type: [PayoutTimelineEntrySchema], default: [] },
  },
  {
    timestamps: true,
  },
);

PayoutSchema.index({ sellerId: 1, createdAt: -1 });
PayoutSchema.index({ sellerId: 1, status: 1, createdAt: -1 });

const Payout = mongoose.model("Payout", PayoutSchema);
module.exports = Payout;
module.exports.PAYOUT_STATUSES = PAYOUT_STATUSES;
module.exports.PAYOUT_METHODS = PAYOUT_METHODS;