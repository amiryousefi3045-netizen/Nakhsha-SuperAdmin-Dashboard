/**
 * ReturnRequest — the RMA (Return Merchandise Authorization) document.
 *
 * Why a first-class document instead of a flag on the order: a return is a
 * conversation that outlives the order's own status column. A buyer opens it,
 * a seller approves or rejects it, the goods come back, and only then money
 * moves. Collapsing that into `order.status = "returned"` would lose the
 * reason, the audit trail, the refund amount and the "who asked" answer that
 * every dispute eventually turns on.
 *
 * Invariants:
 *   - `sellerId` is authoritative and never accepted from the client; the
 *     seller is derived from the order so a request can never be filed against
 *     another store's order.
 *   - An order may have at most ONE open request. Enforced by a unique sparse
 *     index on `openKey` (set to the order id while open, cleared on close) —
 *     two simultaneous refund claims for one order are unreconcilable.
 *   - Money is integer Rial, matching the order ledger. No floats.
 *   - The RMA covers the whole order. `refundAmount` may be lower than the
 *     order total (damage deduction / partial refund) but the item set is the
 *     order's, so the stock return stays exactly the one `transitionOrder`
 *     already performs.
 */
const mongoose = require("mongoose");

const RETURN_STATUSES = [
  "requested", // buyer opened it, seller has not answered yet
  "approved", // seller accepted; the buyer ships the goods back
  "rejected", // seller declined (terminal)
  "received", // goods are physically back in the store
  "refunded", // money returned and the order left `delivered` (terminal)
  "cancelled", // withdrawn before receiving (terminal)
];

// The validated state machine, enforced in ReturnService. Mirrors how
// OrderService treats ORDER_TRANSITIONS: the schema fixes the enum, the
// service owns the matrix.
const RETURN_TRANSITIONS = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["received", "cancelled"],
  rejected: [],
  received: ["refunded"],
  refunded: [],
  cancelled: [],
};

/** A request stays actionable until one of these states. */
const OPEN_RETURN_STATUSES = ["requested", "approved", "received"];

const ReturnItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1, validate: Number.isInteger },
  },
  { _id: false },
);

const ReturnTimelineSchema = new mongoose.Schema(
  {
    status: { type: String, enum: RETURN_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    // The acting user: the buyer who filed it, or the seller user who decided.
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { _id: false },
);

const ReturnRequestSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
      index: true,
    },
    sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    // Snapshots so the RMA list renders without a per-row order join.
    orderNumber: { type: Number, required: true },
    customerName: { type: String, default: "", maxlength: 200 },
    customerPhone: { type: String, default: "", maxlength: 20 },
    // Null for a seller-filed request (e.g. a walk-in return).
    buyerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Human-readable store number, unique per seller (same convention as
    // orderNumber, minted race-safely through AtomicCounter).
    rmaNumber: { type: Number, required: true },
    status: { type: String, enum: RETURN_STATUSES, default: "requested" },
    // Set to String(orderId) while the request is open, cleared once it reaches
    // a terminal state. The unique sparse index on it allows at most one open
    // request per order while permitting any number of closed ones.
    openKey: { type: String, default: undefined },
    // The buyer's complaint. Required: a dispute without a stated reason
    // cannot be adjudicated.
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    // The seller's answer/justification.
    resolutionNote: { type: String, default: "", maxlength: 1000 },
    items: { type: [ReturnItemSchema], required: true, validate: [(v) => v.length > 0, "حداقل یک قلم الزامی است"] },
    refundAmount: { type: Number, default: 0, min: 0 },
    refundCurrency: { type: String, default: "IRR", maxlength: 10 },
    refundedAt: { type: Date, default: null },
    timeline: { type: [ReturnTimelineSchema], default: [] },
  },
  { timestamps: true },
);

// ============================================================================
// INDEXES
// ============================================================================

ReturnRequestSchema.index({ sellerId: 1, rmaNumber: -1 }, { unique: true });
ReturnRequestSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
// At most one open request per order (sparse: closed requests have no openKey).
ReturnRequestSchema.index({ openKey: 1 }, { unique: true, sparse: true });
ReturnRequestSchema.index({ buyerUserId: 1, createdAt: -1 });

// ============================================================================
// VIRTUALS
// ============================================================================

ReturnRequestSchema.virtual("isOpen").get(function () {
  return OPEN_RETURN_STATUSES.includes(this.status);
});

ReturnRequestSchema.set("toJSON", { virtuals: true });

const ReturnRequest = mongoose.model("ReturnRequest", ReturnRequestSchema);

module.exports = ReturnRequest;
module.exports.RETURN_STATUSES = RETURN_STATUSES;
module.exports.RETURN_TRANSITIONS = RETURN_TRANSITIONS;
module.exports.OPEN_RETURN_STATUSES = OPEN_RETURN_STATUSES;
