const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Review = require("../models/Review");
const AuditLog = require("../models/AuditLog");
const OrderService = require("../services/OrderService");
const { ANONYMOUS_NAME } = require("../services/StorefrontReviewService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Product rating & review — HTTP contract tests.
 *
 * The full buyer path is exercised end-to-end: checkout on a published
 * storefront, simulated SUCCESS payment, then the seller (OrderService)
 * walks the order through to delivered, after which a review is allowed.
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
  owner: "09147010011",
  buyerA: "09147010012",
  buyerB: "09147010013",
  stranger: "09147010014",
  buyerC: "09147010015",
};

const PUBLISHED_SETTINGS = {
  storefrontPublished: true,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "bank_transfer",
};
const FINANCE_TERMS = { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 };

let buyerAToken;
let buyerBToken;
let buyerCToken;
let strangerToken;
let productId;
let slug;
let sellerId;
let sellerUserId;

async function wipeReviewData() {
  await Review.deleteMany({});
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({
    action: { $in: ["ORDER_CREATED", "PAYMENT_RECEIVED", "PAYMENT_FAILED"] },
  });
}

async function checkoutAndPay(token, refBody = {}) {
  const checkout = await request(app)
    .post(`/api/storefront/${slug}/checkout`)
    .set("Authorization", AUTH(token))
    .send({
      customer: { name: "خریدار دیدگاه", phone: "09123456789" },
      items: [{ productId, qty: 1 }],
      paymentMethod: "card",
    });
  expect(checkout.body.success).toBe(true);
  const refId = checkout.body.paymentIntent.refId;
  const pay = await request(app)
    .post(`/api/storefront/payments/${refId}/callback`)
    .send({ result: "SUCCESS", reason: "", ...refBody });
  expect(pay.body.success).toBe(true);
  return pay.body.order.id;
}

