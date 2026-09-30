/**
 * Public storefront service.
 *
 * These targets are reachable WITHOUT authentication via `/api/storefront/*`,
 * addressed by the seller's public `slug`. The backend returns a 404 for any
 * unpublished, suspended or unknown slug so existence is never leaked.
 */

import { apiClient } from "../lib/apiClient";
import type { ApiError, ApiResult } from "../types/apiClient";
import type {
  BuyerOrder,
  BuyerOrderDetail,
  BuyerOrdersPage,
  BuyerReturn,
  BuyerReturnsPage,
  CheckoutInput,
  CheckoutItemInput,
  CheckoutResponse,
  CouponPreview,
  CreateBuyerReturnInput,
  ListBuyerOrdersParams,
  ListStorefrontProductsParams,
  ListStorefrontsParams,
  MyStorefrontReview,
  PaymentCallbackResult,
  PaymentCallbackResultPayload,
  ProductRating,
  ReviewItem,
  StorefrontProduct,
  StorefrontProductsPage,
  StorefrontProfile,
  StorefrontReviewsPage,
  StorefrontsPage,
  SubmitReviewInput,
} from "../types/storefront";
import type { ShippingQuote, ShippingQuoteInput } from "../types/shipping";

/**
 * A stand-in for an unconfigured store.
 *
 * `configured: false` is the honest answer, not a failure: a store with no rate
 * card still trades, on free shipping. The UI keys off this flag to say so
 * rather than to block the buyer.
 */
const emptyQuote: ShippingQuote = {
  configured: false,
  freeShippingThreshold: 0,
  methods: [],
  unavailable: [],
  warning: "",
};

function unwrap<T>(res: ApiResult<T>, expected: T): T {
  if (!res.success || res.data === undefined) {
    throw (res.error as ApiError) ?? new Error("پاسخ سرور نامعتبر است");
  }
  return res.data ?? expected;
}

/** GET /storefront/:slug — public storefront profile + stats. */
export async function getStorefront(slug: string): Promise<StorefrontProfile> {
  const res = await apiClient.get<{ storefront: StorefrontProfile }>(
    `/storefront/${encodeURIComponent(slug)}`,
  );
  return unwrap(res, { storefront: {} as StorefrontProfile }).storefront;
}

/** GET /storefronts — public directory of every published + active store. */
export async function listStorefronts(
  params: ListStorefrontsParams = {},
): Promise<StorefrontsPage> {
  const res = await apiClient.get<StorefrontsPage>("/storefronts", { params });
  return unwrap(res, {
    items: [],
    total: 0,
    page: params.page ?? 1,
    limit: params.limit ?? 25,
  });
}

/** GET /storefront/:slug/products — paginated catalog of ACTIVE products. */
export async function getStorefrontProducts(
  slug: string,
  params: ListStorefrontProductsParams = {},
): Promise<StorefrontProductsPage> {
  const res = await apiClient.get<StorefrontProductsPage>(
    `/storefront/${encodeURIComponent(slug)}/products`,
    { params },
  );
  return unwrap(res, {
    items: [],
    total: 0,
    page: params.page ?? 1,
    limit: params.limit ?? 25,
  });
}

/** GET /storefront/:slug/products/:productId — public product detail. */
export async function getStorefrontProduct(
  slug: string,
  productId: string,
): Promise<StorefrontProduct> {
  const res = await apiClient.get<{ product: StorefrontProduct }>(
    `/storefront/${encodeURIComponent(slug)}/products/${productId}`,
  );
  return unwrap(res, { product: {} as StorefrontProduct }).product;
}

/**
 * POST /storefront/:slug/checkout — buyer checkout.
 *
 * Requires authentication (the interceptor attaches the token). Reserves stock
 * and returns a mock payment intent addressed to the (also authenticated-
 * agnostic) callback endpoint below.
 */
export async function checkoutStorefront(
  slug: string,
  input: CheckoutInput,
): Promise<CheckoutResponse> {
  const res = await apiClient.post<CheckoutResponse>(
    `/storefront/${encodeURIComponent(slug)}/checkout`,
    input,
  );
  return unwrap(res, {
    order: {} as CheckoutResponse["order"],
    paymentIntent: {} as CheckoutResponse["paymentIntent"],
  });
}

/**
 * POST /storefront/:slug/shipping/quote — what delivery costs for this basket.
 *
 * Called before checkout, from the buyer's own form, so the number on screen is
 * the number they will be charged: the server re-prices the basket from live
 * products and the seller's rate card. Nothing here is an amount the client
 * computed, and the quote is not a reservation — it changes if the basket,
 * destination or rate card changes, and checkout always prices it again.
 *
 * Requires authentication, and is rate limited: this endpoint reveals a seller's
 * rates, so it is for a human filling in a form, not a loop.
 */
export async function quoteStorefrontShipping(
  slug: string,
  input: ShippingQuoteInput,
): Promise<ShippingQuote> {
  const res = await apiClient.post<ShippingQuote>(
    `/storefront/${encodeURIComponent(slug)}/shipping/quote`,
    input,
  );
  return unwrap(res, emptyQuote);
}

/**
 * GET /storefront/:slug/shipping/provinces — the canonical province list.
 *
 * Fetched rather than bundled on purpose: the server validates the buyer's
 * province against exactly this table, so a local copy would drift and offer
 * provinces that are then rejected. Public (no auth) because the answer is the
 * same 31 names for every store and leaks nothing.
 */
