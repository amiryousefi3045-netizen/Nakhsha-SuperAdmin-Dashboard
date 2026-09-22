/**
 * OrderService — domain logic for the seller Orders & Fulfillment surface.
 *
 * Invariants it enforces (each covered by tests):
 *   - Every order is seller-scoped; nothing crosses `sellerId`.
 *   - Prices/totals are snapshots taken at creation (integer Rial math).
 *   - Order creation reserves stock ATOMICALLY per item: `onHand` drops and
 *     `reserved` rises under a `onHand >= qty` guard, so stock can never go
 *     negative even under concurrency.
 *   - `cancelled` restores reserved units back to `onHand`.
 *   - `returned` physically returns units to `onHand` (reservation was
 *     already released at shipment).
 *   - `shipped` releases the reservation (units left the warehouse).
 *   - Status changes follow the validated transition matrix; invalid moves
 *     raise `INVALID_TRANSITION`.
 *   - Order numbers are race-safe per seller (AtomicCounter).
 */
const Order = require("../models/Order");
const Product = require("../models/Product");
const { nextSequence } = require("../models/AtomicCounter");

// ── State machine ───────────────────────────────────────────────────────────

const ORDER_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

// ── Custom domain errors (controller maps these to HTTP) ────────────────────

class OrderDomainError extends Error {
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

// ── DTO ─────────────────────────────────────────────────────────────────────

function orderToDTO(order) {
  const o = order.toObject ? order.toObject({ virtuals: true }) : order;
  return {
    id: String(o._id),
    sellerId: String(o.sellerId),
    origin: o.origin || "seller",
    buyerUserId: o.buyerUserId ? String(o.buyerUserId) : null,
    orderNumber: o.orderNumber,
    customer: o.customer || {},
    items: (o.items || []).map((item) => ({
      productId: String(item.productId),
      title: item.title,
      sku: item.sku || "",
      image: item.image || "",
      price: item.price,
      currency: item.currency || "IRR",
      qty: item.qty,
    })),
    subtotal: o.subtotal,
    shippingFee: o.shippingFee || 0,
    discount: o.discount || 0,
    total: o.total,
    currency: o.currency || "IRR",
    status: o.status,
    itemCount: o.itemCount ?? 0,
    timeline: (o.timeline || []).map((entry) => ({
      status: entry.status,
      at: entry.at,
      by: entry.by ? String(entry.by) : null,
      reason: entry.reason || "",
    })),
    carrierInfo: o.carrierInfo || {},
    payment: o.payment || { status: "unpaid" },
    customerNote: o.customerNote || "",
    sellerNote: o.sellerNote || "",
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

// ── Atomic stock helpers ────────────────────────────────────────────────────

/**
 * Reserve `qty` units: onHand -= qty, reserved += qty. Atomic guard ensures the
 * reservation is impossible when available stock is insufficient.
 */
async function reserveStock(productId, sellerId, qty) {
  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      sellerId,
      stockPolicy: "tracked",
      "stock.onHand": { $gte: qty },
    },
    [
      {
        $set: {
          "stock.onHand": { $subtract: [{ $ifNull: ["$stock.onHand", 0] }, qty] },
          "stock.reserved": { $add: [{ $ifNull: ["$stock.reserved", 0] }, qty] },
        },
      },
    ],
    { new: true },
  );
  return updated;
}

/** Release a reservation without touching onHand (shipment): clamps at 0. */
async function releaseReserved(productId, sellerId, qty) {
  return Product.findOneAndUpdate(
    { _id: productId, sellerId, stockPolicy: "tracked" },
    [
      {
        $set: {
          "stock.reserved": {
            $max: [{ $subtract: [{ $ifNull: ["$stock.reserved", 0] }, qty] }, 0],
          },
        },
      },
    ],
    { new: true },
  );
}

/** Restore reserved units back to onHand (cancel/return). Strict guard. */
async function restoreStock(productId, sellerId, qty) {
  return Product.findOneAndUpdate(
    {
      _id: productId,
      sellerId,
      stockPolicy: "tracked",
      "stock.reserved": { $gte: qty },
    },
    [
      {
        $set: {
          "stock.reserved": { $subtract: [{ $ifNull: ["$stock.reserved", 0] }, qty] },
          "stock.onHand": { $add: [{ $ifNull: ["$stock.onHand", 0] }, qty] },
        },
      },
    ],
    { new: true },
  );
}

/**
 * Physically return units to onHand (returned after delivery). The reservation
 * was already released at shipment, so only onHand grows; there is no reserved
 * balance to reconcile.
 */
async function returnToStock(productId, sellerId, qty) {
  return Product.findOneAndUpdate(
    { _id: productId, sellerId, stockPolicy: "tracked" },
    [
      {
        $set: {
          "stock.onHand": { $add: [{ $ifNull: ["$stock.onHand", 0] }, qty] },
        },
      },
    ],
    { new: true },
  );
}

// ── Service ─────────────────────────────────────────────────────────────────

/**
 * Create an order for one seller and reserve its stock.
 *
 * @param {object} params
 * @param {import("mongoose").Types.ObjectId} params.sellerId - SellerProfile id
 * @param {import("mongoose").Types.ObjectId} params.sellerUserId - User id
 * @param {{ name: string; phone: string; email?: string; address?: string }} params.customer
 * @param {Array<{ productId: string; qty: number }>} params.items
 * @param {number} [params.shippingFee]
 * @param {number} [params.discount]
 * @param {string} [params.customerNote]
 * @param {"seller"|"storefront"} [params.origin] - entry point; defaults to seller
 * @param {import("mongoose").Types.ObjectId|null} [params.buyerUserId] - buyer for storefront orders
 */
async function createOrder({
  sellerId,
  sellerUserId,
  customer,
  items,
  shippingFee = 0,
  discount = 0,
  customerNote = "",
  origin = "seller",
  buyerUserId = null,
}) {
  if (!customer || !customer.name || !customer.phone) {
    throw new OrderDomainError("VALIDATION_ERROR", "نام و شماره تماس مشتری الزامی است");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderDomainError("VALIDATION_ERROR", "حداقل یک قلم سفارش الزامی است");
  }
  for (const item of items) {
    if (!item.productId || (Number.isInteger(item.qty) && item.qty < 1)) {
      throw new OrderDomainError("VALIDATION_ERROR", "شناسه محصول یا تعداد معتبر نیست", {
        field: "items",
      });
    }
  }

  const productIds = items.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds }, sellerId }).lean();

  // Build the snapshot rows in the requested order, atomically reserving stock
  // for tracked products. A single failure aborts the whole order.
  const snapshotItems = [];
  for (const item of items) {
    const product = products.find((p) => String(p._id) === String(item.productId));
    if (!product) {
      throw new OrderDomainError("PRODUCT_NOT_FOUND", "محصولی در سفارش یافت نشد", {
        productId: item.productId,
      });
    }

    if (product.stockPolicy === "tracked") {
      const reserved = await reserveStock(product._id, sellerId, item.qty);
      if (!reserved) {
        throw new OrderDomainError(
          "INSUFFICIENT_STOCK",
          `موجودی کافی برای «${product.title}» وجود ندارد`,
          { productId: String(product._id), title: product.title },
        );
      }
    }

    snapshotItems.push({
      productId: product._id,
      title: product.title,
      sku: product.sku || "",
      image: Array.isArray(product.images) && product.images[0] ? product.images[0] : "",
      price: product.price,
      currency: product.currency || "IRR",
      qty: item.qty,
    });
  }

  const subtotal = snapshotItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = Math.max(0, subtotal + shippingFee - discount);

  const orderNumber = await nextSequence(`order:${String(sellerId)}`);
  const order = await Order.create({
    sellerId,
    sellerUserId,
    origin,
    buyerUserId,
    orderNumber,
    customer: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email || "",
      address: customer.address || "",
    },
    items: snapshotItems,
    subtotal,
    shippingFee,
    discount,
    total,
    currency: snapshotItems[0]?.currency || "IRR",
    status: "pending",
    timeline: [{ status: "pending", at: new Date() }],
    customerNote: customerNote || "",
    payment: { status: "unpaid" },
  });

  return order;
}

