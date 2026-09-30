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
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { nextSequence } = require("../models/AtomicCounter");
const NotificationService = require("./NotificationService");
const sellerEventHub = require("./SellerEventHub");
const CouponService = require("./CouponService");
const ShippingService = require("./ShippingService");
const AuditService = require("./AuditService");
const logger = require("../utils/logger");

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
    /**
     * Delivery detail for the receipt (Phase 36). `cost` is deliberately NOT
     * here: this DTO is shared by the buyer endpoint and the seller endpoint, so
     * including the seller's courier cost would hand the buyer the seller's
     * margin. The seller's own view of `cost` comes from the seller-only finance
     * and margin reports.
     */
    shipping: o.shipping?.methodKey
      ? {
          methodKey: o.shipping.methodKey,
          methodTitle: o.shipping.methodTitle || "",
          kind: o.shipping.kind || "",
          carrier: o.shipping.carrier || "",
          fee: o.shipping.fee || 0,
          zoneLabel: o.shipping.zoneLabel || "",
          eta: o.shipping.eta || { minDays: 0, maxDays: 0 },
          address: o.shipping.address || {},
          pickup: o.shipping.pickup || {},
        }
      : null,
    discount: o.discount || 0,
    // Null on an order with no coupon, so the receipt can render a breakdown
    // line only when there is genuinely something to explain.
    coupon: o.coupon?.couponId
      ? {
          code: o.coupon.code || "",
          type: o.coupon.type || "",
          value: o.coupon.value || 0,
          discount: o.coupon.discount || 0,
        }
      : null,
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
    notifications: (o.notifications || []).map((n) => ({
      channel: n.channel,
      status: n.status,
      reason: n.reason || "",
      message: n.message || "",
      delivered: n.delivered ?? false,
      error: n.error || "",
      at: n.at,
    })),
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
 * Can this order physically be handed over?
 *
 * Two shapes are accepted, and nothing else:
 *   - `pickup`: the store's own address must be on the order. A pickup method
 *     with no address is a promise the seller cannot keep.
 *   - `delivery`: a province, a city and a street line. A postal code alone is
 *     not enough — plenty of Iranian couriers deliver to a named village, so
 *     demanding one would refuse legitimate orders.
 *
 * Orders created before Phase 36 carry no `shipping` snapshot at all. Those fall
 * back to the old free-text `customer.address`, which at least closes the "shipped
 * with literally nowhere to go" hole without making every historical order
 * permanently unshippable. This is a transitional allowance and is recorded as
 * such; it disappears once no pre-Phase-36 order can still be in flight.
 *
 * @param {import("mongoose").Document} order
 * @throws {OrderDomainError} SHIPPING_DESTINATION_REQUIRED
 */
function assertShippable(order) {
  const shipping = order.shipping || {};

  if (shipping.kind === "pickup") {
    if (shipping.pickup?.address) return;
    throw new OrderDomainError(
      "SHIPPING_DESTINATION_REQUIRED",
      "نشانی فروشگاه برای سفارش حضوری ثبت نشده است",
      { kind: "pickup" },
    );
  }

  if (shipping.kind === "delivery") {
    const address = shipping.address || {};
    if (address.province && address.city && address.line1) return;
    throw new OrderDomainError(
      "SHIPPING_DESTINATION_REQUIRED",
      "برای ارسال، استان، شهر و نشانی گیرنده الزامی است",
      { kind: "delivery" },
    );
  }

  // No snapshot: a pre-Phase-36 order.
  if (typeof order.customer?.address === "string" && order.customer.address.trim()) return;

  throw new OrderDomainError(
    "SHIPPING_DESTINATION_REQUIRED",
    "برای ارسال، نشانی گیرنده الزامی است",
    { kind: "unknown" },
  );
}

/**
 * Create an order for one seller and reserve its stock.
 *
 * @param {object} params
 * @param {import("mongoose").Types.ObjectId} params.sellerId - SellerProfile id
 * @param {import("mongoose").Types.ObjectId} params.sellerUserId - User id
 * @param {{ name: string; phone: string; email?: string; address?: string }} params.customer
 * @param {Array<{ productId: string; qty: number }>} params.items
 * @param {string} [params.shippingMethodId] the seller's method KEY (Phase 36).
 *   Only a lookup key: the fee is derived here from the seller's own rate card,
 *   so a tampered body can pick a different method but never a cheaper price.
 * @param {object} [params.shippingAddress] structured destination for delivery.
 *   Not required for pickup, which has no destination by definition.
 * @param {number} [params.discount]
 * @param {string} [params.couponCode] seller-owned code to redeem (Phase 35).
 *   Only a lookup key: the amount is derived here from the server-priced
 *   subtotal, never taken from the request.
 * @param {string} [params.customerNote]
 * @param {"seller"|"storefront"} [params.origin] - entry point; defaults to seller
 * @param {import("mongoose").Types.ObjectId|null} [params.buyerUserId] - buyer for storefront orders
 */
