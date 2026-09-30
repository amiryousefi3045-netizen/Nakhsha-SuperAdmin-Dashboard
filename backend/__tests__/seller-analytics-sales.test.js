const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Order = require("../models/Order");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 29 — seller analytics sales block (P1-01/P1-03). GET /api/seller/analytics
 * now returns a live `sales` period with per-status breakdown, a continuous
 * daily revenue series and a full period-over-period comparison window, all
 * scoped to the authenticated seller.
 */

function accessTokenOf(user) {
  return jwt.sign(
    {
      id: String(user._id),
      role: user.role,
      type: "access",
      ver: user.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m", algorithm: "HS256" },
  );
}

const TOKEN_OF = (u) => accessTokenOf(u);
const AUTH = (token) => `Bearer ${token}`;

const PHONES = {
  seller: "09146800031",
  seller2: "09146800032",
};

let sellerToken;
let seller2Token;
let sellerProfileId;
let seller2ProfileId;
let seedNow;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Order.deleteMany({});
}

const DAY = 86400000;

async function makeOrder({ sellerId, sellerUserId, createdAt, status, items, total, orderNumber }) {
  return Order.create({
    sellerId,
    sellerUserId,
    orderNumber,
    origin: "storefront",
    customer: { name: "مشتری آنالیتیکس", phone: "09120000000" , address: "تهران، خیابان آزادی، پلاک ۱۲" },
    items,
    subtotal: total,
    shippingFee: 0,
    discount: 0,
    total,
    currency: "IRR",
    status,
    createdAt,
    updatedAt: createdAt,
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  _resetRateLimitStoreForTests();

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;
  await wipe();

  const seller = await User.create({
    name: "فروشنده آنالیتیکس",
    phone: PHONES.seller,
    handle: "ana_seller_a",
    role: "seller",
    isVerified: true,
  });
  await SellerProfile.create({
    userId: seller._id,
    storeName: "فروشگاه آنالیتیکس",
    slug: "ana-shop",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  }).then((p) => {
    sellerProfileId = p._id;
  });
  sellerToken = TOKEN_OF(seller);

  const seller2 = await User.create({
    name: "فروشنده آنالیتیکس دیگر",
    phone: PHONES.seller2,
    handle: "ana_seller_b",
    role: "seller",
    isVerified: true,
  });
  await SellerProfile.create({
    userId: seller2._id,
    storeName: "فروشگاه دیگر",
    slug: "ana-shop-2",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  }).then((p) => {
    seller2ProfileId = p._id;
  });
  seller2Token = TOKEN_OF(seller2);

  const now = Date.now();
  seedNow = now;

  // ── Seller A — current window (default 30 days) ───────────────────────────
  // day -20: 1 delivered order.
  await makeOrder({
    sellerId: sellerProfileId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 20 * DAY),
    status: "delivered",
    orderNumber: 1,
    total: 400000,
    items: [{ productId: new mongoose.Types.ObjectId(), title: "گلدان", price: 100000, qty: 2, currency: "IRR" }],
  });
  // day -5: 1 pending + 1 shipped.
  await makeOrder({
    sellerId: sellerProfileId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 5 * DAY),
    status: "pending",
    orderNumber: 2,
    total: 150000,
    items: [{ productId: new mongoose.Types.ObjectId(), title: "لیوان", price: 50000, qty: 3, currency: "IRR" }],
  });
  await makeOrder({
    sellerId: sellerProfileId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 5 * DAY),
    status: "shipped",
    orderNumber: 3,
    total: 300000,
    items: [{ productId: new mongoose.Types.ObjectId(), title: "سفال", price: 60000, qty: 5, currency: "IRR" }],
  });

  // ── Seller A — previous window (day -50), same length as the default 30-day? ─
  // The previous window is [now-60D, now-30D); day -50 lives inside it.
  await makeOrder({
    sellerId: sellerProfileId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 50 * DAY),
    status: "delivered",
    orderNumber: 4,
    total: 120000,
    items: [{ productId: new mongoose.Types.ObjectId(), title: "قدیمی", price: 40000, qty: 3, currency: "IRR" }],
  });
  await makeOrder({
    sellerId: sellerProfileId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 50 * DAY),
    status: "cancelled",
    orderNumber: 5,
    total: 80000,
    items: [{ productId: new mongoose.Types.ObjectId(), title: "قدیمی۲", price: 40000, qty: 2, currency: "IRR" }],
  });

  // Outside any window (day -100) — must not count anywhere.
  await makeOrder({
    sellerId: sellerProfileId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 100 * DAY),
    status: "delivered",
    orderNumber: 6,
    total: 99999999,
    items: [{ productId: new mongoose.Types.ObjectId(), title: "باستانی", price: 1, qty: 1, currency: "IRR" }],
  });

  // ── Seller B — current window, must never leak into A's analytics ─────────
  await makeOrder({
    sellerId: seller2ProfileId,
    sellerUserId: seller2._id,
    createdAt: new Date(now - 5 * DAY),
    status: "delivered",
    orderNumber: 1,
    total: 88888888,
    items: [{ productId: new mongoose.Types.ObjectId(), title: "رقبا", price: 2, qty: 1, currency: "IRR" }],
  });
});

