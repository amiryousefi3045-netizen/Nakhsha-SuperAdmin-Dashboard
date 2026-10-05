/**
 * Order — the seller-fulfillment order domain.
 *
 * Ownership invariants (mirror Product):
 *   - `sellerId` / `sellerUserId` are authoritative; client-supplied values
 *     are never accepted.
 *   - All seller queries filter by `sellerId`.
 *
 * Money safety: every monetary field is an integer amount in minor units
 * (Rial), matching the app-wide `price` convention. No floats.
 */
const mongoose = require("mongoose");

// Order lifecycle — a strictly validated state machine. The companion
// OrderService enforces the allowed matrix; the schema only fixes the enum.
const ORDER_STATUSES = [
  "pending", // created, awaiting seller confirmation
  "confirmed", // seller accepted
  "processing", // packing / fulfillment started
  "shipped", // handed to carrier (stock reservation released)
  "delivered", // reached the customer
  "cancelled", // stock restored
  "returned", // from delivered; stock restored
];

const OrderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    sku: { type: String, default: "" },
    image: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "IRR", maxlength: 10 },
    qty: { type: Number, required: true, min: 1, validate: Number.isInteger },
  },
  { _id: false },
);

const TimelineEntrySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, default: "", maxlength: 1000 },
  },
  { _id: false },
);

// Notification attempt log (Phase 18). `delivered: false` denotes a pending or
// failed outbound notification — the dispatcher drains these and flips the
// flag, so delivery state is observable (buyer receipt UI) and retryable.
const OrderNotificationSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ["sms", "email", "telegram"], required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    to: { type: String, default: "" },
    message: { type: String, default: "" },
    reason: { type: String, default: "", maxlength: 1000 },
    delivered: { type: Boolean, default: false },
    error: { type: String, default: "", maxlength: 500 },
    at: { type: Date, default: Date.now },
    // Queue bookkeeping (Phase 19): bumped on every claim attempt; `delivered`
    // flips only on success. Records with attempts >= the queue limit are left
    // untouched (no endless retries) and surface in the admin ops view.
    attempts: { type: Number, default: 0, min: 0 },
    lastAttemptAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null },
  },
  { _id: true },
);

