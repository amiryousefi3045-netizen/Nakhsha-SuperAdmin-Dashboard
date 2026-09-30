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
  /** The buyer's price for THIS basket. Server-computed. */
  fee: number;
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
}

export interface ShippingQuoteInput {
  items: { productId: string; qty: number }[];
  shippingAddress?: ShippingAddressInput;
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

export interface ShippingMethodPricing {
  mode: ShippingPricingMode;
  flatFee: number;
  perKgFee: number;
  perItemFee: number;
  /** 0 = this method never becomes free on its own. */
  freeThreshold: number;
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
  updatedAt?: string;
}

export interface SellerShippingProfileInput {
  isEnabled: boolean;
  freeShippingThreshold: number;
  methods: ShippingMethod[];
}

/** Server limits, mirrored so the form can refuse early instead of round-tripping. */
export const SHIPPING_LIMITS = {
  maxMethods: 12,
  maxZonesPerMethod: 50,
  maxFee: 100_000_000,
} as const;

export const SHIPPING_PRICING_LABELS: Record<ShippingPricingMode, string> = {
  flat: "مبلغ ثابت",
  weight: "به‌ازای هر کیلوگرم",
  per_item: "به‌ازای هر قلم",
  free: "رایگان",
};

export const SHIPPING_ZONE_LABELS: Record<ShippingZoneType, string> = {
  all: "همهٔ ایران",
  province: "استان",
  postal_code: "پیشوند کدپستی",
  radius: "شعاع از مرکز",
};

export function etaText(eta: ShippingEta | null | undefined): string {
  if (!eta) return "";
  if (eta.minDays === eta.maxDays) return `${eta.minDays} روز`;
  return `${eta.minDays} تا ${eta.maxDays} روز`;
}
