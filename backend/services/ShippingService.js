/**
 * ShippingService — the seller's delivery policy engine (Phase 36, P1-08).
 *
 * The engine is split in two on purpose:
 *   - Pure functions (`quoteProfile`, `computeFee`, `selectZone`, `zoneMatches`,
 *     `normalizeAddress`) take plain objects and return plain objects. This is
 *     where the money is decided, and it is testable with no database at all.
 *   - The thin `getProfile` / `saveProfile` / `quoteForStore` layer does the I/O
 *     and delegates straight to the pure core.
 *
 * The money rule, and the reason the whole design is shaped this way: the client
 * sends a METHOD KEY, never an amount. Every price below is computed here from
 * the seller's own stored policy. A tampered checkout body can therefore pick a
 * different method, but it can never buy a cheaper one.
 *
 * Decision of record for unconfigured stores: a missing or disabled profile does
 * NOT close the store. `quoteProfile` returns `configured: false` with a warning
 * and no methods, and the storefront keeps selling (with free shipping), because
 * a seller who has not opened the shipping screen yet must still be able to trade.
 */

const ShippingProfile = require("../models/ShippingProfile");
const {
  normalizeProvince,
  normalizePostalCode,
  normalizePostalPrefix,
  isValidProvince,
} = require("../utils/iranGeo");
const { calculateDistance, isValidCoordinates } = require("../utils/geospatial");

const ZONE_SPECIFICITY = ShippingProfile.ZONE_SPECIFICITY;
const DISCOUNT_TYPES = ShippingProfile.DISCOUNT_TYPES;
const MAX_FEE = 50_000_000; // Sanity ceiling; a courier fee above this is a typo.
// A rate card is a handful of methods and a handful of zones each. The caps keep
// a runaway form post from turning the quote loop into a denial of service, and
// they reject loudly rather than truncating — a silently dropped zone is a rate
// the seller believes is live and is not.
const MAX_METHODS = 12;
const MAX_ZONES_PER_METHOD = 50;
const MAX_TIERS_PER_METHOD = 10;
const MAX_DISCOUNTS = 10;
// Discount codes are enumerated by buyers, so the keyspace has to be tight and
// the lookup has to be rate-limited. The coupon code rules (Phase 35) apply here
// for the same reasons: a short, guessable code plus no rate limit is a coupon
// printer.
const DISCOUNT_CODE_RE = /^[A-Z0-9-]{3,20}$/;

class ShippingDomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ShippingDomainError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Couriers bill per STARTED kilogram, not per started fraction: 0.2 kg and 1.0 kg
 * cost the buyer the same 1 kg. Rounding down would let a heavy order ship for
 * free by shaving 0.9 kg off; rounding to the nearest would undercharge a 1.6 kg
 * parcel by a whole kilo.
 *
 * @param {number} kg
 * @returns {number} whole kilograms, never negative
 */
function roundUpKg(kg) {
  const value = Number(kg);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value);
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

/**
 * Price a weight-billed method from a seller's step card.
 *
 * The step is chosen by the SAME whole-kilogram figure the courier bills by
 * (`roundUpKg`), so a buyer and a seller looking at the same 0.4 kg parcel agree
 * on which bracket it lands in. Reusing the rounded number is the point: pricing
 * step one at 0.9 kg and step two at 1.1 kg would make a 1 kg parcel cheaper than
 * a 0.9 kg one.
 *
 * @param {object[]} tiers   ascending by `upToKg`
 * @param {number}   totalWeightKg
 * @param {number}   perKgFee  fallback when the seller has written no steps
 * @returns {number}
 */
