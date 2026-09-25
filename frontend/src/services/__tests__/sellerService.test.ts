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
  adjustSellerStock,
  getSellerStockHistory,
  getSellerAnalytics,
  getSellerSalesReport,
  listSellerOrders,
  getSellerOrder,
  updateSellerOrderStatus,
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
} from "../sellerService";
import { apiClient } from "../../lib/apiClient";

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
  it("getSellerAnalytics GETs /seller/analytics", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({
        inventory: { totalOnHand: 40, totalReserved: 4, available: 36, products: 4 },
        byStatus: { draft: 2, active: 2 },
        note: "",
      }),
    );
    const analytics = await getSellerAnalytics();
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/seller/analytics");
    expect(analytics.inventory.available).toBe(36);
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