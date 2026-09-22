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
});