function computeTierFee(tiers, totalWeightKg, perKgFee = 0) {
  const list = Array.isArray(tiers) ? tiers : [];
  if (list.length === 0) return toInt(perKgFee) * roundUpKg(totalWeightKg);

  const kg = roundUpKg(totalWeightKg);
  // The schema already forbids unsorted duplicates, but this list can also come
  // straight from a request body, so the ordering is re-established here instead
  // of trusted. Picking the first match is then deterministic.
  const sorted = [...list].sort((a, b) => toInt(a.upToKg) - toInt(b.upToKg));
  for (const tier of sorted) {
    if (kg <= toInt(tier.upToKg)) return toInt(tier.price);
  }
  // Heavier than the top step. A courier would refuse or re-quote, but the buyer
  // has to be given a number, so the top step is held flat rather than guessed
  // upward — and the seller sees a `unavailable`-free but expensive option they
  // can fix by adding a step.
  return toInt(sorted[sorted.length - 1].price);
}

/**
 * Resolve a shipping discount code against this seller's own codes.
 *
 * The client sends a CODE, never an amount. Everything about the reduction —
 * whether it exists, how much it is, whether the basket qualifies — is decided
 * here from the seller's stored policy.
 *
 * Clamp order matters, and it is the whole safety argument for this feature:
 *   1. `minSubtotal` gate — a code that does not apply yet applies at 0, not as
 *      an error, so a buyer can add an item and see the price drop;
 *   2. percent/fixed → a raw amount;
 *   3. `maxDiscount` — the seller's own promise about the ceiling;
 *   4. the fee itself — the hard stop. Nothing above this can make the order's
 *      total smaller than the goods subtotal, which is the unbounded loss
 *      Phase 35 warned about.
 *
 * @param {object} params
 * @param {object} params.profile   plain ShippingProfile
 * @param {string} params.code      buyer-supplied code, may be empty
 * @param {number} params.fee       the delivery charge BEFORE any discount
 * @param {number} params.subtotal  goods subtotal, for the `minSubtotal` gate
 * @returns {{amount: number, code: string, applied: boolean, reason: string}}
 */
function resolveShippingDiscount({ profile, code = "", fee = 0, subtotal = 0 }) {
  const none = { amount: 0, code: "", applied: false, reason: "" };
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!normalized) return none;

  const list = (profile?.discounts || []).filter((d) => d && d.enabled !== false);
  const discount = list.find((d) => d.code === normalized);
  // A code that does not exist here and a code belonging to another store are
  // the same lookup miss, so the response cannot be used to discover which codes
  // other sellers are running.
  if (!discount) return { ...none, reason: "SHIPPING_DISCOUNT_INVALID" };

  if (toInt(subtotal) < toInt(discount.minSubtotal)) {
    return { ...none, reason: "SHIPPING_DISCOUNT_MIN_SUBTOTAL" };
  }

  const charge = toInt(fee);
  if (charge <= 0) return { ...none, reason: "SHIPPING_DISCOUNT_NO_FEE" };

  const raw =
    discount.type === "percent"
      ? Math.floor((charge * toInt(discount.value)) / 100)
      : toInt(discount.value);
  // The fee is the hard ceiling; `maxDiscount` is the seller's stated one. A
  // percent code above 100 is nonsense rather than a free order, and a fixed
  // code above the fee means the seller is paying the buyer to shop.
  const amount = Math.min(Math.max(0, toInt(raw)), toInt(discount.maxDiscount), charge);
  if (amount <= 0) return { ...none, code: normalized, reason: "SHIPPING_DISCOUNT_NO_EFFECT" };

  return { amount, code: normalized, applied: true, reason: "" };
}

/**
 * Validate and normalize a buyer-supplied destination.
 *
 * @param {object} input
 * @returns {{ok: true, value: object} | {ok: false, errors: string[]}}
 */