async function deliver(orderId) {
  let order = orderId;
  for (const next of ["confirmed", "processing", "shipped", "delivered"]) {
    order = await OrderService.transitionOrder({
      orderId: order,
      sellerId,
      nextStatus: next,
      sellerUserId,
    });
  }
  return order;
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
  await wipeReviewData();

  const owner = await User.create({
    name: "مالک دیدگاه",
    phone: PHONES.owner,
    handle: "rew_owner",
    role: "seller",
    isVerified: true,
  });
  sellerUserId = owner._id;

  const store = await SellerProfile.create({
    userId: owner._id,
    storeName: "ویترین دیدگاه نخشا",
    slug: "rew-store",
    status: "active",
    verification: { status: "verified" },
    settings: { ...PUBLISHED_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });
  sellerId = store._id;
  slug = store.slug;

  const product = await Product.create({
    sellerId: store._id,
    sellerUserId: owner._id,
    title: "گلدان سفالی دیدگاه",
    price: 300000,
    category: "pottery",
    stock: { onHand: 50, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  productId = String(product._id);

  const buyerA = await User.create({
    name: "خریدار اول",
    phone: PHONES.buyerA,
    handle: "rew_buyer_a",
    role: "user",
  });
  buyerAToken = TOKEN_OF(buyerA);

  const buyerB = await User.create({
    name: "خریدار دوم",
    phone: PHONES.buyerB,
    handle: "rew_buyer_b",
    role: "user",
  });
  buyerBToken = TOKEN_OF(buyerB);

  const buyerC = await User.create({
    name: "خریدار سوم",
    phone: PHONES.buyerC,
    handle: "rew_buyer_c",
    role: "user",
  });
  buyerCToken = TOKEN_OF(buyerC);

  const stranger = await User.create({
    name: "کسی که نخریده",
    phone: PHONES.stranger,
    handle: "rew_stranger",
    role: "user",
  });
  strangerToken = TOKEN_OF(stranger);
});

afterAll(async () => {
  await wipeReviewData();
  await mongoose.connection.close();
});

describe("POST /api/storefront/products/:productId/review", () => {
  it("requires authentication", async () => {
    const res = await request(app)
      .post(`/api/storefront/products/${productId}/review`)
      .send({ rating: 5 });
    expect(res.status).toBe(401);
  });

  it("rejects a buyer without a delivered purchase (403 REVIEW_NOT_ALLOWED)", async () => {
    const res = await request(app)
      .post(`/api/storefront/products/${productId}/review`)
      .set("Authorization", AUTH(strangerToken))
      .send({ rating: 5, comment: "نخریدم ولی نظر می‌دهم" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("REVIEW_NOT_ALLOWED");
  });

  it("rejects a pending (not yet delivered) order", async () => {
    const orderId = await checkoutAndPay(buyerAToken);
    const res = await request(app)
      .post(`/api/storefront/products/${productId}/review`)
      .set("Authorization", AUTH(buyerAToken))
      .send({ rating: 5 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("REVIEW_NOT_ALLOWED");
    await OrderService.transitionOrder({
      orderId,
      sellerId,
      nextStatus: "cancelled",
      sellerUserId,
    });
  });

  it("rejects an invalid rating value", async () => {
    const res = await request(app)
      .post(`/api/storefront/products/${productId}/review`)
      .set("Authorization", AUTH(buyerAToken))
      .send({ rating: 9 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");

    const res2 = await request(app)
      .post(`/api/storefront/products/${productId}/review`)
      .set("Authorization", AUTH(buyerAToken))
      .send({ rating: "عالی" });
    expect(res2.status).toBe(400);
  });

  it("returns 404 for an unknown product", async () => {
    const res = await request(app)
      .post(`/api/storefront/products/000000000000000000000000/review`)
      .set("Authorization", AUTH(buyerAToken))
      .send({ rating: 5 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("creates a review after a delivered purchase and updates the catalog rating", async () => {
    const orderId = await checkoutAndPay(buyerAToken);
    await deliver(orderId);

    const res = await request(app)
      .post(`/api/storefront/products/${productId}/review`)
      .set("Authorization", AUTH(buyerAToken))
      .send({ rating: 5, comment: "کیفیت عالی بود" });
    expect(res.status).toBe(200);
    expect(res.body.review).toMatchObject({ rating: 5, comment: "کیفیت عالی بود" });
    expect(res.body.rating).toEqual({ average: 5, count: 1 });

    const product = await request(app).get(`/api/storefront/${slug}/products/${productId}`);
    expect(product.body.product.rating).toEqual({ average: 5, count: 1 });
  });

  it("upserts the same buyer's review and aggregates across buyers", async () => {
    const orderB = await checkoutAndPay(buyerBToken);
    await deliver(orderB);

    // Buyer A edits their earlier review 5 → 3.
    const edit = await request(app)
      .post(`/api/storefront/products/${productId}/review`)
      .set("Authorization", AUTH(buyerAToken))
      .send({ rating: 3, comment: "به‌روزرسانی" });
    expect(edit.body.rating).toEqual({ average: 3, count: 1 });

    const reviews = await Review.find({ productId });
    expect(reviews).toHaveLength(1);

    // Buyer B adds a 5 → aggregate (3 + 5) / 2 = 4.
    const add = await request(app)
      .post(`/api/storefront/products/${productId}/review`)
      .set("Authorization", AUTH(buyerBToken))
      .send({ rating: 5, comment: "بسیار عالی" });
    expect(add.body.rating).toEqual({ average: 4, count: 2 });

    // Storefront profile stats reflect the same roll-up.
    const store = await request(app).get(`/api/storefront/${slug}`);
    expect(store.body.storefront.stats).toEqual(
      expect.objectContaining({ averageRating: 4, ratingCount: 2 }),
    );
  });

  it("hides the name for anonymous reviews", async () => {
    await request(app)
      .post(`/api/storefront/products/${productId}/review`)
      .set("Authorization", AUTH(buyerAToken))
      .send({ rating: 3, comment: "مخفی", isAnonymous: true });

    const list = await request(app).get(
      `/api/storefront/products/${productId}/reviews`,
    );
    const mine = list.body.items.find((r) => r.comment === "مخفی");
    expect(mine.isAnonymous).toBe(true);
    expect(mine.buyerName).toBe(ANONYMOUS_NAME);
  });
});

describe("GET /api/storefront/products/:productId/reviews", () => {
  it("is public and paginated with the rating block", async () => {
    const res = await request(app).get(
      `/api/storefront/products/${productId}/reviews?page=1&limit=10`,
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.rating.average).toBe("number");
    expect(res.body.rating.count).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for an unknown product", async () => {
    const res = await request(app).get(
      `/api/storefront/products/000000000000000000000000/reviews`,
    );
    expect(res.status).toBe(404);
  });

  it("rejects an out-of-range page", async () => {
    const res = await request(app).get(
      `/api/storefront/products/${productId}/reviews?page=0`,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/storefront/products/:productId/review/mine", () => {
  it("returns canReview false + the review when already submitted", async () => {
    const res = await request(app)
      .get(`/api/storefront/products/${productId}/review/mine`)
      .set("Authorization", AUTH(buyerAToken));
    expect(res.status).toBe(200);
    expect(res.body.hasDeliveredPurchase).toBe(true);
    expect(res.body.canReview).toBe(false);
    expect(res.body.review).not.toBeNull();
  });

  it("returns canReview true for a fulfilled buyer who has not reviewed yet", async () => {
    const orderC = await checkoutAndPay(buyerCToken);
    await deliver(orderC);

    const res = await request(app)
      .get(`/api/storefront/products/${productId}/review/mine`)
      .set("Authorization", AUTH(buyerCToken));
    expect(res.body.hasDeliveredPurchase).toBe(true);
    expect(res.body.canReview).toBe(true);
    expect(res.body.review).toBeNull();
  });

  it("returns no purchase for a stranger and blocks anonymous", async () => {
    const res = await request(app)
      .get(`/api/storefront/products/${productId}/review/mine`)
      .set("Authorization", AUTH(strangerToken));
    expect(res.body.canReview).toBe(false);
    expect(res.body.hasDeliveredPurchase).toBe(false);
    expect(res.body.review).toBeNull();

    const anon = await request(app).get(
      `/api/storefront/products/${productId}/review/mine`,
    );
    expect(anon.status).toBe(401);
  });
});