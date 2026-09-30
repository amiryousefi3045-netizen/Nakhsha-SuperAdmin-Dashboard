/**
 * Unit tests for the Seller Dashboard API service.
 *
 * apiClient is fully mocked so no network calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    rawGet: vi.fn(),
  },
  TokenManager: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
  API_BASE_URL: "/api",
}));

import {
  getSellerDashboard,
  getSellerProfile,
  updateSellerProfile,
  listSellerProducts,
  createSellerProduct,
  getSellerProduct,
  updateSellerProduct,
  deleteSellerProduct,
  updateSellerProductStatus,
  listSellerInventory,
  exportSellerInventoryCsv,
  adjustSellerStock,
  getSellerStockHistory,
  getSellerAnalytics,
  getSellerSalesReport,
  exportSellerSalesReportCsv,
  getSellerPayoutReport,
  exportSellerPayoutReportCsv,
  getSellerActivity,
  exportSellerActivityCsv,
  listSellerOrders,
  exportSellerOrdersCsv,
  getSellerOrder,
  updateSellerOrderStatus,
  getSellerShipping,
  saveSellerShipping,
  previewSellerShipping,
  recordOrderShippingCost,
  getSellerFulfillment,
  getSellerFinance,
  getSellerPayouts,
  requestSellerPayout,
  cancelSellerPayout,
  getSellerSettings,
  updateSellerSettings,
  getSellerTeam,
  inviteSellerTeamMember,
  changeSellerTeamMemberRole,
  removeSellerTeamMember,
  listSellerReviews,
  updateSellerReviewVisibility,
  updateSellerReviewReply,
  deleteSellerReviewReply,
  subscribeSellerLiveEvents,
  bulkUpdateSellerProductStatus,
  bulkUpdateSellerOrderStatus,
  listSellerReturns,
  getSellerReturn,
  createSellerReturn,
  updateSellerReturnStatus,
  refundSellerReturn,
  listSellerCoupons,
  getSellerCoupon,
  createSellerCoupon,
  updateSellerCoupon,
  updateSellerCouponStatus,
  exportSellerCouponUsageCsv,
} from "../sellerService";
import { apiClient, TokenManager } from "../../lib/apiClient";

const ok = <T>(data: T) => ({ success: true as const, data });

const DASHBOARD = {
  overview: {
    totalProducts: 4,
    activeProducts: 2,
    lowStock: 1,
    outOfStock: 1,
    pendingProducts: 1,
  },
  orders: {
    byStatus: {
      pending: 1,
      confirmed: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      returned: 0,
    },
    total: 1,
    needAction: 1,
    open: 1,
  },
  revenue: { shipped: 0, delivered: 450000, total: 450000 },
  recentProducts: [],
  profile: { id: "sp1", storeName: "فروشگاه نخشا" },
};

const PRODUCT = {
  id: "p1",
  sellerId: "sp1",
  title: "گلیم دستباف",
  price: 2500000,
  currency: "IRR",
  status: "draft",
  stock: { onHand: 20, reserved: 2, incoming: 0, available: 18 },
  stockPolicy: "tracked",
  lowStockThreshold: 3,
  images: [],
  tags: [],
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

const ORDER = {
  id: "o1",
  sellerId: "sp1",
  orderNumber: 1042,
  customer: { name: "مریم احمدی", phone: "09121111111" },
  items: [
    { productId: "p1", title: "گلیم دستباف", sku: "SKU-1", image: "", price: 2500000, currency: "IRR", qty: 2 },
  ],
  subtotal: 5000000,
  shippingFee: 120000,
  discount: 0,
  total: 5120000,
  currency: "IRR",
  status: "pending",
  itemCount: 2,
  timeline: [{ status: "pending", at: "2026-09-15T00:00:00.000Z", by: null, reason: "" }],
  carrierInfo: {},
  payment: { status: "unpaid" },
  customerNote: "",
  sellerNote: "",
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

const FINANCE = {
  currency: "IRR",
  gross: { delivered: 4500000, held: 1000000, awaiting: 3500000 },
  commission: { percent: 5, amount: 225000 },
  net: { earned: 4275000, available: 3000000 },
  outlaid: { requested: 775000, processing: 0, paid: 500000, total: 1275000 },
  cancelledPayouts: 1,
  hold: { days: 7, amount: 1000000 },
  asOf: "2026-09-22T00:00:00.000Z",
};

const PAYOUT = {
  id: "po1",
  sellerId: "sp1",
  amount: 3000000,
  currency: "IRR",
  status: "requested",
  method: "bank_transfer",
  note: "تسویهٔ شهریور",
  timeline: [{ status: "requested", at: "2026-09-22T00:00:00.000Z", by: "u1" }],
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

const SETTINGS = {
  storefrontPublished: true,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "card" as const,
};

const TEAM = {
  items: [
    {
      id: "tm1",
      userId: "u2",
      role: "manager" as const,
      note: "مدیر فروش",
      name: "سعید رضایی",
      phone: "09123334444",
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    },
  ],
  total: 1,
  owner: { userId: "u1", name: "نگار احمدی", phone: "09121111111" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seller dashboard & profile", () => {
  it("getSellerDashboard GETs /seller/dashboard", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok(DASHBOARD));
    await expect(getSellerDashboard()).resolves.toEqual(DASHBOARD);
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/dashboard");
  });

  it("getSellerProfile unwraps the profile", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok({ profile: DASHBOARD.profile }));
    const profile = await getSellerProfile();
    expect(profile.storeName).toBe("فروشگاه نخشا");
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/profile");
  });

  it("updateSellerProfile PATCHes the profile endpoint", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ profile: { ...DASHBOARD.profile, storeName: "نام جدید" } }),
    );
    const profile = await updateSellerProfile({ storeName: "نام جدید" });
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/profile", {
      storeName: "نام جدید",
    });
    expect(profile.storeName).toBe("نام جدید");
  });
});

describe("seller products", () => {
  it("listSellerProducts forwards filters and pagination", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [PRODUCT], total: 1, page: 1, limit: 25 }),
    );
    const page = await listSellerProducts({ page: 2, status: "active", q: "گلیم" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/products", {
      params: { page: 2, status: "active", q: "گلیم" },
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe("p1");
  });

  it("createSellerProduct POSTs to /seller/products and unwraps product", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(ok({ product: PRODUCT }));
    const product = await createSellerProduct({
      title: "گلیم دستباف",
      price: 2500000,
      stock: { onHand: 20, reserved: 2 },
    });
    expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith("/seller/products", {
      title: "گلیم دستباف",
      price: 2500000,
      stock: { onHand: 20, reserved: 2 },
    });
    expect(product.stock.available).toBe(18);
  });

  it("getSellerProduct GETs the single product", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok({ product: PRODUCT }));
    const product = await getSellerProduct("p1");
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/products/p1");
    expect(product.title).toBe("گلیم دستباف");
  });

  it("updateSellerProduct PATCHes the product", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ product: { ...PRODUCT, price: 3000000 } }),
    );
    const product = await updateSellerProduct("p1", { price: 3000000 });
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/products/p1", {
      price: 3000000,
    });
    expect(product.price).toBe(3000000);
  });

  it("updateSellerProductStatus PATCHes the status endpoint", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ product: { ...PRODUCT, status: "active" } }),
    );
    const product = await updateSellerProductStatus("p1", "active");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/products/p1/status", {
      status: "active",
    });
    expect(product.status).toBe("active");
  });

  it("deleteSellerProduct calls DELETE (soft delete)", async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(ok({ message: "محصول بایگانی شد", id: "p1" }));
    const result = await deleteSellerProduct("p1");
    expect(vi.mocked(apiClient.delete)).toHaveBeenCalledWith("/seller/products/p1");
    expect(result.id).toBe("p1");
  });
});

describe("seller inventory", () => {
  it("listSellerInventory forwards the low-stock filter", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok({ items: [], total: 0, page: 1, limit: 25 }));
    await listSellerInventory({ status: "low" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/inventory", {
      params: { status: "low" },
    });
  });

  it("adjustSellerStock PATCHes inventory with delta + reason", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ product: { ...PRODUCT, stock: { ...PRODUCT.stock, onHand: 25, available: 23 } } }),
    );
    const product = await adjustSellerStock("p1", { delta: 5, reason: "شرج دوباره" });
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/inventory/p1", {
      delta: 5,
      reason: "شرج دوباره",
    });
    expect(product.stock.onHand).toBe(25);
  });

  it("getSellerStockHistory GETs the adjustment trail", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({
        product: { id: "p1", title: "گلیم", sku: "SKU-1" },
        items: [{ id: "h1", delta: 5, type: "receipt", createdAt: "2026-09-15T00:00:00.000Z" }],
        total: 1,
        page: 1,
        limit: 25,
      }),
    );
    const history = await getSellerStockHistory("p1");
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/inventory/p1/history", {
      params: {},
    });
    expect(history.items[0].delta).toBe(5);
  });
});

describe("seller analytics", () => {
  it("getSellerAnalytics GETs /seller/analytics with period params", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({
        inventory: { totalOnHand: 40, totalReserved: 4, available: 36, products: 4 },
        byStatus: { draft: 2, active: 2 },
        sales: {
          period: { from: "2026-08-26T00:00:00Z", to: "2026-09-25T23:59:59Z" },
          days: 31,
          current: {
            orders: 4,
            units: 9,
            subtotal: 1050000,
            shippingFee: 0,
            discount: 0,
            total: 1050000,
            avgOrderValue: 262500,
            byStatus: [{ status: "delivered", count: 2, total: 600000 }],
          },
          previous: { orders: 2, units: 5, total: 500000 },
          daily: [{ day: "2026-08-26", orders: 0, total: 0 }],
          currency: "IRR",
        },
      }),
    );
    const analytics = await getSellerAnalytics({ from: "2026-08-26", to: "2026-09-25" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/analytics", {
      params: { from: "2026-08-26", to: "2026-09-25" },
    });
    expect(analytics.inventory.available).toBe(36);
    expect(analytics.sales.current.total).toBe(1050000);
    expect(analytics.sales.previous.orders).toBe(2);
    expect(analytics.sales.daily[0].day).toBe("2026-08-26");
  });

  it("getSellerSalesReport GETs /seller/reports/sales with period params", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({
        period: { from: "2026-08-26T00:00:00Z", to: "2026-09-25T23:59:59Z" },
        summary: { orders: 4, units: 14, subtotal: 1050000, shippingFee: 0, discount: 0, total: 1050000 },
        byStatus: [{ status: "delivered", count: 2, total: 600000 }],
        topProducts: [{ productId: "p1", title: "سفال", orders: 1, units: 5, revenue: 300000 }],
        daily: [{ day: "2026-08-26", orders: 0, total: 0 }],
        currency: "IRR",
      }),
    );
    const report = await getSellerSalesReport({ from: "2026-08-26", to: "2026-09-25" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/reports/sales", {
      params: { from: "2026-08-26", to: "2026-09-25" },
    });
    expect(report.summary.orders).toBe(4);
    expect(report.topProducts[0].revenue).toBe(300000);
  });

  it("exportSellerSalesReportCsv downloads a blob and picks the filename", async () => {
    vi.mocked(apiClient.rawGet).mockResolvedValueOnce({
      data: new Blob(["\uFEFForderNumber,total\r\n"], { type: "text/csv" }),
      status: 200,
      statusText: "OK",
      headers: { "content-disposition": 'attachment; filename="sales-report-2026-09-25.csv"' },
      config: {},
    } as never);
    const file = await exportSellerSalesReportCsv({ from: "2026-08-26", to: "2026-09-25" });
    expect(vi.mocked(apiClient.rawGet)).toHaveBeenCalledWith("/seller/reports/sales/export", {
      params: { from: "2026-08-26", to: "2026-09-25" },
      responseType: "blob",
    });
    expect(file.blob.type).toBe("text/csv");
    expect(file.filename).toBe("sales-report-2026-09-25.csv");
  });
});

describe("settlement report (Phase 28)", () => {
  it("getSellerPayoutReport GETs /seller/reports/payouts with period params", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({
        period: { from: "2026-08-26T00:00:00Z", to: "2026-09-25T23:59:59Z" },
        summary: {
          total: { count: 5, amount: 1150000 },
          requested: { count: 1, amount: 300000 },
          processing: { count: 1, amount: 100000 },
          paid: { count: 1, amount: 500000 },
          cancelled: { count: 1, amount: 200000 },
          rejected: { count: 1, amount: 50000 },
        },
        byMethod: [
          { method: "bank_transfer", count: 2, amount: 500000 },
          { method: "card", count: 1, amount: 500000 },
        ],
        daily: [{ day: "2026-08-26", count: 0, amount: 0 }],
        currency: "IRR",
      }),
    );
    const report = await getSellerPayoutReport({ from: "2026-08-26", to: "2026-09-25" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/reports/payouts", {
      params: { from: "2026-08-26", to: "2026-09-25" },
    });
    expect(report.summary.total.count).toBe(5);
    expect(report.byMethod[0].amount).toBe(500000);
  });

  it("exportSellerPayoutReportCsv downloads a blob and picks the filename", async () => {
    vi.mocked(apiClient.rawGet).mockResolvedValueOnce({
      data: new Blob(["\uFEFFid,status,amount\r\n"], { type: "text/csv" }),
      status: 200,
      statusText: "OK",
      headers: { "content-disposition": 'attachment; filename="payout-report-2026-09-25.csv"' },
      config: {},
    } as never);
    const file = await exportSellerPayoutReportCsv({ from: "2026-08-26", to: "2026-09-25" });
    expect(vi.mocked(apiClient.rawGet)).toHaveBeenCalledWith("/seller/reports/payouts/export", {
      params: { from: "2026-08-26", to: "2026-09-25" },
      responseType: "blob",
    });
    expect(file.blob.type).toBe("text/csv");
    expect(file.filename).toBe("payout-report-2026-09-25.csv");
  });
});

describe("seller activity feed", () => {
  it("getSellerActivity GETs /seller/activity with pagination", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({
        items: [
          {
            id: "a1",
            action: "STOCK_ADJUSTED",
            riskLevel: "HIGH",
            result: "SUCCESS",
            resource: { type: "SELLER_PROFILE", id: "p1" },
            after: { delta: -3 },
            metadata: {},
            endpoint: "/api/seller/inventory/p1/adjust",
            createdAt: "2026-09-25T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      }),
    );
    const page = await getSellerActivity({ page: 1, limit: 20 });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/activity", {
      params: { page: 1, limit: 20 },
    });
    expect(page.total).toBe(1);
    expect(page.items[0].action).toBe("STOCK_ADJUSTED");
    expect(page.items[0].after).toEqual({ delta: -3 });
  });
});

describe("seller orders & fulfillment (real domains)", () => {
  it("listSellerOrders forwards filters and pagination", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [ORDER], total: 1, page: 1, limit: 25 }),
    );
    const page = await listSellerOrders({ page: 2, status: "pending", q: "مریم" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/orders", {
      params: { page: 2, status: "pending", q: "مریم" },
    });
    expect(page.items[0].orderNumber).toBe(1042);
    expect(page.total).toBe(1);
  });

  it("listSellerOrders forwards advanced filters (date/payment/amount)", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [ORDER], total: 1, page: 1, limit: 25 }),
    );
    await listSellerOrders({
      page: 1,
      from: "2026-09-01",
      to: "2026-09-25",
      payment: "paid",
      minTotal: 1000000,
      maxTotal: 6000000,
    });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/orders", {
      params: {
        page: 1,
        from: "2026-09-01",
        to: "2026-09-25",
        payment: "paid",
        minTotal: 1000000,
        maxTotal: 6000000,
      },
    });
  });

  it("getSellerOrder unwraps the order detail", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok({ order: ORDER }));
    const order = await getSellerOrder("o1");
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/orders/o1");
    expect(order.customer.name).toBe("مریم احمدی");
    expect(order.total).toBe(5120000);
  });

  it("updateSellerOrderStatus PATCHes the status endpoint with the reason", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ order: { ...ORDER, status: "confirmed" } }),
    );
    const order = await updateSellerOrderStatus("o1", "confirmed", "تأیید شد");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/orders/o1/status", {
      status: "confirmed",
      reason: "تأیید شد",
    });
    expect(order.status).toBe("confirmed");
  });

  it("updateSellerOrderStatus omits the reason when absent", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(ok({ order: ORDER }));
    await updateSellerOrderStatus("o1", "cancelled");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/orders/o1/status", {
      status: "cancelled",
    });
  });

  it("getSellerFulfillment unwraps counts and recent orders", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({
        counts: { pending: 2, confirmed: 1, processing: 0, shipped: 1, delivered: 4, cancelled: 0, returned: 1 },
        needAction: 3,
        needingShipment: 1,
        recent: [ORDER],
      }),
    );
    const summary = await getSellerFulfillment();
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/fulfillment");
    expect(summary.needAction).toBe(3);
    expect(summary.counts.delivered).toBe(4);
    expect(summary.recent).toHaveLength(1);
  });
});

describe("seller finance & payouts (live backend)", () => {
  it("getSellerFinance unwraps the live settlement summary", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok({ finance: FINANCE }));
    const summary = await getSellerFinance();
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/finance");
    expect(summary.net.available).toBe(3000000);
    expect(summary.commission.percent).toBe(5);
    expect(summary.gross.delivered).toBe(4500000);
  });

  it("getSellerFinance throws the normalized ApiError on failure", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      success: false as const,
      error: { code: "UNAUTHORIZED", message: "لطفاً وارد شوید", status: 401 },
    });
    await expect(getSellerFinance()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("getSellerPayouts passes filter params and unwraps the page", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [PAYOUT], total: 1, page: 2, limit: 10 }),
    );
    const pageRes = await getSellerPayouts({ page: 2, limit: 10, status: "requested" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/payouts", {
      params: { page: 2, limit: 10, status: "requested" },
    });
    expect(pageRes.total).toBe(1);
    expect(pageRes.items[0].id).toBe("po1");
    expect(pageRes.items[0].status).toBe("requested");
  });

  it("getSellerPayouts works without params", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [], total: 0, page: 1, limit: 20 }),
    );
    const pageRes = await getSellerPayouts();
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/payouts", { params: {} });
    expect(pageRes.items).toEqual([]);
  });

  it("requestSellerPayout POSTs the payload and unwraps the payout", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(ok({ payout: PAYOUT }));
    const payout = await requestSellerPayout({
      amount: 3000000,
      method: "bank_transfer",
      note: "تسویهٔ شهریور",
    });
    expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith("/seller/payouts", {
      amount: 3000000,
      method: "bank_transfer",
      note: "تسویهٔ شهریور",
    });
    expect(payout.id).toBe("po1");
    expect(payout.status).toBe("requested");
  });

  it("requestSellerPayout omits absent method/note", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(ok({ payout: PAYOUT }));
    await requestSellerPayout({ amount: 100000 });
    expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith("/seller/payouts", { amount: 100000 });
  });

  it("requestSellerPayout surfaces backend domain errors", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      success: false as const,
      error: { code: "INSUFFICIENT_PAYOUT_BALANCE", message: "موجودی قابل تسویه کافی نیست", status: 400 },
    });
    await expect(requestSellerPayout({ amount: 999999999 })).rejects.toMatchObject({
      code: "INSUFFICIENT_PAYOUT_BALANCE",
    });
  });

  it("cancelSellerPayout PATCHes the cancel endpoint", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ payout: { ...PAYOUT, status: "cancelled" } }),
    );
    const payout = await cancelSellerPayout("po1", "انصراف");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/payouts/po1/cancel", {
      note: "انصراف",
    });
    expect(payout.status).toBe("cancelled");
  });

  it("cancelSellerPayout sends an empty body without a note", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ payout: { ...PAYOUT, status: "cancelled" } }),
    );
    await cancelSellerPayout("po1");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/payouts/po1/cancel", {});
  });
});

describe("seller settings & team (live backend)", () => {
  it("getSellerSettings GETs /seller/settings and unwraps preferences", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok({ settings: SETTINGS }));
    const settings = await getSellerSettings();
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/settings");
    expect(settings.defaultPayoutMethod).toBe("card");
    expect(settings.notificationSms).toBe(false);
  });

  it("updateSellerSettings PATCHes the partial payload", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ settings: { ...SETTINGS, storefrontPublished: true } }),
    );
    const settings = await updateSellerSettings({ defaultPayoutMethod: "wallet" });
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/settings", {
      defaultPayoutMethod: "wallet",
    });
    expect(settings.storefrontPublished).toBe(true);
  });

  it("getSellerTeam GETs /seller/team with items/owner", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok(TEAM));
    const team = await getSellerTeam();
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/team");
    expect(team.total).toBe(1);
    expect(team.items[0].role).toBe("manager");
    expect(team.owner?.name).toBe("نگار احمدی");
  });

  it("inviteSellerTeamMember POSTs phone/role/note", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(ok({ member: TEAM.items[0] }));
    const member = await inviteSellerTeamMember({
      phone: "09123334444",
      role: "manager",
      note: "مدیر فروش",
    });
    expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith("/seller/team", {
      phone: "09123334444",
      role: "manager",
      note: "مدیر فروش",
    });
    expect(member.id).toBe("tm1");
  });

  it("inviteSellerTeamMember omits the note when absent", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(ok({ member: TEAM.items[0] }));
    await inviteSellerTeamMember({ phone: "09123334444", role: "staff" });
    expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith("/seller/team", {
      phone: "09123334444",
      role: "staff",
    });
  });

  it("changeSellerTeamMemberRole PATCHes the role endpoint", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ member: { ...TEAM.items[0], role: "staff" } }),
    );
    const member = await changeSellerTeamMemberRole("tm1", "staff");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/team/tm1/role", {
      role: "staff",
    });
    expect(member.role).toBe("staff");
  });

  it("removeSellerTeamMember DELETEs the member and returns the id", async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(ok({ id: "tm1", message: "عضو تیم حذف شد" }));
    const result = await removeSellerTeamMember("tm1");
    expect(vi.mocked(apiClient.delete)).toHaveBeenCalledWith("/seller/team/tm1");
    expect(result.id).toBe("tm1");
  });
});

describe("seller reviews (live backend)", () => {
  const REVIEW = {
    id: "rv1",
    productId: "p1",
    productTitle: "گلدان مسی",
    rating: 5,
    comment: "کیفیت فوق‌العاده",
    buyerName: "خریدار دیدگاه",
    isAnonymous: false,
    status: "published",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    sellerReply: null,
  };

  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.patch).mockReset();
  });

  it("listSellerReviews GETs /seller/reviews with params and unwraps the page", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [REVIEW], total: 1, page: 2, limit: 10 }),
    );
    const page = await listSellerReviews({ page: 2, limit: 10, status: "published" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/reviews", {
      params: { page: 2, limit: 10, status: "published" },
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].productTitle).toBe("گلدان مسی");
    expect(page.total).toBe(1);
  });

  it("updateSellerReviewVisibility PATCHes the visibility and returns the review", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ review: { ...REVIEW, status: "hidden" } }),
    );
    const review = await updateSellerReviewVisibility("rv1", "hidden");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/seller/reviews/rv1/visibility", {
      status: "hidden",
    });
    expect(review.status).toBe("hidden");
  });

  it("updateSellerReviewReply PUTs the comment and returns the review with the reply", async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce(
      ok({
        review: {
          ...REVIEW,
          sellerReply: { comment: "ممنون از بازخوردتون", createdAt: "2026-09-02T10:00:00Z", updatedAt: "2026-09-02T10:00:00Z" },
        },
      }),
    );
    const review = await updateSellerReviewReply("rv1", "ممنون از بازخوردتون");
    expect(vi.mocked(apiClient.put)).toHaveBeenCalledWith("/seller/reviews/rv1/reply", {
      comment: "ممنون از بازخوردتون",
    });
    expect(review.sellerReply?.comment).toBe("ممنون از بازخوردتون");
  });

  it("deleteSellerReviewReply DELETEs the reply and returns the review", async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(
      ok({ review: { ...REVIEW, sellerReply: null } }),
    );
    const review = await deleteSellerReviewReply("rv1");
    expect(vi.mocked(apiClient.delete)).toHaveBeenCalledWith("/seller/reviews/rv1/reply");
    expect(review.sellerReply).toBeNull();
  });
});

describe("seller CSV row exports (Phase 30, P1-02)", () => {
  it("exportSellerOrdersCsv forwards the current list filters", async () => {
    vi.mocked(apiClient.rawGet).mockResolvedValueOnce({
      data: new Blob(["\uFEFFid,status\r\n"], { type: "text/csv" }),
      status: 200,
      statusText: "OK",
      headers: { "content-disposition": 'attachment; filename="orders-2026-09-25.csv"' },
      config: {},
    } as never);
    const file = await exportSellerOrdersCsv({
      status: "pending",
      q: "مریم",
      payment: "paid",
      minTotal: 100000,
    });
    expect(vi.mocked(apiClient.rawGet)).toHaveBeenCalledWith("/seller/orders/export", {
      params: { status: "pending", q: "مریم", payment: "paid", minTotal: 100000 },
      responseType: "blob",
    });
    expect(file.filename).toBe("orders-2026-09-25.csv");
  });

  it("exportSellerInventoryCsv forwards the stock filters", async () => {
    vi.mocked(apiClient.rawGet).mockResolvedValueOnce({
      data: new Blob(["\uFEFFsku,available\r\n"], { type: "text/csv" }),
      status: 200,
      statusText: "OK",
      headers: { "content-disposition": 'attachment; filename="inventory-2026-09-25.csv"' },
      config: {},
    } as never);
    const file = await exportSellerInventoryCsv({ status: "low", q: "گلدان" });
    expect(vi.mocked(apiClient.rawGet)).toHaveBeenCalledWith("/seller/inventory/export", {
      params: { status: "low", q: "گلدان" },
      responseType: "blob",
    });
    expect(file.blob.type).toBe("text/csv");
    expect(file.filename).toBe("inventory-2026-09-25.csv");
  });

  it("exportSellerActivityCsv hits the activity export with no params", async () => {
    vi.mocked(apiClient.rawGet).mockResolvedValueOnce({
      data: new Blob(["\uFEFFid,action\r\n"], { type: "text/csv" }),
      status: 200,
      statusText: "OK",
      headers: { "content-disposition": 'attachment; filename="store-activity-2026-09-25.csv"' },
      config: {},
    } as never);
    const file = await exportSellerActivityCsv();
    expect(vi.mocked(apiClient.rawGet)).toHaveBeenCalledWith("/seller/activity/export", {
      params: {},
      responseType: "blob",
    });
    expect(file.filename).toBe("store-activity-2026-09-25.csv");
  });

  it("falls back to a dated filename when the header carries no filename", async () => {
    vi.mocked(apiClient.rawGet).mockResolvedValueOnce({
      data: new Blob(["id,status\r\n"], { type: "text/csv" }),
      status: 200,
      statusText: "OK",
      headers: {},
      config: {},
    } as never);
    const file = await exportSellerActivityCsv();
    expect(file.filename).toBe(`store-activity-${new Date().toISOString().slice(0, 10)}.csv`);
  });
});

describe("seller live events (Phase 31, P1-05)", () => {
  const encoder = new TextEncoder();

  function mockStream(chunks: string[]) {
    let index = 0;
    const reader = {
      read: vi.fn().mockImplementation(() => {
        if (index >= chunks.length) return Promise.resolve({ done: true, value: undefined });
        const value = encoder.encode(chunks[index]);
        index += 1;
        return Promise.resolve({ done: false, value });
      }),
    };
    return {
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    } as unknown as Response;
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("parses event frames and forwards them to the handler", async () => {
    vi.mocked(TokenManager.get).mockReturnValue("tok-1");
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockStream([
        'event: initial\ndata: {"at":"2026-09-25T10:00:00Z"}\n\n',
        'event: order\ndata: {"id":"o1","orderNumber":7001,"from":"pending","status":"confirmed","total":300000,"currency":"IRR","at":"2026-09-25T10:00:01Z"}\n\n',
      ]),
    ) as never;

    const events: unknown[] = [];
    const unsubscribe = subscribeSellerLiveEvents({ onEvent: (e) => events.push(e) });
    await flush();
    await flush();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/seller/events/live"),
      expect.objectContaining({
        headers: { Authorization: "Bearer tok-1" },
      }),
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "initial" });
    expect(events[1]).toMatchObject({ type: "order" });
    expect((events[1] as { payload: { orderNumber: number } }).payload.orderNumber).toBe(7001);
    unsubscribe();
  });

  it("reassembles a frame split across two chunks and ignores malformed ones", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockStream([
        'event: payout\ndata: {"id":"p1","from":"requested","status":"paid","amount":250000,',
        '"currency":"IRR","at":"2026-09-25T10:00:02Z"}\n\nevent: bogus\ndata: not-json\n\n',
      ]),
    ) as never;

    const events: Array<{ type: string }> = [];
    subscribeSellerLiveEvents({ onEvent: (e) => events.push(e) });
    await flush();
    await flush();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("payout");
  });

  it("reports a failed stream response through onError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response) as never;

    const errors: Error[] = [];
    subscribeSellerLiveEvents({ onEvent: () => {}, onError: (e) => errors.push(e) });
    await flush();
    await flush();

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("403");
  });
});

describe("seller bulk actions (Phase 32, P1-06)", () => {
  beforeEach(() => {
    vi.mocked(apiClient.patch).mockClear();
  });

  it("bulkUpdateSellerProductStatus PATCHes /seller/products/bulk-status with ids and status", async () => {
    const payload = {
      success: true,
      data: {
        batchId: "b1",
        summary: { total: 2, succeeded: 2, skipped: 0, failed: 0 },
        succeeded: [{ id: "p1" }, { id: "p2" }],
        skipped: [],
        failed: [],
      },
    };
    vi.mocked(apiClient.patch).mockResolvedValue(payload as never);

    const result = await bulkUpdateSellerProductStatus(["p1", "p2"], "paused");

    expect(apiClient.patch).toHaveBeenCalledWith("/seller/products/bulk-status", {
      ids: ["p1", "p2"],
      status: "paused",
    });
    expect(result.summary.succeeded).toBe(2);
    expect(result.failed).toHaveLength(0);
  });

  it("bulkUpdateSellerOrderStatus forwards a reason and keeps partial failures", async () => {
    const payload = {
      success: true,
      data: {
        batchId: "b2",
        summary: { total: 3, succeeded: 1, skipped: 1, failed: 1 },
        succeeded: [{ id: "o1", orderNumber: 1001 }],
        skipped: [{ id: "o2", orderNumber: 1002 }],
        failed: [{ id: "o3", orderNumber: 1003, reason: "INVALID_TRANSITION" }],
      },
    };
    vi.mocked(apiClient.patch).mockResolvedValue(payload as never);

    const result = await bulkUpdateSellerOrderStatus(["o1", "o2", "o3"], "shipped", "personal pickup");

    expect(apiClient.patch).toHaveBeenCalledWith("/seller/orders/bulk-status", {
      ids: ["o1", "o2", "o3"],
      status: "shipped",
      reason: "personal pickup",
    });
    expect(result.summary.failed).toBe(1);
    expect(result.failed[0].reason).toBe("INVALID_TRANSITION");
  });

  it("omits the reason from the orders bulk payload when none is given", async () => {
    const payload = {
      success: true,
      data: {
        batchId: "b3",
        summary: { total: 1, succeeded: 1, skipped: 0, failed: 0 },
        succeeded: [{ id: "o9", orderNumber: 1009 }],
        skipped: [],
        failed: [],
      },
    };
    vi.mocked(apiClient.patch).mockResolvedValue(payload as never);

    await bulkUpdateSellerOrderStatus(["o9"], "confirmed");

    expect(apiClient.patch).toHaveBeenCalledWith("/seller/orders/bulk-status", {
      ids: ["o9"],
      status: "confirmed",
    });
  });
});

describe("seller returns / RMA (Phase 33, P1-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for the RMA queue with the status filter and page", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(ok({ items: [], total: 0, page: 2, limit: 20 }) as never);

    await listSellerReturns({ page: 2, limit: 20, status: "requested" });

    expect(apiClient.get).toHaveBeenCalledWith("/seller/returns", {
      params: { page: 2, limit: 20, status: "requested" },
    });
  });

  it("falls back to a full zeroed count object when the server omits it", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(ok({ items: [], total: 0, page: 1, limit: 20 }) as never);

    const result = await listSellerReturns();

    // A missing `counts` must not make the dashboard crash on `.counts.open`.
    expect(result.counts.awaitingDecision).toBe(0);
    expect(result.counts.open).toBe(0);
  });

  it("unwraps a single RMA from the detail endpoint", async () => {
    const row = { id: "r1", rmaNumber: 7, status: "requested", orderTotal: 100000 };
    vi.mocked(apiClient.get).mockResolvedValue(ok({ return: row }) as never);

    const result = await getSellerReturn("r1");

    expect(apiClient.get).toHaveBeenCalledWith("/seller/returns/r1");
    expect(result.rmaNumber).toBe(7);
  });

  it("files a walk-in return with the order id and reason", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(ok({ return: { id: "r2" } }) as never);

    await createSellerReturn({ orderId: "o1", reason: "?????? ?????" });

    expect(apiClient.post).toHaveBeenCalledWith("/seller/returns", {
      orderId: "o1",
      reason: "?????? ?????",
    });
  });

  it("sends the note when one is given", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(ok({ return: { id: "r3" } }) as never);

    await updateSellerReturnStatus("r3", "rejected", "?????? ????? ???");

    expect(apiClient.patch).toHaveBeenCalledWith("/seller/returns/r3/status", {
      status: "rejected",
      note: "?????? ????? ???",
    });
  });

  it("omits the note entirely when approving without one", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(ok({ return: { id: "r4" } }) as never);

    await updateSellerReturnStatus("r4", "approved");

    expect(apiClient.patch).toHaveBeenCalledWith("/seller/returns/r4/status", {
      status: "approved",
    });
  });

  it("posts the refund amount and returns both the RMA and the order", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(
      ok({ return: { id: "r5", refundAmount: 60000 }, order: { id: "o5", status: "returned" } }) as never,
    );

    const result = await refundSellerReturn("r5", { refundAmount: 60000, note: "??? ?????" });

    expect(apiClient.post).toHaveBeenCalledWith("/seller/returns/r5/refund", {
      refundAmount: 60000,
      note: "??? ?????",
    });
    // The order comes back so the page can show that it is now `returned`
    // instead of guessing at the side effect.
    expect(result.order.status).toBe("returned");
    expect(result.return.refundAmount).toBe(60000);
  });

  it("propagates a domain error instead of swallowing it", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      success: false as const,
      error: {
        code: "INVALID_RETURN_TRANSITION",
        message: "استرداد تنها پس از دریافت کالا ممکن است",
        status: 409,
      },
    });

    await expect(refundSellerReturn("r6", { refundAmount: 100 })).rejects.toMatchObject({
      code: "INVALID_RETURN_TRANSITION",
    });
  });
});

describe("seller coupons / campaigns (Phase 35, P1-07)", () => {
  const COUPON = {
    id: "c1",
    code: "SUMMER10",
    description: "",
    type: "percent" as const,
    value: 10,
    maxDiscount: 0,
    minPurchase: 0,
    maxUses: 100,
    maxUsesPerBuyer: 1,
    usedCount: 3,
    remainingUses: 97,
    startsAt: null,
    expiresAt: null,
    status: "active" as const,
    usage: { redemptions: 3, discountGiven: 30000, lastRedeemedAt: null },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for the campaign list with the status filter and page", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(ok({ items: [], total: 0, page: 2, limit: 20 }) as never);

    await listSellerCoupons({ page: 2, limit: 20, status: "paused" });

    expect(apiClient.get).toHaveBeenCalledWith("/seller/coupons", {
      params: { page: 2, limit: 20, status: "paused" },
    });
  });

  it("falls back to a full zeroed count object when the server omits it", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(ok({ items: [], total: 0, page: 1, limit: 20 }) as never);

    const result = await listSellerCoupons();

    // A missing `counts` must not make the page crash on `.counts.active`.
    expect(result.counts.total).toBe(0);
    expect(result.counts.discountGiven).toBe(0);
  });

  it("keeps the server's own counts and per-row usage when they are present", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      ok({
        items: [COUPON],
        total: 1,
        page: 1,
        limit: 20,
        counts: { total: 4, active: 3, paused: 1, exhausted: 0, discountGiven: 90000 },
      }) as never,
    );

    const result = await listSellerCoupons();

    expect(result.counts.total).toBe(4);
    expect(result.counts.discountGiven).toBe(90000);
    expect(result.items[0].usage.discountGiven).toBe(30000);
  });

  it("unwraps a single campaign from the detail endpoint", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(ok({ coupon: COUPON }) as never);

    const result = await getSellerCoupon("c1");

    expect(apiClient.get).toHaveBeenCalledWith("/seller/coupons/c1");
    expect(result.code).toBe("SUMMER10");
  });

  it("creates a campaign with the limits the seller typed", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(ok({ coupon: COUPON }) as never);

    await createSellerCoupon({
      code: "SUMMER10",
      type: "percent",
      value: 10,
      maxUses: 100,
      maxUsesPerBuyer: 1,
    });

    expect(apiClient.post).toHaveBeenCalledWith("/seller/coupons", {
      code: "SUMMER10",
      type: "percent",
      value: 10,
      maxUses: 100,
      maxUsesPerBuyer: 1,
    });
  });

  it("sends only the fields an update actually changes", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(ok({ coupon: COUPON }) as never);

    await updateSellerCoupon("c1", { value: 20 });

    // A partial update must not blank the limits the seller did not touch.
    expect(apiClient.patch).toHaveBeenCalledWith("/seller/coupons/c1", { value: 20 });
  });

  it("pauses a campaign through the status endpoint", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(ok({ coupon: COUPON }) as never);

    const result = await updateSellerCouponStatus("c1", "paused");

    expect(apiClient.patch).toHaveBeenCalledWith("/seller/coupons/c1/status", {
      status: "paused",
    });
    expect(result.id).toBe("c1");
  });

  it("downloads the usage export with the server's filename", async () => {
    vi.mocked(apiClient.rawGet).mockResolvedValue({
      data: new Blob(["code,discount"]),
      headers: { "content-disposition": 'attachment; filename="coupon-usage.csv"' },
    } as never);

    const result = await exportSellerCouponUsageCsv({ status: "active" });

    expect(apiClient.rawGet).toHaveBeenCalledWith("/seller/coupons/usage/export", {
      params: { status: "active" },
      responseType: "blob",
    });
    expect(result.filename).toBe("coupon-usage.csv");
  });

  it("propagates a coupon domain error instead of swallowing it", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      success: false as const,
      error: { code: "COUPON_CODE_TAKEN", message: "این کد قبلاً ثبت شده است", status: 400 },
    });

    await expect(
      createSellerCoupon({ code: "SUMMER10", type: "percent", value: 10 }),
    ).rejects.toMatchObject({ code: "COUPON_CODE_TAKEN" });
  });
});

describe("sellerService — delivery (Phase 36)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the rate card", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      ok({
        configured: true,
        isEnabled: true,
        freeShippingThreshold: 0,
        methods: [],
      }) as never,
    );

    const profile = await getSellerShipping();

    expect(apiClient.get).toHaveBeenCalledWith("/seller/shipping");
    expect(profile.configured).toBe(true);
  });

  it("treats a store with no rate card as a normal state", async () => {
    // Not an error: the store stays open on free shipping, so the editor renders
    // an empty card rather than a failure.
    vi.mocked(apiClient.get).mockResolvedValue(
      ok({
        configured: false,
        isEnabled: false,
        freeShippingThreshold: 0,
        methods: [],
      }) as never,
    );

    const profile = await getSellerShipping();

    expect(profile.configured).toBe(false);
    expect(profile.methods).toEqual([]);
  });

  it("replaces the whole rate card rather than patching it", async () => {
    vi.mocked(apiClient.put).mockResolvedValue(
      ok({ configured: true, isEnabled: true, freeShippingThreshold: 0, methods: [] }) as never,
    );

    await saveSellerShipping({ isEnabled: true, freeShippingThreshold: 0, methods: [] });

    expect(apiClient.put).toHaveBeenCalledWith("/seller/shipping", {
      isEnabled: true,
      freeShippingThreshold: 0,
      methods: [],
    });
  });

  it("previews with basket totals, not a product list", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(
      ok({ configured: true, methods: [], unavailable: [], warning: "" }) as never,
    );

    await previewSellerShipping({
      subtotal: 500000,
      totalWeightKg: 2.5,
      totalQty: 3,
      shippingAddress: { province: "تهران" },
    });

    expect(apiClient.post).toHaveBeenCalledWith("/seller/shipping/preview", {
      subtotal: 500000,
      totalWeightKg: 2.5,
      totalQty: 3,
      shippingAddress: { province: "تهران" },
    });
  });

  it("records the courier invoice as a bare number", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(ok({ order: { id: "o1" } }) as never);

    await recordOrderShippingCost("o1", 38000);

    expect(apiClient.patch).toHaveBeenCalledWith("/seller/orders/o1/shipping-cost", {
      cost: 38000,
    });
  });

  it("lets a locked cost surface its 409 rather than looking like a network failure", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      success: false as const,
      error: {
        code: "SHIPPING_COST_LOCKED",
        message: "پس از تحویل قابل تغییر نیست",
        status: 409,
      },
    });

    await expect(recordOrderShippingCost("o1", 38000)).rejects.toMatchObject({
      code: "SHIPPING_COST_LOCKED",
    });
  });
});
