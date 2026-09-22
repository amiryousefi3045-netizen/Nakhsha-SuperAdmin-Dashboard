const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const OtpCode = require("../models/OtpCode");
const { createOrder } = require("../services/OrderService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Orders & Fulfillment — HTTP integration tests for the seller surface.
 *
 * Order creation is exercised through OrderService.createOrder (the buyer
 * checkout is a later phase); these tests cover the seller-facing read/detail/
 * status-transition/fulfillment endpoints plus authN/authZ, ownership, and
 * invalid-transition semantics.
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
  seller: "09147000002",
  seller2: "09147000003",
  creator: "09147000004",
  noProfileSeller: "09147000006",
};

let sellerUser;
let sellerToken;
let sellerProfile;
let seller2User;
let seller2Token;
let creatorToken;
let noProfileSellerToken;
let trackedProductId;

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
  await Product.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({ action: { $in: ["ORDER_STATUS_CHANGED"] } });

  sellerUser = await User.create({
    name: "فروشنده اصلی سفارش",
    phone: PHONES.seller,
    handle: "seller_orders",
    role: "seller",
    isVerified: true,
  });
  sellerToken = TOKEN_OF(sellerUser);

  sellerProfile = await SellerProfile.create({
    userId: sellerUser._id,
    storeName: "فروشگاه سفارش",
    status: "active",
    verification: { status: "verified" },
  });

  seller2User = await User.create({
    name: "فروشنده دوم سفارش",
    phone: PHONES.seller2,
    handle: "seller2_orders",
    role: "seller",
    isVerified: true,
  });
  seller2Token = TOKEN_OF(seller2User);

  await SellerProfile.create({
    userId: seller2User._id,
    storeName: "فروشگاه دوم سفارش",
    status: "active",
    verification: { status: "verified" },
  });

  const creatorUser = await User.create({
    name: "کریتور سفارش",
    phone: PHONES.creator,
    handle: "creator_orders",
    role: "creator",
    creatorType: "artisan",
    isVerified: true,
  });
  creatorToken = TOKEN_OF(creatorUser);

  const noProfileSeller = await User.create({
    name: "فروشنده بدون پروفایل سفارش",
    phone: PHONES.noProfileSeller,
    handle: "seller_noprofile_orders",
    role: "seller",
    isVerified: true,
  });
  noProfileSellerToken = TOKEN_OF(noProfileSeller);

  const product = await Product.create({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser._id,
    title: "کوزه سفالی",
    price: 120000,
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  trackedProductId = product._id;

  // Seed two orders for seller 1 (via the real service so stock is reserved).
  await createOrder({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser._id,
    customer: { name: "مریم احمدی", phone: "09121111111" },
    items: [{ productId: trackedProductId, qty: 2 }],
  });
  await createOrder({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser._id,
    customer: { name: "رضا کریمی", phone: "09122222222" },
    items: [{ productId: trackedProductId, qty: 3 }],
  });
});

afterAll(async () => {
  await OtpCode.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({ action: { $in: ["ORDER_STATUS_CHANGED"] } });
  await mongoose.connection.close();
});

// ── Guards ──────────────────────────────────────────────────────────────────

describe("Orders — authN / authZ guards", () => {
  it("rejects an unauthenticated request with 401", async () => {
    await request(app).get("/api/seller/orders").expect(401);
  });

  it("rejects a non-seller role with 403", async () => {
    const res = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", AUTH(creatorToken))
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a seller with no profile (403 SELLER_PROFILE_REQUIRED)", async () => {
    const res = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", AUTH(noProfileSellerToken))
      .expect(403);
    expect(res.body.error.code).toBe("SELLER_PROFILE_REQUIRED");
  });

  it("applies the same guards to fulfillment and status writes", async () => {
    await request(app).get("/api/seller/fulfillment").expect(401);
    await request(app)
      .patch(`/api/seller/orders/${new mongoose.Types.ObjectId()}/status`)
      .expect(401);
  });
});

// ── List ────────────────────────────────────────────────────────────────────

describe("GET /api/seller/orders", () => {
  it("returns the seller's own orders with DTO fields", async () => {
    const res = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);

    expect(res.body.items.length).toBe(2);
    expect(res.body.total).toBe(2);
    const order = res.body.items[0];
    expect(order.orderNumber).toBeGreaterThan(0);
    expect(order.customer.name.length).toBeGreaterThan(0);
    expect(order.items[0].price).toBeGreaterThan(0);
    expect(typeof order.subtotal).toBe("number");
    expect(typeof order.total).toBe("number");
    expect(order.status).toBe("pending");
  });

  it("never leaks another seller's orders", async () => {
    const res = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", AUTH(seller2Token))
      .expect(200);
    expect(res.body.items.length).toBe(0);
    expect(res.body.total).toBe(0);
  });

  it("filters by status", async () => {
    const res = await request(app)
      .get("/api/seller/orders?status=cancelled")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.items.length).toBe(0);
    expect(res.body.total).toBe(0);
  });

  it("searches by customer name (q)", async () => {
    const res = await request(app)
      .get("/api/seller/orders?q=%D9%85%D8%B1%DB%8C%D9%85") // "مریم"
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].customer.name).toBe("مریم احمدی");
  });

  it("paginates", async () => {
    const res = await request(app)
      .get("/api/seller/orders?page=1&limit=1")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.total).toBe(2);
    expect(res.body.limit).toBe(1);
  });
});

