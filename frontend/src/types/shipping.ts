/**
 * Delivery types (Phase 36, P1-08).
 *
 * The single rule these types exist to protect: the browser never computes a
 * shipping price. It sends a destination and a method KEY; the server prices it
 * from the seller's own rate card and returns the number. Everything below that
 * is a lookup key or a server answer, and a tampered client that edits any of it
 * gains nothing except a validation error.
 *
 * A second rule: the province list is served by the API
 * (`GET /storefront/:slug/shipping/provinces`) and deliberately NOT duplicated
 * here. `ShippingService.normalizeAddress` validates against one canonical
 * table, so a second copy in this bundle would drift and start offering buyers
 * provinces the server then rejects.
 */

export const SHIPPING_PRICING_MODES = ["flat", "weight", "per_item", "free"] as const;
export type ShippingPricingMode = (typeof SHIPPING_PRICING_MODES)[number];

export const SHIPPING_METHOD_KINDS = ["pickup", "delivery"] as const;
export type ShippingMethodKind = (typeof SHIPPING_METHOD_KINDS)[number];

export const SHIPPING_ZONE_TYPES = ["all", "province", "postal_code", "radius"] as const;
export type ShippingZoneType = (typeof SHIPPING_ZONE_TYPES)[number];

/**
 * The destination, as the buyer fills it in.
 *
 * Every field is optional on the wire because a pickup order legitimately has no
 * destination: an all-blank object means "no address", while a half-filled one
 * is a validation error. That distinction is enforced server-side, so the UI
 * only has to send what the buyer actually typed.
 */
export interface ShippingAddressInput {
  receiverName?: string;
  receiverPhone?: string;
  province?: string;
  city?: string;
  postalCode?: string;
  line1?: string;
  line2?: string;
  note?: string;
  lat?: number;
  lng?: number;
}

export interface ShippingAddress extends ShippingAddressInput {
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  postalCode: string;
  line1: string;
  line2: string;
  note: string;
}

export interface ShippingEta {
  minDays: number;
  maxDays: number;
}

/** One quoted option for this basket and this destination. */
export interface ShippingQuoteMethod {
  key: string;
  title: string;
  kind: ShippingMethodKind;
  carrier: string;
  /** The buyer's price for THIS basket, after any code. Server-computed. */
  fee: number;
  /**
   * What the rate card charges before the seller's own code (Phase 37).
   * `originalFee - fee` is the discount the buyer actually received, which is
   * not always the code's headline number: a fixed code larger than the fee, or
   * one capped by `maxDiscount`, comes out lower.
   */
  originalFee?: number;
  /** Rial actually taken off this shipment. 0 when no code applied. */
  discount?: number;
  /** The code that earned it, uppercased by the server. Empty when none applied. */
  discountCode?: string;
  zoneLabel: string;
  eta: ShippingEta;
  /**
   * Where to collect a parcel. Non-null only for a pickup method, because a
   * pickup has no destination and the buyer has to know the address anyway.
   */
  pickup: {
    address: string;
    city: string;
    province: string;
    hours: string;
    instructions: string;
  } | null;
}

/**
 * The verdict on the code that was submitted (Phase 37).
 *
 * `rejected` is a boolean, not a reason string, and that is deliberate: this
 * object is returned to the buyer as well as the seller, and naming *why* a code
 * failed (disabled, below its minimum, wrong store) would tell a stranger which
 * of a store's codes exist. A code that is absent, disabled, too small a basket
 * or another store's all read the same: `applied: false`.
 */
export interface ShippingQuoteDiscount {
  code: string;
  applied: boolean;
  rejected: boolean;
}

/** Why a configured method is not being offered. Shown to the seller, not the buyer. */
export interface ShippingUnavailableMethod {
  key: string;
  title: string;
  reason: string;
}

export interface ShippingQuote {
  /**
   * False when the store has no rate card at all. Such a store stays open with
   * free shipping, so the UI must not block checkout on an empty method list.
   */
  configured: boolean;
  freeShippingThreshold: number;
  /** Cheapest first — the server already sorts, so the UI must not re-sort. */
  methods: ShippingQuoteMethod[];
  unavailable: ShippingUnavailableMethod[];
  warning: string;
  /**
   * Present on the buyer's quote, absent on the seller's preview: only the
   * storefront path re-prices a real basket, while the seller previews against
   * totals the form supplies. Optional rather than defaulted so a caller cannot
   * print a basket subtotal that the server never sent.
   */
  subtotal?: number;
  currency?: string;
  /** Absent when no code was submitted, so the UI can hide the whole block. */
  discount?: ShippingQuoteDiscount;
}

export interface ShippingQuoteInput {
  items: { productId: string; qty: number }[];
  shippingAddress?: ShippingAddressInput;
  /**
   * The seller's shipping code, uppercased server-side. A lookup key, never an
   * amount - the same rule the buyer's coupon field follows.
   */
  shippingDiscountCode?: string;
}

/**
 * The seller's own preview input.
 *
 * Deliberately NOT a product list: the seller is testing a rate card against a
 * hypothetical parcel, not a real basket, so they state the subtotal, weight and
 * item count directly instead of picking SKUs. Same engine, same zones, same
 * outcome as the buyer's quote.
 */
export interface SellerShippingPreviewInput {
  subtotal: number;
  totalWeightKg: number;
  totalQty: number;
  shippingAddress?: ShippingAddressInput;
  /** Try a code against this hypothetical basket before publishing it. */
  discountCode?: string;
}

