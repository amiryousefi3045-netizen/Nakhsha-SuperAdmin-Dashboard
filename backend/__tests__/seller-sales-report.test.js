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
let sellerUserId;
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
    customer: { name: "مشتری گزارش", phone: "09120000000" , address: "تهران، خیابان آزادی، پلاک ۱۲" },
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
  sellerUserId = seller._id;
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

describe("sales report — delivery economics (Phase 36, P1-08)", () => {
  // Two orders inside the default 30-day window: one with a recorded courier
  // cost, one the seller has not filled in yet.
  const withShipping = () =>
    Order.create({
      sellerId,
      sellerUserId: sellerUserId,
      orderNumber: "990001",
      origin: "storefront",
      customer: { name: "مشتری ارسال", phone: "09120000001", address: "تهران، خیابان ولیعصر" },
      items: [{ productId: new mongoose.Types.ObjectId(), title: "گلدان", price: 500000, qty: 1, currency: "IRR" }],
      subtotal: 500000,
      shippingFee: 45000,
      discount: 0,
      total: 545000,
      currency: "IRR",
      status: "shipped",
      shipping: {
        methodKey: "post",
        methodTitle: "پست پیشتاز",
        kind: "delivery",
        carrier: "پست",
        fee: 45000,
        cost: 38000,
        zoneLabel: "تهران",
      },
      createdAt: new Date(seedNow - 3 * DAY),
      updatedAt: new Date(seedNow - 3 * DAY),
    });

  const withoutCost = () =>
    Order.create({
      sellerId,
      sellerUserId: sellerUserId,
      orderNumber: "990002",
      origin: "storefront",
      customer: { name: "مشتری حضوری", phone: "09120000002", address: "تهران" },
      items: [{ productId: new mongoose.Types.ObjectId(), title: "لیوان", price: 200000, qty: 1, currency: "IRR" }],
      subtotal: 200000,
      shippingFee: 0,
      discount: 0,
      total: 200000,
      currency: "IRR",
      status: "delivered",
      // A pickup order: a real order, but with no courier to pay.
      shipping: { methodKey: "pickup", methodTitle: "دریافت حضوری", kind: "pickup", fee: 0, cost: 0 },
      createdAt: new Date(seedNow - 2 * DAY),
      updatedAt: new Date(seedNow - 2 * DAY),
    });

  beforeEach(async () => {
    await Order.deleteMany({ orderNumber: { $in: ["990001", "990002"] } });
  });

  afterAll(async () => {
    await Order.deleteMany({ orderNumber: { $in: ["990001", "990002"] } });
  });

  it("separates what buyers paid from what the seller paid", async () => {
    await withShipping();
    await withoutCost();
    const summary = (await get("/api/seller/reports/sales")).body.report.summary;
    // The seeded orders carry no shipping fee; only the two above do.
    expect(summary.shippingFee).toBe(45000);
    expect(summary.shippingCost).toBe(38000);
    expect(summary.shippingMargin).toBe(7000);
  });

  it("does not silently read an unrecorded cost as free freight", async () => {
    await withShipping();
    await withoutCost();
    const summary = (await get("/api/seller/reports/sales")).body.report.summary;
    // The pickup order contributes a fee of 0 and an unrecorded cost. Counting
    // it as recorded would tell the seller their margin is fully known when it
    // is not; the honest number is surfaced next to the sum.
    expect(summary.shippingCostUnrecorded).toBeGreaterThanOrEqual(1);
  });

  it("writes the delivery columns into the CSV, marked recorded or not", async () => {
    await withShipping();
    await withoutCost();
    const res = await get("/api/seller/reports/sales/export");
    const lines = res.text.split("\r\n").slice(1).filter(Boolean);
    const header = res.text.split("\r\n")[0].replace(/^﻿/, "").split(",");

    const shipped = lines.find((l) => l.startsWith("990001,"));
    expect(shipped).toBeDefined();
    const cols = Object.fromEntries(shipped.split(",").map((v, i) => [header[i], v]));
    expect(cols.shippingMethod).toBe("پست پیشتاز");
    expect(cols.shippingKind).toBe("delivery");
    expect(cols.shippingZone).toBe("تهران");
    expect(cols.shippingCost).toBe("38000");
    expect(cols.shippingMargin).toBe("7000");
    expect(cols.shippingCostRecorded).toBe("yes");

    const pickup = lines.find((l) => l.startsWith("990002,"));
    const pickupCols = Object.fromEntries(pickup.split(",").map((v, i) => [header[i], v]));
    // "no" rather than a blank cell, so a spreadsheet cannot read an empty
    // string as "the courier was free".
    expect(pickupCols.shippingCostRecorded).toBe("no");
  });

  it("never puts another seller's delivery figures in the report", async () => {
    await withShipping();
    const report = (await get("/api/seller/reports/sales")).body.report;
    expect(JSON.stringify(report)).not.toContain("88888888");
  });
});

describe("sales report — CSV export", () => {
  it("returns a BOM-prefixed CSV with one row per order, sender scoped", async () => {
    const res = await get("/api/seller/reports/sales/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");

    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM
    const lines = text.split("\r\n");
    // Phase 36 appends the delivery columns after `currency`, so an importer
    // reading by position still lines up.
    expect(lines[0].replace(/^﻿/, "")).toBe(
      "orderNumber,orderStatus,createdAt,customerName,customerPhone,items,units,subtotal,shippingFee,discount,total,currency,shippingMethod,shippingKind,shippingZone,shippingCost,shippingMargin,shippingCostRecorded",
    );
    expect(lines).toHaveLength(5); // header + 4 orders (seller B's order excluded)
    expect(lines.slice(1).join("\n")).not.toContain("88888888");
    expect(lines[1]).toContain(",delivered,");
    expect(lines.slice(1).some((l) => l.includes("گلدان x2"))).toBe(true);
    expect(lines.slice(1).some((l) => l.split(",")[10] === "300000")).toBe(true);
  });

  it("subtotal/total values stay numeric columns for spreadsheet use", async () => {
    const res = await get("/api/seller/reports/sales/export");
    const lines = res.text.split("\r\n");
    const totals = lines.slice(1).map((l) => l.split(",")[10]);
    expect([400000, 200000, 150000, 300000].every((t) => totals.includes(String(t)))).toBe(true);
  });

  it("rejects an invalid range just like the JSON endpoint", async () => {
    const res = await get("/api/seller/reports/sales/export?from=2026-09-20T00:00:00Z&to=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
  });
});