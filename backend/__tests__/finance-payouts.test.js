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
 * Finance & Payouts — HTTP integration tests for the seller surface.
 * The money math and business rules live in FinanceService and are covered by
 * finance-unit.test.js; these tests pin the HTTP contract (routes, guards,
 * ownership, audit trail). Every stateful test wipes the financial ledger and
 * reseeds only what it needs so tests never depend on one another.
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
  seller: "09147000011",
  seller2: "09147000012",
  creator: "09147000013",
  noProfileSeller: "09147000015",
};

let sellerUser;
let sellerToken;
let sellerProfile;
let seller2User;
let seller2Token;
let creatorToken;
let noProfileSellerToken;

async function deliverAnOrder(profile, userId, price = 1000000) {
  const product = await Product.create({
    sellerId: profile._id,
    sellerUserId: userId,
    title: "سفال مالی",
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

async function wipeLedger() {
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await AuditLog.deleteMany({ action: { $in: ["PAYOUT_REQUESTED", "PAYOUT_CANCELLED"] } });
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

  sellerUser = await User.create({
    name: "فروشنده اصلی مالی",
    phone: PHONES.seller,
    handle: "seller_fin",
    role: "seller",
    isVerified: true,
  });
  sellerToken = TOKEN_OF(sellerUser);
  sellerProfile = await SellerProfile.create({
    userId: sellerUser._id,
    storeName: "فروشگاه مالی",
    status: "active",
    verification: { status: "verified" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });

  seller2User = await User.create({
    name: "فروشنده دوم مالی",
    phone: PHONES.seller2,
    handle: "seller2_fin",
    role: "seller",
    isVerified: true,
  });
  seller2Token = TOKEN_OF(seller2User);
  await SellerProfile.create({
    userId: seller2User._id,
    storeName: "فروشگاه دوم مالی",
    status: "active",
    verification: { status: "verified" },
  });

  const creatorUser = await User.create({
    name: "کریتور مالی",
    phone: PHONES.creator,
    handle: "creator_fin",
    role: "creator",
    creatorType: "artisan",
    isVerified: true,
  });
  creatorToken = TOKEN_OF(creatorUser);

  const noProfileUser = await User.create({
    name: "فروشنده بدون پروفایل",
    phone: PHONES.noProfileSeller,
    handle: "noseller_fin",
    role: "seller",
    isVerified: true,
  });
  noProfileSellerToken = TOKEN_OF(noProfileUser);
});

beforeEach(wipeLedger);

afterAll(async () => {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await wipeLedger();
});

// ── AuthN / AuthZ ───────────────────────────────────────────────────────────

describe("finance & payout auth guards", () => {
  it("rejects anonymous requests with 401", async () => {
    await request(app).get("/api/seller/finance").expect(401);
    await request(app).get("/api/seller/payouts").expect(401);
    await request(app).post("/api/seller/payouts").send({ amount: 100 }).expect(401);
    await request(app).patch("/api/seller/payouts/000000000000000000000000/cancel").expect(401);
  });

  it("rejects non-seller roles with 403", async () => {
    await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(creatorToken))
      .expect(403);
    await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(creatorToken))
      .send({ amount: 100 })
      .expect(403);
  });

  it("rejects sellers without a SellerProfile with 403", async () => {
    await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(noProfileSellerToken))
      .expect(403);
  });
});

// ── GET /finance ────────────────────────────────────────────────────────────

describe("GET /api/seller/finance", () => {
  it("returns a clean zero envelope before any sales", async () => {
    const res = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    const f = res.body.finance;
    expect(f.currency).toBe("IRR");
    expect(f.gross.delivered).toBe(0);
    expect(f.gross.shipped).toBe(0);
    expect(f.gross.held).toBe(0);
    expect(f.commission.amount).toBe(0);
    expect(f.net.earned).toBe(0);
    expect(f.net.available).toBe(0);
    expect(f.outlaid.total).toBe(0);
    expect(typeof f.asOf).toBe("string");
  });

  it("reflects delivered revenue after a sale (commission left in)", async () => {
    await setFinanceTerms(sellerProfile, { commissionPercent: 10 });
    await deliverAnOrder(sellerProfile, sellerUser._id);

    const res = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);

    const f = res.body.finance;
    expect(f.gross.delivered).toBe(1000000);
    expect(f.commission.percent).toBe(10);
    expect(f.commission.amount).toBe(100000);
    expect(f.net.earned).toBe(900000);
    expect(f.net.available).toBe(900000);
  });

  it("is scoped to the authenticated seller only", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const res = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(seller2Token))
      .expect(200);
    expect(res.body.finance.gross.delivered).toBe(0);
    expect(res.body.finance.net.available).toBe(0);
  });
});