const OrderSchema = new mongoose.Schema(
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
    // Where the order entered the system: a seller's manual/admin entry or a
    // public storefront checkout. Legacy/hand-created orders default to seller.
    origin: {
      type: String,
      enum: ["seller", "storefront"],
      default: "seller",
    },
    // Buyer identity for storefront checkout orders; null for seller-entered.
    buyerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Human-readable store number, unique per seller (monotonic counter).
    orderNumber: { type: Number, required: true },
    // Seller store display name snapshotted at checkout (invoice emails).
    sellerStoreName: { type: String, default: "", maxlength: 300 },
    customer: {
      name: { type: String, required: true, trim: true, maxlength: 200 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
      email: { type: String, trim: true, maxlength: 200, default: "" },
      // Filled server-side at checkout from the buyer's linked Telegram chat
      // id (never accepted from the public form).
      telegram: { type: String, trim: true, default: "" },
      address: { type: String, default: "", maxlength: 1000 },
    },
    items: { type: [OrderItemSchema], required: true, validate: [(v) => v.length > 0, "حداقل یک قلم الزامی است"] },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    // Provenance of `discount` (Phase 35, P1-07). Snapshotted because a coupon
    // can be edited or deleted later, yet the order still has to render what it
    // was actually given and a refund has to know the buyer paid less. The
    // money itself stays in `discount` — this block is only the "why".
    coupon: {
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },
      code: { type: String, default: "", maxlength: 32 },
      type: { type: String, default: "", maxlength: 10 },
      // The rule as applied, so a later edit to the coupon cannot rewrite history.
      value: { type: Number, default: 0, min: 0 },
      // Integer actually taken off this order (after any percentage ceiling).
      discount: { type: Number, default: 0, min: 0 },
    },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "IRR", maxlength: 10 },
    /**
     * Delivery snapshot (Phase 36, P1-08). The method, the price the buyer was
     * quoted and the destination are frozen here at checkout, because the seller
     * can edit their rate card tomorrow and the order still has to show what was
     * promised on the day — the same reason `coupon` is snapshotted.
     *
     * Three money fields that are deliberately NOT the same number:
     *   - `fee`    → what the BUYER paid. Mirrored into `shippingFee` for the
     *                existing totals math; it is the duplicate that is kept in
     *                step here, not an independent value.
     *   - `cost`   → what the SELLER paid the courier, recorded per shipment.
     *                Not knowable at checkout, and this is the number that makes
     *                `fee - cost` a real margin instead of a guess.
     *   - `shippingFee` above is the charge; never treat it as the cost.
     */
    shipping: {
      methodKey: { type: String, default: "", maxlength: 40 },
      methodTitle: { type: String, default: "", maxlength: 80 },
      kind: { type: String, enum: ["pickup", "delivery", ""], default: "" },
      carrier: { type: String, default: "", maxlength: 80 },
      // Integer, same unit as `total`. Mirrors `shippingFee`.
      //
      // `fee` is what the BUYER paid for delivery, i.e. already net of any
      // discount code. `originalFee` is what the rate card asked for. Both are
      // kept because a seller who gave 20,000 away needs to see it in the margin
      // report, and a disputed order has to be settled against the number the
      // buyer was actually charged.
      fee: { type: Number, default: 0, min: 0 },
      originalFee: { type: Number, default: 0, min: 0 },
      // Seller-funded reduction on the delivery charge, and the code that earned
      // it. 0/"" on an order placed without a code.
      discount: { type: Number, default: 0, min: 0 },
      discountCode: { type: String, default: "", maxlength: 20 },
      // Seller's actual courier cost. 0 until the seller records it.
      cost: { type: Number, default: 0, min: 0 },
      // Who recorded the cost and when, so a margin figure can be traced to the
      // moment the expense was entered rather than to an anonymous total.
      costRecordedAt: Date,
      costRecordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      zoneLabel: { type: String, default: "", maxlength: 80 },
      eta: {
        minDays: { type: Number, default: 0, min: 0 },
        maxDays: { type: Number, default: 0, min: 0 },
      },
      // Structured destination. Free-text `customer.address` is retained for
      // pre-Phase-36 orders, but a new order stores the parts so a zone can be
      // re-evaluated and a courier label can be printed.
      address: {
        receiverName: { type: String, default: "", maxlength: 80 },
        receiverPhone: { type: String, default: "", maxlength: 20 },
        province: { type: String, default: "", maxlength: 80 },
        city: { type: String, default: "", maxlength: 80 },
        postalCode: { type: String, default: "", maxlength: 20 },
        line1: { type: String, default: "", maxlength: 300 },
        line2: { type: String, default: "", maxlength: 300 },
        note: { type: String, default: "", maxlength: 200 },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
      },
      pickup: {
        address: { type: String, default: "", maxlength: 400 },
        city: { type: String, default: "", maxlength: 80 },
        province: { type: String, default: "", maxlength: 80 },
        hours: { type: String, default: "", maxlength: 200 },
        instructions: { type: String, default: "", maxlength: 400 },
      },
      // The full quote as issued, so a dispute can be settled against what the
      // buyer actually saw rather than against the rate card of the moment.
      quotedAt: { type: Date, default: null },
    },
    status: { type: String, enum: ORDER_STATUSES, default: "pending" },
    timeline: { type: [TimelineEntrySchema], default: [] },
    notifications: { type: [OrderNotificationSchema], default: [] },
    carrierInfo: {
      carrier: { type: String, default: "", maxlength: 100 },
      trackingCode: { type: String, default: "", maxlength: 200 },
    },
    // Payment snapshot. For storefront orders the gateway is simulated
    // (`provider: "mock"`, `refId` = order id) so the flow is fully hermetic;
    // real gateways can later reuse the same shape. Never assume a paid state
    // beyond what this snapshot says.
    payment: {
      method: { type: String, default: "", maxlength: 50 },
      status: { type: String, enum: ["unpaid", "paid", "refunded"], default: "unpaid" },
      provider: { type: String, default: "", maxlength: 50 },
      refId: { type: String, default: "", maxlength: 100 },
      paidAt: { type: Date, default: null },
      // Return/refund ledger (Phase 33, P1-04). The amount is what was actually
      // returned to the buyer, which may be less than `total` (damage
      // deduction, partial refund) — never assume it equals the order total.
      refundedAmount: { type: Number, default: 0, min: 0 },
      refundedAt: { type: Date, default: null },
    },
    customerNote: { type: String, default: "", maxlength: 2000 },
    sellerNote: { type: String, default: "", maxlength: 2000 },
    // Set once the payment-reminder scheduler enqueues the single SMS nudge for
    // a storefront order that is still `pending` past its max age. Its presence
    // is what makes reminder scheduling idempotent (Phase 20).
    paymentReminderAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// ============================================================================
// INDEXES
// ============================================================================

OrderSchema.index({ sellerId: 1, createdAt: -1 });
OrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ sellerId: 1, orderNumber: -1 }, { unique: true });
OrderSchema.index({ "items.productId": 1 });
OrderSchema.index({ buyerUserId: 1, createdAt: -1 });

// ============================================================================
// VIRTUALS
// ============================================================================

OrderSchema.virtual("itemCount").get(function () {
  return (this.items || []).reduce((sum, item) => sum + item.qty, 0);
});

OrderSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    if (typeof ret.itemCount === "number") {
      ret.itemCount = ret.itemCount;
      delete ret.__v;
    }
    return ret;
  },
});

const Order = mongoose.model("Order", OrderSchema);
module.exports = Order;
module.exports.ORDER_STATUSES = ORDER_STATUSES;