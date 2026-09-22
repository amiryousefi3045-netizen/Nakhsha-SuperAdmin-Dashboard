/**
 * Seller Dashboard API service (independent of the Creator/Admin domains).
 *
 * Every function targets `/api/seller/*` (the apiClient base URL already
 * includes `/api`). All routes require `seller` + a SellerProfile on the
 * backend; the token is injected automatically by the apiClient interceptor.
 *
 * Domains that are not implemented on the backend yet (finance, payouts)
 * return an honest `DomainGap` — never fake data.
 */

import { apiClient } from "../lib/apiClient";
import type { ApiError, ApiResult } from "../types/apiClient";
import type {
  DomainGap,
  FulfillmentSummary,
  OrderCounts,
  OrderStatus,
  ProductStatus,
  SellerAnalytics,
  SellerDashboardData,
  SellerOrder,
  SellerPage,
  SellerProduct,
  SellerProfile,
  StockAdjustmentHistory,
} from "../types/seller";

/** Throws the normalized ApiError when a request failed. */
function unwrap<T>(res: ApiResult<T>, expected: T): T {
  if (!res.success || res.data === undefined) {
    throw (res.error as ApiError) ?? new Error("پاسخ سرور نامعتبر است");
  }
  return res.data ?? expected;
}

/** Reads a DomainGap from a 501 "planned" envelope (server never lies). */
function toDomainGap(res: ApiResult<DomainGap>, domain: string): DomainGap {
  if (res.success && res.data?.status === "planned" && res.data?.message) {
    return res.data;
  }
  if (res.error?.status === 501 && res.error.message) {
    return { status: "planned", domain, message: res.error.message };
  }
  throw (res.error as ApiError) ?? new Error("پاسخ سرور نامعتبر است");
}

// ── Dashboard ───────────────────────────────────────────────────────────────

/** GET /seller/dashboard */
export async function getSellerDashboard(): Promise<SellerDashboardData> {
  const res = await apiClient.get<SellerDashboardData>("/seller/dashboard");
  return unwrap(res, {} as SellerDashboardData);
}

// ── Profile ─────────────────────────────────────────────────────────────────

/** GET /seller/profile */
export async function getSellerProfile(): Promise<SellerProfile> {
  const res = await apiClient.get<{ profile: SellerProfile }>("/seller/profile");
  return unwrap(res, { profile: {} as SellerProfile }).profile;
}

/** PATCH /seller/profile */
export async function updateSellerProfile(payload: Partial<SellerProfile>): Promise<SellerProfile> {
  const res = await apiClient.patch<{ profile: SellerProfile }>("/seller/profile", payload);
  return unwrap(res, { profile: {} as SellerProfile }).profile;
}

// ── Products ────────────────────────────────────────────────────────────────

export interface ListSellerProductsParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: ProductStatus;
  category?: string;
}

/** GET /seller/products */
export async function listSellerProducts(
  params: ListSellerProductsParams = {},
): Promise<SellerPage<SellerProduct>> {
  const res = await apiClient.get<SellerPage<SellerProduct>>("/seller/products", {
    params,
  });
  return unwrap(res, { items: [], total: 0, page: 1, limit: 0 });
}

export type SellerProductPayload = Partial<
  Pick<
    SellerProduct,
    | "title"
    | "description"
    | "images"
    | "category"
    | "price"
    | "currency"
    | "sku"
    | "status"
    | "stockPolicy"
    | "lowStockThreshold"
    | "tags"
  > & {
    sourceCraftId: string | null;
    /** Accepted on create only (initial stock), validated server-side. */
    stock?: { onHand?: number; reserved?: number; incoming?: number };
  }
>;

/** POST /seller/products */
export async function createSellerProduct(payload: SellerProductPayload): Promise<SellerProduct> {
  const res = await apiClient.post<{ product: SellerProduct }>("/seller/products", payload);
  return unwrap(res, { product: {} as SellerProduct }).product;
}

/** GET /seller/products/:id */
export async function getSellerProduct(id: string): Promise<SellerProduct> {
  const res = await apiClient.get<{ product: SellerProduct }>(`/seller/products/${id}`);
  return unwrap(res, { product: {} as SellerProduct }).product;
}

/** PATCH /seller/products/:id */
export async function updateSellerProduct(
  id: string,
  payload: SellerProductPayload,
): Promise<SellerProduct> {
  const res = await apiClient.patch<{ product: SellerProduct }>(`/seller/products/${id}`, payload);
  return unwrap(res, { product: {} as SellerProduct }).product;
}

