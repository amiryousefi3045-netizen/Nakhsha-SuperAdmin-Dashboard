/**
 * Public storefront domain types.
 *
 * These mirror the backend storefront DTOs (no seller-internal fields such as
 * status, stock, sku, finance or verification data are ever exposed).
 */

import type { ReturnItem, ReturnStatus, ReturnTimelineEntry } from "./returns";
import type { CouponPreview } from "./coupon";
import type { ShippingAddressInput } from "./shipping";

/**
 * The buyer's view of a campaign. Re-exported so storefront consumers can reach
 * it from the storefront types, the same way the return types are shared.
 */
export type { CouponPreview };

export interface StorefrontStats {
  totalProducts: number;
  averageRating: number;
  ratingCount: number;
}

export interface StorefrontContact {
  phone?: string;
  email?: string;
  telegram?: string;
  instagram?: string;
  whatsapp?: string;
}

export interface StorefrontProfile {
  id: string;
  storeName: string;
  slug: string;
  description?: string;
  logo?: string;
  cover?: string;
  contact?: StorefrontContact;
  location?: { city?: string; neighborhood?: string };
  stats: StorefrontStats;
  createdAt?: string;
}

export interface ProductRating {
  average: number;
  count: number;
}

export interface StorefrontProduct {
  id: string;
  title: string;
  description?: string;
  images: string[];
  category: string;
  price: number;
  currency: string;
  tags: string[];
  /** Derived stock: onHand − reserved (only when stockPolicy === "tracked"). */
  availableStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  /** Buyer rating aggregate — Phase 14 (defaults to none when empty). */
  rating?: ProductRating;
  createdAt?: string;
}

export type StorefrontSort = "newest" | "priceAsc" | "priceDesc";

/** Directory sort options (Phase 15): newest, best rated, most products. */
export type StorefrontDirectorySort = "newest" | "rating" | "products";

export interface ListStorefrontsParams {
  page?: number;
  limit?: number;
  q?: string;
  sort?: StorefrontDirectorySort;
}

export interface StorefrontsPage {
  items: StorefrontProfile[];
  total: number;
  page: number;
  limit: number;
}

export interface ListStorefrontProductsParams {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  sort?: StorefrontSort;
}

export interface StorefrontProductsPage {
  items: StorefrontProduct[];
  total: number;
  page: number;
  limit: number;
}

/** Product category enum values accepted by the public storefront. */
export const STOREFRONT_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "carpet", label: "فرش" },
  { value: "pottery", label: "سفالگری" },
  { value: "metalwork", label: "فلزکاری" },
  { value: "woodwork", label: "نجاری" },
  { value: "textile", label: "نساجی" },
  { value: "jewelry", label: "زیورآلات" },
  { value: "leather", label: "چرم" },
  { value: "home_decor", label: "دکوراسیون" },
  { value: "accessories", label: "اکسسوری" },
  { value: "tourism", label: "گردشگری" },
  { value: "other", label: "سایر" },
];

/**
 * Buyer checkout + payment types (Phase 12).
 *
 * These mirror the storefront-order DTOs: `BuyerOrder` is the buyer-facing
 * order receipt derived from OrderService.orderToDTO — seller-internal fields
 * (seller profile internals, seller notes about fulfillment) are never shown.
 */

export interface CheckoutItemInput {
  productId: string;
  qty: number;
}

