/**
 * StorefrontOrderService — buyer checkout + (simulated) payment flow.
 *
 * Seams it builds on:
 *   - StorefrontService.findPublishedStorefront — the SAME publish/active gate
 *     as the public catalog, so you can only buy from a live, published store.
 *   - OrderService.createOrder — the atomic per-item stock reservation and
 *     integer-Rial snapshots are reused verbatim; `origin: "storefront"` +
 *     `buyerUserId` tag the order as buyer-entered.
 *
 * Payment is deliberately hermetic: `provider: "mock"`, `refId` = order id,
 * and the "gateway" is a callback endpoint the caller invokes with SUCCESS/FAIL.
 * Real gateways can later reuse the same snapshot shape without touching the
 * checkout path. No floats, no external network, fully testable offline.
 */
const Order = require("../models/Order");
const Product = require("../models/Product");
const SellerProfile = require("../models/SellerProfile");
const OrderService = require("./OrderService");
const AuditService = require("./AuditService");
const { StorefrontService } = require("./StorefrontService");

const PAYMENT_PROVIDER = "mock";
const ORDER_STATUSES = Order.ORDER_STATUSES;

class StorefrontOrderError extends Error {
  /**
   * @param {string} code machine-readable error code
   * @param {string} message Persian user-facing message
   * @param {object} [details]
   */
  constructor(code, message, details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/**
 * Create a buyer order from a public storefront.
 *
 * @param {object} params
 * @param {string} params.slug - published storefront slug
 * @param {string} params.buyerUserId - authenticated buyer user id
 * @param {{ name: string; phone: string; email?: string; address?: string }} params.customer
 * @param {Array<{ productId: string; qty: number }>} params.items
 * @param {"card"|"wallet"|"other"} [params.paymentMethod]
 * @param {string} [params.customerNote]
 * @returns {Promise<{ order: import("mongoose").Model<Order>, paymentIntent: object }>}
 */
async function createBuyerOrder({
  slug,
  buyerUserId,
  customer,
  items,
  paymentMethod = "card",
  customerNote = "",
}) {
  if (!buyerUserId) {
    throw new StorefrontOrderError("VALIDATION_ERROR", "خریدار مشخص نیست");
  }

  const profile = await StorefrontService.findPublishedStorefront(slug);
  if (!profile) {
    throw new StorefrontOrderError("STORE_NOT_FOUND", "ویترین فروشگاه یافت نشد");
  }

  // The public DTO intentionally strips userId; fetch it separately for the
  // seller identity and the self-purchase guard.
  const owner = await SellerProfile.findById(profile._id).select("userId").lean();
  if (!owner || !owner.userId) {
    throw new StorefrontOrderError("STORE_NOT_FOUND", "ویترین فروشگاه یافت نشد");
  }
  if (String(owner.userId) === String(buyerUserId)) {
    throw new StorefrontOrderError(
      "SELF_PURCHASE",
      "خرید از فروشگاه خودتان مجاز نیست",
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new StorefrontOrderError("VALIDATION_ERROR", "حداقل یک قلم سفارش الزامی است");
  }

  // Every requested item must be visible in THIS storefront (store-owned +
  // active). A product that exists on the seller side but is not on sale here
  // answers as unavailable — never as leaked existence.
  const found = await Product.find({
    _id: { $in: items.map((i) => i.productId) },
    sellerId: profile._id,
    status: "active",
  })
    .select("_id")
    .lean();
  const foundKeys = new Set(found.map((p) => String(p._id)));
  for (const item of items) {
    if (!foundKeys.has(String(item.productId))) {
      throw new StorefrontOrderError(
        "PRODUCT_NOT_AVAILABLE",
        "این محصول برای خرید در دسترس نیست",
        { productId: item.productId },
      );
    }
  }

  // Atomic reservation + snapshot happens here (OrderService.createOrder).
  const order = await OrderService.createOrder({
    sellerId: profile._id,
    sellerUserId: owner.userId,
    customer,
    items,
    origin: "storefront",
    buyerUserId,
    customerNote,
  });

  const refId = String(order._id);
  order.payment.method = paymentMethod;
  order.payment.provider = PAYMENT_PROVIDER;
  order.payment.refId = refId;
  await order.save();

  await AuditService.log({
    userId: buyerUserId,
    action: "ORDER_CREATED",
    resource: { type: "TRANSACTION", id: refId },
    result: "SUCCESS",
    riskLevel: "LOW",
    metadata: {
      origin: "storefront",
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      refId,
    },
  });

  return {
    order,
    paymentIntent: {
      provider: PAYMENT_PROVIDER,
      refId,
      amount: order.total,
      currency: order.currency || "IRR",
      status: order.payment.status,
    },
  };
}

/**
 * Apply the (simulated) gateway result to a buyer order.
 *
 * - SUCCESS marks the payment paid (idempotent; a second SUCCESS no-ops).
 * - FAIL cancels the pending order and restores the reserved stock, then a
 *   PAYMENT_FAILED audit is written. A second FAIL on the cancelled order also
 *   no-ops so the callback is safe to redeliver.
 *
 * @param {object} params
 * @param {string} params.refId - gateway reference (= order id for the mock)
 * @param {"SUCCESS"|"FAIL"} params.result
 * @param {string} [params.reason]
 * @returns {Promise<{ order: import("mongoose").Model<Order>, applied: boolean }>}
 */
async function submitPaymentResult({ refId, result, reason = "" }) {
  if (!/^[0-9a-f]{24}$/i.test(String(refId || ""))) {
    throw new StorefrontOrderError("PAYMENT_NOT_FOUND", "تراکنش پرداخت یافت نشد");
  }

  const order = await Order.findById(refId);
  if (!order || order.origin !== "storefront") {
    throw new StorefrontOrderError("PAYMENT_NOT_FOUND", "تراکنش پرداخت یافت نشد");
  }

  // Idempotency: already resolved (paid, or cancelled after a failed payment).
  if (order.payment.status === "paid" || order.status === "cancelled") {
    return { order, applied: false };
  }

  if (result === "SUCCESS") {
    order.payment.status = "paid";
    order.payment.paidAt = new Date();
    order.payment.provider = order.payment.provider || PAYMENT_PROVIDER;
    order.payment.refId = String(order._id);
    await order.save();

    await AuditService.log({
      userId: order.buyerUserId || undefined,
      action: "PAYMENT_RECEIVED",
      resource: { type: "TRANSACTION", id: String(order._id) },
      result: "SUCCESS",
      riskLevel: "LOW",
      metadata: {
        orderNumber: order.orderNumber,
        amount: order.total,
        currency: order.currency || "IRR",
        refId: String(order._id),
      },
    });

    return { order, applied: true };
  }

  // FAIL → the buyer never completed payment; release the reservation.
  await OrderService.transitionOrder({
    orderId: order._id,
    sellerId: order.sellerId,
    nextStatus: "cancelled",
    sellerUserId: order.buyerUserId || undefined,
    reason: reason || "پرداخت ناموفق",
  });

  await AuditService.log({
    userId: order.buyerUserId || undefined,
    action: "PAYMENT_FAILED",
    resource: { type: "TRANSACTION", id: String(order._id) },
    result: "FAILURE",
    riskLevel: "MEDIUM",
    metadata: { orderNumber: order.orderNumber, refId: String(order._id) },
  });

  const updated = await Order.findById(order._id);
  return { order: updated, applied: true };
}

/**
 * Paginated list of a buyer's OWN storefront orders, newest first.
 *
 * Scoped to `{ buyerUserId, origin: "storefront" }` (index buyerUserId +
 * createdAt), so seller-entered orders and other buyers' orders can never
 * appear. The optional `status` filter is validated against the order enum.
 */
async function listBuyerOrders({ buyerUserId, page = 1, limit = 10, status }) {
  if (!buyerUserId) {
    throw new StorefrontOrderError("VALIDATION_ERROR", "خریدار مشخص نیست");
  }
  if (status && !ORDER_STATUSES.includes(status)) {
    throw new StorefrontOrderError("VALIDATION_ERROR", "وضعیت سفارش نامعتبر است");
  }

  const filter = { buyerUserId, origin: "storefront" };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  return {
    items: items.map((o) => OrderService.orderToDTO(o)),
    total,
    page,
    limit,
  };
}

/**
 * Fetch a buyer's own storefront order (receipt). Null when the order does not
 * belong to this buyer or was not created via the storefront.
 */
async function getBuyerOrder({ buyerUserId, orderId }) {
  const order = await Order.findOne({
    _id: orderId,
    buyerUserId,
    origin: "storefront",
  });
  return order ? OrderService.orderToDTO(order) : null;
}

module.exports = {
  StorefrontOrderError,
  PAYMENT_PROVIDER,
  createBuyerOrder,
  submitPaymentResult,
  listBuyerOrders,
  getBuyerOrder,
};