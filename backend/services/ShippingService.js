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
const MAX_FEE = 50_000_000; // Sanity ceiling; a courier fee above this is a typo.

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
        fee = toInt(pricing.perKgFee) * roundUpKg(totalWeightKg);
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
 * @returns {object} quote
 */
function quoteProfile({
  profile,
  address = {},
  subtotal = 0,
  totalWeightKg = 0,
  totalQty = 0,
}) {
  const profileFreeThreshold = toInt(profile?.freeShippingThreshold);
  const methods = (profile?.methods || []).filter((m) => m.enabled !== false);

  if (!profile || profile.isEnabled === false || methods.length === 0) {
    return {
      configured: false,
      freeShippingThreshold: profileFreeThreshold,
      methods: [],
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
    const fee = computeFee({
      method,
      zone,
      subtotal,
      totalWeightKg,
      totalQty,
      profileFreeThreshold,
    });
    const eta = (zone && zone.etaOverride) || method.eta || {};
    quoted.push({
      key: method.key,
      title: method.title,
      kind: method.kind,
      carrier: method.carrier || "",
      fee,
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
        methods,
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean();
}

module.exports = {
  ShippingDomainError,
  roundUpKg,
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
};