// ── Detail ──────────────────────────────────────────────────────────────────

describe("GET /api/seller/orders/:id", () => {
  it("returns full detail for the owning seller", async () => {
    const list = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", AUTH(sellerToken));
    const id = list.body.items[0].id;

    const res = await request(app)
      .get(`/api/seller/orders/${id}`)
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.order.id).toBe(id);
    expect(res.body.order.timeline[0].status).toBe("pending");
    expect(res.body.order.itemCount).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for another seller's order (existence hidden)", async () => {
    const list = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", AUTH(sellerToken));
    const id = list.body.items[0].id;

    await request(app)
      .get(`/api/seller/orders/${id}`)
      .set("Authorization", AUTH(seller2Token))
      .expect(404);
  });

  it("returns 400 for a malformed id", async () => {
    await request(app)
      .get("/api/seller/orders/not-an-objectid")
      .set("Authorization", AUTH(sellerToken))
      .expect(400);
  });
});

// ── Status transitions ──────────────────────────────────────────────────────

describe("PATCH /api/seller/orders/:id/status", () => {
  let orderId;

  beforeAll(async () => {
    const product = await Product.create({
      sellerId: sellerProfile._id,
      sellerUserId: sellerUser._id,
      title: "کاسه چوبی",
      price: 90000,
      stock: { onHand: 5, reserved: 0 },
      stockPolicy: "tracked",
      status: "active",
    });
    const order = await createOrder({
      sellerId: sellerProfile._id,
      sellerUserId: sellerUser._id,
      customer: { name: "سارا نادری", phone: "09123333333" },
      items: [{ productId: product._id, qty: 2 }],
    });
    orderId = String(order._id);
  });

  it("applies a valid transition and writes an audit entry", async () => {
    const before = await AuditLog.countDocuments({ action: "ORDER_STATUS_CHANGED" });

    const res = await request(app)
      .patch(`/api/seller/orders/${orderId}/status`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "confirmed", reason: "تایید سفارش" })
      .expect(200);
    expect(res.body.order.status).toBe("confirmed");
    expect(res.body.order.timeline.length).toBe(2);
    expect(res.body.order.timeline[1].status).toBe("confirmed");

    const after = await AuditLog.countDocuments({ action: "ORDER_STATUS_CHANGED" });
    expect(after).toBe(before + 1);
  });

  it("rejects an invalid transition with 409 INVALID_TRANSITION", async () => {
    const res = await request(app)
      .patch(`/api/seller/orders/${orderId}/status`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "shipped" }) // confirmed → shipped is not allowed
      .expect(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects an unknown status value with 400", async () => {
    const res = await request(app)
      .patch(`/api/seller/orders/${orderId}/status`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "nonsense" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when another seller targets the order", async () => {
    await request(app)
      .patch(`/api/seller/orders/${orderId}/status`)
      .set("Authorization", AUTH(seller2Token))
      .send({ status: "confirmed" })
      .expect(404);
  });

  it("walks the full pipeline (confirmed→processing→shipped→delivered) and releases stock", async () => {
    const productId = (await Product.findOne({ title: "کاسه چوبی" }))._id;

    for (const status of ["processing", "shipped", "delivered"]) {
      await request(app)
        .patch(`/api/seller/orders/${orderId}/status`)
        .set("Authorization", AUTH(sellerToken))
        .send({ status })
        .expect(200);
    }

    const after = await Product.findById(productId).lean();
    expect(after.stock.reserved).toBe(0);
    expect(after.stock.onHand).toBe(3);
  });
});

// ── Fulfillment ─────────────────────────────────────────────────────────────

describe("GET /api/seller/fulfillment", () => {
  it("returns real counts and actionable orders", async () => {
    const res = await request(app)
      .get("/api/seller/fulfillment")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);

    expect(res.body.counts).toBeDefined();
    expect(typeof res.body.counts.pending).toBe("number");
    expect(typeof res.body.needAction).toBe("number");
    expect(res.body.needAction).toBe(
      res.body.counts.pending + res.body.counts.confirmed + res.body.counts.processing,
    );
    expect(Array.isArray(res.body.recent)).toBe(true);
    // Every recent order must be actionable/in-transit, never a terminal state.
    for (const order of res.body.recent) {
      expect(["pending", "confirmed", "processing", "shipped"]).toContain(order.status);
    }
  });

  it("counts are seller-scoped (other seller sees zeros)", async () => {
    const res = await request(app)
      .get("/api/seller/fulfillment")
      .set("Authorization", AUTH(seller2Token))
      .expect(200);
    expect(res.body.counts.pending).toBe(0);
    expect(res.body.needAction).toBe(0);
    expect(res.body.recent.length).toBe(0);
  });
});

// ── Finance remains an honest gap (regression) ──────────────────────────────

describe("Finance stays planned", () => {
  it("GET /api/seller/finance still returns 501 planned", async () => {
    const res = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(sellerToken))
      .expect(501);
    expect(res.body.status).toBe("planned");
  });

  it("GET /api/seller/payouts still returns 501 planned", async () => {
    await request(app)
      .get("/api/seller/payouts")
      .set("Authorization", AUTH(sellerToken))
      .expect(501);
  });
});