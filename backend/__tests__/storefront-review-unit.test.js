const mongoose = require("mongoose");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Review = require("../models/Review");
const {
  StorefrontReviewError,
  ANONYMOUS_NAME,
  hasDeliveredPurchase,
  submitReview,
  getMyReview,
  listProductReviews,
} = require("../services/StorefrontReviewService");

/**
 * Product rating & review — service unit tests. The HTTP contract lives in
 * storefront-review.test.js; here we pin the purchase gate, the single-review
 * upsert and the aggregate recompute of Product.rating + SellerProfile.stats.
 */

let buyerA;
let buyerB;
let outsider;

beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  buyerA = new mongoose.Types.ObjectId();
  buyerB = new mongoose.Types.ObjectId();
  outsider = new mongoose.Types.ObjectId();
});

async function makeUser(over = {}) {
  return User.create({
    name: "کاربر دیدگاه",
    phone: `09${String(Math.floor(100000000 + Math.random() * 899999999))}`,
    handle: `rv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    ...over,
  });
}

async function makeSeller() {
  const user = await makeUser({ role: "seller" });
  return SellerProfile.create({
    userId: user._id,
    storeName: `فروشگاه دیدگاه ${Date.now()}`,
    status: "active",
    settings: {
      storefrontPublished: true,
      notificationEmail: true,
      notificationSms: false,
      defaultPayoutMethod: "bank_transfer",
    },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
}

async function makeProduct(profile, over = {}) {
  return Product.create({
    sellerId: profile._id,
    sellerUserId: profile.userId,
    title: "ظرف سفالی",
    price: 200000,
    category: "pottery",
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
    ...over,
  });
}

const CUSTOMER = { name: "خریدار تستی", phone: "09123456789" };

function randomOrderNumber() {
  return Math.floor(Date.now() + Math.random() * 1000);
}

async function makeOrder({
  buyerUserId,
  product,
  profile,
  sellerUserId,
  status = "delivered",
  paymentStatus = "paid",
}) {
  return Order.create({
    sellerId: profile._id,
    sellerUserId,
    origin: "storefront",
    buyerUserId,
    orderNumber: randomOrderNumber(),
    customer: CUSTOMER,
    items: [{ productId: product._id, title: product.title, price: product.price, qty: 1 }],
    subtotal: product.price,
    total: product.price,
    status,
    timeline: [{ status, at: new Date() }],
    payment: { status: paymentStatus, provider: "mock", refId: String(product._id) },
  });
}

async function cleanAll() {
  await Review.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await SellerProfile.deleteMany({});
  await User.deleteMany({ handle: /^rv_/ });
}

beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await mongoose.connection.close();
});

describe("purchase gate (hasDeliveredPurchase)", () => {
  it("is true only for paid + delivered storefront orders with the product", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({ buyerUserId: buyerA, product, profile, sellerUserId: profile.userId });

    expect(await hasDeliveredPurchase(String(product._id), buyerA)).toBe(true);
  });

  it("is false when payment is unpaid", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({
      buyerUserId: buyerA,
      product,
      profile,
      sellerUserId: profile.userId,
      paymentStatus: "unpaid",
    });

    expect(await hasDeliveredPurchase(String(product._id), buyerA)).toBe(false);
  });

  it("is false for an order that has not been delivered", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({
      buyerUserId: buyerA,
      product,
      profile,
      sellerUserId: profile.userId,
      status: "pending",
    });

    expect(await hasDeliveredPurchase(String(product._id), buyerA)).toBe(false);
  });

  it("is false for a seller-origin order even if delivered", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await Order.create({
      sellerId: profile._id,
      sellerUserId: profile.userId,
      origin: "seller",
      buyerUserId: buyerA,
      orderNumber: randomOrderNumber(),
      customer: CUSTOMER,
      items: [{ productId: product._id, title: product.title, price: product.price, qty: 1 }],
      subtotal: product.price,
      total: product.price,
      status: "delivered",
      timeline: [{ status: "delivered", at: new Date() }],
      payment: { status: "paid", provider: "mock", refId: String(product._id) },
    });

    expect(await hasDeliveredPurchase(String(product._id), buyerA)).toBe(false);
  });

  it("is false for a different product in the order", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({ buyerUserId: buyerA, product, profile, sellerUserId: profile.userId });

    expect(await hasDeliveredPurchase(String(new mongoose.Types.ObjectId()), buyerA)).toBe(
      false,
    );
  });
});

describe("submitReview", () => {
  it("creates a review and recomputes product and seller aggregates", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({ buyerUserId: buyerA, product, profile, sellerUserId: profile.userId });
    await makeOrder({ buyerUserId: buyerB, product, profile, sellerUserId: profile.userId });

    await submitReview({
      productId: String(product._id),
      buyerUserId: buyerA,
      rating: 5,
      comment: "کیفیت عالی بود",
    });
    const second = await submitReview({
      productId: String(product._id),
      buyerUserId: buyerB,
      rating: 3,
      comment: "قابل قبول",
    });

    expect(second.rating.average).toBe(4);
    expect(second.rating.count).toBe(2);

    const productAfter = await Product.findById(product._id);
    expect(productAfter.rating.average).toBe(4);
    expect(productAfter.rating.count).toBe(2);

    const sellerAfter = await SellerProfile.findById(profile._id);
    expect(sellerAfter.stats.averageRating).toBe(4);
    expect(sellerAfter.stats.ratingCount).toBe(2);
  });

  it("upserts: a re-submission edits the same review and keeps count at 1", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({ buyerUserId: buyerA, product, profile, sellerUserId: profile.userId });

    await submitReview({ productId: String(product._id), buyerUserId: buyerA, rating: 5 });
    const update = await submitReview({
      productId: String(product._id),
      buyerUserId: buyerA,
      rating: 2,
      comment: "ویرایش",
    });

    const reviews = await Review.find({ productId: product._id });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(2);
    expect(update.rating.average).toBe(2);
    expect(update.rating.count).toBe(1);
  });

  it("rejects a rating outside 1..5 or non-integer", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({ buyerUserId: buyerA, product, profile, sellerUserId: profile.userId });

    await expect(
      submitReview({ productId: String(product._id), buyerUserId: buyerA, rating: 0 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      submitReview({ productId: String(product._id), buyerUserId: buyerA, rating: 6 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      submitReview({ productId: String(product._id), buyerUserId: buyerA, rating: 3.5 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a missing buyer", async () => {
    await expect(
      submitReview({
        productId: String(new mongoose.Types.ObjectId()),
        buyerUserId: "",
        rating: 5,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns PRODUCT_NOT_FOUND for an unknown product", async () => {
    await expect(
      submitReview({
        productId: String(new mongoose.Types.ObjectId()),
        buyerUserId: buyerA,
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(StorefrontReviewError);
    await expect(
      submitReview({
        productId: String(new mongoose.Types.ObjectId()),
        buyerUserId: buyerA,
        rating: 5,
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("blocks buyers without a delivered purchase (REVIEW_NOT_ALLOWED)", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({
      buyerUserId: buyerA,
      product,
      profile,
      sellerUserId: profile.userId,
      status: "pending",
    });

    await expect(
      submitReview({ productId: String(product._id), buyerUserId: buyerA, rating: 5 }),
    ).rejects.toMatchObject({ code: "REVIEW_NOT_ALLOWED" });
    await expect(
      submitReview({
        productId: String(product._id),
        buyerUserId: outsider,
        rating: 5,
      }),
    ).rejects.toMatchObject({ code: "REVIEW_NOT_ALLOWED" });
  });
});

describe("anonymous masking", () => {
  it("hides the buyer name in the public review DTO", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({ buyerUserId: buyerA, product, profile, sellerUserId: profile.userId });

    const { review } = await submitReview({
      productId: String(product._id),
      buyerUserId: buyerA,
      rating: 4,
      comment: "بی‌نام",
      isAnonymous: true,
    });

    expect(review.buyerName).toBe(ANONYMOUS_NAME);
    expect(review.isAnonymous).toBe(true);
  });

  it("shows the snapshot name when not anonymous", async () => {
    const buyer = await makeUser({ name: "امین خریدار" });
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({ buyerUserId: buyer._id, product, profile, sellerUserId: profile.userId });

    const { review } = await submitReview({
      productId: String(product._id),
      buyerUserId: buyer._id,
      rating: 4,
      comment: "با نام",
    });

    expect(review.buyerName).toBe("امین خریدار");
  });
});

describe("listProductReviews", () => {
  it("returns only published reviews, newest first, with the rating block", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({ buyerUserId: buyerA, product, profile, sellerUserId: profile.userId });
    await makeOrder({ buyerUserId: buyerB, product, profile, sellerUserId: profile.userId });
    await submitReview({ productId: String(product._id), buyerUserId: buyerA, rating: 5 });
    await submitReview({ productId: String(product._id), buyerUserId: buyerB, rating: 1 });
    await Review.updateOne(
      { productId: product._id, buyerUserId: buyerA },
      { $set: { status: "hidden" } },
    );

    const result = await listProductReviews({ productId: String(product._id), page: 1, limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.items[0].rating).toBe(1);
    expect(result.rating.count).toBe(2); // denormalized snapshot kept at submit time
  });

  it("paginates", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    for (let i = 0; i < 4; i += 1) {
      const buyer = await makeUser();
      await makeOrder({ buyerUserId: buyer._id, product, profile, sellerUserId: profile.userId });
      await submitReview({
        productId: String(product._id),
        buyerUserId: buyer._id,
        rating: 5 - i,
      });
    }

    const page1 = await listProductReviews({ productId: String(product._id), page: 1, limit: 2 });
    const page2 = await listProductReviews({ productId: String(product._id), page: 2, limit: 2 });

    expect(page1.total).toBe(4);
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
  });

  it("returns PRODUCT_NOT_FOUND for an unknown product", async () => {
    await expect(
      listProductReviews({ productId: String(new mongoose.Types.ObjectId()) }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });
});

describe("getMyReview", () => {
  it("reports no purchase for a stranger", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);

    const mine = await getMyReview({ productId: String(product._id), buyerUserId: outsider });
    expect(mine).toEqual({
      canReview: false,
      hasDeliveredPurchase: false,
      review: null,
    });
  });

  it("reports canReview before reviewing and false after", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    await makeOrder({ buyerUserId: buyerA, product, profile, sellerUserId: profile.userId });

    const before = await getMyReview({ productId: String(product._id), buyerUserId: buyerA });
    expect(before.canReview).toBe(true);
    expect(before.hasDeliveredPurchase).toBe(true);
    expect(before.review).toBeNull();

    await submitReview({ productId: String(product._id), buyerUserId: buyerA, rating: 4 });

    const after = await getMyReview({ productId: String(product._id), buyerUserId: buyerA });
    expect(after.canReview).toBe(false);
    expect(after.hasDeliveredPurchase).toBe(true);
    expect(after.review).toMatchObject({ rating: 4 });
  });
});