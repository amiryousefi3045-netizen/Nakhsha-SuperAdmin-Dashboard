const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Buyer checkout + simulated payment — HTTP contract tests.
 *
 * The flow: authenticated checkout on a published storefront reserves stock
 * and returns a mock payment intent; a public callback endpoint applies the
 * gateway result (SUCCESS marks paid, FAIL cancels + restores) idempotently;
 * the buyer can then fetch their own order receipt.
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
  owner: "09147010001",
  buyer: "09147010002",
  otherBuyer: "09147010003",
  altOwner: "09147010004",
  hiddenOwner: "09147010005",
};

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

let ownerToken;
let buyerUserId;
let buyerToken;
let otherBuyerToken;
let trackedProductId;
let altProductId;

async function wipeBuyerData() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({
    action: { $in: ["ORDER_CREATED", "PAYMENT_RECEIVED", "PAYMENT_FAILED"] },
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
  await wipeBuyerData();

  const owner = await User.create({
    name: "مالک ویترین خرید",
    phone: PHONES.owner,
    handle: "buyer_owner",
    role: "seller",
    isVerified: true,
  });
  ownerToken = TOKEN_OF(owner);

  const publishedStore = await SellerProfile.create({
    userId: owner._id,
    storeName: "ویترین خرید نخشا",
    slug: "buy-store",
    description: "فروشگاه برای تست خرید",
    status: "active",
    verification: { status: "verified" },
    settings: { ...PUBLIC_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  const trackedProduct = await Product.create({
    sellerId: publishedStore._id,
    sellerUserId: owner._id,
    title: "گلدان سفالی قابل خرید",
    price: 500000,
    category: "pottery",
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  trackedProductId = String(trackedProduct._id);

  const hiddenOwner = await User.create({
    name: "مالک مخفی خرید",
    phone: PHONES.hiddenOwner,
    handle: "buyer_hidden_owner",
    role: "seller",
    isVerified: true,
  });
  await SellerProfile.create({
    userId: hiddenOwner._id,
    storeName: "ویترین مخفی خرید",
    slug: "hidden-shop",
    status: "active",
    verification: { status: "verified" },
    settings: { ...PRIVATE_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  // Another seller's store — used for the "not available here" rule.
  const altOwner = await User.create({
    name: "مالک دیگر خرید",
    phone: PHONES.altOwner,
    handle: "buyer_alt_owner",
    role: "seller",
    isVerified: true,
  });
  const altStore = await SellerProfile.create({
    userId: altOwner._id,
    storeName: "فروشگاه دیگر خرید",
    slug: "other-buy-store",
    status: "active",
    verification: { status: "verified" },
    settings: { ...PUBLIC_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });
  const altProduct = await Product.create({
    sellerId: altStore._id,
    sellerUserId: altOwner._id,
    title: "محصول از فروشگاه دیگر",
    price: 100000,
    category: "pottery",
    stock: { onHand: 5, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  altProductId = String(altProduct._id);

  const buyer = await User.create({
    name: "خریدار نخشا",
    phone: PHONES.buyer,
    handle: "buyer_main",
    role: "user",
    isVerified: true,
  });
  buyerUserId = String(buyer._id);
  buyerToken = TOKEN_OF(buyer);

  const otherBuyer = await User.create({
    name: "خریدار دیگر",
    phone: PHONES.otherBuyer,
    handle: "buyer_other",
    role: "user",
    isVerified: true,
  });
  otherBuyerToken = TOKEN_OF(otherBuyer);
});

afterAll(async () => {
  await wipeBuyerData();
  await mongoose.connection.close();
});

const CHECKOUT_BODY = {
  customer: { name: "خریدار محمدی", phone: "09123456789" },
  items: [],
  paymentMethod: "card",
};

describe("POST /api/storefront/:slug/checkout", () => {
  it("creates a pending unpaid order with a mock payment intent", async () => {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({
        ...CHECKOUT_BODY,
        items: [{ productId: trackedProductId, qty: 2 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order).toBeDefined();
    expect(res.body.order.origin).toBe("storefront");
    expect(res.body.order.buyerUserId).toBe(buyerUserId);
    expect(res.body.order.status).toBe("pending");
    expect(res.body.order.total).toBe(1000000);
    expect(res.body.order.payment.status).toBe("unpaid");
    expect(res.body.order.payment.provider).toBe("mock");
    expect(res.body.order.payment.refId).toBe(res.body.order.id);

    expect(res.body.paymentIntent.refId).toBe(res.body.order.id);
    expect(res.body.paymentIntent.amount).toBe(1000000);
    expect(res.body.paymentIntent.provider).toBe("mock");
  });

  it("reserves stock (available drops on the public catalog)", async () => {
    const before = (await Product.findById(trackedProductId)).stock;
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({
        ...CHECKOUT_BODY,
        items: [{ productId: trackedProductId, qty: 1 }],
      });
    expect(res.status).toBe(200);

    const after = (await Product.findById(trackedProductId)).stock;
    expect(after.onHand).toBe(before.onHand - 1);
    expect(after.reserved).toBe(before.reserved + 1);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .send({ ...CHECKOUT_BODY, items: [{ productId: trackedProductId, qty: 1 }] });
    expect(res.status).toBe(401);
  });

  it("answers 404 for an unpublished storefront", async () => {
    const res = await request(app)
      .post("/api/storefront/hidden-shop/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({ ...CHECKOUT_BODY, items: [{ productId: trackedProductId, qty: 1 }] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("STORE_NOT_FOUND");
  });

  it("answers 404 for an unknown slug", async () => {
    const res = await request(app)
      .post("/api/storefront/no-such/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({ ...CHECKOUT_BODY, items: [{ productId: trackedProductId, qty: 1 }] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("STORE_NOT_FOUND");
  });

  it("blocks a seller from buying from their own store", async () => {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(ownerToken))
      .send({ ...CHECKOUT_BODY, items: [{ productId: trackedProductId, qty: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SELF_PURCHASE");
  });

  it("rejects an insufficient stock quantity", async () => {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({ ...CHECKOUT_BODY, items: [{ productId: trackedProductId, qty: 60 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  });

  it("validates customer name/phone", async () => {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({
        customer: { name: "بدون تلفن", phone: "123" },
        items: [{ productId: trackedProductId, qty: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a product that is not on sale in this storefront", async () => {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({ ...CHECKOUT_BODY, items: [{ productId: altProductId, qty: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PRODUCT_NOT_AVAILABLE");
  });
});

describe("POST /api/storefront/payments/:refId/callback", () => {
  async function checkoutFor() {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({ ...CHECKOUT_BODY, items: [{ productId: trackedProductId, qty: 1 }] });
    expect(res.status).toBe(200);
    return res.body.order;
  }

  it("marks the order paid on SUCCESS and is idempotent", async () => {
    const order = await checkoutFor();
    const refId = order.id;

    const res = await request(app)
      .post(`/api/storefront/payments/${refId}/callback`)
      .send({ result: "SUCCESS" });
    expect(res.status).toBe(200);
    expect(res.body.order.payment.status).toBe("paid");
    expect(res.body.applied).toBe(true);
    expect(res.body.order.status).toBe("pending");

    const again = await request(app)
      .post(`/api/storefront/payments/${refId}/callback`)
      .send({ result: "SUCCESS" });
    expect(again.body.applied).toBe(false);
    expect(await AuditLog.countDocuments({ action: "PAYMENT_RECEIVED" })).toBe(1);
  });

  it("cancels + restores stock on FAIL", async () => {
    const before = (await Product.findById(trackedProductId)).stock;
    const order = await checkoutFor();

    const res = await request(app)
      .post(`/api/storefront/payments/${order.id}/callback`)
      .send({ result: "FAIL", reason: "عدم موجودی کارت" });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("cancelled");
    expect(res.body.order.payment.status).toBe("unpaid");

    const after = (await Product.findById(trackedProductId)).stock;
    expect(after.onHand).toBe(before.onHand);
    expect(after.reserved).toBe(before.reserved);
    expect(await AuditLog.countDocuments({ action: "PAYMENT_FAILED" })).toBeGreaterThan(0);
  });

  it("answers 404 for an unknown refId", async () => {
    const res = await request(app)
      .post(`/api/storefront/payments/${new mongoose.Types.ObjectId().toHexString()}/callback`)
      .send({ result: "SUCCESS" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PAYMENT_NOT_FOUND");
  });

  it("validates the result value", async () => {
    const res = await request(app)
      .post(`/api/storefront/payments/${new mongoose.Types.ObjectId().toHexString()}/callback`)
      .send({ result: "MAYBE" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/storefront/orders/:orderId", () => {
  it("returns the buyer's own order receipt", async () => {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({ ...CHECKOUT_BODY, items: [{ productId: trackedProductId, qty: 1 }] });
    const orderId = res.body.order.id;

    const receipt = await request(app)
      .get(`/api/storefront/orders/${orderId}`)
      .set("Authorization", AUTH(buyerToken));
    expect(receipt.status).toBe(200);
    expect(receipt.body.order.id).toBe(orderId);
    expect(receipt.body.order.buyerUserId).toBe(buyerUserId);
    expect(receipt.body.order.items).toHaveLength(1);
    expect(receipt.body.order.payment.status).toBe("unpaid");
  });

  it("hides orders of other buyers", async () => {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({ ...CHECKOUT_BODY, items: [{ productId: trackedProductId, qty: 1 }] });
    const orderId = res.body.order.id;

    const receipt = await request(app)
      .get(`/api/storefront/orders/${orderId}`)
      .set("Authorization", AUTH(otherBuyerToken));
    expect(receipt.status).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .get(`/api/storefront/orders/${new mongoose.Types.ObjectId().toHexString()}`);
    expect(res.status).toBe(401);
  });
});

describe("seam: storefront orders flow into the seller dashboard", () => {
  it("lists the buyer order in the seller's order catalog", async () => {
    const res = await request(app)
      .post("/api/storefront/buy-store/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({ ...CHECKOUT_BODY, items: [{ productId: trackedProductId, qty: 1 }] });
    const order = res.body.order;

    const list = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", AUTH(ownerToken));
    expect(list.status).toBe(200);
    expect(list.body.items.map((o) => o.orderNumber)).toContain(order.orderNumber);
    expect(list.body.items.find((o) => o.orderNumber === order.orderNumber).origin).toBe("storefront");
  });
});