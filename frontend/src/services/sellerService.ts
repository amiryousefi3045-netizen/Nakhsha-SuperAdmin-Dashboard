/**
 * Seller Dashboard API service (independent of the Creator/Admin domains).
 *
 * Every function targets `/api/seller/*` (the apiClient base URL already
 * includes `/api`). All routes require `seller` + a SellerProfile on the
 * backend; the token is injected automatically by the apiClient interceptor.
 */

import { apiClient } from "../lib/apiClient";
import type { ApiError, ApiResult } from "../types/apiClient";
import type {
  FulfillmentSummary,
  ListSellerReviewsParams,
  OrderCounts,
  OrderStatus,
  ProductStatus,
  ReviewStatus,
  SellerAnalytics,
  SellerDashboardData,
  SellerFinanceSummary,
  SellerOrder,
  SellerPage,
  SellerPayout,
  SellerPayoutListParams,
  SellerProduct,
  SellerProfile,
  SellerReview,
  SellerSettings,
  SellerSettingsUpdate,
  SellerTeam,
  StockAdjustmentHistory,
  InviteTeamMemberInput,
  RequestSellerPayoutInput,
  TeamMember,
  TeamMemberRole,
} from "../types/seller";

/** Throws the normalized ApiError when a request failed. */
function unwrap<T>(res: ApiResult<T>, expected: T): T {
  if (!res.success || res.data === undefined) {
    throw (res.error as ApiError) ?? new Error("پاسخ سرور نامعتبر است");
  }
  return res.data ?? expected;
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

// ── Reviews (Phase 16) ───────────────────────────────────────────────────────

/** GET /seller/reviews — the store's reviews with product context. */
export async function listSellerReviews(
  params: ListSellerReviewsParams = {},
): Promise<SellerPage<SellerReview>> {
  const res = await apiClient.get<SellerPage<SellerReview>>("/seller/reviews", { params });
  return unwrap(res, { items: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 25 });
}

/** PATCH /seller/reviews/:id/visibility — hide or re-publish a review. */
export async function updateSellerReviewVisibility(
  id: string,
  status: ReviewStatus,
): Promise<SellerReview> {
  const res = await apiClient.patch<{ review: SellerReview }>(
    `/seller/reviews/${id}/visibility`,
    { status },
  );
  return unwrap(res, { review: {} as SellerReview }).review;
}

// ── Finance & payouts ───────────────────────────────────────────────────────

/** GET /seller/finance — live settlement summary (real backend, no DomainGap). */
export async function getSellerFinance(): Promise<SellerFinanceSummary> {
  const res = await apiClient.get<{ finance: SellerFinanceSummary }>("/seller/finance");
  return unwrap(res, { finance: {} as SellerFinanceSummary }).finance;
}

/** GET /seller/payouts — paginated payout history (optional status filter). */
export async function getSellerPayouts(
  params: SellerPayoutListParams = {},
): Promise<SellerPage<SellerPayout>> {
  const res = await apiClient.get<SellerPage<SellerPayout>>("/seller/payouts", { params });
  return unwrap(res, { items: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 20 });
}

/** POST /seller/payouts — request a settlement (deducts from available balance). */
export async function requestSellerPayout(input: RequestSellerPayoutInput): Promise<SellerPayout> {
  const res = await apiClient.post<{ payout: SellerPayout }>("/seller/payouts", {
    amount: input.amount,
    ...(input.method ? { method: input.method } : {}),
    ...(input.note ? { note: input.note } : {}),
  });
  return unwrap(res, { payout: {} as SellerPayout }).payout;
}

/** PATCH /seller/payouts/:id/cancel — retract a still-requested payout. */
export async function cancelSellerPayout(id: string, note?: string): Promise<SellerPayout> {
  const res = await apiClient.patch<{ payout: SellerPayout }>(
    `/seller/payouts/${id}/cancel`,
    note ? { note } : {},
  );
  return unwrap(res, { payout: {} as SellerPayout }).payout;
}

// ── Settings & team ─────────────────────────────────────────────────────────

/** GET /seller/settings — store operating preferences (owner + members). */
export async function getSellerSettings(): Promise<SellerSettings> {
  const res = await apiClient.get<{ settings: SellerSettings }>("/seller/settings");
  return unwrap(res, { settings: {} as SellerSettings }).settings;
}

/** PATCH /seller/settings — owner-only partial settings update. */
export async function updateSellerSettings(
  payload: SellerSettingsUpdate,
): Promise<SellerSettings> {
  const res = await apiClient.patch<{ settings: SellerSettings }>("/seller/settings", payload);
  return unwrap(res, { settings: {} as SellerSettings }).settings;
}

/** GET /seller/team — owner-only roster (items + owner card). */
export async function getSellerTeam(): Promise<SellerTeam> {
  const res = await apiClient.get<SellerTeam>("/seller/team");
  return unwrap(res, { items: [], total: 0, owner: null });
}

/** POST /seller/team — owner-only invite by phone. */
export async function inviteSellerTeamMember(
  input: InviteTeamMemberInput,
): Promise<TeamMember> {
  const res = await apiClient.post<{ member: TeamMember }>("/seller/team", input);
  return unwrap(res, { member: {} as TeamMember }).member;
}

/** PATCH /seller/team/:id/role — owner-only role change. */
export async function changeSellerTeamMemberRole(
  id: string,
  role: TeamMemberRole,
): Promise<TeamMember> {
  const res = await apiClient.patch<{ member: TeamMember }>(`/seller/team/${id}/role`, { role });
  return unwrap(res, { member: {} as TeamMember }).member;
}

/** DELETE /seller/team/:id — owner-only removal. */
export async function removeSellerTeamMember(
  id: string,
): Promise<{ id: string }> {
  const res = await apiClient.delete<{ id: string }>(`/seller/team/${id}`);
  return unwrap(res, { id: "" });
}