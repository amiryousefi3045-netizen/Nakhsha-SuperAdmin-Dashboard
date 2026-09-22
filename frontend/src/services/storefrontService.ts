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
  BuyerOrdersPage,
  CheckoutInput,
  CheckoutResponse,
  ListBuyerOrdersParams,
  ListStorefrontProductsParams,
  MyStorefrontReview,
  PaymentCallbackResult,
  PaymentCallbackResultPayload,
  ProductRating,
  ReviewItem,
  StorefrontProduct,
  StorefrontProductsPage,
  StorefrontProfile,
  StorefrontReviewsPage,
  SubmitReviewInput,
} from "../types/storefront";

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
  const res = await apiClient.get<{ order: BuyerOrder }>(
    `/storefront/orders/${orderId}`,
  );
  return unwrap(res, { order: {} as BuyerOrder }).order;
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