async function createOrder({
  sellerId,
  sellerUserId,
  customer,
  items,
  shippingMethodId = null,
  shippingAddress = null,
  discount = 0,
  couponCode = null,
  customerNote = "",
  origin = "seller",
  buyerUserId = null,
  ...rejected
}) {
  // `shippingFee` used to be an accepted parameter. It is gone, because an
  // amount on this call is a price the caller chose rather than one the seller's
  // rate card produced. Ignoring it silently would hand every such caller FREE
  // shipping, so a leftover key is a hard error instead of a quiet discount.
  if ("shippingFee" in rejected) {
    throw new OrderDomainError(
      "SHIPPING_FEE_NOT_ACCEPTED",
      "هزینهٔ ارسال از سمت سرور محاسبه می‌شود؛ shippingMethodId ارسال کنید",
      { field: "shippingMethodId" },
    );
  }
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

  // A destination is validated before anything is priced, so a malformed address
  // is a hard error rather than a silently free shipment. Only delivery needs
  // one: pickup has no destination by definition, and a seller-created order may
  // legitimately be a phone order the seller will ask about.
  let normalizedShippingAddress = null;
  if (shippingAddress && typeof shippingAddress === "object" && !ShippingService.isEmptyAddress(shippingAddress)) {
    const normalized = ShippingService.normalizeAddress(shippingAddress);
    if (!normalized.ok) {
      throw new OrderDomainError("INVALID_SHIPPING_ADDRESS", normalized.errors[0], {
        errors: normalized.errors,
      });
    }
    normalizedShippingAddress = normalized.value;
  }

  // ── Phase 1: price the basket (read-only) ──────────────────────────────────
  // Snapshot rows are built in the requested order WITHOUT touching stock, so
  // the subtotal is known before any scarce resource is spent. `trackedToReserve`
  // records what phase 3 will have to reserve.
  const snapshotItems = [];
  const trackedToReserve = [];
  for (const item of items) {
    const product = products.find((p) => String(p._id) === String(item.productId));
    if (!product) {
      throw new OrderDomainError("PRODUCT_NOT_FOUND", "محصولی در سفارش یافت نشد", {
        productId: item.productId,
      });
    }

    if (product.stockPolicy === "tracked") {
      trackedToReserve.push({ product, qty: item.qty });
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
  const totalWeightKg = products.reduce(
    (sum, product) => sum + (Number(product.shipping?.weight) || 0) * (items.find((i) => String(i.productId) === String(product._id))?.qty || 0),
    0,
  );
  const totalQty = snapshotItems.reduce((sum, item) => sum + item.qty, 0);

  // ── Phase 1b: price delivery (Phase 36) ───────────────────────────────────
  // `shippingMethodId` is a lookup key, never an amount. The price comes from
  // the seller's own rate card via ShippingService, which is why a tampered
  // checkout body can choose a different method but cannot buy a cheaper one.
  //
  // A seller with no shipping profile is NOT blocked: the store stays open and
  // the order is created with free shipping, which is the decision of record.
  const shippingQuote = await ShippingService.quoteProfile({
    profile: await ShippingService.getProfile(sellerId),
    address: normalizedShippingAddress || {},
    subtotal,
    totalWeightKg,
    totalQty,
  });

  let chosenMethod = null;
  if (shippingMethodId) {
    chosenMethod =
      shippingQuote.methods.find((m) => m.key === String(shippingMethodId).toLowerCase()) || null;
    if (!chosenMethod) {
      // A method that exists but is not available to this destination must be
      // refused, and refused indistinguishably from one that never existed, so
      // the endpoint cannot be used to enumerate another store's rate card.
      throw new OrderDomainError(
        "SHIPPING_METHOD_UNAVAILABLE",
        "روش ارسال انتخاب‌شده برای این مقصد در دسترس نیست",
        { shippingMethodId: String(shippingMethodId) },
      );
    }
  } else if (shippingQuote.methods.length > 0) {
    // No preference: take the cheapest quote. The list is already sorted
    // cheapest-first, so this is the first entry by construction.
    chosenMethod = shippingQuote.methods[0];
  } else if (shippingQuote.configured) {
    // A seller who HAS configured rates, but whose rates cover neither this
    // destination nor this basket, gets no silent free order. Falling through
    // here would let a buyer pay nothing for delivery the seller never agreed to
    // carry, simply by omitting `shippingMethodId`. Only a store with no profile
    // at all — `configured: false` above — keeps the free-shipping default.
    throw new OrderDomainError(
      "SHIPPING_NOT_AVAILABLE",
      "برای این مقصد روش ارسالی در دسترس نیست",
      { reasons: shippingQuote.unavailable.map((u) => u.key) },
    );
  }

  const shippingFee = chosenMethod ? chosenMethod.fee : 0;
  const shippingSnapshot = chosenMethod
    ? {
        methodKey: chosenMethod.key,
        methodTitle: chosenMethod.title,
        kind: chosenMethod.kind,
        carrier: chosenMethod.carrier || "",
        fee: chosenMethod.fee,
        cost: 0,
        zoneLabel: chosenMethod.zoneLabel || "",
        eta: { minDays: chosenMethod.eta.minDays, maxDays: chosenMethod.eta.maxDays },
        address: normalizedShippingAddress || {
          receiverName: "",
          receiverPhone: "",
          province: "",
          city: "",
          postalCode: "",
          line1: "",
          line2: "",
          note: "",
          lat: null,
          lng: null,
        },
        pickup: chosenMethod.pickup || {
          address: "",
          city: "",
          province: "",
          hours: "",
          instructions: "",
        },
        quotedAt: new Date(),
      }
    : undefined;

  // ── Phase 2: spend the coupon ──────────────────────────────────────────────
  // The discount is decided HERE, from the subtotal this server just priced.
  // Nothing about the amount comes from the request, and `couponCode` is only
  // a lookup key against this seller's own coupons.
  //
  // Ordering matters. The scarce resource (the coupon's last remaining use) is
  // spent BEFORE stock is touched, and against an order id that already exists,
  // because a redemption row must point at a real order. A pre-generated id
  // gives that for free — so a buyer who loses a quota race never has their
  // stock reservation opened and rolled back.
  const orderId = new mongoose.Types.ObjectId();
  let appliedDiscount = Math.max(0, Math.floor(Number(discount) || 0));
  let couponSnapshot = null;
  let reservedCoupon = null;

  if (couponCode) {
    const evaluated = await CouponService.evaluateCoupon({
      sellerId,
      code: couponCode,
      subtotal,
      buyerUserId: buyerUserId || null,
    });
    appliedDiscount = evaluated.discount;
    reservedCoupon = await CouponService.reserveCoupon({
      coupon: evaluated.coupon,
      buyerUserId: buyerUserId || null,
      orderId,
      discount: evaluated.discount,
    });
    couponSnapshot = {
      couponId: evaluated.coupon._id,
      code: evaluated.coupon.code,
      type: evaluated.coupon.type,
      value: evaluated.coupon.value,
      discount: evaluated.discount,
    };
  } else {
    appliedDiscount = Math.min(appliedDiscount, subtotal);
  }

  const total = Math.max(0, subtotal + shippingFee - appliedDiscount);

  // ── Phase 3: reserve stock, then write the order ───────────────────────────
  // Every mutation from here on is compensated on failure. `reservedNow` is the
  // running list of reservations actually taken, so a mid-loop failure returns
  // exactly what it took and leaves nothing stranded.
  const reservedNow = [];

  /** Undo every reservation this call opened. Never masks the original error. */
  const unwindStock = async () => {
    for (const taken of reservedNow.reverse()) {
      await restoreStock(taken.productId, String(sellerId), taken.qty).catch((err) =>
        logger.error("Failed to unwind a stock reservation for a failed order", {
          productId: String(taken.productId),
          qty: taken.qty,
          error: err.message,
        }),
      );
    }
  };

  /** Give a coupon use back to whoever was holding it. Never throws. */
  const unwindCoupon = async () => {
    if (!reservedCoupon) return;
    await CouponService.releaseCouponForOrder(orderId).catch((err) =>
      logger.error("Failed to release coupon after order write failure", {
        error: err.message,
      }),
    );
  };

  try {
    for (const { product, qty } of trackedToReserve) {
      const reserved = await reserveStock(product._id, sellerId, qty);
      if (!reserved) {
        throw new OrderDomainError(
          "INSUFFICIENT_STOCK",
          `موجودی کافی برای «${product.title}» وجود ندارد`,
          { productId: String(product._id), title: product.title },
        );
      }
      reservedNow.push({ productId: product._id, qty });
    }

    const orderNumber = await nextSequence(`order:${String(sellerId)}`);
    const order = await Order.create({
      _id: orderId,
      sellerId,
      sellerUserId,
      origin,
      buyerUserId,
      orderNumber,
      customer: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email || "",
        telegram: customer.telegram || "",
        // Composed from the structured parts so the seller list, the receipt and
        // the legacy free-text column all show a usable address. Kept as one
        // line on purpose: the parts live in `shipping.address`.
        address:
          customer.address ||
          (normalizedShippingAddress
            ? [
                normalizedShippingAddress.province,
                normalizedShippingAddress.city,
                normalizedShippingAddress.line1,
                normalizedShippingAddress.line2,
              ]
                .filter(Boolean)
                .join("، ")
            : ""),
      },
      items: snapshotItems,
      subtotal,
      shippingFee,
      shipping: shippingSnapshot,
      discount: appliedDiscount,
      coupon: couponSnapshot || undefined,
      total,
      currency: snapshotItems[0]?.currency || "IRR",
      status: "pending",
      timeline: [{ status: "pending", at: new Date() }],
      customerNote: customerNote || "",
      payment: { status: "unpaid" },
    });

    // A brand-new order is the single most important seller notification
    // (storefront checkout included), so it is published with `from: null`.
    publishOrderEvent(order, null);

    // Money left the seller's till because of this campaign, so the redemption
    // joins the audit trail. `AuditService.log` swallows its own failures, so
    // awaiting it makes the trail deterministic without letting an audit
    // problem fail the order. It is awaited like every other `AuditService.log`
    // call in the codebase; `COUPON_REDEEMED` is only emitted when a campaign
    // was actually applied, so plain orders pay nothing.
    if (couponSnapshot) {
      await AuditService.log({
        // A guest checkout has no buyer account, so the store's own operator
        // owns the entry.
        userId: String(buyerUserId || sellerUserId),
        action: "COUPON_REDEEMED",
        resource: { type: "COUPON", id: String(couponSnapshot.couponId) },
        result: "SUCCESS",
        riskLevel: "LOW",
        metadata: {
          code: couponSnapshot.code,
          discount: couponSnapshot.discount,
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          buyerUserId: buyerUserId ? String(buyerUserId) : null,
          sellerProfileId: String(sellerId),
        },
      });
    }

    return order;
  } catch (e) {
    // The order never became real, so every scarce thing this call consumed has
    // to go back: reserved stock first, then the coupon use. A failed write must
    // not permanently consume a one-use-per-buyer allowance or hold inventory
    // hostage.
    await unwindStock();
    await unwindCoupon();
    throw e;
  }
}

  /**
   * Live store event (P1-05) so open dashboards refetch without polling.
   * Never throws: a live update must not fail the write path that triggered it.
   */
  function publishOrderEvent(order, fromStatus) {
    try {
      sellerEventHub.publish(order.sellerId, "order", {
        id: String(order._id),
        orderNumber: order.orderNumber,
        from: fromStatus || null,
        status: order.status,
        total: order.total,
        currency: order.currency || "IRR",
        at: new Date().toISOString(),
      });
    } catch (e) {
      logger.warn("Failed to publish seller order event", { error: e.message });
    }
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
    // The order never became real, so the coupon's use goes back with it. A
    // buyer must not lose a one-use-per-buyer allowance because a seller or a
    // carrier dropped the order. Refunds travel the RMA path instead, where the
    // discount really was consumed.
    if (order.coupon?.couponId) {
      await CouponService.releaseCouponForOrder(order._id).catch((e) =>
        logger.error("Failed to release coupon on cancellation", { error: e.message }),
      );
    }
  } else if (nextStatus === "returned") {
    // Reservation was released at shipment; units physically return to onHand.
    for (const item of order.items) {
      await returnToStock(item.productId, sellerId, item.qty);
    }
  } else if (nextStatus === "shipped") {
    // A shipment must have a destination. Before this guard an order could go to
    // `shipped` with no address at all: the reservation was released, the buyer
    // was told their parcel was on the way, and the order could then reach
    // `delivered` and earn real money in the payout ledger with no evidence that
    // anything was ever sent. An undeliverable order must never be earnable.
    assertShippable(order);
    for (const item of order.items) {
      await releaseReserved(item.productId, sellerId, item.qty);
    }
  }

  const fromStatus = order.status;
  order.status = nextStatus;
  // A payment-reminder record is only meaningful while the order is still
  // pending. The moment it leaves pending (payment done / cancelled) the nudge
  // is moot — drop it here so the delivery queue never resurfaces it after
  // the buyer already paid.
  if (fromStatus === "pending") {
    order.notifications = order.notifications.filter(
      (n) => !(n.status === "pending" && n.reason === NotificationService.REMINDER_REASON),
    );
  }
  order.timeline.push({
    status: nextStatus,
    at: new Date(),
    by: sellerUserId || null,
    reason: reason || "",
  });
  // Buyer notifications are recorded atomically with the transition so the
  // state is testable; the actual SMS is dispatched off-loop (never blocks the
  // seller's changeOrderStatus reply, never throws).
  if (NotificationService.hasNotificationTarget(order)) {
    order.notifications.push({
      channel: "sms",
      status: nextStatus,
      to: order.customer.phone,
      reason: reason || "",
    });
  }
  if (NotificationService.hasEmailTarget(order)) {
    order.notifications.push({
      channel: "email",
      status: nextStatus,
      to: order.customer.email,
      reason: reason || "",
    });
  }
  if (NotificationService.hasTelegramTarget(order)) {
    order.notifications.push({
      channel: "telegram",
      status: nextStatus,
      to: order.customer.telegram,
      reason: reason || "",
    });
  }
  await order.save();

  // Live store event (P1-05) so open dashboards refetch without polling.
  publishOrderEvent(order, fromStatus);

  if (order.notifications.length > 0) {
    void NotificationService.deliverOrderNotifications(order._id);
  }

  return order;
}