/**
 * Move an order through the validated state machine.
 */
async function transitionOrder({
  orderId,
  sellerId,
  nextStatus,
  sellerUserId,
  reason = "",
}) {
  const order = await Order.findOne({ _id: orderId, sellerId });
  if (!order) return null;

  const allowed = ORDER_TRANSITIONS[order.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new OrderDomainError(
      "INVALID_TRANSITION",
      `انتقال از «${order.status}» به «${nextStatus}» مجاز نیست`,
      { from: order.status, to: nextStatus },
    );
  }

  // Stock side-effects happen BEFORE the status write so a failure leaves the
  // order untouched.
  if (nextStatus === "cancelled") {
    for (const item of order.items) {
      const restored = await restoreStock(item.productId, sellerId, item.qty);
      if (!restored) {
        throw new OrderDomainError(
          "INSUFFICIENT_STOCK",
          "بازگرداندن موجودی سفارش ناموفق بود",
          { productId: String(item.productId) },
        );
      }
    }
  } else if (nextStatus === "returned") {
    // Reservation was released at shipment; units physically return to onHand.
    for (const item of order.items) {
      await returnToStock(item.productId, sellerId, item.qty);
    }
  } else if (nextStatus === "shipped") {
    for (const item of order.items) {
      await releaseReserved(item.productId, sellerId, item.qty);
    }
  }

  order.status = nextStatus;
  order.timeline.push({
    status: nextStatus,
    at: new Date(),
    by: sellerUserId || null,
    reason: reason || "",
  });
  await order.save();

  return order;
}

/**
 * List orders for a seller. `status` filters by workflow state; `q` searches
 * customer name/phone or the numeric order number.
 */
async function listOrders(sellerId, { page = 1, limit = 25, status, q } = {}) {
  const filter = { sellerId };
  if (status && Order.ORDER_STATUSES.includes(status)) {
    filter.status = status;
  }
  if (q && String(q).trim()) {
    const safe = String(q)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const num = Number.parseInt(safe, 10);
    filter.$or = [
      { "customer.name": { $regex: safe, $options: "i" } },
      { "customer.phone": { $regex: safe, $options: "i" } },
    ];
    if (Number.isInteger(num)) {
      filter.$or.push({ orderNumber: num });
    }
  }
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);
  return { items: orders.map(orderToDTO), total, page, limit };
}

async function getOrder(sellerId, orderId) {
  const order = await Order.findOne({ _id: orderId, sellerId });
  return order ? orderToDTO(order) : null;
}

async function countsByStatus(sellerId) {
  const rows = await Order.aggregate([
    { $match: { sellerId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts = { pending: 0, confirmed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0, returned: 0 };
  for (const row of rows) {
    if (row._id in counts) counts[row._id] = row.count;
  }
  return counts;
}

module.exports = {
  OrderDomainError,
  ORDER_TRANSITIONS,
  orderToDTO,
  createOrder,
  transitionOrder,
  listOrders,
  getOrder,
  countsByStatus,
};