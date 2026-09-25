const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Order = require("../models/Order");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 24 — seller sales report (GET /api/seller/reports/sales). Everything
 * is scoped to the authenticated seller; the period filter (UTC days), status
 * breakdown, top products and the continuous daily series are the contract.
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
  seller: "09146800001",
  seller2: "09146800002",
};

let sellerToken;
let seller2Token;
let sellerId;
let seller2Id;
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
    customer: { name: "مشتری گزارش", phone: "09120000000" },
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
    name: "فروشنده گزارش",
    phone: PHONES.seller,
    handle: "rep_seller_a",
    role: "seller",
    isVerified: true,
  });
  const profile = await SellerProfile.create({
    userId: seller._id,
    storeName: "فروشگاه گزارش",
    slug: "rep-shop",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  sellerId = profile._id;
  sellerToken = TOKEN_OF(seller);

  const seller2 = await User.create({
    name: "فروشنده گزارش دیگر",
    phone: PHONES.seller2,
    handle: "rep_seller_b",
    role: "seller",
    isVerified: true,
  });
  const profile2 = await SellerProfile.create({
    userId: seller2._id,
    storeName: "فروشگاه دیگر",
    slug: "rep-shop-2",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  seller2Id = profile2._id;
  seller2Token = TOKEN_OF(seller2);

  const now = Date.now();
  seedNow = now;
  // Seller A — day -20: 2 orders (گلدان ×2 و لیوان ×4) delivered.
  await makeOrder({
    sellerId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 20 * DAY),
    status: "delivered",
    orderNumber: 1,
    total: 400000,
    items: [
      { productId: new mongoose.Types.ObjectId(), title: "گلدان", price: 100000, qty: 2, currency: "IRR" },
    ],
  });
  await makeOrder({
    sellerId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 20 * DAY),
    status: "delivered",
    orderNumber: 2,
    total: 200000,
    items: [
      { productId: new mongoose.Types.ObjectId(), title: "لیوان", price: 50000, qty: 4, currency: "IRR" },
    ],
  });
  // Seller A — day -5: 1 pending, 1 shipped.
  await makeOrder({
    sellerId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 5 * DAY),
    status: "pending",
    orderNumber: 3,
    total: 150000,
    items: [
      { productId: new mongoose.Types.ObjectId(), title: "گلدان", price: 50000, qty: 3, currency: "IRR" },
    ],
  });
  await makeOrder({
    sellerId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 5 * DAY),
    status: "shipped",
    orderNumber: 4,
    total: 300000,
    items: [
      { productId: new mongoose.Types.ObjectId(), title: "سفال", price: 60000, qty: 5, currency: "IRR" },
    ],
  });
  // Seller A — day -60 (outside the 30-day default window).
  await makeOrder({
    sellerId,
    sellerUserId: seller._id,
    createdAt: new Date(now - 60 * DAY),
    status: "cancelled",
    orderNumber: 5,
    total: 999999,
    items: [{ productId: new mongoose.Types.ObjectId(), title: "قدیمی", price: 1, qty: 1, currency: "IRR" }],
  });
  // Seller B — same window, must never appear in A's report.
  await makeOrder({
    sellerId: seller2Id,
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

function get(url) {
  return request(app)
    .get(url)
    .set("Authorization", AUTH(sellerToken));
}

describe("sales report — default window", () => {
  it("aggregates orders, units and totals for the seller only", async () => {
    const res = await get("/api/seller/reports/sales");
    expect(res.status).toBe(200);
    const report = res.body.report;

    expect(report.summary.orders).toBe(4); // excludes day -60 and seller B
    expect(report.summary.units).toBe(2 + 4 + 3 + 5);
    expect(report.summary.total).toBe(400000 + 200000 + 150000 + 300000);
    expect(report.daily).toHaveLength(31); // whole day across the 30-day window
  });

  it("breaks revenue down by status with zero-fill in enum order", async () => {
    const report = (await get("/api/seller/reports/sales")).body.report;
    const byStatus = Object.fromEntries(report.byStatus.map((s) => [s.status, s]));
    expect(byStatus.delivered.count).toBe(2);
    expect(byStatus.delivered.total).toBe(600000);
    expect(byStatus.pending.count).toBe(1);
    expect(byStatus.shipped.count).toBe(1);
    expect(byStatus.delivered.total + byStatus.pending.total + byStatus.shipped.total).toBe(1050000);
    expect(byStatus.returned.count).toBe(0);
    expect(report.byStatus[0].status).toBe("pending");
  });

  it("ranks top products by units with revenue and order count", async () => {
    const report = (await get("/api/seller/reports/sales")).body.report;
    expect(report.topProducts[0].title).toBe("سفال");
    expect(report.topProducts[0].units).toBe(5);
    expect(report.topProducts[0].revenue).toBe(300000);
    expect(report.topProducts[0].orders).toBe(1);
    expect(report.topProducts.map((p) => p.title)).toEqual(
      expect.arrayContaining(["گلدان", "لیوان", "سفال"]),
    );
  });

  it("builds a continuous daily series (zero days included)", async () => {
    const report = (await get("/api/seller/reports/sales")).body.report;
    const dayKeys = report.daily.map((d) => d.day);
    expect(dayKeys).toHaveLength(31);
    const first = report.daily.find((d) => d.orders === 2);
    expect(first.total).toBe(600000);
  });
});

describe("sales report — filters and ownership", () => {
  it("honors from/to window boundaries", async () => {
    const from = new Date(seedNow - 20 * DAY).toISOString();
    const to = new Date(seedNow - 20 * DAY + 1000).toISOString();
    const res = await get(
      `/api/seller/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(res.status).toBe(200);
    const report = res.body.report;
    expect(report.summary.orders).toBe(2);
    expect(report.daily).toHaveLength(1);
  });

  it("rejects an inverted range", async () => {
    const res = await get("/api/seller/reports/sales?from=2026-09-20T00:00:00Z&to=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("rejects an oversized range", async () => {
    const res = await get("/api/seller/reports/sales?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("never leaks another seller's orders", async () => {
    const res = await request(app)
      .get("/api/seller/reports/sales")
      .set("Authorization", AUTH(seller2Token));
    expect(res.status).toBe(200);
    const report = res.body.report;
    expect(report.summary.total).toBe(88888888);
    expect(report.summary.orders).toBe(1);
    expect(report.summary.units).toBe(1);
  });
});