/** DELETE /seller/products/:id (soft delete → archived) */
export async function deleteSellerProduct(id: string): Promise<{ message: string; id: string }> {
  const res = await apiClient.delete<{ message: string; id: string }>(`/seller/products/${id}`);
  return unwrap(res, { message: "", id });
}

/** PATCH /seller/products/:id/status */
export async function updateSellerProductStatus(
  id: string,
  status: ProductStatus,
): Promise<SellerProduct> {
  const res = await apiClient.patch<{ product: SellerProduct }>(
    `/seller/products/${id}/status`,
    { status },
  );
  return unwrap(res, { product: {} as SellerProduct }).product;
}

// ── Inventory ───────────────────────────────────────────────────────────────

export interface ListSellerInventoryParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: "low" | "out";
}

/** GET /seller/inventory */
export async function listSellerInventory(
  params: ListSellerInventoryParams = {},
): Promise<SellerPage<SellerProduct>> {
  const res = await apiClient.get<SellerPage<SellerProduct>>("/seller/inventory", {
    params,
  });
  return unwrap(res, { items: [], total: 0, page: 1, limit: 0 });
}

/** PATCH /seller/inventory/:productId (atomic, non-negativity enforced) */
export async function adjustSellerStock(
  productId: string,
  payload: { delta: number; reason?: string; type?: string },
): Promise<SellerProduct> {
  const res = await apiClient.patch<{ product: SellerProduct }>(
    `/seller/inventory/${productId}`,
    payload,
  );
  return unwrap(res, { product: {} as SellerProduct }).product;
}

/** GET /seller/inventory/:productId/history */
export async function getSellerStockHistory(
  productId: string,
  params: { page?: number; limit?: number } = {},
): Promise<StockAdjustmentHistory> {
  const res = await apiClient.get<StockAdjustmentHistory>(
    `/seller/inventory/${productId}/history`,
    { params },
  );
  return unwrap(res, { product: { id: productId, title: "" }, items: [], total: 0, page: 1, limit: 0 });
}

// ── Analytics ───────────────────────────────────────────────────────────────

/** GET /seller/analytics */
export async function getSellerAnalytics(): Promise<SellerAnalytics> {
  const res = await apiClient.get<SellerAnalytics>("/seller/analytics");
  return unwrap(res, {} as SellerAnalytics);
}

// ── Orders ──────────────────────────────────────────────────────────────────

export interface ListSellerOrdersParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: OrderStatus;
}

const EMPTY_ORDER_COUNTS: OrderCounts = {
  pending: 0,
  confirmed: 0,
  processing: 0,
  shipped: 0,
  delivered: 0,
  cancelled: 0,
  returned: 0,
};

/** GET /seller/orders */
export async function listSellerOrders(
  params: ListSellerOrdersParams = {},
): Promise<SellerPage<SellerOrder>> {
  const res = await apiClient.get<SellerPage<SellerOrder>>("/seller/orders", { params });
  return unwrap(res, { items: [], total: 0, page: 1, limit: 0 });
}

/** GET /seller/orders/:id */
export async function getSellerOrder(id: string): Promise<SellerOrder> {
  const res = await apiClient.get<{ order: SellerOrder }>(`/seller/orders/${id}`);
  return unwrap(res, { order: {} as SellerOrder }).order;
}

/** PATCH /seller/orders/:id/status (workflow transition; 409 on illegal move) */
export async function updateSellerOrderStatus(
  id: string,
  status: OrderStatus,
  reason?: string,
): Promise<SellerOrder> {
  const res = await apiClient.patch<{ order: SellerOrder }>(
    `/seller/orders/${id}/status`,
    reason ? { status, reason } : { status },
  );
  return unwrap(res, { order: {} as SellerOrder }).order;
}

/** GET /seller/fulfillment */
export async function getSellerFulfillment(): Promise<FulfillmentSummary> {
  const res = await apiClient.get<FulfillmentSummary>("/seller/fulfillment");
  return unwrap(res, {
    counts: EMPTY_ORDER_COUNTS,
    needAction: 0,
    needingShipment: 0,
    recent: [],
  });
}

// ── Planned domains (honest DomainGap, never fabricated) ────────────────────

/** GET /seller/finance */
export async function getSellerFinance(): Promise<DomainGap> {
  const res = await apiClient.get<DomainGap>("/seller/finance");
  return toDomainGap(res, "مالی و تسویه");
}

/** GET /seller/payouts */
export async function getSellerPayouts(): Promise<DomainGap> {
  const res = await apiClient.get<DomainGap>("/seller/payouts");
  return toDomainGap(res, "مالی و تسویه");
}