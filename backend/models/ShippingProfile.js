/**
 * ShippingProfile — a seller-scoped delivery policy (Phase 36, P1-08).
 *
 * Why this is a first-class document: shipping is the one part of checkout where
 * the buyer's price, the seller's cost and the promise of delivery are three
 * different numbers that must stay linked. Collapsing them into `Order.shippingFee`
 * answers "how much was charged" but never "what did the courier cost the seller",
 * so the seller's margin on every order is unknowable and the payout ledger cannot
 * be trusted.
 *
 * Three numbers per method, deliberately kept apart:
 *   - `pricing.*`   → what the BUYER pays (a revenue line on the order).
 *   - `feeOverride` → per-zone buyer price.
 *   - the seller's actual `Order.shipping.cost` → what the SELLER pays the
 *     carrier. Never configured here, because it is not knowable in advance; it
 *     is recorded per shipment and is what makes `fee - cost` a real margin.
 *
 * Invariants:
 *   - `sellerId` is authoritative and never accepted from the client, exactly as
 *     for Coupon. One store can never quote or ship with another's rates.
 *   - `key` is the client-safe identifier the checkout sends. Money is still
 *     computed here on the server; the key is a lookup, never an amount.
 *   - All money fields are integers in the same unit as `Order.total`; there is
 *     no Rial/Toman conversion anywhere in the stack.
 *   - A missing/disabled profile does NOT close the store. Decision of record:
 *     an unconfigured store stays open, keeps pickup (or free shipping) available
 *     and shows the seller a warning, because a store that cannot configure
 *     shipping must still be able to trade.
 */
const mongoose = require("mongoose");

const PRICING_MODES = ["flat", "weight", "per_item", "free"];
const METHOD_KINDS = ["pickup", "delivery"];
const ZONE_TYPES = ["all", "province", "postal_code", "radius"];

const EtaSchema = new mongoose.Schema(
  {
    minDays: { type: Number, min: 0, max: 90, default: 1 },
    maxDays: { type: Number, min: 0, max: 180, default: 3 },
  },
  { _id: false },
);

// Narrower = wins. Two zones can both match a destination (a province zone and a
// radius zone); picking by declaration order would make the seller's price
// depend on array order, which is not an interface anyone can reason about.
const ZONE_SPECIFICITY = { all: 0, province: 1, postal_code: 2, radius: 3 };

const ZoneSchema = new mongoose.Schema(
  {
    label: { type: String, default: "", trim: true, maxlength: 80 },
    type: { type: String, enum: ZONE_TYPES, required: true, default: "all" },
    // `province` zones. Validated against the real list at the service layer
    // (iranGeo) rather than here, so the same normalization the buyer path uses
    // is the one that guards the seller's config.
    provinces: { type: [String], default: [] },
    // `postal_code` zones match by PREFIX, because sellers target delivery areas
    // ("16xxxxxxx" = west Tehran) far more often than whole provinces.
    postalPrefixes: { type: [String], default: [] },
    // `radius` zones need a centre and a positive radius; there is no sensible
    // "radius 0" and no sensible radius without a centre.
    center: {
      lat: { type: Number, min: -90, max: 90, default: null },
      lng: { type: Number, min: -180, max: 180, default: null },
    },
    radiusKm: { type: Number, min: 0, max: 5000, default: 0 },
    // null = fall back to the method's own pricing. A number overrides it.
    feeOverride: { type: Number, min: 0, default: null },
    etaOverride: { type: EtaSchema, default: null },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

/**
 * A zone is unusable unless it carries the data its own type is matched on.
 * Catching this at write time means a seller can never publish a radius zone
 * that silently never matches, and then wonder why nobody sees the discount.
 */
function validateZone(zone) {
  if (!zone.enabled) return true;
  if (zone.type === "province" && (!zone.provinces || zone.provinces.length === 0)) {
    throw new Error("ناحیهٔ استانی باید حداقل یک استان داشته باشد");
  }
  if (zone.type === "postal_code") {
    if (!zone.postalPrefixes || zone.postalPrefixes.length === 0) {
      throw new Error("ناحیهٔ کدپستی باید حداقل یک پیشوند داشته باشد");
    }
    const bad = zone.postalPrefixes.find((p) => !/^\d{1,10}$/.test(p));
    if (bad !== undefined) {
      throw new Error(`پیشوند کدپستی نامعتبر است: ${bad}`);
    }
  }
  if (zone.type === "radius") {
    if (zone.center?.lat == null || zone.center?.lng == null) {
      throw new Error("ناحیهٔ شعاعی به مرکز نیاز دارد");
    }
    if (!(zone.radiusKm > 0)) {
      throw new Error("ناحیهٔ شعاعی به شعاع بزرگ‌تر از صفر نیاز دارد");
    }
  }
  return true;
}

ZoneSchema.path("type").validators.push(validateZone);

const MethodSchema = new mongoose.Schema(
  {
    // The identifier the checkout sends. Kept short and machine-friendly so it
    // is stable across a title edit.
    key: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    // `pickup` is first-class, not a delivery with a blank address: it has no
    // destination, so it must not be gated on having one.
    kind: { type: String, enum: METHOD_KINDS, required: true },
    enabled: { type: Boolean, default: true },
    carrier: { type: String, default: "", trim: true, maxlength: 80 },
    pricing: {
      mode: { type: String, enum: PRICING_MODES, default: "flat" },
      flatFee: { type: Number, min: 0, default: 0 },
      perKgFee: { type: Number, min: 0, default: 0 },
      perItemFee: { type: Number, min: 0, default: 0 },
      // 0 = this method never becomes free on its own. A profile-level threshold
      // still applies on top; the effective threshold is the lower of the two.
      freeThreshold: { type: Number, min: 0, default: 0 },
    },
    eta: { type: EtaSchema, default: () => ({ minDays: 1, maxDays: 3 }) },
    zones: {
      type: [ZoneSchema],
      default: [],
      validate: {
        validator: (zones) => (zones || []).every((z) => validateZone(z)),
        message: "پیکربندی ناحیه نامعتبر است",
      },
    },
    // Pickup only. A pickup method with no address cannot be fulfilled, so the
    // service layer refuses to quote it without one.
    pickup: {
      address: { type: String, default: "", trim: true, maxlength: 400 },
      city: { type: String, default: "", trim: true, maxlength: 80 },
      province: { type: String, default: "", trim: true, maxlength: 80 },
      hours: { type: String, default: "", trim: true, maxlength: 200 },
      instructions: { type: String, default: "", trim: true, maxlength: 400 },
    },
  },
  { _id: false },
);

const ShippingProfileSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerProfile",
      required: true,
      unique: true,
      index: true,
    },
    sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isEnabled: { type: Boolean, default: false },
    // Store-wide "free shipping above X". 0 disables it. Lower than a method's
    // own threshold, so a seller can offer both without surprising the buyer.
    freeShippingThreshold: { type: Number, min: 0, default: 0 },
    methods: {
      type: [MethodSchema],
      default: [],
      validate: {
        // Keys are the checkout's lookup handle; a duplicate would make the
        // chosen method ambiguous and the price a coin flip.
        validator: (methods) => {
          const keys = (methods || []).map((m) => m.key);
          return new Set(keys).size === keys.length;
        },
        message: "کلید روش‌های ارسال باید یکتا باشد",
      },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ShippingProfile", ShippingProfileSchema);
module.exports.PRICING_MODES = PRICING_MODES;
module.exports.METHOD_KINDS = METHOD_KINDS;
module.exports.ZONE_TYPES = ZONE_TYPES;
module.exports.ZONE_SPECIFICITY = ZONE_SPECIFICITY;
