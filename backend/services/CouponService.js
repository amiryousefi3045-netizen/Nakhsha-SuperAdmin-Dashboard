/**
 * CouponService — the discount engine behind Phase 35 (P1-07).
 *
 * The one rule this whole file exists to enforce: **the amount taken off an
 * order is decided on the server, from the cart the server priced.** A coupon
 * code is a string a buyer types; the resulting discount is never accepted from
 * the client, and no browser response influences it. Everything else — the
 * percentage ceiling, the minimum spend, the per-buyer cap, the total cap — is
 * a guard against a *legitimate-looking* order taking more than it should.
 *
 * Unit discipline: every amount here is an integer in the same unit as
 * `Order.subtotal` / `Order.total`. The stack has no Rial↔Toman conversion
 * anywhere, so a value stored in a different unit would be silently 10x wrong.
 *
 * Concurrency: the last remaining use of a coupon is spent with a single
 * guarded atomic `$inc`, and a one-use-per-buyer allowance is protected by a
 * unique index rather than a count. Read-then-write in both places would hand a
 * buyer two discounts for one code by simply firing two requests at once.
 */
const Coupon = require("../models/Coupon");
const CouponRedemption = require("../models/CouponRedemption");
const logger = require("../utils/logger");

const COUPON_TYPES = Coupon.COUPON_TYPES;
const COUPON_STATUSES = Coupon.COUPON_STATUSES;

/** Codes are typed by humans in a hurry; keep them short and typo-proof. */
const CODE_MIN_LENGTH = 4;
const CODE_MAX_LENGTH = 32;

