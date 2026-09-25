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
    channel: { type: String, enum: ["sms", "email"], required: true },
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
    customer: {
      name: { type: String, required: true, trim: true, maxlength: 200 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
      email: { type: String, trim: true, maxlength: 200, default: "" },
      address: { type: String, default: "", maxlength: 1000 },
    },
    items: { type: [OrderItemSchema], required: true, validate: [(v) => v.length > 0, "حداقل یک قلم الزامی است"] },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "IRR", maxlength: 10 },
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