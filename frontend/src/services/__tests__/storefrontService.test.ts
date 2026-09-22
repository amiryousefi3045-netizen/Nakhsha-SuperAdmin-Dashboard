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
});