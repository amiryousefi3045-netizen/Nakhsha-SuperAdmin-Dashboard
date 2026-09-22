const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payout = require("../models/Payout");
const AuditLog = require("../models/AuditLog");
const OrderService = require("../services/OrderService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Payout settlement queue — HTTP integration tests for the ADMIN surface.
 * Business rules (state machine, balance math) are covered by
 * payouts-admin-unit.test.js; these tests pin the HTTP contract: routes,
 * super_admin guards, listing/filtering, transitions, audit trail and that the
 * seller side stays consistent after an admin decision.
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
  admin: "09147000021",
  seller: "09147000022",
  seller2: "09147000023",
  creator: "09147000024",
};

let adminUser;
let adminToken;
let sellerUser;
let sellerToken;
let sellerProfile;
let seller2User;
let seller2Profile;
let creatorToken;

async function deliverAnOrder(profile, userId, price = 1000000) {
  const product = await Product.create({
    sellerId: profile._id,
    sellerUserId: userId,
    title: "سفال تسویه ادمین",
    price,
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  const order = await OrderService.createOrder({
    sellerId: profile._id,
    sellerUserId: userId,
    customer: { name: "علی", phone: "09120000001" },
    items: [{ productId: String(product._id), qty: 1 }],
  });
  for (const step of ["confirmed", "processing", "shipped", "delivered"]) {
    await OrderService.transitionOrder({
      orderId: String(order._id),
      sellerId: profile._id,
      nextStatus: step,
      sellerUserId: userId,
    });
  }
  return order;
}

async function setFinanceTerms(profile, over = {}) {
  await SellerProfile.findByIdAndUpdate(profile._id, {
    $set: { finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0, ...over } },
  });
}

async function requestPayoutAsSeller(profile, userId, token, amount) {
  const res = await request(app)
    .post("/api/seller/payouts")
    .set("Authorization", AUTH(token))
    .send({ amount, method: "bank_transfer" })
    .expect(200);
  return res.body.payout;
}

async function wipeLedger() {
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await AuditLog.deleteMany({
    action: { $in: ["PAYOUT_REQUESTED", "PAYOUT_CANCELLED", "PAYOUT_STATUS_CHANGED"] },
  });
  if (sellerProfile) {
    await setFinanceTerms(sellerProfile, { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 });
  }
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

  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await wipeLedger();

  adminUser = await User.create({
    name: "مدیر کل تسویه",
    phone: PHONES.admin,
    handle: "admin_settle",
    role: "super_admin",
    isVerified: true,
  });
  adminToken = TOKEN_OF(adminUser);

  sellerUser = await User.create({
    name: "فروشنده تسویه",
    phone: PHONES.seller,
    handle: "seller_settle",
    role: "seller",
    isVerified: true,
  });
  sellerToken = TOKEN_OF(sellerUser);
  sellerProfile = await SellerProfile.create({
    userId: sellerUser._id,
    storeName: "فروشگاه سیمرغ",
    status: "active",
    verification: { status: "verified" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });

  seller2User = await User.create({
    name: "فروشنده دوم تسویه",
    phone: PHONES.seller2,
    handle: "seller2_settle",
    role: "seller",
    isVerified: true,
  });
  seller2Profile = await SellerProfile.create({
    userId: seller2User._id,
    storeName: "فروشگاه آناهیتا",
    status: "active",
    verification: { status: "verified" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  seller2Token = TOKEN_OF(seller2User);

  const creatorUser = await User.create({
    name: "کریتور تسویه",
    phone: PHONES.creator,
    handle: "creator_settle",
    role: "creator",
    creatorType: "artisan",
    isVerified: true,
  });
  creatorToken = TOKEN_OF(creatorUser);
});

beforeEach(wipeLedger);

afterAll(async () => {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await wipeLedger();
});

// ── AuthN / AuthZ ───────────────────────────────────────────────────────────

describe("admin payout auth guards", () => {
  it("rejects anonymous requests with 401", async () => {
    await request(app).get("/api/admin/payouts").expect(401);
    await request(app).get("/api/admin/payouts/overview").expect(401);
    await request(app).get("/api/admin/payouts/000000000000000000000000").expect(401);
    await request(app)
      .patch("/api/admin/payouts/000000000000000000000000/status")
      .send({ status: "processing" })
      .expect(401);
  });

  it("rejects non-super-admin roles with 403", async () => {
    await request(app)
      .get("/api/admin/payouts")
      .set("Authorization", AUTH(sellerToken))
      .expect(403);
    await request(app)
      .get("/api/admin/payouts/overview")
      .set("Authorization", AUTH(creatorToken))
      .expect(403);
    await request(app)
      .patch("/api/admin/payouts/000000000000000000000000/status")
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "processing" })
      .expect(403);
  });
});

// ── Overview + listing ───────────────────────────────────────────────────────

describe("GET /api/admin/payouts", () => {
  it("returns a clean zero queue before any payouts exist", async () => {
    const res = await request(app)
      .get("/api/admin/payouts")
      .set("Authorization", AUTH(adminToken))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("lists every seller's payouts with seller context", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 400000);

    const res = await request(app)
      .get("/api/admin/payouts")
      .set("Authorization", AUTH(adminToken))
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].seller.storeName).toBe("فروشگاه سیمرغ");
    expect(res.body.items[0].status).toBe("requested");
    expect(res.body.items[0].amount).toBe(400000);
  });

  it("filters by status and by seller store-name", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    await deliverAnOrder(seller2Profile, seller2User._id);
    await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 400000);
    await requestPayoutAsSeller(seller2Profile, seller2User._id, seller2Token, 250000);

    const byStatus = await request(app)
      .get("/api/admin/payouts?status=requested")
      .set("Authorization", AUTH(adminToken))
      .expect(200);
    expect(byStatus.body.total).toBe(2);

    const bySeller = await request(app)
      .get("/api/admin/payouts?seller=آناهیتا")
      .set("Authorization", AUTH(adminToken))
      .expect(200);
    expect(bySeller.body.total).toBe(1);
    expect(bySeller.body.items[0].seller.storeName).toBe("فروشگاه آناهیتا");

    const combined = await request(app)
      .get("/api/admin/payouts?status=requested&seller=سیمرغ")
      .set("Authorization", AUTH(adminToken))
      .expect(200);
    expect(combined.body.total).toBe(1);
  });

  it("validates unknown enum filters with 400", async () => {
    await request(app)
      .get("/api/admin/payouts?status=bogus")
      .set("Authorization", AUTH(adminToken))
      .expect(400);
  });
});

