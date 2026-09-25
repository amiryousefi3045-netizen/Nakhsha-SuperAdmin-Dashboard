const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Order = require("../models/Order");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 27 — advanced order filters for the seller list:
 * `from/to` (createdAt window), `payment` (payment.status), `minTotal/maxTotal`.
 * Every filter stays scoped to the authenticated seller.
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
  seller: "09147000001",
  other: "09147000002",
};

let sellerToken;
let sellerId;
let seedNow;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Order.deleteMany({});
}

const DAY = 86400000;

async function seedOrder({ sellerId, sellerUserId, createdAt, status, total, paid }) {
  return Order.create({
    sellerId,
    sellerUserId,
    orderNumber: Math.floor(Math.random() * 900000) + 100000,
    origin: "storefront",
    customer: { name: "مشتری فیلتر", phone: "09120000000" },
    items: [{ productId: new mongoose.Types.ObjectId(), title: "کالا", price: total, qty: 1, currency: "IRR" }],
    subtotal: total,
    shippingFee: 0,
    discount: 0,
    total,
    currency: "IRR",
    status,
    payment: { status: paid ? "paid" : "unpaid" },
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
    name: "فروشنده فیلتر",
    phone: PHONES.seller,
    handle: "flt_seller_a",
    role: "seller",
    isVerified: true,
  });
  const profile = await SellerProfile.create({
    userId: seller._id,
    storeName: "فروشگاه فیلترها",
    slug: "flt-shop",
    status: "active",
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  sellerId = profile._id;
  sellerToken = TOKEN_OF(seller);

  const other = await User.create({
    name: "فروشنده دیگر",
    phone: PHONES.other,
    handle: "flt_seller_b",
    role: "seller",
    isVerified: true,
  });
  const otherProfile = await SellerProfile.create({
    userId: other._id,
    storeName: "فروشگاه دیگر",
    slug: "flt-shop-2",
    status: "active",
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });

  seedNow = Date.now();
  // Seller A
  await seedOrder({
    sellerId,
    sellerUserId: seller._id,
    createdAt: new Date(seedNow - 10 * DAY),
    status: "pending",
    total: 100000,
    paid: false,
  });
  await seedOrder({
    sellerId,
    sellerUserId: seller._id,
    createdAt: new Date(seedNow - 5 * DAY),
    status: "delivered",
    total: 250000,
    paid: true,
  });
  await seedOrder({
    sellerId,
    sellerUserId: seller._id,
    createdAt: new Date(seedNow - 2 * DAY),
    status: "shipped",
    total: 300000,
    paid: true,
  });
  // Seller B — must never appear under any of A's filters
  await seedOrder({
    sellerId: otherProfile._id,
    sellerUserId: other._id,
    createdAt: new Date(seedNow - 5 * DAY),
    status: "delivered",
    total: 99000000,
    paid: true,
  });
});

afterAll(async () => {
  await wipe();
  await mongoose.connection.close();
});

function get(qs) {
  return request(app)
    .get(`/api/seller/orders${qs}`)
    .set("Authorization", AUTH(sellerToken));
}

describe("advanced order filters", () => {
  it("filters by creation window", async () => {
    const from = new Date(seedNow - 5 * DAY).toISOString();
    const to = new Date(seedNow - 5 * DAY + 1000).toISOString();
    const res = await get(`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((o) => o.id);
    expect(ids).toHaveLength(1);
  });

  it("filters by payment status", async () => {
    const paid = await get("?payment=paid");
    expect(paid.status).toBe(200);
    const paidIds = paid.body.items.map((o) => o.id);
    expect(paidIds).toHaveLength(2);

    const unpaid = await get("?payment=unpaid");
    expect(unpaid.body.items).toHaveLength(1);
  });

  it("filters by total amount range (inclusive)", async () => {
    const res = await get("?minTotal=200000&maxTotal=290000");
    expect(res.status).toBe(200);
    const totals = res.body.items.map((o) => o.total);
    expect(totals).toEqual([250000]);
  });

  it("combines status + amount + payment filters", async () => {
    const res = await get("?status=delivered&payment=paid&minTotal=200000");
    expect(res.status).toBe(200);
    const items = res.body.items;
    expect(items).toHaveLength(1);
    expect(items[0].total).toBe(250000);
  });

  it("tolerates blank/invalid date and amount params", async () => {
    const res = await get("?from=not-a-date&minTotal=abc&to=");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3); // all three of A's orders, no crash
  });

  it("never leaks another seller's orders through any filter", async () => {
    const res = await get("?payment=paid&minTotal=1");
    expect(res.status).toBe(200);
    const totals = res.body.items.map((o) => o.total);
    expect(totals).not.toContain(99000000);
  });
});