// ── POST /payouts ───────────────────────────────────────────────────────────

describe("POST /api/seller/payouts", () => {
  it("requests a payout and writes an audit trail", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);

    const res = await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 400000, method: "card", note: "تسویه سفارش" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.payout.status).toBe("requested");
    expect(res.body.payout.amount).toBe(400000);
    expect(res.body.payout.method).toBe("card");
    expect(res.body.payout.note).toBe("تسویه سفارش");

    const audit = await AuditLog.findOne({ action: "PAYOUT_REQUESTED", userId: sellerUser._id });
    expect(audit).not.toBeNull();
    expect(audit.metadata.amount).toBe(400000);
  });

  it("leaves the balance reduced by the in-flight request", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 400000 })
      .expect(200);

    const res = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.finance.outlaid.requested).toBe(400000);
    expect(res.body.finance.net.available).toBe(600000);
  });

  it("rejects amounts above the available balance with 400", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 400000 })
      .expect(200);

    const res = await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 900000 })
      .expect(400);
    expect(res.body.error.code).toBe("INSUFFICIENT_PAYOUT_BALANCE");
  });

  it("rejects invalid amounts with 400", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const res = await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 0 })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("enforces the payout minimum with 400 when configured", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    await setFinanceTerms(sellerProfile, { commissionPercent: 0, payoutMinimum: 500000 });

    const res = await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 100000 })
      .expect(400);
    expect(res.body.error.code).toBe("PAYOUT_BELOW_MINIMUM");

    const ok = await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 500000 })
      .expect(200);
    expect(ok.body.payout.status).toBe("requested");
  });
});

// ── GET /payouts ────────────────────────────────────────────────────────────

describe("GET /api/seller/payouts", () => {
  it("lists the seller's payouts with pagination + status filter", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 200000 })
      .expect(200);

    const all = await request(app)
      .get("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(all.body.success).toBe(true);
    expect(all.body.total).toBe(1);
    expect(all.body.items[0].status).toBe("requested");

    const filtered = await request(app)
      .get("/api/seller/payouts?status=cancelled")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(filtered.body.total).toBe(0);
  });

  it("never leaks another seller's payouts", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 200000 })
      .expect(200);

    const res = await request(app)
      .get("/api/seller/payouts")
      .set("Authorization", AUTH(seller2Token))
      .expect(200);
    expect(res.body.total).toBe(0);
  });
});

// ── PATCH /payouts/:id/cancel ───────────────────────────────────────────────

describe("PATCH /api/seller/payouts/:id/cancel", () => {
  async function requestAndGetPayout() {
    const res = await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .send({ amount: 400000 })
      .expect(200);
    return res.body.payout.id;
  }

  it("cancels a requested payout and writes an audit trail", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const id = await requestAndGetPayout();

    const res = await request(app)
      .patch(`/api/seller/payouts/${id}/cancel`)
      .set("Authorization", AUTH(sellerToken))
      .send({ note: "انصراف" })
      .expect(200);

    expect(res.body.payout.status).toBe("cancelled");
    const audit = await AuditLog.findOne({ action: "PAYOUT_CANCELLED", userId: sellerUser._id });
    expect(audit).not.toBeNull();
    expect(String(audit.resource.id)).toBe(id);
  });

  it("restores the balance after cancellation", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const id = await requestAndGetPayout();

    await request(app)
      .patch(`/api/seller/payouts/${id}/cancel`)
      .set("Authorization", AUTH(sellerToken))
      .expect(200);

    const res = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.finance.net.available).toBe(1000000);
  });

  it("rejects cancelling twice with 409", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const id = await requestAndGetPayout();
    await request(app)
      .patch(`/api/seller/payouts/${id}/cancel`)
      .set("Authorization", AUTH(sellerToken))
      .expect(200);

    const res = await request(app)
      .patch(`/api/seller/payouts/${id}/cancel`)
      .set("Authorization", AUTH(sellerToken))
      .expect(409);
    expect(res.body.error.code).toBe("INVALID_PAYOUT_TRANSITION");
  });

  it("is ownership-blind: another seller gets 404", async () => {
    await deliverAnOrder(sellerProfile, sellerUser._id);
    const id = await requestAndGetPayout();

    const res = await request(app)
      .patch(`/api/seller/payouts/${id}/cancel`)
      .set("Authorization", AUTH(seller2Token))
      .expect(404);
    expect(res.body.error.code).toBe("PAYOUT_NOT_FOUND");
  });

  it("rejects a malformed payout id with 400", async () => {
    const res = await request(app)
      .patch("/api/seller/payouts/not-a-valid-id/cancel")
      .set("Authorization", AUTH(sellerToken))
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});