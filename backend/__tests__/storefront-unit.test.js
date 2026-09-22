const mongoose = require("mongoose");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const { StorefrontService, publicStorefrontToDTO, publicProductToDTO } = require("../services/StorefrontService");

/**
 * Public storefront — unit tests for the visibility gate and privacy-safe DTOs.
 * The HTTP contract is pinned by storefront.test.js.
 */

let viewerUserId;

beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  viewerUserId = new mongoose.Types.ObjectId();
});

async function makeUser(over = {}) {
  return User.create({
    name: "فروشنده تستی",
    phone: `09${String(Math.floor(100000000 + Math.random() * 899999999))}`,
    handle: `sf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: "seller",
    ...over,
  });
}

async function makeSeller(over = {}) {
  const user = await makeUser();
  return SellerProfile.create({
    userId: user._id,
    storeName: `فروشگاه ${Date.now()}`,
    status: "active",
    settings: {
      storefrontPublished: true,
      notificationEmail: true,
      notificationSms: false,
      defaultPayoutMethod: "bank_transfer",
    },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
    ...over,
  });
}

async function makeProduct(profile, over = {}) {
  return Product.create({
    sellerId: profile._id,
    sellerUserId: viewerUserId,
    title: "ظرف سفالی",
    price: 200000,
    category: "pottery",
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
    ...over,
  });
}

beforeEach(async () => {
  await Product.deleteMany({});
  await User.deleteMany({ handle: /^sf_/ });
  await SellerProfile.deleteMany({});
});

afterAll(async () => {
  await Product.deleteMany({});
  await User.deleteMany({ handle: /^sf_/ });
  await SellerProfile.deleteMany({});
  await mongoose.connection.close();
});

function objectIdHex() {
  return new mongoose.Types.ObjectId().toHexString();
}

// ── Publish gate ─────────────────────────────────────────────────────────────

describe("StorefrontService.getStorefront", () => {
  it("returns a public DTO for a published + active store", async () => {
    await makeSeller({ slug: "nakhsha-test", storeName: "فروشگاه نخشا" });
    const dto = await StorefrontService.getStorefront("nakhsha-test");
    expect(dto).not.toBeNull();
    expect(dto.storeName).toBe("فروشگاه نخشا");
    expect(dto.slug).toBe("nakhsha-test");
    expect(dto.stats).toEqual(expect.objectContaining({ totalProducts: 0, averageRating: 0, ratingCount: 0 }));
    // privacy: internal fields never leak
    expect(dto.settings).toBeUndefined();
    expect(dto.finance).toBeUndefined();
    expect(dto.userId).toBeUndefined();
  });

  it("hides a store whose owner has not published it", async () => {
    await makeSeller({ slug: "hidden-store", settings: { storefrontPublished: false } });
    expect(await StorefrontService.getStorefront("hidden-store")).toBeNull();
  });

  it("hides a suspended store even when published", async () => {
    await makeSeller({ slug: "closed-store", status: "suspended" });
    expect(await StorefrontService.getStorefront("closed-store")).toBeNull();
  });

  it("returns null for an unknown slug", async () => {
    expect(await StorefrontService.getStorefront("does-not-exist")).toBeNull();
  });

  it("normalizes the incoming slug before matching", async () => {
    await makeSeller({ slug: "my-shop" });
    const dto = await StorefrontService.getStorefront("MY-Shop");
    expect(dto).not.toBeNull();
    expect(dto.slug).toBe("my-shop");
  });
});

// ── Product catalog filters ──────────────────────────────────────────────────

describe("StorefrontService.listStorefrontProducts", () => {
  it("returns only ACTIVE products of the published store", async () => {
    const profile = await makeSeller({ slug: "catalog" });
    await makeProduct(profile, { title: "فعال یک" });
    await makeProduct(profile, { title: "فعال دو", price: 900000 });
    await makeProduct(profile, { title: "پیش‌نویس", status: "draft" });
    await makeProduct(profile, { title: "مکث", status: "paused" });
    await makeProduct(profile, { title: "در انتظار", status: "pending_review" });
    await makeProduct(profile, { title: "بایگانی", status: "archived" });

    const result = await StorefrontService.listStorefrontProducts({ slug: "catalog", page: 1, limit: 25 });
    expect(result).not.toBeNull();
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.title).sort()).toEqual(["فعال دو", "فعال یک"]);
    // public DTO never leaks status or internal stock quantities
    expect(result.items[0].status).toBeUndefined();
    expect(result.items[0].stock).toBeUndefined();
    expect(result.items[0].sku).toBeUndefined();
  });

  it("is empty for a published store with no active products", async () => {
    const profile = await makeSeller({ slug: "empty-shop" });
    await makeProduct(profile, { status: "draft" });
    const result = await StorefrontService.listStorefrontProducts({ slug: "empty-shop" });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns null when the storefront is not published", async () => {
    await makeSeller({ slug: "cat-hidden", settings: { storefrontPublished: false } });
    expect(await StorefrontService.listStorefrontProducts({ slug: "cat-hidden" })).toBeNull();
  });

  it("filters by category", async () => {
    const profile = await makeSeller({ slug: "cat-filter" });
    await makeProduct(profile, { title: "سفال", category: "pottery" });
    await makeProduct(profile, { title: "گلیم", category: "carpet" });
    const result = await StorefrontService.listStorefrontProducts({ slug: "cat-filter", category: "carpet" });
    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe("گلیم");
  });

  it("searches the title and tags", async () => {
    const profile = await makeSeller({ slug: "cat-q" });
    await makeProduct(profile, { title: "گلدان مسی", tags: ["مس"] });
    await makeProduct(profile, { title: "سینی چوبی", tags: ["پایه‌هفت"] });
    const byTitle = await StorefrontService.listStorefrontProducts({ slug: "cat-q", q: "مس" });
    expect(byTitle.total).toBe(1);
    expect(byTitle.items[0].title).toBe("گلدان مسی");
    const byTag = await StorefrontService.listStorefrontProducts({ slug: "cat-q", q: "پایه‌هفت" });
    expect(byTag.total).toBe(1);
    expect(byTag.items[0].title).toBe("سینی چوبی");
  });

  it("sorts by price ascending and descending", async () => {
    const profile = await makeSeller({ slug: "cat-sort" });
    await makeProduct(profile, { title: "ارزان", price: 50000 });
    await makeProduct(profile, { title: "گران", price: 5000000 });
    await makeProduct(profile, { title: "متوسط", price: 900000 });

    const asc = await StorefrontService.listStorefrontProducts({ slug: "cat-sort", sort: "priceAsc" });
    expect(asc.items.map((i) => i.price)).toEqual([50000, 900000, 5000000]);

    const desc = await StorefrontService.listStorefrontProducts({ slug: "cat-sort", sort: "priceDesc" });
    expect(desc.items.map((i) => i.price)).toEqual([5000000, 900000, 50000]);

    const newest = await StorefrontService.listStorefrontProducts({ slug: "cat-sort", sort: "newest" });
    expect(newest.items).toHaveLength(3);
  });

  it("paginates with page/limit", async () => {
    const profile = await makeSeller({ slug: "cat-page" });
    for (let i = 0; i < 6; i += 1) {
      await makeProduct(profile, { title: `محصول ${i + 1}`, price: 1000 * (i + 1) });
    }
    const page = await StorefrontService.listStorefrontProducts({ slug: "cat-page", page: 2, limit: 2, sort: "priceAsc" });
    expect(page.total).toBe(6);
    expect(page.page).toBe(2);
    expect(page.limit).toBe(2);
    // newest-first overwritten by priceAsc: first page prices 1000,2000 → second page 3000,4000
    expect(page.items.map((i) => i.price)).toEqual([3000, 4000]);
  });
});

// ── Product detail ───────────────────────────────────────────────────────────

describe("StorefrontService.getStorefrontProduct", () => {
  it("returns the active product of the published store with safe fields", async () => {
    const profile = await makeSeller({ slug: "detail-shop" });
    const product = await makeProduct(profile, {
      title: "گلدان نقاشی",
      price: 1500000,
      stock: { onHand: 4, reserved: 1 },
    });
    const result = await StorefrontService.getStorefrontProduct({
      slug: "detail-shop",
      productId: String(product._id),
    });
    expect(result).not.toBeNull();
    expect(result.product.title).toBe("گلدان نقاشی");
    expect(result.product.price).toBe(1500000);
    // available = onHand - reserved, quantity internals stay private
    expect(result.product.availableStock).toBe(3);
    expect(result.product.stock).toBeUndefined();
    expect(result.product.isOutOfStock).toBe(false);
    expect(result.storefront.slug).toBe("detail-shop");
  });

  it("marks an out-of-stock product", async () => {
    const profile = await makeSeller({ slug: "oop-shop" });
    const product = await makeProduct(profile, { stock: { onHand: 0, reserved: 0 } });
    const result = await StorefrontService.getStorefrontProduct({
      slug: "oop-shop",
      productId: String(product._id),
    });
    expect(result.product.isOutOfStock).toBe(true);
    expect(result.product.availableStock).toBe(0);
  });

  it("hides a non-active product even when it exists", async () => {
    const profile = await makeSeller({ slug: "paused-shop" });
    const product = await makeProduct(profile, { status: "paused" });
    const result = await StorefrontService.getStorefrontProduct({
      slug: "paused-shop",
      productId: String(product._id),
    });
    expect(result).toBeNull();
  });

  it("never returns another store's product", async () => {
    const profileA = await makeSeller({ slug: "owned-by-a" });
    await makeSeller({ slug: "owned-by-b" });
    const product = await makeProduct(profileA);
    const result = await StorefrontService.getStorefrontProduct({
      slug: "owned-by-b",
      productId: String(product._id),
    });
    expect(result).toBeNull();
  });

  it("returns null for an unknown product id in a valid store", async () => {
    await makeSeller({ slug: "no-product" });
    const result = await StorefrontService.getStorefrontProduct({
      slug: "no-product",
      productId: objectIdHex(),
    });
    expect(result).toBeNull();
  });

  it("returns null when the store is unpublished", async () => {
    const profile = await makeSeller({ slug: "dp-hidden", settings: { storefrontPublished: false } });
    const product = await makeProduct(profile);
    const result = await StorefrontService.getStorefrontProduct({
      slug: "dp-hidden",
      productId: String(product._id),
    });
    expect(result).toBeNull();
  });
});

// ── DTO helper contracts ─────────────────────────────────────────────────────

describe("storefront DTO helpers", () => {
  it("publicStorefrontToDTO strips finance/settings/verification documents", async () => {
    const profile = await makeSeller({
      slug: "dto-check",
      storeName: "فروشگاه DTO",
      description: "توضیح",
      verification: { status: "verified", documents: [{ type: "business_license", image: "/uploads/doc.webp" }] },
    });
    const dto = publicStorefrontToDTO(profile);
    expect(dto.verification).toBeUndefined();
    expect(dto.documents).toBeUndefined();
    expect(dto.description).toBe("توضیح");
    expect(dto.location).toEqual({ city: "", neighborhood: "" });
  });

  it("publicProductToDTO keeps currency and tags", async () => {
    const profile = await makeSeller({ slug: "dto-product" });
    const product = await makeProduct(profile, { tags: ["سفال", "تزئینی"], currency: "IRR" });
    const dto = publicProductToDTO(product);
    expect(dto.tags).toEqual(["سفال", "تزئینی"]);
    expect(dto.currency).toBe("IRR");
  });
});