export async function getShippingProvinces(slug: string): Promise<string[]> {
  const res = await apiClient.get<{ provinces: string[] }>(
    `/storefront/${encodeURIComponent(slug)}/shipping/provinces`,
  );
  return unwrap(res, { provinces: [] }).provinces;
}

/**
 * POST /storefront/:slug/coupons/validate — check a typed code against the
 * current cart WITHOUT spending it.
 *
 * The server re-prices the cart from live products, so the returned numbers are
 * the ones checkout will use; the client never sends a subtotal and never does
 * the arithmetic itself. Nothing here is a promise that the code will still be
 * valid at checkout — the quota is only spent when the order is written.
 *
 * Requires authentication. The endpoint is rate limited, so this is for a human
 * typing a code, not a loop.
 */
export async function validateStorefrontCoupon(
  slug: string,
  code: string,
  items: CheckoutItemInput[],
): Promise<CouponPreview> {
  const res = await apiClient.post<CouponPreview>(
    `/storefront/${encodeURIComponent(slug)}/coupons/validate`,
    { code, items },
  );
  return unwrap(res, {} as CouponPreview);
}

/**
 * POST /storefront/payments/:refId/callback — apply the (simulated) gateway
 * result. Public by design: the gateway calls back without a session token.
 */
export async function submitStorefrontPayment(
  refId: string,
  result: PaymentCallbackResult,
  reason = "",
): Promise<PaymentCallbackResultPayload> {
  const res = await apiClient.post<PaymentCallbackResultPayload>(
    `/storefront/payments/${refId}/callback`,
    { result, reason: reason || undefined },
  );
  return unwrap(res, { order: {} as PaymentCallbackResultPayload["order"], applied: false });
}

/** GET /storefront/orders/:orderId — the buyer's own order receipt. */
export async function getStorefrontOrder(orderId: string): Promise<BuyerOrder> {
  const detail = await getStorefrontOrderDetail(orderId);
  return detail.order;
}

/**
 * GET /storefront/orders/:orderId — the receipt plus the return affordance.
 *
 * `returnEligible` / `returnDeadline` come from the server, so the "request a
 * return" button can never be shown for a window that has already closed.
 */
export async function getStorefrontOrderDetail(orderId: string): Promise<BuyerOrderDetail> {
  const res = await apiClient.get<BuyerOrderDetail>(`/storefront/orders/${orderId}`);
  return unwrap(res, {
    order: {} as BuyerOrder,
    returns: [],
    returnEligible: false,
    returnDeadline: null,
  });
}

/**
 * POST /storefront/orders/:orderId/returns — open a return on a delivered
 * order. The server owns the window and the one-open-request rule; a rejected
 * attempt comes back as a domain error (400/409) with a Persian message.
 */
export async function createBuyerReturn(
  orderId: string,
  input: CreateBuyerReturnInput,
): Promise<BuyerReturn> {
  const res = await apiClient.post<{ return: BuyerReturn }>(
    `/storefront/orders/${orderId}/returns`,
    input,
  );
  return unwrap(res, { return: {} as BuyerReturn }).return;
}

/** GET /storefront/returns — the buyer's own claims, newest first. */
export async function listBuyerReturns(
  params: { page?: number; limit?: number } = {},
): Promise<BuyerReturnsPage> {
  const res = await apiClient.get<BuyerReturnsPage>("/storefront/returns", { params });
  return unwrap(res, {
    items: [],
    total: 0,
    page: params.page ?? 1,
    limit: params.limit ?? 10,
  });
}

/** GET /storefront/orders — paginated "my orders" for the signed-in buyer. */
export async function listStorefrontOrders(
  params: ListBuyerOrdersParams = {},
): Promise<BuyerOrdersPage> {
  const res = await apiClient.get<BuyerOrdersPage>("/storefront/orders", { params });
  return unwrap(res, {
    items: [],
    total: 0,
    page: params.page ?? 1,
    limit: params.limit ?? 10,
  });
}

/**
 * GET /storefront/products/:productId/reviews — public, paginated list of the
 * product's published reviews plus its overall rating aggregate.
 */
export async function getStorefrontProductReviews(
  productId: string,
  params: { page?: number; limit?: number } = {},
): Promise<StorefrontReviewsPage> {
  const res = await apiClient.get<StorefrontReviewsPage>(
    `/storefront/products/${productId}/reviews`,
    { params },
  );
  return unwrap(res, {
    rating: { average: 0, count: 0 },
    items: [],
    total: 0,
    page: params.page ?? 1,
    limit: params.limit ?? 10,
  });
}

/**
 * POST /storefront/products/:productId/review — submit or edit a review.
 * Requires authentication; a review is only allowed after a paid + delivered
 * storefront purchase of the product (enforced server-side).
 */
export async function submitStorefrontReview(
  productId: string,
  input: SubmitReviewInput,
): Promise<{ review: ReviewItem; rating: ProductRating }> {
  const res = await apiClient.post<{ review: ReviewItem; rating: ProductRating }>(
    `/storefront/products/${productId}/review`,
    input,
  );
  return unwrap(res, {
    review: {} as ReviewItem,
    rating: { average: 0, count: 0 },
  });
}

/**
 * GET /storefront/products/:productId/review/mine — the signed-in buyer's own
 * review plus their purchase eligibility for this product.
 */
export async function getMyStorefrontReview(
  productId: string,
): Promise<MyStorefrontReview> {
  const res = await apiClient.get<MyStorefrontReview>(
    `/storefront/products/${productId}/review/mine`,
  );
  return unwrap(res, {
    canReview: false,
    hasDeliveredPurchase: false,
    review: null,
  });
}