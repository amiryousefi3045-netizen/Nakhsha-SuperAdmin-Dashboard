/**
 * Coupon / campaign contract (Phase 35, P1-07).
 *
 * Like `types/returns.ts`, this lives on its own because BOTH sides of the
 * storefront need the same facts and must not disagree: the buyer's checkout
 * needs to know a code is real and what it is worth, and the seller's campaign
 * page needs to know what that same code has cost so far. Deriving the money
 * from one shared vocabulary is what keeps the preview and the real order in
 * agreement.
 *
 * Mirrors `backend/models/Coupon.js`. Note that every money value here is an
 * integer in the SAME unit as `Order.subtotal` / `Order.total` — there is no
 * Rial/Toman conversion anywhere in this flow, so a value is never scaled.
 */

/** How the discount is computed. Mirrors `Coupon.COUPON_TYPES`. */
export type CouponType = "percent" | "fixed";

/** Campaign lifecycle. Mirrors `Coupon.COUPON_STATUSES`. */
export type CouponStatus = "active" | "paused";

export const COUPON_TYPES: CouponType[] = ["percent", "fixed"];
export const COUPON_STATUSES: CouponStatus[] = ["active", "paused"];

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  percent: "درصدی",
  fixed: "مبلغ ثابت",
};

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  active: "فعال",
  paused: "متوقف",
};

/** Upper bound on a percentage, enforced on both sides. */
export const COUPON_MAX_PERCENT = 90;

/** A campaign as the seller sees it. Mirrors `CouponService.couponToDTO`. */
export interface SellerCoupon {
  id: string;
  code: string;
  description: string;
  type: CouponType;
  value: number;
  /** Ceiling for a percentage campaign; 0 means "no ceiling". */
  maxDiscount: number;
  /** Minimum cart the code accepts; 0 means "no minimum". */
  minPurchase: number;
  /** Total uses allowed across the store; 0 means "unlimited". */
  maxUses: number;
  /** Uses allowed per buyer; 0 means "unlimited per buyer". */
  maxUsesPerBuyer: number;
  usedCount: number;
  /** `null` when the campaign is unlimited. */
  remainingUses: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  status: CouponStatus;
}

/**
 * Per-campaign usage, as the reporting table needs it.
 *
 * `redemptions` is the authoritative count of rows; `discountGiven` is the sum
 * of what those redemptions actually cost the store, which is the number that
 * answers "what did this campaign do to my margin".
 */
export interface CouponUsage {
  redemptions: number;
  discountGiven: number;
  lastRedeemedAt: string | null;
}

/** `GET /seller/coupons` adds this to the page envelope. */
export interface CouponCounts {
  total: number;
  active: number;
  paused: number;
  /** Campaigns whose quota is used up. */
  exhausted: number;
  /** Sum of every redemption's discount across the filtered set. */
  discountGiven: number;
}

export interface ListSellerCouponsParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: CouponStatus;
}

export interface CreateSellerCouponInput {
  code: string;
  description?: string;
  type: CouponType;
  value: number;
  maxDiscount?: number;
  minPurchase?: number;
  maxUses?: number;
  maxUsesPerBuyer?: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  status?: CouponStatus;
}

/** Every field is optional; only what is sent is changed. */
export type UpdateSellerCouponInput = Partial<CreateSellerCouponInput>;

/**
 * A campaign as the BUYER sees it, from the server-priced preview.
 *
 * The amounts are computed by the server from live product prices. The client
 * never sends a subtotal and never computes the discount itself, which is why
 * this type is a result and not an input.
 */
export interface CouponPreview {
  code: string;
  type: CouponType;
  value: number;
  description: string;
  /** Server-priced cart total, before any discount. */
  subtotal: number;
  discount: number;
  /** What the buyer will actually be charged. */
  total: number;
}

/** One line of `GET /seller/coupons/usage/export`. */
export interface CouponUsageRow {
  code: string;
  orderId: string;
  buyerPhone: string;
  discount: number;
  redeemedAt: string;
}

/**
 * Whether a campaign can still be spent, derived from the DTO alone.
 *
 * The seller page needs this for badges, and it deliberately mirrors the
 * server's rules rather than inventing its own: a paused, expired, not-yet-
 * started, or exhausted campaign is not spendable, no matter what `status` says.
 */
export function isCouponSpendable(
  coupon: Pick<SellerCoupon, "status" | "startsAt" | "expiresAt" | "remainingUses">,
  now: number = Date.now(),
): boolean {
  if (coupon.status !== "active") return false;
  if (coupon.remainingUses !== null && coupon.remainingUses <= 0) return false;
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return false;
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now) return false;
  return true;
}