afterAll(async () => {
  await wipe();
  await mongoose.connection.close();
});

function get(url, token = sellerToken) {
  return request(app)
    .get(url)
    .set("Authorization", AUTH(token));
}

describe("analytics — live sales block", () => {
  it("returns real period totals, units and avg order value for the seller", async () => {
    const res = await get("/api/seller/analytics");
    expect(res.status).toBe(200);
    const sales = res.body.sales;

    expect(sales.current.orders).toBe(3);
    expect(sales.current.units).toBe(2 + 3 + 5);
    expect(sales.current.total).toBe(400000 + 150000 + 300000);
    expect(sales.current.avgOrderValue).toBe(Math.round((850000) / 3));
    expect(sales.currency).toBe("IRR");
  });

  it("compares against the equally-long previous window", async () => {
    const sales = (await get("/api/seller/analytics")).body.sales;
    expect(sales.previous.orders).toBe(2);
    expect(sales.previous.units).toBe(3 + 2);
    expect(sales.previous.total).toBe(120000 + 80000);
    expect(sales.days).toBe(31);
  });

  it("breaks the current window's orders down by status", async () => {
    const sales = (await get("/api/seller/analytics")).body.sales;
    const byStatus = Object.fromEntries(sales.current.byStatus.map((s) => [s.status, s]));
    expect(byStatus.delivered.count).toBe(1);
    expect(byStatus.pending.count).toBe(1);
    expect(byStatus.shipped.count).toBe(1);
    expect(byStatus.delivered.total).toBe(400000);
    expect(sales.current.byStatus[0].status).toBe("pending");
  });

  it("builds a continuous daily revenue series", async () => {
    const sales = (await get("/api/seller/analytics")).body.sales;
    expect(sales.daily).toHaveLength(31);
    const day5 = sales.daily.find((d) => d.orders === 2);
    expect(day5.total).toBe(450000);
  });

  it("honors an explicit from/to window", async () => {
    const from = new Date(seedNow - 20 * DAY).toISOString();
    const to = new Date(seedNow - 20 * DAY + 1000).toISOString();
    const res = await get(
      `/api/seller/analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(res.status).toBe(200);
    const sales = res.body.sales;
    expect(sales.current.orders).toBe(1);
    expect(sales.current.total).toBe(400000);
    expect(sales.daily).toHaveLength(1);
  });

  it("rejects an invalid window like the report endpoints", async () => {
    const res = await get("/api/seller/analytics?from=2026-09-20T00:00:00Z&to=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("never leaks another seller's orders into any block", async () => {
    const res = await get("/api/seller/analytics", seller2Token);
    expect(res.status).toBe(200);
    const sales = res.body.sales;
    expect(sales.current.orders).toBe(1);
    expect(sales.current.total).toBe(88888888);
    // Outside-window + other-seller amounts are absent.
    expect([99999999].some((v) => sales.current.total === v || sales.previous.total === v)).toBe(false);
  });
});