/* ── Seller side: the rate card ───────────────────────────────────────────── */

export interface ShippingZonePricing {
  /** null = use the method's own pricing. A number overrides it. */
  feeOverride: number | null;
  etaOverride: ShippingEta | null;
}

export interface ShippingZone {
  label: string;
  type: ShippingZoneType;
  provinces: string[];
  postalPrefixes: string[];
  center: { lat: number | null; lng: number | null };
  radiusKm: number;
  feeOverride: number | null;
  etaOverride: ShippingEta | null;
  enabled: boolean;
}

/**
 * One step of a weight rate card: "anything up to `upToKg` costs `price`"
 * (Phase 37).
 *
 * `upToKg` is an INCLUSIVE bound, not a starting point, because that is how
 * Iranian couriers write their brackets and how a buyer reads them. The steps
 * must ascend; the server refuses a card that does not rather than sorting it,
 * since a silently reordered card is one the seller never approved.
 */
export interface ShippingTier {
  upToKg: number;
  price: number;
}

export type ShippingDiscountType = "percent" | "fixed";

/**
 * A seller-funded reduction on the delivery charge (Phase 37).
 *
 * `maxDiscount` is required by the server, not merely recommended: without it a
 * `fixed` value is an open-ended liability, and on a small fee it would pay the
 * buyer to shop. The engine additionally never lets a discount exceed the fee.
 */
export interface ShippingDiscount {
  /** Stored and compared uppercase, so a buyer may type it in any case. */
  code: string;
  type: ShippingDiscountType;
  /** Percent (1-100) or rial, depending on `type`. */
  value: number;
  /** 0 = no minimum basket. Below it the code simply does not apply. */
  minSubtotal: number;
  /** Hard ceiling in rial, whatever the percentage works out to. */
  maxDiscount: number;
  enabled: boolean;
}

export interface ShippingMethodPricing {
  mode: ShippingPricingMode;
  flatFee: number;
  perKgFee: number;
  perItemFee: number;
  /** 0 = this method never becomes free on its own. */
  freeThreshold: number;
  /**
   * Step pricing, in ascending `upToKg` order (Phase 37). Only read when
   * `mode` is `weight`; the server falls back to `perKgFee` when it is empty, so
   * a seller who has not migrated keeps working.
   */
  tiers: ShippingTier[];
}

export interface ShippingPickupInfo {
  address: string;
  city: string;
  province: string;
  hours: string;
  instructions: string;
}

export interface ShippingMethod {
  /** The stable identifier checkout sends. Survives a title edit. */
  key: string;
  title: string;
  kind: ShippingMethodKind;
  enabled: boolean;
  carrier: string;
  pricing: ShippingMethodPricing;
  eta: ShippingEta;
  zones: ShippingZone[];
  pickup: ShippingPickupInfo;
}

export interface SellerShippingProfile {
  configured: boolean;
  isEnabled: boolean;
  freeShippingThreshold: number;
  methods: ShippingMethod[];
  discounts: ShippingDiscount[];
  updatedAt?: string;
}

export interface SellerShippingProfileInput {
  isEnabled: boolean;
  freeShippingThreshold: number;
  methods: ShippingMethod[];
  discounts: ShippingDiscount[];
}

/** Server limits, mirrored so the form can refuse early instead of round-tripping. */
export const SHIPPING_LIMITS = {
  maxMethods: 12,
  maxZonesPerMethod: 50,
  maxFee: 100_000_000,
  maxTiersPerMethod: 10,
  maxTierKg: 1_000,
  maxDiscounts: 10,
  maxCodeLength: 20,
} as const;

/** The shape a code has to have. Mirrors the server so the form can say so now. */
export const SHIPPING_CODE_PATTERN = /^[A-Z0-9-]{3,20}$/;

export const SHIPPING_PRICING_LABELS: Record<ShippingPricingMode, string> = {
  flat: "مبلغ ثابت",
  weight: "به‌ازای هر کیلوگرم",
  per_item: "به‌ازای هر قلم",
  free: "رایگان",
};

export const SHIPPING_ZONE_LABELS: Record<ShippingZoneType, string> = {
  all: "همهٔ ایران",
  province: "استان",
  postal_code: "پیشوند کد پستی",
  radius: "شعاع دور از فروشگاه",
};

export const SHIPPING_DISCOUNT_TYPE_LABELS: Record<ShippingDiscountType, string> = {
  percent: "درصدی",
  fixed: "مبلغ ثابت",
};

/**
 * The price a step card charges for a weight, in rial.
 *
 * Mirrors `ShippingService.computeTierFee` so the seller form can show the
 * result as they type. A 30 kg parcel with no step that reaches it holds the
 * last step's price - the server does the same, and the form says so rather than
 * silently showing a cheaper number than will be charged.
 */
export function tierFeeFor(tiers: ShippingTier[], weightKg: number): number {
  if (!tiers.length) return 0;
  const steps = [...tiers].sort((a, b) => a.upToKg - b.upToKg);
  let fee = steps[0].price;
  for (const step of steps) {
    if (weightKg <= step.upToKg) return step.price;
    fee = step.price;
  }
  return fee;
}

export function etaText(eta: ShippingEta | null | undefined): string {
  if (!eta) return "";
  if (eta.minDays === eta.maxDays) return `${eta.minDays} روز`;
  return `${eta.minDays} تا ${eta.maxDays} روز`;
}
