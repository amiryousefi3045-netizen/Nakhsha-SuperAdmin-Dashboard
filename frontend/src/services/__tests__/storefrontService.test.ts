/**
 * Unit tests for the public storefront service.
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
  getStorefront,
  getStorefrontProducts,
  getStorefrontProduct,
  checkoutStorefront,
  submitStorefrontPayment,
  getStorefrontOrder,
  listStorefrontOrders,
  getStorefrontProductReviews,
  submitStorefrontReview,
  getMyStorefrontReview,
  listStorefronts,
  getStorefrontOrderDetail,
  createBuyerReturn,
  listBuyerReturns,
  validateStorefrontCoupon,
  quoteStorefrontShipping,
  getShippingProvinces,
} from "../storefrontService";
import { apiClient } from "../../lib/apiClient";
import type { ApiError } from "../../types/apiClient";

const ok = <T>(data: T) => ({ success: true as const, data });

const PROFILE = {
  success: true,
  reqId: "r1",
  storefront: {
    id: "p1",
    storeName: "فروشگاه نخشا",
    slug: "nakhsha-vitrin",
    description: "گالری دست‌سازه‌های ایرانی",
    contact: { phone: "09147000040", instagram: "nakhsha" },
    location: { city: "تهران", neighborhood: "باغ‌فرمان" },
    stats: { totalProducts: 2, averageRating: 0, ratingCount: 0 },
  },
};

const PAGE = {
  success: true,
  reqId: "r2",
  items: [
    {
      id: "c1",
      title: "گلدان سفالی",
      description: "",
      images: [],
      category: "pottery",
      price: 500000,
      currency: "IRR",
      tags: ["سفال"],
      availableStock: 10,
      isLowStock: false,
      isOutOfStock: false,
    },
  ],
  total: 1,
  page: 1,
  limit: 9,
};

const PRODUCT = {
  success: true,
  reqId: "r3",
  product: {
    id: "c1",
    title: "گلدان سفالی",
    description: "دست‌ساخته در تهران",
    images: [],
    category: "pottery",
    price: 500000,
    currency: "IRR",
    tags: ["سفال"],
    availableStock: 10,
    isLowStock: false,
    isOutOfStock: false,
  },
};

const BUYER_ORDER = {
  id: "ord1",
  sellerId: "p1",
  origin: "storefront",
  buyerUserId: "u1",
  orderNumber: 7,
  customer: { name: "خریدار محمدی", phone: "09123456789" },
  items: [
    {
      productId: "c1",
      title: "گلدان سفالی",
      sku: "",
      image: "",
      price: 500000,
      currency: "IRR",
      qty: 2,
    },
  ],
  subtotal: 1000000,
  shippingFee: 0,
  discount: 0,
  total: 1000000,
  currency: "IRR",
  status: "pending",
  itemCount: 2,
  timeline: [
    { status: "pending", at: "2026-01-01T00:00:00.000Z", by: null, reason: "" },
  ],
  carrierInfo: {},
  payment: { method: "card", status: "unpaid", provider: "mock", refId: "ord1" },
  customerNote: "",
  sellerNote: "",
};

const CHECKOUT = {
  success: true,
  reqId: "r4",
  order: BUYER_ORDER,
  paymentIntent: {
    provider: "mock",
    refId: "ord1",
    amount: 1000000,
    currency: "IRR",
    status: "unpaid",
  },
};

describe("storefrontService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStorefront", () => {
    it("fetches the public storefront profile for a slug", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(PROFILE));
      const result = await getStorefront("nakhsha-vitrin");
      expect(result.storeName).toBe("فروشگاه نخشا");
      expect(apiClient.get).toHaveBeenCalledWith("/storefront/nakhsha-vitrin");
    });

    it("URL-encodes Persian slugs", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(PROFILE));
      await getStorefront("فروشگاه-فردوسی");
      expect(apiClient.get).toHaveBeenCalledWith(
        `/storefront/${encodeURIComponent("فروشگاه-فردوسی")}`,
      );
    });

    it("throws the normalized error on failure (404 hides unpublished stores)", async () => {
      const err: ApiError = { code: "NOT_FOUND", message: "ویترین پیدا نشد" };
      vi.mocked(apiClient.get).mockResolvedValue({ success: false, error: err });
      await expect(getStorefront("secret-vitrin")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("getStorefrontProducts", () => {
    it("fetches the catalog page with params", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(PAGE));
      const result = await getStorefrontProducts("nakhsha-vitrin", {
        page: 2,
        limit: 9,
        category: "pottery",
        sort: "priceAsc",
      });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(apiClient.get).toHaveBeenCalledWith("/storefront/nakhsha-vitrin/products", {
        params: { page: 2, limit: 9, category: "pottery", sort: "priceAsc" },
      });
    });

    it("throws when the success envelope is missing", async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: undefined });
      await expect(getStorefrontProducts("nakhsha-vitrin")).rejects.toThrow();
    });

    it("throws on error", async () => {
      const err: ApiError = { code: "VALIDATION_ERROR", message: "دسته‌بندی نامعتبر" };
      vi.mocked(apiClient.get).mockResolvedValue({ success: false, error: err });
      await expect(
        getStorefrontProducts("nakhsha-vitrin", { category: "bogus" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });
  });

  describe("getStorefrontProduct", () => {
    it("fetches a single public product", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(PRODUCT));
      const result = await getStorefrontProduct("nakhsha-vitrin", "c1");
      expect(result.title).toBe("گلدان سفالی");
      expect(result.availableStock).toBe(10);
      expect(apiClient.get).toHaveBeenCalledWith("/storefront/nakhsha-vitrin/products/c1");
    });

    it("throws when the product does not belong to the store", async () => {
      const err: ApiError = { code: "NOT_FOUND", message: "محصول پیدا نشد" };
      vi.mocked(apiClient.get).mockResolvedValue({ success: false, error: err });
      await expect(getStorefrontProduct("nakhsha-vitrin", "other")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("throws when the response has no product field", async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: undefined });
      await expect(getStorefrontProduct("nakhsha-vitrin", "c1")).rejects.toThrow();
    });
  });

  describe("checkoutStorefront", () => {
    it("posts the checkout payload and returns order + payment intent", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(ok(CHECKOUT));
      const input = {
        customer: { name: "خریدار محمدی", phone: "09123456789" },
        items: [{ productId: "c1", qty: 2 }],
        paymentMethod: "card" as const,
      };
      const result = await checkoutStorefront("nakhsha-vitrin", input);
      expect(result.order.orderNumber).toBe(7);
      expect(result.paymentIntent.refId).toBe("ord1");
      expect(apiClient.post).toHaveBeenCalledWith(
        "/storefront/nakhsha-vitrin/checkout",
        input,
      );
    });

    it("throws when stock cannot be reserved", async () => {
      const err: ApiError = { code: "INSUFFICIENT_STOCK", message: "موجودی کافی نیست" };
      vi.mocked(apiClient.post).mockResolvedValue({ success: false, error: err });
      await expect(
        checkoutStorefront("nakhsha-vitrin", {
          customer: { name: "خریدار محمدی", phone: "09123456789" },
          items: [{ productId: "c1", qty: 60 }],
        }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    });

    it("passes the campaign code through as a lookup key only", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(ok(CHECKOUT));
      await checkoutStorefront("nakhsha-vitrin", {
        customer: { name: "خریدار محمدی", phone: "09123456789" },
        items: [{ productId: "c1", qty: 2 }],
        paymentMethod: "card" as const,
        couponCode: "SUMMER10",
      });
      // The client sends the code and NOTHING about the money: no subtotal, no
      // discount. The server re-prices the cart and decides the amount.
      expect(apiClient.post).toHaveBeenCalledWith(
        "/storefront/nakhsha-vitrin/checkout",
        expect.objectContaining({ couponCode: "SUMMER10" }),
      );
      const [, sent] = vi.mocked(apiClient.post).mock.calls[0];
      expect(sent).not.toHaveProperty("subtotal");
      expect(sent).not.toHaveProperty("discount");
      expect(sent).not.toHaveProperty("total");
    });

    it("omits couponCode entirely when no code was applied", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(ok(CHECKOUT));
      const input = {
        customer: { name: "خریدار محمدی", phone: "09123456789" },
        items: [{ productId: "c1", qty: 1 }],
      };
      await checkoutStorefront("nakhsha-vitrin", input);
      expect(apiClient.post).toHaveBeenCalledWith("/storefront/nakhsha-vitrin/checkout", input);
    });

    it("surfaces a coupon refusal so the page can say the code is not usable", async () => {
      const err: ApiError = { code: "COUPON_EXHAUSTED", message: "ظرفیت این کد تکمیل شده است" };
      vi.mocked(apiClient.post).mockResolvedValue({ success: false, error: err });
      await expect(
        checkoutStorefront("nakhsha-vitrin", {
          customer: { name: "خریدار محمدی", phone: "09123456789" },
          items: [{ productId: "c1", qty: 1 }],
          couponCode: "SUMMER10",
        }),
      ).rejects.toMatchObject({ code: "COUPON_EXHAUSTED" });
    });
  });

  describe("validateStorefrontCoupon", () => {
    const PREVIEW = {
      code: "SUMMER10",
      type: "percent" as const,
      value: 10,
      description: "",
      subtotal: 1000000,
      discount: 100000,
      total: 900000,
    };

    it("previews a code against the cart without spending it", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(ok(PREVIEW));

      const result = await validateStorefrontCoupon("nakhsha-vitrin", "SUMMER10", [
        { productId: "c1", qty: 2 },
      ]);

      // The amounts come from the server, not from arithmetic in the browser.
      expect(result.discount).toBe(100000);
      expect(result.total).toBe(900000);
      expect(apiClient.post).toHaveBeenCalledWith(
        "/storefront/nakhsha-vitrin/coupons/validate",
        { code: "SUMMER10", items: [{ productId: "c1", qty: 2 }] },
      );
    });

    it("sends no subtotal, so a forged cart total cannot buy a discount", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(ok(PREVIEW));
      await validateStorefrontCoupon("nakhsha-vitrin", "SUMMER10", [{ productId: "c1", qty: 2 }]);
      const [, sent] = vi.mocked(apiClient.post).mock.calls[0];
      expect(sent).not.toHaveProperty("subtotal");
    });

    it("URL-encodes Persian slugs", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(ok(PREVIEW));
      await validateStorefrontCoupon("فروشگاه من", "X", []);
      expect(apiClient.post).toHaveBeenCalledWith(
        `/storefront/${encodeURIComponent("فروشگاه من")}/coupons/validate`,
        { code: "X", items: [] },
      );
    });

    it("throws the server's own refusal for a bad code", async () => {
      const err: ApiError = { code: "COUPON_MIN_PURCHASE", message: "مبلغ خرید کافی نیست" };
      vi.mocked(apiClient.post).mockResolvedValue({ success: false, error: err });
      await expect(
        validateStorefrontCoupon("nakhsha-vitrin", "SUMMER10", [{ productId: "c1", qty: 1 }]),
      ).rejects.toMatchObject({ code: "COUPON_MIN_PURCHASE" });
    });
  });

  describe("submitStorefrontPayment", () => {
    it("applies SUCCESS and returns the paid order", async () => {
      const paid = {
        ...BUYER_ORDER,
        payment: { method: "card", status: "paid", provider: "mock", refId: "ord1" },
      };
      vi.mocked(apiClient.post).mockResolvedValue(ok({ order: paid, applied: true }));
      const result = await submitStorefrontPayment("ord1", "SUCCESS");
      expect(result.applied).toBe(true);
      expect(result.order.payment.status).toBe("paid");
      expect(apiClient.post).toHaveBeenCalledWith("/storefront/payments/ord1/callback", {
        result: "SUCCESS",
        reason: undefined,
      });
    });

    it("reports FAIL without marking the order paid", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(
        ok({ order: { ...BUYER_ORDER, status: "cancelled" }, applied: true }),
      );
      const result = await submitStorefrontPayment("ord1", "FAIL", "کاربر انصراف داد");
      expect(result.applied).toBe(true);
      expect(result.order.status).toBe("cancelled");
      expect(apiClient.post).toHaveBeenCalledWith("/storefront/payments/ord1/callback", {
        result: "FAIL",
        reason: "کاربر انصراف داد",
      });
    });

    it("throws when the refId is not a known transaction", async () => {
      const err: ApiError = { code: "NOT_FOUND", message: "تراکنش پرداخت یافت نشد" };
      vi.mocked(apiClient.post).mockResolvedValue({ success: false, error: err });
      await expect(submitStorefrontPayment("deadbeef", "SUCCESS")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("getStorefrontOrder", () => {
    it("fetches the buyer's own order receipt", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok({ order: BUYER_ORDER }));
      const result = await getStorefrontOrder("ord1");
      expect(result.payment.status).toBe("unpaid");
      expect(result.items).toHaveLength(1);
      expect(apiClient.get).toHaveBeenCalledWith("/storefront/orders/ord1");
    });

    it("throws when the order belongs to another buyer", async () => {
      const err: ApiError = { code: "NOT_FOUND", message: "سفارش پیدا نشد" };
      vi.mocked(apiClient.get).mockResolvedValue({ success: false, error: err });
      await expect(getStorefrontOrder("ord-other")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("listStorefrontOrders", () => {
    const PAGE = {
      success: true,
      reqId: "r5",
      items: [BUYER_ORDER],
      total: 1,
      page: 2,
      limit: 10,
    };

    it("fetches the buyer's own order page with params", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(PAGE));
      const result = await listStorefrontOrders({ page: 2, limit: 10, status: "pending" });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(apiClient.get).toHaveBeenCalledWith("/storefront/orders", {
        params: { page: 2, limit: 10, status: "pending" },
      });
    });

    it("defaults page/limit when omitted", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(PAGE));
      await listStorefrontOrders();
      expect(apiClient.get).toHaveBeenCalledWith("/storefront/orders", { params: {} });
    });

    it("throws when the success envelope is missing", async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: undefined });
      await expect(listStorefrontOrders()).rejects.toThrow();
    });
  });

  describe("listStorefronts", () => {
    const DIR = {
      success: true,
      reqId: "r7",
      items: [
        {
          id: "p1",
          storeName: "فروشگاه نخشا",
          slug: "nakhsha-vitrin",
          description: "گالری دست‌سازه‌های ایرانی",
          location: { city: "تهران", neighborhood: "باغ‌فرمان" },
          stats: { totalProducts: 2, averageRating: 4.5, ratingCount: 12 },
        },
        {
          id: "p2",
          storeName: "فروشگاه فردوسی",
          slug: "فروشگاه-فردوسی",
          description: "",
          location: { city: "مشهد", neighborhood: "" },
          stats: { totalProducts: 0, averageRating: 0, ratingCount: 0 },
        },
      ],
      total: 2,
      page: 1,
      limit: 25,
    };

    it("fetches the public directory with q and sort", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(DIR));
      const result = await listStorefronts({ page: 1, limit: 25, q: "نخشا", sort: "rating" });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.items[0].stats.averageRating).toBe(4.5);
      expect(apiClient.get).toHaveBeenCalledWith("/storefronts", {
        params: { page: 1, limit: 25, q: "نخشا", sort: "rating" },
      });
    });

    it("defaults pagination when omitted", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(DIR));
      await listStorefronts();
      expect(apiClient.get).toHaveBeenCalledWith("/storefronts", { params: {} });
    });

    it("throws when the success envelope is missing", async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: undefined });
      await expect(listStorefronts()).rejects.toThrow();
    });
  });

  describe("getStorefrontProductReviews", () => {
    const REVIEWS = {
      success: true,
      reqId: "r6",
      rating: { average: 4.5, count: 2 },
      items: [
        {
          id: "rev1",
          rating: 5,
          comment: "کیفیت عالی",
          buyerName: "کاربر نخشا",
          isAnonymous: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "rev2",
          rating: 4,
          comment: "خوب بود",
          buyerName: "امین",
          isAnonymous: false,
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      total: 2,
      page: 1,
      limit: 5,
    };

    it("fetches the public review list with the rating block", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(REVIEWS));
      const result = await getStorefrontProductReviews("prod1", { page: 2, limit: 5 });
      expect(result.items).toHaveLength(2);
      expect(result.rating).toEqual({ average: 4.5, count: 2 });
      expect(apiClient.get).toHaveBeenCalledWith("/storefront/products/prod1/reviews", {
        params: { page: 2, limit: 5 },
      });
    });

    it("defaults pagination and anon-labelled names", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(ok(REVIEWS));
      const result = await getStorefrontProductReviews("prod1");
      expect(result.items[0].buyerName).toBe("کاربر نخشا");
      expect(apiClient.get).toHaveBeenCalledWith("/storefront/products/prod1/reviews", {
        params: {},
      });
    });

    it("throws when the product is unknown", async () => {
      const err: ApiError = { code: "NOT_FOUND", message: "محصول یافت نشد" };
      vi.mocked(apiClient.get).mockResolvedValue({ success: false, error: err });
      await expect(getStorefrontProductReviews("prod-nope")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("submitStorefrontReview", () => {
    it("posts the review and returns the updated rating", async () => {
      vi.mocked(apiClient.post).mockResolvedValue(
        ok({ review: { id: "rev1", rating: 4, comment: "...", buyerName: "امین", isAnonymous: false }, rating: { average: 4, count: 1 } }),
      );
      const result = await submitStorefrontReview("prod1", {
        rating: 4,
        comment: "خوب بود",
        isAnonymous: false,
      });
      expect(result.rating.count).toBe(1);
      expect(apiClient.post).toHaveBeenCalledWith("/storefront/products/prod1/review", {
        rating: 4,
        comment: "خوب بود",
        isAnonymous: false,
      });
    });

    it("surfaces REVIEW_NOT_ALLOWED for buyers without a delivered purchase", async () => {
      const err: ApiError = {
        code: "REVIEW_NOT_ALLOWED",
        message: "برای ثبت دیدگاه باید این کالا را خریداری و تحویل گرفته باشید",
      };
      vi.mocked(apiClient.post).mockResolvedValue({ success: false, error: err });
      await expect(
        submitStorefrontReview("prod1", { rating: 5, comment: "", isAnonymous: false }),
      ).rejects.toMatchObject({ code: "REVIEW_NOT_ALLOWED" });
    });
  });

  describe("getMyStorefrontReview", () => {
    it("reports purchase eligibility and an existing review", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(
        ok({
          canReview: false,
          hasDeliveredPurchase: true,
          review: { id: "rev1", rating: 5, comment: "عالی", buyerName: "امین", isAnonymous: false },
        }),
      );
      const result = await getMyStorefrontReview("prod1");
      expect(result.canReview).toBe(false);
      expect(result.hasDeliveredPurchase).toBe(true);
      expect(result.review).toMatchObject({ rating: 5 });
      expect(apiClient.get).toHaveBeenCalledWith("/storefront/products/prod1/review/mine");
    });

    it("reports no purchase for a stranger", async () => {
      vi.mocked(apiClient.get).mockResolvedValue(
        ok({ canReview: false, hasDeliveredPurchase: false, review: null }),
      );
      const result = await getMyStorefrontReview("prod1");
      expect(result).toEqual({
        canReview: false,
        hasDeliveredPurchase: false,
        review: null,
      });
    });
  });
});

describe("buyer returns / RMA (Phase 33, P1-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the receipt with the return affordance the server decided", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      ok({
        order: { id: "o1", orderNumber: 501 },
        returns: [{ id: "r1", status: "requested", isOpen: true }],
        returnEligible: true,
        returnDeadline: "2026-01-01T00:00:00.000Z",
      }) as never,
    );

    const detail = await getStorefrontOrderDetail("o1");

    // Eligibility is never computed on the client: a stale clock must not be
    // able to offer a return the store would refuse.
    expect(detail.returnEligible).toBe(true);
    expect(detail.returns).toHaveLength(1);
    expect(detail.order.orderNumber).toBe(501);
  });

  it("still returns the plain order from the legacy helper", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      ok({
        order: { id: "o2", orderNumber: 502 },
        returns: [],
        returnEligible: false,
        returnDeadline: null,
      }) as never,
    );

    const order = await getStorefrontOrder("o2");

    expect(order.id).toBe("o2");
  });

  it("posts a return request against the order", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(
      ok({ return: { id: "r2", rmaNumber: 9, status: "requested" } }) as never,
    );

    const created = await createBuyerReturn("o3", { reason: "???? ????? ????" });

    expect(apiClient.post).toHaveBeenCalledWith("/storefront/orders/o3/returns", {
      reason: "???? ????? ????",
    });
    expect(created.rmaNumber).toBe(9);
  });

  it("surfaces a closed window instead of pretending it is open", async () => {
    const err = { code: "RETURN_WINDOW_CLOSED", message: "???? ?????? ?? ????? ????? ???" };
    vi.mocked(apiClient.post).mockResolvedValue({ success: false, error: err } as never);

    await expect(createBuyerReturn("o4", { reason: "????????" })).rejects.toMatchObject({
      code: "RETURN_WINDOW_CLOSED",
    });
  });

  it("lists the buyer's own claims with pagination", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      ok({ items: [], total: 0, page: 1, limit: 10 }) as never,
    );

    await listBuyerReturns({ page: 1, limit: 10 });

    expect(apiClient.get).toHaveBeenCalledWith("/storefront/returns", {
      params: { page: 1, limit: 10 },
    });
  });
});

describe("storefrontService — delivery (Phase 36)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const QUOTE = {
    configured: true,
    freeShippingThreshold: 0,
    methods: [
      {
        key: "post",
        title: "پست پیشتاز",
        kind: "delivery",
        carrier: "پست",
        fee: 45000,
        zoneLabel: "تهران",
        eta: { minDays: 2, maxDays: 4 },
        pickup: null,
      },
    ],
    unavailable: [],
    warning: "",
    subtotal: 500000,
    currency: "IRR",
  };

  it("sends the destination and basket, never a price", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(ok(QUOTE) as never);

    const quote = await quoteStorefrontShipping("nakhsha-vitrin", {
      items: [{ productId: "p1", qty: 2 }],
      shippingAddress: { province: "تهران", city: "تهران", postalCode: "1584743311" },
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      "/storefront/nakhsha-vitrin/shipping/quote",
      {
        items: [{ productId: "p1", qty: 2 }],
        shippingAddress: { province: "تهران", city: "تهران", postalCode: "1584743311" },
      },
    );
    expect(quote.methods[0].fee).toBe(45000);
  });

  it("sends a shipping code as a lookup key and reads the discount back (Phase 37)", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(
      ok({
        ...QUOTE,
        methods: [{ ...QUOTE.methods[0], fee: 31500, originalFee: 45000, discount: 13500, discountCode: "SHIP30" }],
        discount: { code: "SHIP30", applied: true, rejected: false },
      }) as never,
    );

    const quote = await quoteStorefrontShipping("nakhsha-vitrin", {
      items: [{ productId: "p1", qty: 2 }],
      shippingDiscountCode: "SHIP30",
    });

    // The code goes out; no amount does. The server re-prices from the seller's
    // own rate card, and the numbers the buyer sees are the numbers checkout
    // will charge.
    expect(apiClient.post).toHaveBeenCalledWith("/storefront/nakhsha-vitrin/shipping/quote", {
      items: [{ productId: "p1", qty: 2 }],
      shippingDiscountCode: "SHIP30",
    });
    expect(quote.methods[0].fee).toBe(31500);
    expect(quote.methods[0].originalFee).toBe(45000);
    expect(quote.methods[0].discount).toBe(13500);
    expect(quote.discount).toEqual({ code: "SHIP30", applied: true, rejected: false });
  });

  it("still quotes a full price when the code does not apply", async () => {
    // A rejected code must not break the quote: the buyer is told it did not
    // apply and shown the real price, rather than being blocked from checkout.
    vi.mocked(apiClient.post).mockResolvedValue(
      ok({ ...QUOTE, discount: { code: "NOPE", applied: false, rejected: true } }) as never,
    );

    const quote = await quoteStorefrontShipping("nakhsha-vitrin", {
      items: [{ productId: "p1", qty: 2 }],
      shippingDiscountCode: "NOPE",
    });

    expect(quote.methods[0].fee).toBe(45000);
    expect(quote.discount?.applied).toBe(false);
  });

  it("treats an unconfigured store as a valid answer, not a failure", async () => {
    // Such a store still trades on free shipping, so the UI must render it as
    // "no delivery options, no charge" rather than an error state.
    vi.mocked(apiClient.post).mockResolvedValue(
      ok({
        configured: false,
        freeShippingThreshold: 0,
        methods: [],
        unavailable: [],
        warning: "این فروشگاه هنوز ارسال را تنظیم نکرده است.",
      }) as never,
    );

    const quote = await quoteStorefrontShipping("nakhsha-vitrin", {
      items: [{ productId: "p1", qty: 1 }],
    });

    expect(quote.configured).toBe(false);
    expect(quote.methods).toEqual([]);
    expect(quote.warning).toContain("ارسال");
  });

  it("fetches the province list instead of bundling its own copy", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      ok({ provinces: ["تهران", "اصفهان"] }) as never,
    );

    const provinces = await getShippingProvinces("nakhsha-vitrin");

    expect(apiClient.get).toHaveBeenCalledWith(
      "/storefront/nakhsha-vitrin/shipping/provinces",
    );
    expect(provinces).toEqual(["تهران", "اصفهان"]);
  });

  it("rejects when the list is unavailable, so callers must degrade explicitly", async () => {
    // The service does not swallow this: a page that treats an empty province
    // list as authoritative would be lying. Both the buyer form and the seller
    // editor catch and fall back to a typed province instead.
    vi.mocked(apiClient.get).mockResolvedValue({ success: false } as never);

    await expect(getShippingProvinces("nakhsha-vitrin")).rejects.toThrow();
  });
});