/**
 * List orders for a seller. `status` filters by workflow state; `q` searches
 * customer name/phone or the numeric order number.
 */
/**
 * Lenient numeric filter value: empty/blank becomes undefined, non-numeric
 * stays undefined, everything else becomes a finite number.
 */
function numericFilter(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// ── Query ──────────────────────────────────────────────────────────────────

function buildOrderFilter(
  sellerId,
  { status, q, from, to, payment, minTotal, maxTotal } = {},
) {
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

  const since = from ? new Date(from) : null;
  const until = to ? new Date(to) : null;
  const hasSince = since && !Number.isNaN(since.getTime());
  const hasUntil = until && !Number.isNaN(until.getTime());
  if (hasSince || hasUntil) {
    filter.createdAt = {};
    if (hasSince) filter.createdAt.$gte = since;
    if (hasUntil) filter.createdAt.$lte = until;
  }

  if (payment && ["paid", "unpaid"].includes(payment)) {
    filter["payment.status"] = payment;
  }

  const min = numericFilter(minTotal);
  const max = numericFilter(maxTotal);
  if (min !== undefined || max !== undefined) {
    filter.total = {};
    if (min !== undefined) filter.total.$gte = min;
    if (max !== undefined) filter.total.$lte = max;
  }

  return filter;
}

async function listOrders(
  sellerId,
  { page = 1, limit = 25, status, q, from, to, payment, minTotal, maxTotal } = {},
) {
  const filter = buildOrderFilter(sellerId, { status, q, from, to, payment, minTotal, maxTotal });

  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);
  return { items: orders.map(orderToDTO), total, page, limit };
}

/**
 * Row-level CSV export payload: every order matching the same filters as
 * `listOrders`, newest first, sorted stable (secondary SKU order). The 50k cap
 * prevents a memory blow-up on accidentally unconstrained windows; exports of
 * this size are far beyond any seller dashboard use-case.
 */
async function exportOrders(
  sellerId,
  { status, q, from, to, payment, minTotal, maxTotal } = {},
) {
  const filter = buildOrderFilter(sellerId, { status, q, from, to, payment, minTotal, maxTotal });
  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(50000)
    .lean();
  return orders;
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
  exportOrders,
  getOrder,
  countsByStatus,
};