class CouponDomainError extends Error {
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

const MESSAGES = {
  COUPON_NOT_FOUND: "کد تخفیف نامعتبر است",
  COUPON_INACTIVE: "این کد تخفیف غیرفعال است",
  COUPON_NOT_STARTED: "زمان استفاده از این کد تخفیف هنوز نرسیده است",
  COUPON_EXPIRED: "مهلت استفاده از این کد تخفیف به پایان رسیده است",
  COUPON_EXHAUSTED: "ظرفیت این کد تخفیف تکمیل شده است",
  COUPON_MIN_PURCHASE: "مبلغ سفارش برای استفاده از این کد تخفیف کافی نیست",
  COUPON_USER_LIMIT: "سقف استفاده از این کد تخفیف برای شما تکمیل شده است",
  COUPON_CODE_INVALID: `کد تخفیف باید بین ${CODE_MIN_LENGTH} تا ${CODE_MAX_LENGTH} نویسهٔ انگلیسی باشد`,
  COUPON_ALREADY_APPLIED: "این سفارش قبلاً یک کد تخفیف دارد",
};

/** Human-facing reasons a code was refused. Deliberately terse and honest. */
function fail(code, details = null) {
  throw new CouponDomainError(code, MESSAGES[code] || MESSAGES.COUPON_NOT_FOUND, details);
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Normalise a typed code to its stored form.
 *
 * Upper-casing happens on write, so a buyer typing `summer1404` must match a
 * code minted as `SUMMER1404`. Internal whitespace is stripped rather than
 * rejected because phones autofill spaces; everything else is refused so a
 * wildcard-ish input cannot reach the database as a lookup key.
 *
 * @param {unknown} code
 * @returns {string} the normalised code, or "" when it is not a usable code
 */
function normaliseCode(code) {
  if (typeof code !== "string") return "";
  const trimmed = code.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return "";
  if (trimmed.length < CODE_MIN_LENGTH || trimmed.length > CODE_MAX_LENGTH) return "";
  return trimmed.toUpperCase();
}

/**
 * How much a coupon takes off a subtotal.
 *
 * Pure and integer-only, so the arithmetic can be pinned by tests without a
 * database. Two rules matter:
 *   - A percentage is rounded once, to the nearest unit, not per item. Rounding
 *     per line would let a buyer inflate a tiny discount by splitting a cart.
 *   - The result is clamped to the subtotal. Shipping is the seller's cost to
 *     fulfil; a code must not be able to pay for the delivery, or a free
 *     shipping coupon becomes an unbounded loss.
 *
 * @param {{type: string, value: number, maxDiscount?: number}} coupon
 * @param {number} subtotal
 * @returns {number} integer discount, never negative and never > subtotal
 */
function computeDiscount(coupon, subtotal) {
  const base = Math.max(0, Math.floor(Number(subtotal) || 0));
  if (base <= 0) return 0;

  let off;
  if (coupon.type === "percent") {
    off = Math.round((base * Number(coupon.value)) / 100);
    const cap = Number(coupon.maxDiscount) || 0;
    if (cap > 0 && off > cap) off = cap;
  } else {
    off = Number(coupon.value) || 0;
  }
  return Math.min(Math.max(0, Math.floor(off)), base);
}

/** Whether a coupon's own window/ceiling rules allow an attempt right now. */
function assertUsable(coupon, subtotal) {
  if (coupon.status !== "active") fail("COUPON_INACTIVE", { status: coupon.status });

  const now = Date.now();
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
    fail("COUPON_NOT_STARTED", { startsAt: coupon.startsAt });
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) {
    fail("COUPON_EXPIRED", { expiresAt: coupon.expiresAt });
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    fail("COUPON_EXHAUSTED", { maxUses: coupon.maxUses, usedCount: coupon.usedCount });
  }
  if (coupon.minPurchase > 0 && subtotal < coupon.minPurchase) {
    fail("COUPON_MIN_PURCHASE", { minPurchase: coupon.minPurchase, subtotal });
  }
}

// ── DTO ─────────────────────────────────────────────────────────────────────

function couponToDTO(coupon, extra = {}) {
  const c = coupon.toObject ? coupon.toObject() : coupon;
  const remaining = c.maxUses > 0 ? Math.max(0, c.maxUses - c.usedCount) : null;
  return {
    id: String(c._id),
    code: c.code,
    description: c.description || "",
    type: c.type,
    value: c.value,
    maxDiscount: c.maxDiscount || 0,
    minPurchase: c.minPurchase || 0,
    maxUses: c.maxUses || 0,
    maxUsesPerBuyer: c.maxUsesPerBuyer || 0,
    usedCount: c.usedCount || 0,
    remainingUses: remaining,
    startsAt: c.startsAt || null,
    expiresAt: c.expiresAt || null,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    ...extra,
  };
}

// ── Validation of seller-authored input ─────────────────────────────────────

/**
 * Validate a create/update payload. Every number is coerced to a real integer
 * and range-checked here, so a `maxDiscount` of `-1` or a `value` of `12.5`
 * cannot reach the schema's own weaker checks and produce a coupon that
 * silently behaves as something the seller never intended.
 *
 * @param {object} input
 * @param {"create"|"update"} mode
 * @returns {object} a clean, coerced copy ready for the model
 */
function parseCouponInput(input, mode = "create") {
  const out = {};

  if (mode === "create" || input.code !== undefined) {
    const code = normaliseCode(input.code);
    if (!code) fail("COUPON_CODE_INVALID", { field: "code" });
    out.code = code;
  }

  if (input.type !== undefined) {
    if (!COUPON_TYPES.includes(input.type)) {
      throw new CouponDomainError("VALIDATION_ERROR", "نوع کوپن نامعتبر است", { field: "type" });
    }
    out.type = input.type;
  }

  const type = out.type || input.type;
  if (input.value !== undefined) {
    const value = Math.floor(Number(input.value));
    if (!Number.isInteger(value) || value < 1) {
      throw new CouponDomainError("VALIDATION_ERROR", "مقدار کوپن نامعتبر است", { field: "value" });
    }
    if (type === "percent" && value > 100) {
      throw new CouponDomainError("VALIDATION_ERROR", "درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد", {
        field: "value",
      });
    }
    out.value = value;
  }

  for (const field of ["maxDiscount", "minPurchase", "maxUses", "maxUsesPerBuyer"]) {
    if (input[field] === undefined) continue;
    const n = Math.floor(Number(input[field]) || 0);
    if (!Number.isInteger(n) || n < 0) {
      throw new CouponDomainError("VALIDATION_ERROR", `مقدار «${field}» نامعتبر است`, { field });
    }
    out[field] = n;
  }

  for (const field of ["startsAt", "expiresAt"]) {
    if (input[field] === undefined || input[field] === null || input[field] === "") continue;
    const d = new Date(input[field]);
    if (Number.isNaN(d.getTime())) {
      throw new CouponDomainError("VALIDATION_ERROR", `تاریخ «${field}» نامعتبر است`, { field });
    }
    out[field] = d;
  }

  if (out.startsAt && out.expiresAt && out.expiresAt <= out.startsAt) {
    throw new CouponDomainError("VALIDATION_ERROR", "تاریخ پایان باید پس از تاریخ شروع باشد", {
      field: "expiresAt",
    });
  }

  if (typeof input.description === "string") {
    out.description = input.description.trim().slice(0, 300);
  }
  if (input.status !== undefined) {
    if (!COUPON_STATUSES.includes(input.status)) {
      throw new CouponDomainError("VALIDATION_ERROR", "وضعیت کوپن نامعتبر است", { field: "status" });
    }
    out.status = input.status;
  }
  return out;
}

// ── Seller CRUD ─────────────────────────────────────────────────────────────

/**
 * Translate a Mongoose validation failure into a `CouponDomainError`.
 *
 * `parseCouponInput` covers the rules it can see, but the schema is the last
 * line of defence (required `type`, enum `status`, percent ceiling, date
 * ordering). Without this bridge a schema-level rejection would leave the
 * service and reach the controller as an unhandled error, turning a bad seller
 * request into a 500.
 *
 * @param {Error} e
 * @param {string} [code] - code to report when `e` is a validation failure
 * @returns {null|Error} the translated error, or null when `e` is not one
 */
function translateWriteError(e, code = "COUPON_INVALID") {
  if (e && e.name === "ValidationError" && e.errors) {
    const fields = Object.keys(e.errors);
    return new CouponDomainError(
      code,
      "اطلاعات کوپن معتبر نیست",
      { fields },
    );
  }
  return null;
}

async function createCoupon({ sellerId, sellerUserId, ...payload }) {
  const data = parseCouponInput(payload, "create");
  try {
    const coupon = await Coupon.create({
      ...data,
      sellerId,
      sellerUserId: sellerUserId || null,
      createdByUserId: sellerUserId || null,
    });
    return coupon;
  } catch (e) {
    // The unique index is the real duplicate guard: two sellers hitting "create"
    // at the same instant is a race, not a user error to explain.
    if (e && e.code === 11000) {
      throw new CouponDomainError("COUPON_CODE_TAKEN", "این کد تخفیف قبلاً ثبت شده است", {
        field: "code",
      });
    }
    const translated = translateWriteError(e, "COUPON_INVALID");
    if (translated) throw translated;
    throw e;
  }
}

async function getCoupon({ sellerId, couponId }) {
  const coupon = await Coupon.findOne({ _id: couponId, sellerId });
  if (!coupon) fail("COUPON_NOT_FOUND");
  return coupon;
}

async function updateCoupon({ sellerId, couponId, ...payload }) {
  const coupon = await getCoupon({ sellerId, couponId });
  const data = parseCouponInput(payload, "update");
  if (Object.keys(data).length === 0) return coupon;

  Object.assign(coupon, data);
  try {
    await coupon.save();
  } catch (e) {
    if (e && e.code === 11000) {
      throw new CouponDomainError("COUPON_CODE_TAKEN", "این کد تخفیف قبلاً ثبت شده است", {
        field: "code",
      });
    }
    const translated = translateWriteError(e);
    if (translated) throw translated;
    throw e;
  }
  return coupon;
}

/**
 * A coupon that has been spent can never be un-spent, so it is paused and kept
 * (the redemption rows still point at it) rather than deleted. Deleting would
 * make every historical order's `coupon.couponId` a dangling reference.
 */
async function setCouponStatus({ sellerId, couponId, status }) {
  if (!COUPON_STATUSES.includes(status)) {
    throw new CouponDomainError("VALIDATION_ERROR", "وضعیت کوپن نامعتبر است", { field: "status" });
  }
  const coupon = await getCoupon({ sellerId, couponId });
  coupon.status = status;
  try {
    await coupon.save();
  } catch (e) {
    const translated = translateWriteError(e);
    if (translated) throw translated;
    throw e;
  }
  return coupon;
}

// ── Redemption (the buyer's path) ───────────────────────────────────────────

/**
 * Check a typed code against a priced cart WITHOUT spending anything.
 *
 * Used by the storefront "apply" preview. It performs no writes, so it cannot
 * be used to burn a quota — but it does reveal whether a code exists inside one
 * store, which is why the route in front of it is rate limited.
 *
 * @param {object} params
 * @param {string} params.sellerId authoritative store of the cart
 * @param {string} params.code as typed by the buyer
 * @param {number} params.subtotal server-priced goods total
 * @param {string} [params.buyerUserId]
 * @returns {Promise<{coupon: object, discount: number}>}
 */
async function evaluateCoupon({ sellerId, code, subtotal, buyerUserId = null }) {
  const normalised = normaliseCode(code);
  if (!normalised) fail("COUPON_NOT_FOUND");

  // Scoped to the seller on purpose: a code minted elsewhere must not even be
  // recognised here, and `sellerId` is taken from the cart, never the request.
  const coupon = await Coupon.findOne({ sellerId, code: normalised });
  if (!coupon) fail("COUPON_NOT_FOUND");

  assertUsable(coupon, subtotal);
  await assertBuyerAllowance(coupon, buyerUserId);

  return { coupon, discount: computeDiscount(coupon, subtotal) };
}

/** Per-buyer cap. Anonymous checkouts have no key to count against. */
async function assertBuyerAllowance(coupon, buyerUserId) {
  const cap = Number(coupon.maxUsesPerBuyer) || 0;
  if (cap <= 0 || !buyerUserId) return;
  const used = await CouponRedemption.countDocuments({
    couponId: coupon._id,
    buyerUserId,
  });
  if (used >= cap) {
    fail("COUPON_USER_LIMIT", { maxUsesPerBuyer: cap, used });
  }
}

/**
 * Spend one use of a coupon, atomically, and record the redemption.
 *
 * The order of operations is deliberate. The counter moves first with a guard
 * baked into the query, so N simultaneous checkouts for the last remaining use
 * produce exactly one winner; the redemption row is written next; and if that
 * write loses a unique-index race the counter is given back, because leaving it
 * inflated would silently destroy a real use for every other buyer.
 *
 * @param {object} params
 * @param {import("mongoose").Document} params.coupon already validated
 * @param {string|null} params.buyerUserId
 * @param {string} params.orderId
 * @param {number} params.discount integer taken off this order
 * @returns {Promise<import("mongoose").Document>} the updated coupon
 */
async function reserveCoupon({ coupon, buyerUserId = null, orderId, discount }) {
  await assertBuyerAllowance(coupon, buyerUserId);

  const filter = { _id: coupon._id, sellerId: coupon.sellerId };
  // With no cap the count is unbounded and needs no guard; with a cap the guard
  // is the entire concurrency control, and it lives in the query rather than in
  // a read above it.
  if (coupon.maxUses > 0) filter.usedCount = { $lt: coupon.maxUses };

  const updated = await Coupon.findOneAndUpdate(filter, { $inc: { usedCount: 1 } }, { new: true });
  if (!updated) fail("COUPON_EXHAUSTED", { maxUses: coupon.maxUses });

  try {
    await CouponRedemption.create({
      couponId: coupon._id,
      sellerId: coupon.sellerId,
      buyerUserId: buyerUserId || null,
      orderId,
      code: coupon.code,
      discount,
      singleUse: (Number(coupon.maxUsesPerBuyer) || 0) === 1,
    });
  } catch (e) {
    // Never leave the counter ahead of reality.
    await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: -1 } }).catch((err) =>
      logger.error("Failed to roll back coupon counter", { error: err.message }),
    );
    if (e && e.code === 11000) {
      fail("COUPON_USER_LIMIT", { code: coupon.code });
    }
    throw e;
  }
  return updated;
}

