/**
 * ReturnService — the RMA domain behind Phase 33 (P1-04).
 *
 * The order state machine already knows `delivered → returned` and already
 * puts the units back on hand. What it could not answer — and what every
 * buyer dispute actually turns on — was: why, who asked, what the seller
 * decided, and how much money went back. That lives here, in a document with
 * its own lifecycle, so `order.status` stays a statement about the goods while
 * the RMA is the statement about the money.
 *
 * Invariants it enforces (each covered by tests):
 *   - A request can only be filed against an order this seller owns, and only
 *     while that order is `delivered` and inside the return window.
 *   - At most one open request per order (unique sparse `openKey` index), so
 *     two refund claims can never be issued for one delivery.
 *   - The state machine is the only way to change status; a refund is the only
 *     way out of `received`, and it always carries an amount.
 *   - The money actually returned is recorded on both the RMA and the order's
 *     payment snapshot, so the finance ledger can never claim a full refund
 *     when a partial one happened.
 *   - Stock returns exactly once, through the existing `transitionOrder` path.
 */
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const { nextSequence } = require("../models/AtomicCounter");
const OrderService = require("./OrderService");
const sellerEventHub = require("./SellerEventHub");
const logger = require("../utils/logger");

const RETURN_TRANSITIONS = ReturnRequest.RETURN_TRANSITIONS;
const RETURN_STATUSES = ReturnRequest.RETURN_STATUSES;
const OPEN_RETURN_STATUSES = ReturnRequest.OPEN_RETURN_STATUSES;

/** Days after delivery during which a buyer may still open a return. */
const RETURN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