describe("GET /api/admin/payouts/overview", () => {
  it("aggregates per-status counts", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 300000);

    const res = await request(app)
      .get("/api/admin/payouts/overview")
      .set("Authorization", AUTH(adminToken))
      .expect(200);
    const requested = res.body.overview.items.find((s) => s.status === "requested");
    expect(requested.count).toBe(1);
    expect(requested.amount).toBe(300000);
    expect(res.body.overview.items).toHaveLength(5);
  });
});

// ── Detail ──────────────────────────────────────────────────────────────────

describe("GET /api/admin/payouts/:id", () => {
  it("returns the payout, its seller and the balance snapshot", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const payout = await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 300000);

    const res = await request(app)
      .get(`/api/admin/payouts/${payout.id}`)
      .set("Authorization", AUTH(adminToken))
      .expect(200);
    expect(res.body.payout.id).toBe(payout.id);
    expect(res.body.payout.seller.storeName).toBe("فروشگاه سیمرغ");
    expect(res.body.balance.net.available).toBe(700000);
  });

  it("returns 404 for an unknown payout id", async () => {
    await request(app)
      .get(`/api/admin/payouts/${new mongoose.Types.ObjectId()}`)
      .set("Authorization", AUTH(adminToken))
      .expect(404);
  });

  it("returns 400 for a malformed id", async () => {
    await request(app)
      .get("/api/admin/payouts/not-an-objectid")
      .set("Authorization", AUTH(adminToken))
      .expect(400);
  });
});

// ── Status transitions ──────────────────────────────────────────────────────

describe("PATCH /api/admin/payouts/:id/status", () => {
  it("walks requested -> processing -> paid end to end and audits it", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const payout = await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 300000);

    await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "processing" })
      .expect(200);

    const paidRes = await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "paid", reference: "PAY-2026-0001", note: "واریز از سمت بانک" })
      .expect(200);
    expect(paidRes.body.payout.status).toBe("paid");
    expect(paidRes.body.payout.reference).toBe("PAY-2026-0001");
    expect(paidRes.body.payout.decisionNote).toBe("واریز از سمت بانک");

    const sellerView = await request(app)
      .get("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(sellerView.body.items[0].status).toBe("paid");

    const audits = await AuditLog.find({
      action: "PAYOUT_STATUS_CHANGED",
      userId: adminUser._id,
    }).lean();
    expect(audits).toHaveLength(2);
    const [first, second] = audits;
    expect(first.metadata.from).toBe("requested");
    expect(first.metadata.to).toBe("processing");
    expect(second.metadata.from).toBe("processing");
    expect(second.metadata.to).toBe("paid");
    expect(second.metadata.reference).toBe("PAY-2026-0001");
  });

  it("rejects a payout and restores the seller balance", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const payout = await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 400000);

    const before = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(before.body.finance.net.available).toBe(600000);

    await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "rejected", note: "شماره شبا نامعتبر" })
      .expect(200);

    const after = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(after.body.finance.net.available).toBe(1000000);
  });

  it("blocks requested -> paid without passing through processing", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const payout = await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 300000);

    const res = await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "paid", reference: "X" })
      .expect(409);
    expect(res.body.error.code).toBe("INVALID_PAYOUT_TRANSITION");
  });

  it("requires a reference before marking an amount paid", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const payout = await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 300000);
    await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "processing" })
      .expect(200);

    const res = await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "paid" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.field).toBe("reference");
  });

  it("keeps paid terminal after the payout is settled", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const payout = await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 300000);
    await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "processing" })
      .expect(200);
    await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "paid", reference: "R1" })
      .expect(200);

    const res = await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "rejected" })
      .expect(409);
    expect(res.body.error.code).toBe("INVALID_PAYOUT_TRANSITION");
  });

  it("supports processing -> rejected", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const payout = await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 300000);
    await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "processing" })
      .expect(200);

    const res = await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "rejected" })
      .expect(200);
    expect(res.body.payout.status).toBe("rejected");
  });

  it("rejects an unknown target status with 400 (zod)", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const payout = await requestPayoutAsSeller(sellerProfile, sellerUser._id, sellerToken, 300000);
    await request(app)
      .patch(`/api/admin/payouts/${payout.id}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "cancelled" })
      .expect(400);
  });

  it("returns 404 when the payout does not exist", async () => {
    await request(app)
      .patch(`/api/admin/payouts/${new mongoose.Types.ObjectId()}/status`)
      .set("Authorization", AUTH(adminToken))
      .send({ status: "rejected" })
      .expect(404);
  });
});