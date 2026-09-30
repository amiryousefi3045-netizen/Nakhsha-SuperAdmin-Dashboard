/**
 * Seller Dashboard API service (independent of the Creator/Admin domains).
 *
 * Every function targets `/api/seller/*` (the apiClient base URL already
 * includes `/api`). All routes require `seller` + a SellerProfile on the
 * backend; the token is injected automatically by the apiClient interceptor.
 */

import { apiClient, API_BASE_URL, TokenManager } from "../lib/apiClient";
import type { ApiError, ApiResult } from "../types/apiClient";
import type {
  CreateSellerCouponInput,
  CouponCounts,
  CouponStatus,
  CouponUsage,
  ListSellerCouponsParams,
  SellerCoupon,
  UpdateSellerCouponInput,
} from "../types/coupon";
import type {
  SellerShippingPreviewInput,
  SellerShippingProfile,
  SellerShippingProfileInput,
  ShippingQuote,
} from "../types/shipping";
import type {
  AnalyticsParams,
  BulkActionResult,
  CreateReturnInput,
  FulfillmentSummary,
  ListSellerReviewsParams,
  ListSellerReturnsParams,
  OrderCounts,
  OrderStatus,
  ProductStatus,
  RefundReturnInput,
  ReturnCounts,
  ReturnStatus,
  ReviewStatus,
  PayoutReportParams,
  SalesReportParams,
  SellerAnalytics,
  SellerActivityParams,
  SellerActivityPage,
  SellerLiveEvent,
  SellerLiveEventPayload,
  SellerLiveEventType,
  SellerDashboardData,
  SellerFinanceSummary,
  SellerOrder,
  SellerPage,
  SellerPayout,
  SellerPayoutListParams,
  SellerPayoutReport,
  SellerProduct,
  SellerProfile,
  SellerReturn,
  SellerReview,
  SellerSalesReport,
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

/**
 * Downloads a CSV endpoint and resolves the blob with the server-suggested
 * filename (falls back to `<fallback>-<date>.csv` when the header is missing).
 */
async function downloadCsv<P extends object>(
  path: string,
  params: P,
  fallback: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.rawGet<Blob>(path, { params, responseType: "blob" });
  const disposition = String(response.headers["content-disposition"] ?? "");
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return {
    blob: response.data,
    filename: match?.[1] ?? `${fallback}-${new Date().toISOString().slice(0, 10)}.csv`,
  };
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

/** PATCH /seller/products/bulk-status — one status write over many ids (P1-06). */
export async function bulkUpdateSellerProductStatus(
  ids: string[],
  status: ProductStatus,
): Promise<BulkActionResult> {
  const res = await apiClient.patch<BulkActionResult>("/seller/products/bulk-status", {
    ids,
    status,
  });
  return unwrap(res, {} as BulkActionResult);
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

/** GET /seller/inventory/export — row-level CSV of tracked stock (P1-02). */
export async function exportSellerInventoryCsv(
  params: ListSellerInventoryParams = {},
): Promise<{ blob: Blob; filename: string }> {
  return downloadCsv("/seller/inventory/export", params, "inventory");
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
export async function getSellerAnalytics(params: AnalyticsParams = {}): Promise<SellerAnalytics> {
  const res = await apiClient.get<SellerAnalytics>("/seller/analytics", { params });
  return unwrap(res, {
    inventory: { totalOnHand: 0, totalReserved: 0, available: 0, products: 0 },
    byStatus: {},
    sales: {
      period: { from: "", to: "" },
      days: 30,
      current: {
        orders: 0,
        units: 0,
        subtotal: 0,
        shippingFee: 0,
        discount: 0,
        total: 0,
        avgOrderValue: 0,
        byStatus: [],
      },
      previous: { orders: 0, units: 0, total: 0 },
      daily: [],
      currency: "IRR",
    },
  });
}

// ── Reports (Phase 24) ──────────────────────────────────────────────────────

/** GET /seller/reports/sales?from&to&top */
export async function getSellerSalesReport(
  params: SalesReportParams = {},
): Promise<SellerSalesReport> {
  const res = await apiClient.get<SellerSalesReport>("/seller/reports/sales", { params });
  return unwrap(res, {
    period: { from: "", to: "" },
    summary: {
      orders: 0,
      units: 0,
      subtotal: 0,
      shippingFee: 0,
      discount: 0,
      total: 0,
      shippingCost: 0,
      shippingMargin: 0,
      shippingCostUnrecorded: 0,
    },
    byStatus: [],
    topProducts: [],
    daily: [],
    currency: "IRR",
  });
}

/** GET /seller/reports/sales/export — row-level CSV download (Phase 25). */
export async function exportSellerSalesReportCsv(
  params: Pick<SalesReportParams, "from" | "to"> = {},
): Promise<{ blob: Blob; filename: string }> {
  return downloadCsv("/seller/reports/sales/export", params, "sales-report");
}

// ── Settlement report (Phase 28, P0-04) ────────────────────────────────────

/** GET /seller/reports/payouts?from&to — period aggregates by status/method/day. */
export async function getSellerPayoutReport(
  params: PayoutReportParams = {},
): Promise<SellerPayoutReport> {
  const res = await apiClient.get<SellerPayoutReport>("/seller/reports/payouts", { params });
  return unwrap(res, {
    period: { from: "", to: "" },
    summary: {
      total: { count: 0, amount: 0 },
      requested: { count: 0, amount: 0 },
      processing: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 },
    },
    byMethod: [],
    daily: [],
    currency: "IRR",
  });
}

/** GET /seller/reports/payouts/export — row-level CSV download. */
export async function exportSellerPayoutReportCsv(
  params: PayoutReportParams = {},
): Promise<{ blob: Blob; filename: string }> {
  return downloadCsv("/seller/reports/payouts/export", params, "payout-report");
}

// ── Store activity (Phase 26) ──────────────────────────────────────────────

/** GET /seller/activity?page&limit — owner + roster audit feed, newest first. */
export async function getSellerActivity(
  params: SellerActivityParams = {},
): Promise<SellerActivityPage> {
  const res = await apiClient.get<SellerActivityPage>("/seller/activity", { params });
  return unwrap(res, { items: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 25 });
}

/** GET /seller/activity/export — row-level CSV download (Phase 30, P1-02). */
export async function exportSellerActivityCsv(): Promise<{ blob: Blob; filename: string }> {
  return downloadCsv("/seller/activity/export", {}, "store-activity");
}

// ── Live store events (Phase 31, P1-05) ────────────────────────────────────

/** Parses one raw `event:`/`data:` frame of the seller SSE stream. */
function parseSellerLiveEvent(chunk: string): SellerLiveEvent | null {
  const eventMatch = /^event:\s*(\S+)$/m.exec(chunk);
  const dataMatch = /^data:\s*([\s\S]+)$/m.exec(chunk);
  if (!eventMatch || !dataMatch) return null;
  try {
    const payload = JSON.parse(dataMatch[1].trim());
    return {
      type: eventMatch[1] as SellerLiveEventType,
      payload: payload as SellerLiveEventPayload,
    };
  } catch {
    return null;
  }
}

export interface SellerLiveEventHandlers {
  onEvent: (event: SellerLiveEvent) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

/**
 * Subscribes to /seller/events/live over fetch+ReadableStream. EventSource can't
 * send an Authorization header, so a raw stream is used instead (same approach
 * as the admin live feed). Returns an unsubscribe function.
 */
export function subscribeSellerLiveEvents(handlers: SellerLiveEventHandlers): () => void {
  const controller = new AbortController();
  const token = TokenManager.get();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let buffer = "";
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    handlers.onClose?.();
  };

  (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/seller/events/live`, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const event = parseSellerLiveEvent(part);
          if (event) handlers.onEvent(event);
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        handlers.onError?.(err as Error);
      }
    } finally {
      closed = true;
    }
  })();

  return close;
}

// ── Orders ──────────────────────────────────────────────────────────────────

export interface ListSellerOrdersParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: OrderStatus;
  from?: string;
  to?: string;
  payment?: "paid" | "unpaid";
  minTotal?: number;
  maxTotal?: number;
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

/** GET /seller/orders/export — row-level CSV of the filtered order list (P1-02). */
export async function exportSellerOrdersCsv(
  params: Omit<ListSellerOrdersParams, "page" | "limit"> = {},
): Promise<{ blob: Blob; filename: string }> {
  return downloadCsv("/seller/orders/export", params, "orders");
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

// — Shipping (Phase 36, P1-08) ————————————————————————————————————————————————

/**
 * GET /seller/shipping — the seller's rate card, or `configured: false`.
 *
 * A missing profile is a normal state, not an error: the store stays open with
 * free shipping, so the editor has to render "nothing configured yet" rather
 * than treat the response as a failure.
 */
export async function getSellerShipping(): Promise<SellerShippingProfile> {
  const res = await apiClient.get<SellerShippingProfile>("/seller/shipping");
  return unwrap(res, {
    configured: false,
    isEnabled: false,
    freeShippingThreshold: 0,
    methods: [],
  });
}

/**
 * PUT /seller/shipping — replace the whole rate card.
 *
 * A replace, not a patch: a zone list and a pricing mode are not fields you can
 * meaningfully merge, and a partial update of a rate card is how a seller ends
 * up with a method priced by the previous version's rules.
 */
export async function saveSellerShipping(
  payload: SellerShippingProfileInput,
): Promise<SellerShippingProfile> {
  const res = await apiClient.put<SellerShippingProfile>("/seller/shipping", payload);
  return unwrap(res, {
    configured: false,
    isEnabled: false,
    freeShippingThreshold: 0,
    methods: [],
  });
}

/**
 * POST /seller/shipping/preview — "what would this basket cost to ship?".
 *
 * The same engine the buyer's quote uses, run against an address the seller
 * types. Without it a seller cannot find out that their own zone list does not
 * cover a town until a buyer complains.
 */
export async function previewSellerShipping(
  input: SellerShippingPreviewInput,
): Promise<ShippingQuote> {
  const res = await apiClient.post<ShippingQuote>("/seller/shipping/preview", input);
  return unwrap(res, {
    configured: false,
    freeShippingThreshold: 0,
    methods: [],
    unavailable: [],
    warning: "",
  });
}

/**
 * PATCH /seller/orders/:id/shipping-cost — what the courier actually charged.
 *
 * This is the number that makes `fee - cost` a real margin, and the only one
 * that cannot be known in advance. Rejected with 409 once the order is
 * delivered, and while the parcel is still `processing` there is no cost to
 * record yet.
 */
export async function recordOrderShippingCost(
  orderId: string,
  cost: number,
): Promise<SellerOrder> {
  const res = await apiClient.patch<{ order: SellerOrder }>(
    `/seller/orders/${orderId}/shipping-cost`,
    { cost },
  );
  return unwrap(res, { order: {} as SellerOrder }).order;
}

// ── Coupons / campaigns (Phase 35, P1-07) ──────────────────────────────────

/** Zeroed count block, used so a response without `counts` still satisfies the type. */
const EMPTY_COUPON_COUNTS: CouponCounts = {
  total: 0,
  active: 0,
  paused: 0,
  exhausted: 0,
  discountGiven: 0,
};

/**
 * GET /seller/coupons — the store's campaigns, newest first, with a usage block
 * per row so the table can show what each one actually cost.
 *
 * Open to any team member: reading a campaign is not a decision.
 */
export async function listSellerCoupons(
  params: ListSellerCouponsParams = {},
): Promise<SellerPage<SellerCoupon & { usage: CouponUsage }> & { counts: CouponCounts }> {
  const res = await apiClient.get<
    SellerPage<SellerCoupon & { usage: CouponUsage }> & { counts: CouponCounts }
  >("/seller/coupons", { params });
  const page = unwrap(res, {
    items: [],
    total: 0,
    page: 1,
    limit: 0,
    counts: EMPTY_COUPON_COUNTS,
  });
  // `unwrap` passes `res.data` through untouched, so a response that omits
  // `counts` would leave the header reading `.counts.active` off undefined.
  return { ...page, counts: { ...EMPTY_COUPON_COUNTS, ...(page.counts ?? {}) } };
}

/** GET /seller/coupons/:id (another store's coupon answers like a missing one) */
export async function getSellerCoupon(id: string): Promise<SellerCoupon> {
  const res = await apiClient.get<{ coupon: SellerCoupon }>(`/seller/coupons/${id}`);
  return unwrap(res, { coupon: {} as SellerCoupon }).coupon;
}

/** POST /seller/coupons — manager or owner only. */
export async function createSellerCoupon(input: CreateSellerCouponInput): Promise<SellerCoupon> {
  const res = await apiClient.post<{ coupon: SellerCoupon }>("/seller/coupons", input);
  return unwrap(res, { coupon: {} as SellerCoupon }).coupon;
}

/**
 * PATCH /seller/coupons/:id — manager or owner only.
 *
 * Only the fields present in `input` reach the server, so an omitted field is
 * left as it is rather than being blanked.
 */
export async function updateSellerCoupon(
  id: string,
  input: UpdateSellerCouponInput,
): Promise<SellerCoupon> {
  const res = await apiClient.patch<{ coupon: SellerCoupon }>(`/seller/coupons/${id}`, input);
  return unwrap(res, { coupon: {} as SellerCoupon }).coupon;
}

/**
 * PATCH /seller/coupons/:id/status — manager or owner only.
 *
 * A spent campaign is paused rather than deleted, because historical orders
 * still point at it.
 */
export async function updateSellerCouponStatus(
  id: string,
  status: CouponStatus,
): Promise<SellerCoupon> {
  const res = await apiClient.patch<{ coupon: SellerCoupon }>(
    `/seller/coupons/${id}/status`,
    { status },
  );
  return unwrap(res, { coupon: {} as SellerCoupon }).coupon;
}

/** GET /seller/coupons/usage/export — manager or owner only. */
export function exportSellerCouponUsageCsv(params: ListSellerCouponsParams = {}) {
  return downloadCsv("/seller/coupons/usage/export", params, "coupon-usage");
}

// ── Returns / RMA (Phase 33, P1-04) ─────────────────────────────────────────

/** Zeroed count block, used so a response without `counts` still satisfies the type. */
const EMPTY_RETURN_COUNTS: ReturnCounts = {
  requested: 0,
  approved: 0,
  rejected: 0,
  received: 0,
  refunded: 0,
  cancelled: 0,
  awaitingDecision: 0,
  open: 0,
};

/** GET /seller/returns — the store's RMA queue, newest first. */
export async function listSellerReturns(
  params: ListSellerReturnsParams = {},
): Promise<SellerPage<SellerReturn> & { counts: ReturnCounts }> {
  const res = await apiClient.get<SellerPage<SellerReturn> & { counts: ReturnCounts }>(
    "/seller/returns",
    { params },
  );
  const page = unwrap(res, { items: [], total: 0, page: 1, limit: 0, counts: EMPTY_RETURN_COUNTS });
  // `unwrap` hands back `res.data` untouched, so a response that omits `counts`
  // would leave the dashboard reading `.counts.open` off undefined. The return
  // type promises a full block, so supply the missing half here.
  return { ...page, counts: { ...EMPTY_RETURN_COUNTS, ...(page.counts ?? {}) } };
}

/** GET /seller/returns/:id (404 for another store's request) */
export async function getSellerReturn(id: string): Promise<SellerReturn> {
  const res = await apiClient.get<{ return: SellerReturn }>(`/seller/returns/${id}`);
  return unwrap(res, { return: {} as SellerReturn }).return;
}

/**
 * POST /seller/returns — file a return on the buyer's behalf (walk-in or
 * phone). Lands directly in `approved`: the seller is the approver.
 */
export async function createSellerReturn(
  input: CreateReturnInput,
): Promise<SellerReturn> {
  const res = await apiClient.post<{ return: SellerReturn }>("/seller/returns", input);
  return unwrap(res, { return: {} as SellerReturn }).return;
}

/** PATCH /seller/returns/:id/status (approve / reject / receive / cancel) */
export async function updateSellerReturnStatus(
  id: string,
  status: ReturnStatus,
  note?: string,
): Promise<SellerReturn> {
  const res = await apiClient.patch<{ return: SellerReturn }>(
    `/seller/returns/${id}/status`,
    note ? { status, note } : { status },
  );
  return unwrap(res, { return: {} as SellerReturn }).return;
}

/**
 * POST /seller/returns/:id/refund — the only call that moves money, and the
 * only one restricted to the account owner. Requires the goods to be in, and
 * returns the updated RMA plus the order it just returned.
 */
export async function refundSellerReturn(
  id: string,
  input: RefundReturnInput,
): Promise<{ return: SellerReturn; order: SellerOrder }> {
  const res = await apiClient.post<{ return: SellerReturn; order: SellerOrder }>(
    `/seller/returns/${id}/refund`,
    input,
  );
  return unwrap(res, { return: {} as SellerReturn, order: {} as SellerOrder });
}

/**
 * PATCH /seller/orders/bulk-status (P1-06). Each order is driven through the
 * same state machine as the single-row action, so illegal transitions come
 * back per row instead of failing the whole selection.
 */
export async function bulkUpdateSellerOrderStatus(
  ids: string[],
  status: OrderStatus,
  reason?: string,
): Promise<BulkActionResult> {
  const res = await apiClient.patch<BulkActionResult>("/seller/orders/bulk-status", {
    ids,
    status,
    ...(reason ? { reason } : {}),
  });
  return unwrap(res, {} as BulkActionResult);
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

/** PUT /seller/reviews/:id/reply — create or update the store's reply. */
export async function updateSellerReviewReply(
  id: string,
  comment: string,
): Promise<SellerReview> {
  const res = await apiClient.put<{ review: SellerReview }>(
    `/seller/reviews/${id}/reply`,
    { comment },
  );
  return unwrap(res, { review: {} as SellerReview }).review;
}

/** DELETE /seller/reviews/:id/reply — remove the store's reply. */
export async function deleteSellerReviewReply(id: string): Promise<SellerReview> {
  const res = await apiClient.delete<{ review: SellerReview }>(`/seller/reviews/${id}/reply`);
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