export interface CheckoutCustomerInput {
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface CheckoutInput {
  customer: CheckoutCustomerInput;
  items: CheckoutItemInput[];
  paymentMethod?: "card" | "wallet" | "other";
  customerNote?: string;
  /**
   * A campaign code, or empty for none. This is ONLY a lookup key: the server
   * re-prices the cart and computes the discount itself, so a client that lies
   * about the code or the cart buys nothing. Omit it to check out normally.
   */
  couponCode?: string;
  /**
   * Structured destination (Phase 36). Sent instead of / alongside
   * `customer.address` because a zone has to be matched against a province, a
   * postal code and coordinates — none of which survive a single free-text
   * string. Omit it for a pickup order, which has no destination by definition.
   */
  shippingAddress?: ShippingAddressInput;
  /**
   * The seller's method KEY from the quote. A lookup, never an amount: the server
   * prices the delivery from the seller's own rate card, so editing this string
   * cannot buy a cheaper parcel. Omit it and the server takes the cheapest
   * method the destination allows.
   */
  shippingMethodId?: string;
}

export interface StorefrontPayment {
  method: string;
  status: "unpaid" | "paid" | "refunded";
  provider?: string;
  refId?: string;
  paidAt?: string;
  /**
   * What the store actually gave back (Phase 33). Optional because it only
   * exists once an RMA is settled, and a partial refund must never be shown
   * as the order total.
   */
  refundedAmount?: number;
  refundedAt?: string | null;
}

export interface BuyerOrderItem {
  productId: string;
  title: string;
  sku: string;
  image: string;
  price: number;
  currency: string;
  qty: number;
}

export interface BuyerOrderTimelineEntry {
  status: string;
  at: string;
  by: string | null;
  reason: string;
}

export interface OrderNotification {
  channel: "sms" | "email" | "telegram";
  status: BuyerOrderStatus;
  reason: string;
  message: string;
  delivered: boolean;
  error: string;
  at: string;
}

export interface BuyerOrder {
  id: string;
  sellerId: string;
  origin: "seller" | "storefront";
  buyerUserId: string | null;
  orderNumber: number;
  customer: CheckoutCustomerInput;
  items: BuyerOrderItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  currency: string;
  status: BuyerOrderStatus;
  itemCount: number;
  timeline: BuyerOrderTimelineEntry[];
  notifications?: OrderNotification[];
  payment: StorefrontPayment;
  customerNote: string;
  sellerNote: string;
  createdAt?: string;
  updatedAt?: string;
}

export type BuyerOrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

/** Order status enum values as served by the storefront order receipt. */
export const BUYER_ORDER_STATUSES: BuyerOrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];

export interface ListBuyerOrdersParams {
  page?: number;
  limit?: number;
  status?: BuyerOrderStatus;
}

// ── Returns / RMA (Phase 33, P1-04) ─────────────────────────────────────────

/**
 * The buyer's view of a return. Mirrors the seller RMA minus the fields that
 * are store-internal (the store id, the acting user ids). `isOpen` is what
 * lets the UI say "under review" without re-deriving the state machine.
 */
export interface BuyerReturn {
  id: string;
  orderId: string;
  orderNumber: number;
  rmaNumber: number;
  status: ReturnStatus;
  isOpen: boolean;
  reason: string;
  resolutionNote: string;
  items: ReturnItem[];
  refundAmount: number;
  refundCurrency: string;
  refundedAt: string | null;
  timeline: ReturnTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface BuyerReturnsPage {
  items: BuyerReturn[];
  total: number;
  page: number;
  limit: number;
}

/**
 * The order receipt plus the return affordance. Eligibility and the deadline
 * are decided server-side: the client must never be the one deciding whether a
 * buyer's return window is still open.
 */
export interface BuyerOrderDetail {
  order: BuyerOrder;
  returns: BuyerReturn[];
  returnEligible: boolean;
  returnDeadline: string | null;
}

export interface CreateBuyerReturnInput {
  reason: string;
}

export interface BuyerOrdersPage {
  items: BuyerOrder[];
  total: number;
  page: number;
  limit: number;
}

export interface PaymentIntent {
  provider: string;
  refId: string;
  amount: number;
  currency: string;
  status: string;
}

export interface CheckoutResponse {
  order: BuyerOrder;
  paymentIntent: PaymentIntent;
}

export interface PaymentCallbackResultPayload {
  order: BuyerOrder;
  applied: boolean;
}

export type PaymentCallbackResult = "SUCCESS" | "FAIL";

/**
 * Product reviews (Phase 14). These mirror the storefront-review DTOs: public
 * reviews only expose a name snapshot (`buyerName` is the generic «کاربر نخشا»
 * for anonymous reviews); buyer PII is never present.
 */

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string;
  buyerName: string;
  isAnonymous: boolean;
  createdAt?: string;
  sellerReply?: {
    comment: string;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
}

export interface StorefrontReviewsPage {
  rating: ProductRating;
  items: ReviewItem[];
  total: number;
  page: number;
  limit: number;
}

export interface SubmitReviewInput {
  rating: number;
  comment?: string;
  isAnonymous?: boolean;
}

export interface MyStorefrontReview {
  canReview: boolean;
  hasDeliveredPurchase: boolean;
  review: ReviewItem | null;
}