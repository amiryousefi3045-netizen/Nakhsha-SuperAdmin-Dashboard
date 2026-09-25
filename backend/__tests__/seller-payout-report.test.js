const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Payout = require("../models/Payout");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 28 — seller settlement report (GET /api/seller/reports/payouts and
 * /export, P0-04). Scoped to the authenticated seller; per-status/per-method
 * aggregates, a continuous daily series and a row-level CSV export pin the
 * contract. The finance surface (including this report) is owner-only.
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
  seller: "09146800021",
  seller2: "09146800022",
  staff: "09146800023",
};

let sellerToken;
let seller2Token;
let staffToken;
let sellerProfile;
let seedNow;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await TeamMember.deleteMany({});
  await Payout.deleteMany({});
}

const DAY = 86400000;

async function makePayout({ sellerId, sellerUserId, createdAt, status, amount, method }) {
  return Payout.create({
    sellerId,
    sellerUserId,
    amount,
    currency: "IRR",
    status,
    method,
    note: "",
    timeline: [{ status, at: createdAt, by: sellerUserId }],
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
    name: "فروشنده تسویه",
    phone: PHONES.seller,
    handle: "rep_payout_a",
    role: "seller",
    isVerified: true,
  });
  sellerProfile = await SellerProfile.create({
    userId: seller._id,
    storeName: "فروشگاه تسویه",
    slug: "payout-shop",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  sellerToken = TOKEN_OF(seller);

  const seller2 = await User.create({
    name: "فروشنده تسویه دیگر",
    phone: PHONES.seller2,
    handle: "rep_payout_b",
    role: "seller",
    isVerified: true,
  });
  const profile2 = await SellerProfile.create({
    userId: seller2._id,
    storeName: "فروشگاه دیگر",
    slug: "payout-shop-2",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  seller2Token = TOKEN_OF(seller2);

  const staff = await User.create({
    name: "کارمند تسویه",
    phone: PHONES.staff,
    handle: "rep_payout_staff",
    role: "seller",
    isVerified: true,
  });
  staffToken = TOKEN_OF(staff);
  await TeamMember.create({
    sellerProfileId: sellerProfile._id,
    userId: staff._id,
    role: "staff",
  });

  const now = Date.now();
  seedNow = now;
  const sellerUser = seller._id;
  // Seller A — day -20: requested 300k (bank) + paid 500k (card).
  await makePayout({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser,
    createdAt: new Date(now - 20 * DAY),
    status: "requested",
    amount: 300000,
    method: "bank_transfer",
  });
  await makePayout({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser,
    createdAt: new Date(now - 20 * DAY),
    status: "paid",
    amount: 500000,
    method: "card",
  });
  // Seller A — day -5: processing 100k (wallet) + cancelled 200k (bank).
  await makePayout({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser,
    createdAt: new Date(now - 5 * DAY),
    status: "processing",
    amount: 100000,
    method: "wallet",
  });
  await makePayout({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser,
    createdAt: new Date(now - 5 * DAY),
    status: "cancelled",
    amount: 200000,
    method: "bank_transfer",
  });
  // Seller A — day -3: rejected 50k (other).
  await makePayout({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser,
    createdAt: new Date(now - 3 * DAY),
    status: "rejected",
    amount: 50000,
    method: "other",
  });
  // Seller A — day -60: outside the 30-day default window.
  await makePayout({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser,
    createdAt: new Date(now - 60 * DAY),
    status: "paid",
    amount: 99999999,
    method: "bank_transfer",
  });
  // Seller B — same window, must never appear in A's report.
  await makePayout({
    sellerId: profile2._id,
    sellerUserId: seller2._id,
    createdAt: new Date(now - 5 * DAY),
    status: "paid",
    amount: 88888888,
    method: "bank_transfer",
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

describe("settlement report — default window", () => {
  it("aggregates payouts for the seller only, with per-status totals", async () => {
    const res = await get("/api/seller/reports/payouts");
    expect(res.status).toBe(200);
    const report = res.body.report;

    expect(report.summary.total.count).toBe(5); // excludes day -60 and seller B
    expect(report.summary.total.amount).toBe(300000 + 500000 + 100000 + 200000 + 50000);

    expect(report.summary.requested).toEqual({ count: 1, amount: 300000 });
    expect(report.summary.processing).toEqual({ count: 1, amount: 100000 });
    expect(report.summary.paid).toEqual({ count: 1, amount: 500000 });
    expect(report.summary.cancelled).toEqual({ count: 1, amount: 200000 });
    expect(report.summary.rejected).toEqual({ count: 1, amount: 50000 });
    expect(report.currency).toBe("IRR");
  });

  it("breaks amounts down by method with zero-fill in enum order", async () => {
    const report = (await get("/api/seller/reports/payouts")).body.report;
    const byMethod = Object.fromEntries(report.byMethod.map((m) => [m.method, m]));

    expect(byMethod.bank_transfer).toEqual({ method: "bank_transfer", count: 2, amount: 500000 });
    expect(byMethod.card).toEqual({ method: "card", count: 1, amount: 500000 });
    expect(byMethod.wallet).toEqual({ method: "wallet", count: 1, amount: 100000 });
    expect(byMethod.other).toEqual({ method: "other", count: 1, amount: 50000 });
    expect(report.byMethod[0].method).toBe("bank_transfer");
  });

  it("builds a continuous daily series", async () => {
    const report = (await get("/api/seller/reports/payouts")).body.report;
    expect(report.daily).toHaveLength(31); // whole day across the 30-day window
    const day20 = report.daily.find((d) => d.count === 2);
    expect(day20.amount).toBe(800000);
  });
});

describe("settlement report — filters and ownership", () => {
  it("honors from/to window boundaries", async () => {
    const from = new Date(seedNow - 20 * DAY).toISOString();
    const to = new Date(seedNow - 20 * DAY + 1000).toISOString();
    const res = await get(
      `/api/seller/reports/payouts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(res.status).toBe(200);
    const report = res.body.report;
    expect(report.summary.total.count).toBe(2);
    expect(report.summary.paid.amount).toBe(500000);
    expect(report.daily).toHaveLength(1);
  });

  it("rejects an inverted range", async () => {
    const res = await get("/api/seller/reports/payouts?from=2026-09-20T00:00:00Z&to=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("rejects an oversized range", async () => {
    const res = await get("/api/seller/reports/payouts?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("never leaks another seller's payouts", async () => {
    const res = await get("/api/seller/reports/payouts", seller2Token);
    expect(res.status).toBe(200);
    const report = res.body.report;
    expect(report.summary.total.count).toBe(1);
    expect(report.summary.total.amount).toBe(88888888);
  });
});

describe("settlement report — auth guards", () => {
  it("rejects anonymous requests with 401", async () => {
    await request(app).get("/api/seller/reports/payouts").expect(401);
    await request(app).get("/api/seller/reports/payouts/export").expect(401);
  });

  it("is owner-only — team staff gets 403 on both endpoints", async () => {
    await get("/api/seller/reports/payouts", staffToken).expect(403);
    await get("/api/seller/reports/payouts/export", staffToken).expect(403);
  });
});

describe("settlement report — CSV export", () => {
  it("returns a BOM-prefixed CSV with one row per payout, sender scoped", async () => {
    const res = await get("/api/seller/reports/payouts/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");

    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM
    const lines = text.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe(
      "id,status,method,amount,currency,note,decisionNote,reference,createdAt,updatedAt",
    );
    expect(lines).toHaveLength(6); // header + 5 payouts (day -60 and seller B excluded)
    expect(lines.join("\n")).not.toContain("88888888");
    expect(lines.join("\n")).not.toContain("99999999");
    expect(lines.slice(1).some((l) => l.includes(",paid,card,500000,"))).toBe(true);
    expect(lines.slice(1).some((l) => l.split(",")[3] === "300000")).toBe(true);
  });

  it("rejects an invalid range just like the JSON endpoint", async () => {
    const res = await get("/api/seller/reports/payouts/export?from=2026-09-20T00:00:00Z&to=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
  });
});