/**
 * Give a coupon back when an order never became real.
 *
 * A cancelled or failed checkout must not permanently consume a one-use
 * allowance, and the buyer is not the one who should pay for a payment failure.
 * Idempotent: an order with no redemption row simply does nothing.
 *
 * @param {string} orderId
 */
async function releaseCouponForOrder(orderId) {
  const redemption = await CouponRedemption.findOneAndDelete({ orderId });
  if (!redemption) return false;
  await Coupon.findByIdAndUpdate(redemption.couponId, { $inc: { usedCount: -1 } });
  return true;
}

// ── Seller reporting ────────────────────────────────────────────────────────

/**
 * Aggregate what a campaign actually cost, per coupon.
 *
 * `discountGiven` is the money the seller gave away — the number that matters
 * when deciding whether to keep a code alive, and the one a careless dashboard
 * would omit because the order totals still look healthy.
 */
async function couponUsageStats({ sellerId, couponId = null }) {
  const match = { sellerId };
  if (couponId) match.couponId = couponId;

  const rows = await CouponRedemption.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$couponId",
        redemptions: { $sum: 1 },
        discountGiven: { $sum: "$discount" },
        firstUsed: { $min: "$redeemedAt" },
        lastUsed: { $max: "$redeemedAt" },
      },
    },
  ]);

  const byCoupon = {};
  let totalGiven = 0;
  let totalRedemptions = 0;
  for (const r of rows) {
    byCoupon[String(r._id)] = {
      redemptions: r.redemptions,
      discountGiven: r.discountGiven,
      firstUsed: r.firstUsed,
      lastUsed: r.lastUsed,
    };
    totalGiven += r.discountGiven;
    totalRedemptions += r.redemptions;
  }
  return { byCoupon, totalGiven, totalRedemptions };
}

module.exports = {
  CouponDomainError,
  COUPON_TYPES,
  COUPON_STATUSES,
  CODE_MIN_LENGTH,
  CODE_MAX_LENGTH,
  normaliseCode,
  computeDiscount,
  parseCouponInput,
  createCoupon,
  getCoupon,
  updateCoupon,
  setCouponStatus,
  evaluateCoupon,
  reserveCoupon,
  releaseCouponForOrder,
  couponUsageStats,
  couponToDTO,
  assertUsable,
};
