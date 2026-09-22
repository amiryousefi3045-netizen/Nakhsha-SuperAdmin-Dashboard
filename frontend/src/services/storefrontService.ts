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
  ListStorefrontProductsParams,
  StorefrontProduct,
  StorefrontProductsPage,
  StorefrontProfile,
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