class ReturnDomainError extends Error {
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

function returnToDTO(ret) {
  const r = ret.toObject ? ret.toObject({ virtuals: true }) : ret;
  return {
    id: String(r._id),
    sellerId: String(r.sellerId),
    orderId: String(r.orderId),
    orderNumber: r.orderNumber,
    rmaNumber: r.rmaNumber,
    buyerUserId: r.buyerUserId ? String(r.buyerUserId) : null,
    status: r.status,
    isOpen: OPEN_RETURN_STATUSES.includes(r.status),
    reason: r.reason || "",
    resolutionNote: r.resolutionNote || "",
    customerName: r.customerName || "",
    customerPhone: r.customerPhone || "",
    items: (r.items || []).map((item) => ({
      productId: String(item.productId),
      title: item.title,
      price: item.price,
      qty: item.qty,
    })),
    refundAmount: r.refundAmount || 0,
    refundCurrency: r.refundCurrency || "IRR",
    refundedAt: r.refundedAt || null,
    timeline: (r.timeline || []).map((entry) => ({
      status: entry.status,
      at: entry.at,
      by: entry.by ? String(entry.by) : null,
      note: entry.note || "",
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** When the order reached `delivered` (last matching timeline entry). */
function deliveredAt(order) {
  const entries = order.timeline || [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].status === "delivered") return entries[i].at;
  }
  return null;
}

/**
 * Whether `order` may still be returned, and until when.
 * @returns {{ ok: boolean, deliveredAt: Date|null, deadline: Date|null, reason: string }}
 */
function returnEligibility(order) {
  if (!order) {
    return { ok: false, deliveredAt: null, deadline: null, reason: "ORDER_NOT_RETURNABLE" };
  }
  const at = deliveredAt(order);
  const deadline = at ? new Date(new Date(at).getTime() + RETURN_WINDOW_DAYS * DAY_MS) : null;

  if (order.status !== "delivered") {
    return { ok: false, deliveredAt: at, deadline, reason: "ORDER_NOT_RETURNABLE" };
  }
  if (!at) {
    return { ok: false, deliveredAt: null, deadline: null, reason: "DELIVERY_DATE_UNKNOWN" };
  }
  if (new Date().getTime() > deadline.getTime()) {
    return { ok: false, deliveredAt: at, deadline, reason: "RETURN_WINDOW_CLOSED" };
  }
  return { ok: true, deliveredAt: at, deadline, reason: "" };
}

/** Throws the domain error that matches an ineligibility verdict. */
function assertReturnable(order) {
  const verdict = returnEligibility(order);
  if (verdict.ok) return verdict;

  const messages = {
    ORDER_NOT_RETURNABLE: "این سفارش در وضعیت قابل مرجوعی نیست",
    DELIVERY_DATE_UNKNOWN: "تاریخ تحویل سفارش مشخص نیست",
    RETURN_WINDOW_CLOSED: `مهلت مرجوعی (${RETURN_WINDOW_DAYS} روز) به پایان رسیده است`,
  };
  throw new ReturnDomainError(
    verdict.reason,
    messages[verdict.reason] || "امکان ثبت مرجوعی وجود ندارد",
    { deadline: verdict.deadline, orderStatus: order?.status },
  );
}

function snapshotItems(order) {
  return (order.items || []).map((item) => ({
    productId: item.productId,
    title: item.title,
    price: item.price,
    qty: item.qty,
  }));
}

async function findOpenRequest(orderId) {
  return ReturnRequest.findOne({ openKey: String(orderId) });
}

/**
 * Live store event so an open seller dashboard refetches without polling.
 *
 * `orderStatus` is always the order's REAL status, never the RMA's: a buyer
 * merely filing a claim does not turn the order into a return, and an event
 * claiming otherwise would put a wrong status in the seller's notification
 * bell. Refunding is the one action where it actually becomes `returned`.
 */
function publishReturnEvent(ret, fromStatus, orderStatus) {
  try {
    sellerEventHub.publish(ret.sellerId, "order", {
      id: String(ret.orderId),
      orderNumber: ret.orderNumber,
      from: fromStatus || null,
      status: orderStatus,
      returnId: String(ret._id),
      rmaNumber: ret.rmaNumber,
      at: new Date().toISOString(),
    });
  } catch (e) {
    logger.warn("Failed to publish seller return event", { error: e.message });
  }
}

/**
 * Persist a new request. Shared by the buyer path and the seller-filed path;
 * the difference is only the initial status and whose id is recorded as `by`.
 *
 * @param {object} params
 * @param {import("mongoose").Model<Order>} params.order - the delivered order
 * @param {string} params.reason - buyer's stated reason (required)
 * @param {import("mongoose").Types.ObjectId|null} [params.buyerUserId]
 * @param {import("mongoose").Types.ObjectId|null} [params.sellerUserId]
 * @param {"requested"|"approved"} [params.initialStatus]
 * @param {string} [params.note]
 */
async function persistRequest({
  order,
  reason,
  buyerUserId = null,
  sellerUserId = null,
  initialStatus = "requested",
  note = "",
}) {
  const existing = await findOpenRequest(order._id);
  if (existing) {
    throw new ReturnDomainError("RETURN_ALREADY_OPEN", "برای این سفارش درخواست مرجوعی باز وجود دارد", {
      returnId: String(existing._id),
      rmaNumber: existing.rmaNumber,
      status: existing.status,
    });
  }

  const rmaNumber = await nextSequence(`rma:${String(order.sellerId)}`);
  const actor = buyerUserId || sellerUserId || null;

  try {
    return await ReturnRequest.create({
      sellerId: order.sellerId,
      sellerUserId: order.sellerUserId || sellerUserId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || "",
      customerPhone: order.customer?.phone || "",
      buyerUserId,
      rmaNumber,
      status: initialStatus,
      openKey: String(order._id),
      reason,
      resolutionNote: initialStatus === "approved" ? note : "",
      items: snapshotItems(order),
      refundCurrency: order.currency || "IRR",
      timeline: [{ status: initialStatus, at: new Date(), by: actor, note }],
    });
  } catch (e) {
    // Two simultaneous requests lose the unique `openKey` race here. Losing it
    // is the correct outcome — the loser is told the truth, not a 500.
    if (e && e.code === 11000) {
      throw new ReturnDomainError("RETURN_ALREADY_OPEN", "برای این سفارش درخواست مرجوعی باز وجود دارد", {
        orderId: String(order._id),
      });
    }
    throw e;
  }
}

// ── Service ─────────────────────────────────────────────────────────────────

/**
 * Buyer opens a return request. The order must be this buyer's own storefront
 * order; a seller-entered order has no buyer identity to claim.
 */
async function createReturnRequest({ buyerUserId, orderId, reason }) {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!buyerUserId) {
    throw new ReturnDomainError("VALIDATION_ERROR", "خریدار مشخص نیست");
  }
  if (!text) {
    throw new ReturnDomainError("VALIDATION_ERROR", "علت مرجوعی الزامی است", { field: "reason" });
  }

  const order = await Order.findOne({
    _id: orderId,
    buyerUserId,
    origin: "storefront",
  });
  if (!order) {
    throw new ReturnDomainError("ORDER_NOT_FOUND", "سفارش یافت نشد");
  }
  assertReturnable(order);

  const ret = await persistRequest({ order, reason: text, buyerUserId });
  publishReturnEvent(ret, null, order.status);
  return ret;
}

/**
 * Seller files a return on the buyer's behalf (a walk-in return, or a phone
 * request the buyer cannot file online). Filed straight into `approved` —
 * the seller is the approver, so there is nothing to wait for.
 */
async function createSellerReturnRequest({ sellerId, orderId, reason, sellerUserId }) {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!text) {
    throw new ReturnDomainError("VALIDATION_ERROR", "علت مرجوعی الزامی است", { field: "reason" });
  }

  const order = await Order.findOne({ _id: orderId, sellerId });
  if (!order) {
    throw new ReturnDomainError("ORDER_NOT_FOUND", "سفارش یافت نشد");
  }
  assertReturnable(order);

  const ret = await persistRequest({
    order,
    reason: text,
    sellerUserId,
    initialStatus: "approved",
    note: "ثبت توسط فروشنده",
  });
  publishReturnEvent(ret, null, order.status);
  return ret;
}

/**
 * Move a request through the RMA state machine (approve / reject / receive /
 * cancel). Refunding is deliberately NOT reachable here: it is the only
 * transition that moves money, so it carries its own validated entry point.
 */
async function transitionReturn({ sellerId, returnId, nextStatus, sellerUserId, note = "" }) {
  if (!RETURN_STATUSES.includes(nextStatus) || nextStatus === "refunded") {
    throw new ReturnDomainError("VALIDATION_ERROR", "وضعیت مرجوعی نامعتبر است", { field: "status" });
  }

  const ret = await ReturnRequest.findOne({ _id: returnId, sellerId });
  if (!ret) {
    throw new ReturnDomainError("RETURN_NOT_FOUND", "درخواست مرجوعی یافت نشد");
  }

  const allowed = RETURN_TRANSITIONS[ret.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new ReturnDomainError(
      "INVALID_RETURN_TRANSITION",
      `انتقال از «${ret.status}» به «${nextStatus}» مجاز نیست`,
      { from: ret.status, to: nextStatus },
    );
  }

  const fromStatus = ret.status;
  ret.status = nextStatus;
  // A rejection must carry a justification: a buyer whose claim is denied is
  // owed an answer, and "no" alone is not one.
  if (nextStatus === "rejected" && !note.trim() && !ret.resolutionNote) {
    throw new ReturnDomainError("VALIDATION_ERROR", "برای رد مرجوعی ذکر دلیل الزامی است", {
      field: "note",
    });
  }
  if (note.trim()) ret.resolutionNote = note.trim();
  // `openKey` is released ONLY on a terminal state. `approved` and `received`
  // are still open (the goods are out, or the money is not yet back), so
  // dropping the key here would let a second claim be filed against the same
  // order while the first is still being settled.
  if (!OPEN_RETURN_STATUSES.includes(nextStatus)) {
    ret.openKey = undefined;
  }
  ret.timeline.push({ status: nextStatus, at: new Date(), by: sellerUserId || null, note: note || "" });
  await ret.save();

  // The order's own status is untouched by approve/reject/receive; the event
  // reports the truth so the dashboard refetches without mislabelling it.
  const order = await Order.findOne({ _id: ret.orderId, sellerId }).select("status").lean();
  publishReturnEvent(ret, fromStatus, order?.status || null);
  return ret;
}

/**
 * Issue the refund: the only path that moves money.
 *
 * Requires the goods to be in (`received`), so the seller can never refund a
 * return that has not physically arrived. The order leaves `delivered` through
 * the normal `transitionOrder`, which is what puts the units back on hand —
 * that is why this method does not touch stock itself.
 */
async function refundReturn({ sellerId, returnId, refundAmount, sellerUserId, note = "" }) {
  const ret = await ReturnRequest.findOne({ _id: returnId, sellerId });
  if (!ret) {
    throw new ReturnDomainError("RETURN_NOT_FOUND", "درخواست مرجوعی یافت نشد");
  }
  if (!Number.isInteger(refundAmount) || refundAmount < 1) {
    throw new ReturnDomainError("REFUND_AMOUNT_INVALID", "مبلغ استرداد باید عدد صحیح و بزرگ‌تر از صفر باشد", {
      field: "refundAmount",
    });
  }

  const order = await Order.findOne({ _id: ret.orderId, sellerId });
  if (!order) {
    throw new ReturnDomainError("ORDER_NOT_FOUND", "سفارش یافت نشد");
  }

  // The RMA is the vehicle for the whole order's money. A first refund enters
  // from `received`; a follow-up (top-up) re-enters from `refunded` while the
  // order still carries an outstanding balance. Without this path a partial
  // refund would permanently strand the remainder: the RMA closes, the order is
  // `returned`, and a fresh claim can no longer reach it (the goods are already
  // back, so only money is left to settle).
  const alreadyRefunded = order.payment?.refundedAmount || 0;
  const outstanding = Math.max(0, order.total - alreadyRefunded);
  const isTopUp = ret.status === "refunded" && outstanding > 0;
  if (ret.status !== "received" && !isTopUp) {
    throw new ReturnDomainError(
      "INVALID_RETURN_TRANSITION",
      "استرداد تنها پس از دریافت کالا ممکن است",
      { from: ret.status, to: "refunded" },
    );
  }

  if (refundAmount > outstanding) {
    throw new ReturnDomainError(
      "REFUND_AMOUNT_INVALID",
      "مبلغ استرداد از ماندهٔ قابل استرداد سفارش بیشتر است",
      { field: "refundAmount", orderTotal: order.total, alreadyRefunded, outstanding },
    );
  }

  // `delivered` is the normal case. An order the seller already returned by
  // hand (legacy `delivered → returned` path), or one whose earlier partial
  // refund already flipped it, is tolerated: the goods are back, the stock was
  // restored once by the (one-way, retry-idempotent) transition below, and only
  // the money remains. Money is checked BEFORE anything is written so a rejected
  // amount leaves the order untouched.
  if (order.status === "delivered") {
    try {
      await OrderService.transitionOrder({
        orderId: order._id,
        sellerId,
        nextStatus: "returned",
        sellerUserId,
        reason: `استرداد مبلغ ${refundAmount} بابت درخواست مرجوعی #${ret.rmaNumber}`,
      });
    } catch (e) {
      // A concurrent refund may have already flipped the order to `returned`;
      // the transition is one-way and already restored stock, so losing that
      // race is harmless. The atomic ledger guard below is the single judge of
      // who actually gets the money, so rethrowing here would only replace a
      // truthful "amount exceeded" with a misleading "invalid transition".
      if (e.code !== "INVALID_TRANSITION") throw e;
    }
  } else if (order.status !== "returned") {
    throw new ReturnDomainError(
      "ORDER_NOT_RETURNABLE",
      "سفارش در وضعیتی نیست که بتوان استرداد آن را ثبت کرد",
      { orderStatus: order.status },
    );
  }

  // The ledger write is the one race that can lose real money, so it is a
  // single atomic guarded increment — never read-modify-write. Two concurrent
  // refunds can therefore never push `refundedAmount` past `total`: the guard
  // lives in the query, so the loser matches nothing and is told the truth.
  const refundedAt = new Date();
  const fresh = await Order.findOneAndUpdate(
    {
      _id: order._id,
      sellerId,
      $or: [
        { "payment.refundedAmount": { $lte: order.total - refundAmount } },
        { "payment.refundedAmount": null },
      ],
    },
    {
      $inc: { "payment.refundedAmount": refundAmount },
      $set: { "payment.status": "refunded", "payment.refundedAt": refundedAt },
    },
    { new: true },
  );
  if (!fresh) {
    throw new ReturnDomainError(
      "REFUND_AMOUNT_INVALID",
      "مبلغ استرداد از ماندهٔ قابل استرداد سفارش بیشتر است",
      { field: "refundAmount", orderTotal: order.total, alreadyRefunded },
    );
  }

  const fromStatus = ret.status;
  ret.status = "refunded";
  // Cumulative on the RMA ledger; the controller reports the increment for the
  // audit trail so a top-up never looks like a second full refund.
  ret.refundAmount = (ret.refundAmount || 0) + refundAmount;
  ret.refundedAt = refundedAt;
  // The RMA stays the open vehicle while money is still owed on the order and
  // only a fully settled order releases the unique `openKey`, which is what
  // keeps a competing second RMA from being filed meanwhile.
  if (fresh.payment.refundedAmount >= fresh.total) {
    ret.openKey = undefined;
  }
  if (note.trim()) ret.resolutionNote = note.trim();
  ret.timeline.push({
    status: "refunded",
    at: refundedAt,
    by: sellerUserId || null,
    note: note || `استرداد ${refundAmount}`,
  });
  await ret.save();

  publishReturnEvent(ret, fromStatus, fresh.status);
  return { ret, order: fresh, refundedNow: refundAmount, outstanding: Math.max(0, fresh.total - fresh.payment.refundedAmount) };
}

// ── Queries ─────────────────────────────────────────────────────────────────

function buildSellerFilter(sellerId, { status } = {}) {
  const filter = { sellerId };
  if (status && RETURN_STATUSES.includes(status)) {
    filter.status = status;
  }
  return filter;
}

async function listSellerReturns(sellerId, { page = 1, limit = 25, status } = {}) {
  const filter = buildSellerFilter(sellerId, { status });
  const [docs, total] = await Promise.all([
    ReturnRequest.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    ReturnRequest.countDocuments(filter),
  ]);

  // The refund input must be bounded by what was actually charged, which is
  // NOT the sum of the item lines once a discount is involved. One extra
  // query for the whole page, never one per row.
  const items = docs.map(returnToDTO);
  const orderIds = [...new Set(items.map((r) => r.orderId))];
  const totals = new Map();
  if (orderIds.length) {
    const orders = await Order.find({ _id: { $in: orderIds } })
      .select("total currency")
      .lean();
    for (const o of orders) totals.set(String(o._id), o);
  }
  for (const r of items) {
    const order = totals.get(r.orderId);
    r.orderTotal = order ? order.total : null;
    r.orderCurrency = order ? order.currency || r.refundCurrency : r.refundCurrency;
  }

  return { items, total, page, limit };
}

async function getSellerReturn(sellerId, returnId) {
  const ret = await ReturnRequest.findOne({ _id: returnId, sellerId });
  if (!ret) return null;
  const dto = returnToDTO(ret);
  const order = await Order.findById(ret.orderId).select("total currency").lean();
  dto.orderTotal = order ? order.total : null;
  dto.orderCurrency = order ? order.currency || dto.refundCurrency : dto.refundCurrency;
  return dto;
}

async function countByStatus(sellerId) {
  const rows = await ReturnRequest.aggregate([
    { $match: { sellerId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(RETURN_STATUSES.map((s) => [s, 0]));
  let awaitingDecision = 0;
  for (const row of rows) {
    if (row._id in counts) counts[row._id] = row.count;
  }
  awaitingDecision = counts.requested + counts.approved;
  return { ...counts, awaitingDecision, open: counts.requested + counts.approved + counts.received };
}

/** A buyer's own requests. Scoped by `buyerUserId`, so nothing leaks sideways. */
async function listBuyerReturns(buyerUserId, { page = 1, limit = 10 } = {}) {
  if (!buyerUserId) {
    throw new ReturnDomainError("VALIDATION_ERROR", "خریدار مشخص نیست");
  }
  const [items, total] = await Promise.all([
    ReturnRequest.find({ buyerUserId })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ReturnRequest.countDocuments({ buyerUserId }),
  ]);
  return { items: items.map(returnToDTO), total, page, limit };
}

async function getBuyerReturn(buyerUserId, returnId) {
  if (!buyerUserId) {
    throw new ReturnDomainError("VALIDATION_ERROR", "خریدار مشخص نیست");
  }
  const ret = await ReturnRequest.findOne({ _id: returnId, buyerUserId });
  return ret ? returnToDTO(ret) : null;
}

module.exports = {
  ReturnDomainError,
  RETURN_WINDOW_DAYS,
  RETURN_TRANSITIONS,
  RETURN_STATUSES,
  OPEN_RETURN_STATUSES,
  returnToDTO,
  returnEligibility,
  createReturnRequest,
  createSellerReturnRequest,
  transitionReturn,
  refundReturn,
  listSellerReturns,
  getSellerReturn,
  countByStatus,
  listBuyerReturns,
  getBuyerReturn,
};
