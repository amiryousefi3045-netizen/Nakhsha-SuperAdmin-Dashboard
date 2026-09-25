const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Review = require("../models/Review");

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
  seller: "09146700001",
  seller2: "09146700002",
  buyer: "09146700003",
  buyer2: "09146700004",
};

const FINANCE_TERMS = { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 };
const PUBLIC_SETTINGS = {
  storefrontPublished: true,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "bank_transfer",
};

let sellerUser;
let sellerToken;
let sellerProfile;
let seller2User;
let seller2Profile;
let buyerUser;
let buyer2User;
let productA;
let productB;
let reviewA;
let reviewAHidden;
let reviewB;
let reviewOther;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await Review.deleteMany({});
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  process.env.SUPER_ADMIN_PHONE = "09146700099";

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;
  await wipe();

  sellerUser = await User.create({
    name: "فروشنده دیدگاه",
    phone: PHONES.seller,
    handle: "rv_seller_a",
    role: "seller",
  });
  sellerToken = TOKEN_OF(sellerUser);
  sellerProfile = await SellerProfile.create({
    userId: sellerUser._id,
    storeName: "فروشگاه دیدگاه‌ها",
    slug: "rv-shop",
    status: "active",
    settings: { ...PUBLIC_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  seller2User = await User.create({
    name: "فروشنده دیگر",
    phone: PHONES.seller2,
    handle: "rv_seller_b",
    role: "seller",
  });
  seller2Profile = await SellerProfile.create({
    userId: seller2User._id,
    storeName: "فروشگاه دیگر",
    slug: "rv-shop-2",
    status: "active",
    settings: { ...PUBLIC_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  buyerUser = await User.create({
    name: "خریدار دیدگاه",
    phone: PHONES.buyer,
    handle: "rv_buyer",
    role: "user",
  });

  buyer2User = await User.create({
    name: "خریدار دیدگاه دو",
    phone: PHONES.buyer2,
    handle: "rv_buyer_2",
    role: "user",
  });

  productA = await Product.create({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser._id,
    title: "گلدان مسی",
    price: 600000,
    category: "metalwork",
    stock: { onHand: 5, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
    rating: { average: 4.5, count: 2 },
  });
  productB = await Product.create({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser._id,
    title: "سینی چوبی",
    price: 400000,
    category: "woodwork",
    stock: { onHand: 5, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
    rating: { average: 3, count: 1 },
  });
  await Product.create({
    sellerId: seller2Profile._id,
    sellerUserId: seller2User._id,
    title: "محصول فروشگاه دیگر",
    price: 100000,
    category: "other",
    stock: { onHand: 5, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });

  reviewA = await Review.create({
    productId: productA._id,
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser._id,
    buyerUserId: buyerUser._id,
    buyerName: "خریدار دیدگاه",
    rating: 5,
    comment: "کیفیت فوق‌العاده",
    isAnonymous: false,
    status: "published",
  });
  reviewAHidden = await Review.create({
    productId: productA._id,
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser._id,
    buyerUserId: buyer2User._id,
    buyerName: "خریدار دیدگاه دو",
    rating: 4,
    comment: "بهتر می‌شد",
    isAnonymous: true,
    status: "hidden",
  });
  reviewB = await Review.create({
    productId: productB._id,
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser._id,
    buyerUserId: buyerUser._id,
    buyerName: "خریدار دیدگاه",
    rating: 3,
    comment: "خوب اما قابل بهبود",
    isAnonymous: false,
    status: "published",
  });
  reviewOther = await Review.create({
    productId: (await Product.findOne({ title: "محصول فروشگاه دیگر" }))._id,
    sellerId: seller2Profile._id,
    sellerUserId: seller2User._id,
    buyerUserId: buyerUser._id,
    buyerName: "خریدار دیدگاه",
    rating: 2,
    comment: "برای فروشگاه دیگر",
    isAnonymous: false,
    status: "published",
  });
});

afterAll(async () => {
  await wipe();
  await mongoose.connection.close();
});

// ── Auth guards ──────────────────────────────────────────────────────────────

describe("seller reviews auth guards", () => {
  it("401 without a token", async () => {
    await request(app).get("/api/seller/reviews").expect(401);
    await request(app)
      .patch(`/api/seller/reviews/${reviewA._id}/visibility`)
      .expect(401);
  });

  it("403 for a non-seller role", async () => {
    const buyerToken = TOKEN_OF(buyerUser);
    await request(app)
      .get("/api/seller/reviews")
      .set("Authorization", AUTH(buyerToken))
      .expect(403);
  });
});

// ── Listing ──────────────────────────────────────────────────────────────────

describe("GET /api/seller/reviews", () => {
  it("lists the store's reviews with product context (both statuses)", async () => {
    const res = await request(app)
      .get("/api/seller/reviews")
      .set("Authorization", AUTH(sellerToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(25);

    const titles = res.body.items.map((r) => r.productTitle);
    expect(titles).toContain("گلدان مسی");
    expect(titles).toContain("سینی چوبی");
    expect(res.body.items).not.toContainEqual(
      expect.objectContaining({ productId: String(reviewOther.productId) }),
    );
  });

  it("never leaks another store's reviews", async () => {
    const res = await request(app)
      .get("/api/seller/reviews")
      .set("Authorization", AUTH(sellerToken));
    const ids = res.body.items.map((r) => r.id);
    expect(ids).not.toContain(String(reviewOther._id));
  });

  it("filters by status", async () => {
    const published = await request(app)
      .get("/api/seller/reviews?status=published")
      .set("Authorization", AUTH(sellerToken));
    expect(published.body.total).toBe(2);

    const hidden = await request(app)
      .get("/api/seller/reviews?status=hidden")
      .set("Authorization", AUTH(sellerToken));
    expect(hidden.body.total).toBe(1);
    expect(hidden.body.items[0].id).toBe(String(reviewAHidden._id));
  });

  it("filters by product", async () => {
    const res = await request(app)
      .get(`/api/seller/reviews?productId=${productA._id}`)
      .set("Authorization", AUTH(sellerToken));
    expect(res.body.total).toBe(2);
    expect(res.body.items.every((r) => r.productId === String(productA._id))).toBe(true);
  });

  it("paginates with page + limit", async () => {
    const res = await request(app)
      .get("/api/seller/reviews?page=2&limit=2")
      .set("Authorization", AUTH(sellerToken));
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(2);
    expect(res.body.items).toHaveLength(1);
  });

  it("rejects an invalid status filter with 400", async () => {
    const res = await request(app)
      .get("/api/seller/reviews?status=bogus")
      .set("Authorization", AUTH(sellerToken));
    expect(res.status).toBe(400);
  });
});

// ── Visibility moderation ────────────────────────────────────────────────────

describe("PATCH /api/seller/reviews/:id/visibility", () => {
  it("hides a review and updates the aggregates", async () => {
    const res = await request(app)
      .patch(`/api/seller/reviews/${reviewB._id}/visibility`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "hidden" });
    expect(res.status).toBe(200);
    expect(res.body.review.status).toBe("hidden");

    const product = await Product.findById(productB._id).lean();
    expect(product.rating.count).toBe(0);
    expect(product.rating.average).toBe(0);
  });

  it("re-publishes a hidden review in place (idempotent upsert path)", async () => {
    const res = await request(app)
      .patch(`/api/seller/reviews/${reviewB._id}/visibility`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "published" });
    expect(res.status).toBe(200);
    expect(res.body.review.status).toBe("published");
  });

  it("404 for a review the seller does not own", async () => {
    const res = await request(app)
      .patch(`/api/seller/reviews/${reviewOther._id}/visibility`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "hidden" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("REVIEW_NOT_FOUND");
  });

  it("400 for an invalid status", async () => {
    const res = await request(app)
      .patch(`/api/seller/reviews/${reviewA._id}/visibility`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "moderated" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("400 for a malformed review id", async () => {
    const res = await request(app)
      .patch("/api/seller/reviews/not-an-id/visibility")
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "hidden" });
    expect(res.status).toBe(400);
  });

  it("404 for an unknown review id", async () => {
    const res = await request(app)
      .patch(`/api/seller/reviews/${new mongoose.Types.ObjectId()}/visibility`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "hidden" });
    expect(res.status).toBe(404);
  });
});