function normalizeAddress(input = {}) {
  const errors = [];
  const value = {};

  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

  value.receiverName = str(input.receiverName, 80);
  value.receiverPhone = str(input.receiverPhone, 20);
  if (!value.receiverName) errors.push("نام گیرنده الزامی است");
  if (!value.receiverPhone) errors.push("شماره تماس گیرنده الزامی است");

  const province = normalizeProvince(input.province);
  if (input.province && !province) errors.push("استان معتبر نیست");
  value.province = province;

  value.city = str(input.city, 80);
  if (province && !value.city) errors.push("شهر الزامی است");

  const postalCode = normalizePostalCode(input.postalCode);
  if (input.postalCode && !postalCode) errors.push("کدپستی معتبر نیست");
  value.postalCode = postalCode;

  value.line1 = str(input.line1, 300);
  if (province && !value.line1) errors.push("نشانی الزامی است");
  value.line2 = str(input.line2, 300);
  value.note = str(input.note, 200);

  // Coordinates are optional (a province/postal zone does not need them) but
  // must be a real pair when present: a radius zone silently never matching
  // because of a swapped lat/lng is a support call the seller cannot act on.
  // `isValidCoordinates` takes (lng, lat) — argument order matters here, since
  // a point at lng 120 / lat 35 is valid but reads as an out-of-range latitude
  // if the two are swapped.
  const lat = num(input.lat);
  const lng = num(input.lng);
  if (input.lat != null || input.lng != null) {
    if (lat == null || lng == null || !isValidCoordinates(lng, lat)) {
      errors.push("مختصات جغرافیایی معتبر نیست");
    } else {
      value.lat = lat;
      value.lng = lng;
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value };
}

const ADDRESS_FIELDS = [
  "receiverName",
  "receiverPhone",
  "province",
  "city",
  "postalCode",
  "line1",
  "line2",
  "note",
  "lat",
  "lng",
];

/**
 * A checkout form will happily post `shippingAddress: {}` for a pickup order,
 * because the buyer filled in no fields and did not pick a method yet. Treating
 * that as a malformed address would make the client know the seller's method
 * list before it is allowed to ask for it. An address that carries *any* field
 * is still validated strictly, so a half-typed address stays a real error.
 */
function isEmptyAddress(input) {
  if (!input || typeof input !== "object") return true;
  return ADDRESS_FIELDS.every((field) => {
    const value = input[field];
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (typeof value === "number") return Number.isNaN(value);
    return false;
  });
}

/** Does this zone's own type match the destination it is given? */
function zoneMatches(zone, address) {
  if (!zone || zone.enabled === false) return false;
  const addr = address || {};

  if (zone.type === "all") return true;

  if (zone.type === "province") {
    if (!addr.province) return false;
    return (zone.provinces || []).some((p) => normalizeProvince(p) === addr.province);
  }

  if (zone.type === "postal_code") {
    if (!addr.postalCode) return false;
    return (zone.postalPrefixes || []).some((prefix) => addr.postalCode.startsWith(prefix));
  }

  if (zone.type === "radius") {
    if (addr.lat == null || addr.lng == null) return false;
    if (zone.center?.lat == null || zone.center?.lng == null) return false;
    const metres = calculateDistance(
      zone.center.lng,
      zone.center.lat,
      addr.lng,
      addr.lat,
    );
    return metres / 1000 <= zone.radiusKm;
  }

  return false;
}

/**
 * The most specific matching zone wins. Two zones routinely match at once (a
 * "Tehran" province zone and a "within 30 km" radius zone); resolving by
 * declaration order would make the buyer's price depend on array order, which
 * is not something a seller can reason about from the UI.
 *
 * @returns {object|null}
 */
function selectZone(method, address) {
  const zones = (method?.zones || []).filter((z) => z.enabled !== false);
  let best = null;
  let bestScore = -1;
  for (const zone of zones) {
    if (!zoneMatches(zone, address)) continue;
    const score = ZONE_SPECIFICITY[zone.type] ?? 0;
    if (score > bestScore) {
      best = zone;
      bestScore = score;
    }
  }
  return best;
}

/**
 * A method with only specific zones covers only those zones. A method that also
 * has an "all" zone has a catch-all, so an unmatched destination falls back to
 * the method's base price instead of vanishing from checkout.
 */
function hasCatchAll(method) {
  return (method?.zones || []).some((z) => z.enabled !== false && z.type === "all");
}

/** Can this method be quoted for this destination at all? */
function methodCoversAddress(method, address) {
  if (method.kind === "pickup") {
    // A pickup method with no address is a promise the seller cannot keep, so it
    // is hidden rather than offered and then failed at the counter.
    return Boolean(method.pickup?.address);
  }
  const zones = (method?.zones || []).filter((z) => z.enabled !== false);
  if (zones.length === 0) return Boolean(address?.province && address?.line1);
  return hasCatchAll(method) || selectZone(method, address) !== null;
}

/**
 * A per-kilogram method needs a real weight. If no product in the basket
 * declares one, the weight is 0, and billing 0 kg would hand the buyer free
 * shipping the seller never agreed to — a silent revenue hole that looks like a
 * generous promotion in the seller's own report.
 *
 * The alternative (inventing a 1 kg minimum) is a lie about the parcel, and the
 * other one (charging flatFee instead) ignores the seller's configured rate.
 * So the method is hidden, with a reason the seller can act on.
 */
function weightIsKnown(method, totalWeightKg) {
  if (method?.pricing?.mode !== "weight") return true;
  return Number(totalWeightKg) > 0;
}

/**
 * The price the BUYER pays. Integer, same unit as `Order.total`.
 *
 * Order of operations is deliberate:
 *   1. base price from the pricing mode (or the zone's override, if it has one);
 *   2. then the free-shipping promises, which are store-level marketing and
 *      therefore apply even to an overridden zone price.
 *
 * @param {object} params
 * @param {object} params.method        a plain method object
 * @param {object|null} params.zone     the selected zone, or null
 * @param {number} params.subtotal     integer, pre-discount goods total
 * @param {number} params.totalWeightKg sum of item weights
 * @param {number} params.totalQty     sum of item quantities
 * @param {number} params.profileFreeThreshold store-wide threshold, 0 = off
 * @returns {number}
 */
function computeFee({
  method,
  zone = null,
  subtotal = 0,
  totalWeightKg = 0,
  totalQty = 0,
  profileFreeThreshold = 0,
}) {
  const pricing = method?.pricing || {};
  let fee;

  if (zone && zone.feeOverride != null) {
    fee = toInt(zone.feeOverride);
  } else {
    switch (pricing.mode) {
      case "free":
        fee = 0;
        break;
      case "per_item":
        fee = toInt(pricing.perItemFee) * toInt(totalQty);
        break;
      case "weight":
        fee = computeTierFee(pricing.tiers, totalWeightKg, pricing.perKgFee);
        break;
      case "flat":
      default:
        fee = toInt(pricing.flatFee);
        break;
    }
  }

  const sub = toInt(subtotal);
  const methodThreshold = toInt(pricing.freeThreshold);
  const profileThreshold = toInt(profileFreeThreshold);
  const freeByMethod = methodThreshold > 0 && sub >= methodThreshold;
  const freeByProfile = profileThreshold > 0 && sub >= profileThreshold;
  if (freeByMethod || freeByProfile) fee = 0;

  // Never negative (an override or a multiply can underflow at the edges) and
  // never absurd: a five-figure typo in a rate card must not become a checkout
  // total the buyer has to pay.
  return Math.min(Math.max(0, toInt(fee)), MAX_FEE);
}

/**
 * Quote every method for one destination. Pure: no I/O, so the whole pricing
 * matrix is testable without Mongo.
 *
 * @param {object} params
 * @param {object} params.profile        a plain ShippingProfile object
 * @param {object} params.address        a normalized address (or {} for pickup)
 * @param {number} params.subtotal
 * @param {number} params.totalWeightKg
 * @param {number} params.totalQty
 * @param {string} params.discountCode  seller-issued shipping discount code
 * @returns {object} quote
 */
function quoteProfile({
  profile,
  address = {},
  subtotal = 0,
  totalWeightKg = 0,
  totalQty = 0,
  discountCode = "",
}) {
  const profileFreeThreshold = toInt(profile?.freeShippingThreshold);
  const methods = (profile?.methods || []).filter((m) => m.enabled !== false);

  if (!profile || profile.isEnabled === false || methods.length === 0) {
    return {
      configured: false,
      freeShippingThreshold: profileFreeThreshold,
      methods: [],
      // A code against a store that never configured shipping is a miss like any
      // other: there is no charge to reduce, so there is nothing to apply. The
      // shape matches the configured branch exactly, because the buyer UI reads
      // one field and must not have to know which branch it got.
      discount: {
        code: typeof discountCode === "string" ? discountCode.trim().toUpperCase() : "",
        applied: false,
        rejected: Boolean(discountCode),
      },
      warning:
        "فروشگاه هنوز روش ارسالی تنظیم نکرده است؛ سفارش‌ها فعلاً بدون هزینهٔ ارسال ثبت می‌شوند.",
    };
  }

  const quoted = [];
  const unavailable = [];
  for (const method of methods) {
    if (!methodCoversAddress(method, address)) {
      unavailable.push({
        key: method.key,
        title: method.title,
        reason: "این روش برای مقصد انتخابی در دسترس نیست",
      });
      continue;
    }
    if (!weightIsKnown(method, totalWeightKg)) {
      // Hidden rather than quoted at zero: see `weightIsKnown`.
      unavailable.push({
        key: method.key,
        title: method.title,
        reason: "وزن این کالاها ثبت نشده است",
      });
      continue;
    }
    const zone = method.kind === "pickup" ? null : selectZone(method, address);
    const originalFee = computeFee({
      method,
      zone,
      subtotal,
      totalWeightKg,
      totalQty,
      profileFreeThreshold,
    });
    // The discount is resolved per method, not once for the quote: a code can be
    // valid, and it is clamped to whatever each method's charge happens to be.
    // Resolving it once against the cheapest method and applying that number
    // everywhere would discount an expensive method by a cheap method's amount.
    const discount = resolveShippingDiscount({
      profile,
      code: discountCode,
      fee: originalFee,
      subtotal,
    });
    const eta = (zone && zone.etaOverride) || method.eta || {};
    quoted.push({
      key: method.key,
      title: method.title,
      kind: method.kind,
      carrier: method.carrier || "",
      fee: originalFee - discount.amount,
      originalFee,
      discount: discount.amount,
      discountCode: discount.applied ? discount.code : "",
      zoneLabel: zone?.label || "",
      eta: {
        minDays: toInt(eta.minDays, 1),
        maxDays: Math.max(toInt(eta.maxDays, 3), toInt(eta.minDays, 1)),
      },
      // A pickup order has no destination, so the store address travels with the
      // quote: the buyer has to know where to come.
      pickup:
        method.kind === "pickup"
          ? {
              address: method.pickup?.address || "",
              city: method.pickup?.city || "",
              province: method.pickup?.province || "",
              hours: method.pickup?.hours || "",
              instructions: method.pickup?.instructions || "",
            }
          : null,
    });
  }

  // Cheapest first, then a stable order for equal prices so the UI does not
  // reshuffle methods between renders of the same cart.
  quoted.sort((a, b) => a.fee - b.fee || a.key.localeCompare(b.key));

  return {
    configured: true,
    freeShippingThreshold: profileFreeThreshold,
    methods: quoted,
    // Why a configured method is missing. The seller can act on these; the buyer
    // never needs to see them.
    unavailable,
    // A single verdict for the code, taken from the cheapest quoted method. The
    // buyer needs to know whether their code was honoured, not per-method
    // details; the per-method figures are on each entry.
    discount: {
      code: typeof discountCode === "string" ? discountCode.trim().toUpperCase() : "",
      applied: quoted.some((m) => m.discount > 0),
      // Not applied but the buyer typed something. Lets the UI say "this code is
      // not valid for this store" instead of silently charging full price, which
      // is the complaint that generates support tickets.
      rejected: Boolean(discountCode) && !quoted.some((m) => m.discount > 0),
    },
    warning: quoted.length === 0 ? "هیچ روش ارسالی برای این مقصد در دسترس نیست." : "",
  };
}

/* ------------------------------------------------------------------ *
 * I/O layer
 * ------------------------------------------------------------------ */

async function getProfile(sellerId) {
  if (!sellerId) return null;
  return ShippingProfile.findOne({ sellerId }).lean();
}

/**
 * Validate and store a seller's policy.
 *
 * Province names are normalized here rather than in the schema so that a
 * seller's config and the buyer's address go through exactly the same
 * normalization — otherwise "كردستان" could be stored by the seller and never
 * match the buyer's "کردستان", and the zone would look broken for no visible
 * reason.
 *
 * @param {object} params
 * @returns {Promise<object>} the stored profile
 */
async function saveProfile({ sellerId, sellerUserId, payload = {} }) {
  if (!sellerId) throw new ShippingDomainError("SELLER_REQUIRED", "فروشنده مشخص نیست");

  const errors = [];
  const incoming = Array.isArray(payload.methods) ? payload.methods : [];
  if (incoming.length > MAX_METHODS) {
    throw new ShippingDomainError(
      "TOO_MANY_METHODS",
      `حداکثر ${MAX_METHODS} روش ارسال می‌توانید تعریف کنید`,
      { count: incoming.length },
    );
  }
  const seenKeys = new Set();
  const methods = [];

  incoming.forEach((raw, index) => {
    const at = `روش ${index + 1}`;
    const key = typeof raw.key === "string" ? raw.key.trim().toLowerCase() : "";
    if (!key || !/^[a-z0-9-]{2,40}$/.test(key)) {
      errors.push(`${at}: کلید نامعتبر است`);
      return;
    }
    if (seenKeys.has(key)) {
      errors.push(`${at}: کلید تکراری است`);
      return;
    }
    seenKeys.add(key);

    const kind = raw.kind === "pickup" ? "pickup" : "delivery";
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) {
      errors.push(`${at}: عنوان الزامی است`);
      return;
    }

    if (kind === "delivery") {
      const normalized = normalizeAddress({
        receiverName: "x",
        receiverPhone: "0",
        province: raw.province,
      });
      if (raw.province && !normalized.ok && !isValidProvince(raw.province)) {
        errors.push(`${at}: استان نامعتبر است`);
        return;
      }
    }

    const zones = [];
    if (Array.isArray(raw.zones) && raw.zones.length > MAX_ZONES_PER_METHOD) {
      errors.push(`${at}: حداکثر ${MAX_ZONES_PER_METHOD} ناحیه برای هر روش`);
      return;
    }
    (Array.isArray(raw.zones) ? raw.zones : []).forEach((z, zi) => {
      const zat = `${at} / ناحیه ${zi + 1}`;
      const type = ["all", "province", "postal_code", "radius"].includes(z?.type)
        ? z.type
        : null;
      if (!type) {
        errors.push(`${zat}: نوع ناحیه نامعتبر است`);
        return;
      }
      const provinces = (Array.isArray(z.provinces) ? z.provinces : [])
        .map((p) => normalizeProvince(p))
        .filter(Boolean);
      if (type === "province") {
        if (provinces.length === 0) {
          errors.push(`${zat}: حداقل یک استان معتبر لازم است`);
          return;
        }
        if (provinces.length !== (z.provinces || []).length) {
          errors.push(`${zat}: یک یا چند استان نامعتبر است`);
          return;
        }
      }
      const postalPrefixes = (Array.isArray(z.postalPrefixes) ? z.postalPrefixes : [])
        .map((p) => normalizePostalPrefix(p))
        .filter(Boolean);
      if (type === "postal_code") {
        if (postalPrefixes.length === 0) {
          errors.push(`${zat}: حداقل یک پیشوند کدپستی معتبر لازم است`);
          return;
        }
      }
      const center =
        Number.isFinite(Number(z.center?.lat)) && Number.isFinite(Number(z.center?.lng))
          ? { lat: Number(z.center.lat), lng: Number(z.center.lng) }
          : { lat: null, lng: null };
      const radiusKm = toInt(z.radiusKm);
      if (type === "radius") {
        if (center.lat == null || center.lng == null) {
          errors.push(`${zat}: مرکز ناحیه الزامی است`);
          return;
        }
        if (!(radiusKm > 0)) {
          errors.push(`${zat}: شعاع باید بزرگ‌تر از صفر باشد`);
          return;
        }
      }
      const feeOverride =
        z.feeOverride === null || z.feeOverride === undefined || z.feeOverride === ""
          ? null
          : toInt(z.feeOverride);
      zones.push({
        label: typeof z.label === "string" ? z.label.trim().slice(0, 80) : "",
        type,
        provinces,
        postalPrefixes,
        center,
        radiusKm,
        feeOverride,
        etaOverride: z.etaOverride
          ? {
              minDays: toInt(z.etaOverride.minDays, 1),
              maxDays: Math.max(toInt(z.etaOverride.maxDays, 1), toInt(z.etaOverride.minDays, 1)),
            }
          : null,
        enabled: z.enabled !== false,
      });
    });

    const pricingRaw = raw.pricing || {};
    const mode = ["flat", "weight", "per_item", "free"].includes(pricingRaw.mode)
      ? pricingRaw.mode
      : "flat";
    const pickupRaw = raw.pickup || {};

    if (Array.isArray(pricingRaw.tiers) && pricingRaw.tiers.length > MAX_TIERS_PER_METHOD) {
      errors.push(`${at}: حداکثر ${MAX_TIERS_PER_METHOD} پلکان وزن`);
      return;
    }
    const tiers = [];
    (Array.isArray(pricingRaw.tiers) ? pricingRaw.tiers : []).forEach((t, ti) => {
      const upToKg = toInt(t?.upToKg);
      const price = toInt(t?.price);
      if (upToKg < 1) {
        errors.push(`${at} / پلکان ${ti + 1}: سقف کیلوگرم باید حداقل ۱ باشد`);
        return;
      }
      // Rejected rather than reordered: a seller who typed 5 then 2 made a
      // mistake, and silently sorting it would store a rate card they never
      // approved.
      if (tiers.some((existing) => existing.upToKg === upToKg)) {
        errors.push(`${at}: سقف کیلوگرم ${upToKg} تکراری است`);
        return;
      }
      if (tiers.length > 0 && upToKg < tiers[tiers.length - 1].upToKg) {
        errors.push(`${at}: پلکان‌های وزن باید به‌ترتیب صعودی وارد شوند`);
        return;
      }
      tiers.push({ upToKg, price });
    });

    methods.push({
      key,
      title: title.slice(0, 80),
      kind,
      enabled: raw.enabled !== false,
      carrier: kind === "delivery" && typeof raw.carrier === "string"
        ? raw.carrier.trim().slice(0, 80)
        : "",
      pricing: {
        mode,
        flatFee: toInt(pricingRaw.flatFee),
        perKgFee: toInt(pricingRaw.perKgFee),
        perItemFee: toInt(pricingRaw.perItemFee),
        tiers,
        freeThreshold: toInt(pricingRaw.freeThreshold),
      },
      eta: {
        minDays: toInt(raw.eta?.minDays, 1),
        maxDays: Math.max(toInt(raw.eta?.maxDays, 3), toInt(raw.eta?.minDays, 1)),
      },
      zones,
      pickup:
        kind === "pickup"
          ? {
              address: typeof pickupRaw.address === "string"
                ? pickupRaw.address.trim().slice(0, 400)
                : "",
              city: typeof pickupRaw.city === "string" ? pickupRaw.city.trim().slice(0, 80) : "",
              province: normalizeProvince(pickupRaw.province),
              hours: typeof pickupRaw.hours === "string" ? pickupRaw.hours.trim().slice(0, 200) : "",
              instructions:
                typeof pickupRaw.instructions === "string"
                  ? pickupRaw.instructions.trim().slice(0, 400)
                  : "",
            }
          : { address: "", city: "", province: "", hours: "", instructions: "" },
    });
  });

  // Discounts are validated into the same accumulator as the methods, so the
  // seller gets one error listing every problem with the rate card rather than
  // fixing them one round-trip at a time.
  const discounts = normalizeDiscounts(payload.discounts, errors);

  if (errors.length) {
    throw new ShippingDomainError("INVALID_PROFILE", errors.join("؛ "), { errors });
  }

  return ShippingProfile.findOneAndUpdate(
    { sellerId },
    {
      $set: {
        sellerUserId: sellerUserId || null,
        isEnabled: payload.isEnabled === true,
        freeShippingThreshold: toInt(payload.freeShippingThreshold),
        discounts,
        methods,
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean();
}

/**
 * Validate a seller's shipping discount codes.
 *
 * `maxDiscount` is required rather than defaulted. A `fixed` code with no cap is
 * an open-ended liability — the seller is promising a fixed amount off every
 * delivery forever — so a code without one is refused rather than stored with a
 * silent default, which would be the exact "unbounded loss" this feature has to
 * avoid creating.
 *
 * @param {unknown} input
 * @param {string[]} errors accumulator, so the seller sees every problem at once
 * @returns {object[]} normalized codes, ready to store
 */
function normalizeDiscounts(input, errors) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    errors.push("فهرست کدهای تخفیف ارسال نامعتبر است");
    return [];
  }
  if (input.length > MAX_DISCOUNTS) {
    errors.push(`حداکثر ${MAX_DISCOUNTS} کد تخفیف ارسال می‌توانید تعریف کنید`);
    return [];
  }

  const out = [];
  const seen = new Set();
  input.forEach((raw, i) => {
    const at = `کد تخفیف ${i + 1}`;
    const code = typeof raw?.code === "string" ? raw.code.trim().toUpperCase() : "";
    if (!DISCOUNT_CODE_RE.test(code)) {
      errors.push(`${at}: کد باید ۳ تا ۲۰ نویسهٔ انگلیسی، عدد یا خط تیره باشد`);
      return;
    }
    if (seen.has(code)) {
      errors.push(`${at}: کد تکراری است`);
      return;
    }
    seen.add(code);

    const type = DISCOUNT_TYPES.includes(raw?.type) ? raw.type : null;
    if (!type) {
      errors.push(`${at}: نوع تخفیف نامعتبر است`);
      return;
    }
    const value = Number(raw?.value);
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${at}: مقدار نامعتبر است`);
      return;
    }
    if (type === "percent" && value > 100) {
      // A "150% off delivery" code is not a promotion, it is a bug in the form.
      // Storing it would rely entirely on the runtime clamp to make it safe,
      // which hides the mistake from the seller who can fix it.
      errors.push(`${at}: تخفیف درصدی نمی‌تواند بیش از ۱۰۰ باشد`);
      return;
    }
    const maxDiscount = Number(raw?.maxDiscount);
    if (!Number.isFinite(maxDiscount) || maxDiscount < 0) {
      errors.push(`${at}: سقف تخفیف الزامی است`);
      return;
    }
    out.push({
      code,
      type,
      value: Math.trunc(value),
      minSubtotal: toInt(raw?.minSubtotal),
      maxDiscount: Math.trunc(maxDiscount),
      enabled: raw?.enabled !== false,
    });
  });

  return out;
}

module.exports = {
  ShippingDomainError,
  roundUpKg,
  computeTierFee,
  resolveShippingDiscount,
  normalizeAddress,
  isEmptyAddress,
  zoneMatches,
  selectZone,
  hasCatchAll,
  methodCoversAddress,
  weightIsKnown,
  computeFee,
  quoteProfile,
  getProfile,
  saveProfile,
  MAX_FEE,
  MAX_DISCOUNTS,
  DISCOUNT_CODE_RE,
};
