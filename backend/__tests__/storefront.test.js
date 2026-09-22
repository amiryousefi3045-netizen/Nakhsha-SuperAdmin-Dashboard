const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");

/**
 * Public storefront — HTTP contract tests. These endpoints are intentionally
 * unauthenticated: the visibility gate lives entirely in the service, so a
 * non-published, suspended or unknown store always answers 404.
 */

const FINANCE_TERMS = { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 };
const PUBLIC_SETTINGS = {
  storefrontPublished: true,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "bank_transfer",
};
const PRIVATE_SETTINGS = {
  storefrontPublished: false,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "bank_transfer",
};

const PHONES = {
  ownerA: "09147000040",
  ownerB: "09147000041",
  ownerC: "09147000042",
  ownerD: "09147000043",
};

let productA;
let productB;
let productPaused;
let productDraft;

async function wipeStorefrontData() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;
  await wipeStorefrontData();

  // Published store with a fixed slug + mixed product states.
  const ownerA = await User.create({
    name: "مالک ویترین",
    phone: PHONES.ownerA,
    handle: "sf_owner_a",
    role: "seller",
    isVerified: true,
  });
  const publishedStore = await SellerProfile.create({
    userId: ownerA._id,
    storeName: "ویترین نخشا",
    slug: "nakhsha-vitrin",
    description: "فروشگاه گلیم و سفال نخشا",
    status: "active",
    verification: { status: "verified" },
    settings: { ...PUBLIC_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  const makeProduct = (title, over = {}) =>
    Product.create({
      sellerId: publishedStore._id,
      sellerUserId: ownerA._id,
      title,
      price: 200000,
      category: "pottery",
      stock: { onHand: 10, reserved: 0 },
      stockPolicy: "tracked",
      status: "active",
      ...over,
    });

  productA = await makeProduct("گلدان سفالی", { price: 500000 });
  productB = await makeProduct("گلیم دستباف", {
    price: 2000000,
    category: "carpet",
    stock: { onHand: 0, reserved: 0 },
  });
  productPaused = await makeProduct("محصول مکث", { status: "paused" });
  productDraft = await makeProduct("محصول پیش‌نویس", { status: "draft" });

  // Auto-generated Persian slug store (exercises the pre-save slug generator).
  const ownerB = await User.create({
    name: "مالک پارسی",
    phone: PHONES.ownerB,
    handle: "sf_owner_b",
    role: "seller",
  });
  await SellerProfile.create({
    userId: ownerB._id,
    storeName: "فروشگاه فردوسی",
    status: "active",
    verification: { status: "verified" },
    settings: { ...PUBLIC_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  // Published flag off → invisible even though it has active products.
  const ownerC = await User.create({
    name: "مالک پنهان",
    phone: PHONES.ownerC,
    handle: "sf_owner_c",
    role: "seller",
  });
  const unpublishedStore = await SellerProfile.create({
    userId: ownerC._id,
    storeName: "فروشگاه پنهان",
    slug: "secret-vitrin",
    status: "active",
    settings: { ...PRIVATE_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });
  await Product.create({
    sellerId: unpublishedStore._id,
    sellerUserId: ownerC._id,
    title: "محصول پنهان",
    price: 100000,
    status: "active",
  });

  // Suspended store → invisible even when published.
  const ownerD = await User.create({
    name: "مالک تعلیقی",
    phone: PHONES.ownerD,
    handle: "sf_owner_d",
    role: "seller",
  });
  await SellerProfile.create({
    userId: ownerD._id,
    storeName: "فروشگاه بسته",
    slug: "closed-vitrin",
    status: "suspended",
    settings: { ...PUBLIC_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });
});

afterAll(async () => {
  await wipeStorefrontData();
  await mongoose.connection.close();
});

// ── Storefront profile ───────────────────────────────────────────────────────

describe("GET /api/storefront/:slug", () => {
  it("serves a published storefront without any authentication", async () => {
    const res = await request(app).get("/api/storefront/nakhsha-vitrin");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.storefront.storeName).toBe("ویترین نخشا");
    expect(res.body.storefront.slug).toBe("nakhsha-vitrin");
    expect(res.body.storefront.description).toBeTruthy();
    expect(res.body.storefront.location).toEqual({ city: "", neighborhood: "" });
    // privacy: internal seller data never leaves the API
    expect(res.body.storefront.settings).toBeUndefined();
    expect(res.body.storefront.finance).toBeUndefined();
    expect(res.body.storefront.verification).toBeUndefined();
    expect(res.body.storefront.userId).toBeUndefined();
  });

  it("serves a store with an auto-generated Persian slug", async () => {
    const res = await request(app).get("/api/storefront/فروشگاه-فردوسی");
    expect(res.status).toBe(200);
    expect(res.body.storefront.storeName).toBe("فروشگاه فردوسی");
  });

  it("404 for an unknown slug", async () => {
    const res = await request(app).get("/api/storefront/who-is-this");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("404 for a store that was never published", async () => {
    const res = await request(app).get("/api/storefront/secret-vitrin");
    expect(res.status).toBe(404);
  });

  it("404 for a suspended store even when published", async () => {
    const res = await request(app).get("/api/storefront/closed-vitrin");
    expect(res.status).toBe(404);
  });

  it("400 for an invalid slug shape", async () => {
    const res = await request(app).get("/api/storefront/bad_slug");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ── Product catalog ──────────────────────────────────────────────────────────

describe("GET /api/storefront/:slug/products", () => {
  it("lists only active products with the public DTO", async () => {
    const res = await request(app).get("/api/storefront/nakhsha-vitrin/products");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(25);
    expect(res.body.items.map((i) => i.title).sort()).toEqual(["گلدان سفالی", "گلیم دستباف"]);
    expect(res.body.items[0].status).toBeUndefined();
    expect(res.body.items[0].stock).toBeUndefined();
    expect(res.body.items[0].sku).toBeUndefined();
  });

  it("filters by category", async () => {
    const res = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?category=carpet",
    );
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("گلیم دستباف");
  });

  it("sorts by price both directions", async () => {
    const asc = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?sort=priceAsc",
    );
    expect(asc.body.items[0].price).toBe(500000);

    const desc = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?sort=priceDesc",
    );
    expect(desc.body.items[0].price).toBe(2000000);
  });

  it("searches the title", async () => {
    const res = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?q=گلدان",
    );
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("گلدان سفالی");
  });

  it("paginates with page + limit", async () => {
    const res = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?page=2&limit=1&sort=priceAsc",
    );
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(2);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].price).toBe(2000000);
  });

  it("404 for an unpublished storefront", async () => {
    const res = await request(app).get("/api/storefront/secret-vitrin/products");
    expect(res.status).toBe(404);
  });

  it("returns an empty page for a store with no active products", async () => {
    const res = await request(app).get("/api/storefront/فروشگاه-فردوسی/products");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it("rejects invalid query values", async () => {
    const badCategory = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?category=weird",
    );
    expect(badCategory.status).toBe(400);
    expect(badCategory.body.error.code).toBe("VALIDATION_ERROR");

    const badLimit = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?limit=0",
    );
    expect(badLimit.status).toBe(400);

    const hugeLimit = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?limit=999",
    );
    expect(hugeLimit.status).toBe(400);

    const badPage = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?page=0",
    );
    expect(badPage.status).toBe(400);

    const badSort = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products?sort=random",
    );
    expect(badSort.status).toBe(400);
  });
});

// ── Product detail ───────────────────────────────────────────────────────────

describe("GET /api/storefront/:slug/products/:productId", () => {
  it("returns an active product with derived stock flags only", async () => {
    const res = await request(app).get(
      `/api/storefront/nakhsha-vitrin/products/${productA._id}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.product.title).toBe("گلدان سفالی");
    expect(res.body.product.price).toBe(500000);
    expect(res.body.product.availableStock).toBe(10);
    expect(res.body.product.isOutOfStock).toBe(false);
    expect(res.body.product.stock).toBeUndefined();
  });

  it("marks out-of-stock items", async () => {
    const res = await request(app).get(
      `/api/storefront/nakhsha-vitrin/products/${productB._id}`,
    );
    expect(res.body.product.isOutOfStock).toBe(true);
    expect(res.body.product.availableStock).toBe(0);
  });

  it("404 for a paused product", async () => {
    const res = await request(app).get(
      `/api/storefront/nakhsha-vitrin/products/${productPaused._id}`,
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("404 for a draft product", async () => {
    const res = await request(app).get(
      `/api/storefront/nakhsha-vitrin/products/${productDraft._id}`,
    );
    expect(res.status).toBe(404);
  });

  it("404 for an unknown product id", async () => {
    const res = await request(app).get(
      `/api/storefront/nakhsha-vitrin/products/${new mongoose.Types.ObjectId()}`,
    );
    expect(res.status).toBe(404);
  });

  it("400 for a malformed product id", async () => {
    const res = await request(app).get(
      "/api/storefront/nakhsha-vitrin/products/not-an-id",
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("404 when the owning store is unpublished", async () => {
    const res = await request(app).get(
      `/api/storefront/secret-vitrin/products/${productA._id}`,
    );
    expect(res.status).toBe(404);
  });
});