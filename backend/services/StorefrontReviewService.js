/**
 * StorefrontReviewService — buyer ratings & reviews on storefront products.
 *
 * Business rules (each pinned by tests):
 *   - A review is only allowed when the buyer owns a PAID, DELIVERED,
 *     storefront-origin order that contained the product. Anything else —
 *     no order, pending payment, pending order, seller-origin order — answers
 *     REVIEW_NOT_ALLOWED and never leaks whether an order exists.
 *   - One review per buyer per product: the write is an upsert keyed on
 *     { productId, buyerUserId }, so re-submitting edits in place.
 *   - Aggregates are maintained on Product.rating AND SellerProfile.stats
 *     (averageRating/ratingCount) after every write by recomputing from the
 *     published reviews — no float deltas, so they can never drift.
 *   - The public list only ever serves `published` reviews; anonymous reviews
 *     render the generic «کاربر نخشا» label instead of the name.
 */
const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const Product = require("../models/Product");
const SellerProfile = require("../models/SellerProfile");
const Review = require("../models/Review");

const ANONYMOUS_NAME = "کاربر نخشا";

class StorefrontReviewError extends Error {
  /**
   * @param {string} code machine-readable error code
   * @param {string} message Persian user-facing message
   * @param {object} [details]
   */
  constructor(code, message, details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// Aggregation pipelines do NOT benefit from the schema casting that find()
// applies, so id-shaped strings must be coerced to ObjectId explicitly.
function toObjectId(value) {
  try {
    if (typeof value === "string" && /^[0-9a-f]{24}$/i.test(value)) {
      return new mongoose.Types.ObjectId(value);
    }
  } catch {
    /* fall through */
  }
  return value;
}

function roundAverage(raw) {
  return Math.round((raw || 0) * 10) / 10;
}

function isValidRating(rating) {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

/**
 * True only when the buyer has a paid + delivered storefront order carrying
 * this product. This is the single source of truth for the purchase gate.
 */
async function hasDeliveredPurchase(productId, buyerUserId) {
  const hit = await Order.findOne({
    buyerUserId,
    origin: "storefront",
    "payment.status": "paid",
    status: "delivered",
    "items.productId": productId,
  })
    .select("_id")
    .lean();
  return Boolean(hit);
}

/** Recompute Product.rating from the published reviews — always full recompute. */
async function refreshProductRating(productId) {
  const [agg] = await Review.aggregate([
    { $match: { productId: toObjectId(productId), status: "published" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const average = agg && agg.count > 0 ? roundAverage(agg.avg) : 0;
  const count = agg ? agg.count : 0;
  await Product.updateOne(
    { _id: toObjectId(productId) },
    { $set: { "rating.average": average, "rating.count": count } },
  );
  return { average, count };
}

/** Recompute SellerProfile.stats rating block from all of a store's reviews. */
async function refreshSellerRating(sellerId) {
  const [agg] = await Review.aggregate([
    { $match: { sellerId: toObjectId(sellerId), status: "published" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const average = agg && agg.count > 0 ? roundAverage(agg.avg) : 0;
  const count = agg ? agg.count : 0;
  await SellerProfile.updateOne(
    { _id: toObjectId(sellerId) },
    { $set: { "stats.averageRating": average, "stats.ratingCount": count } },
  );
  return { average, count };
}

function reviewToPublicDTO(review) {
  const anonymous = Boolean(review.isAnonymous);
  return {
    id: String(review._id),
    rating: review.rating,
    comment: review.comment || "",
    buyerName: anonymous ? ANONYMOUS_NAME : review.buyerName || "خریدار",
    isAnonymous: anonymous,
    createdAt: review.createdAt,
  };
}

/**
 * Seller-facing DTO — the store owner sees the real buyer name snapshot (the
 * anonymity flag only masks the PUBLIC surface) plus moderation state and the
 * product the review belongs to (joined by the caller).
 */
function reviewToSellerDTO(review) {
  const product = review.productId;
  return {
    id: String(review._id),
    productId: String(product?._id ?? review.productId),
    productTitle: product?.title || "",
    rating: review.rating,
    comment: review.comment || "",
    buyerName: review.buyerName || "خریدار",
    isAnonymous: Boolean(review.isAnonymous),
    status: review.status,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

/**
 * Create or update a buyer's review of a product.
 *
 * @param {object} params
 * @param {string} params.productId
 * @param {string} params.buyerUserId - authenticated buyer user id
 * @param {number} params.rating - 1..5 integer
 * @param {string} [params.comment]
 * @param {boolean} [params.isAnonymous]
 * @returns {Promise<{ review: object, rating: { average: number, count: number } }>}
 */
async function submitReview({
  productId,
  buyerUserId,
  rating,
  comment = "",
  isAnonymous = false,
}) {
  if (!buyerUserId) {
    throw new StorefrontReviewError("VALIDATION_ERROR", "خریدار مشخص نیست");
  }
  if (!isValidRating(rating)) {
    throw new StorefrontReviewError("VALIDATION_ERROR", "امتیاز باید عددی صحیح بین ۱ تا ۵ باشد");
  }
  if (String(comment || "").length > 1000) {
    throw new StorefrontReviewError("VALIDATION_ERROR", "متن دیدگاه نباید بیش از ۱۰۰۰ کاراکتر باشد");
  }

  const product = await Product.findById(productId).select("sellerId sellerUserId").lean();
  if (!product) {
    throw new StorefrontReviewError("PRODUCT_NOT_FOUND", "محصول یافت نشد");
  }

  const purchased = await hasDeliveredPurchase(productId, buyerUserId);
  if (!purchased) {
    throw new StorefrontReviewError(
      "REVIEW_NOT_ALLOWED",
      "برای ثبت دیدگاه باید این کالا را خریداری و تحویل گرفته باشید",
    );
  }

  const buyer = await User.findById(buyerUserId).select("name").lean();
  const buyerName = buyer?.name || "";

  const review = await Review.findOneAndUpdate(
    { productId, buyerUserId },
    {
      $set: {
        sellerId: product.sellerId,
        sellerUserId: product.sellerUserId,
        rating,
        comment: String(comment || "").trim(),
        isAnonymous: Boolean(isAnonymous),
        buyerName,
        status: "published",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  await refreshProductRating(productId);
  await refreshSellerRating(product.sellerId);

  const ratingNow = await Product.findById(productId).select("rating").lean();
  return {
    review: reviewToPublicDTO(review),
    rating: {
      average: ratingNow?.rating?.average ?? 0,
      count: ratingNow?.rating?.count ?? 0,
    },
  };
}

/**
 * The signed-in buyer's own review state for a product.
 *
 * `canReview` is true only when the buyer has a delivered purchase and has not
 * reviewed yet. `hasDeliveredPurchase` is exposed separately so the UI knows
 * whether an existing review is editable.
 */
async function getMyReview({ productId, buyerUserId }) {
  if (!buyerUserId) {
    return { canReview: false, hasDeliveredPurchase: false, review: null };
  }
  const [review, purchased] = await Promise.all([
    Review.findOne({ productId, buyerUserId }).lean(),
    hasDeliveredPurchase(productId, buyerUserId),
  ]);
  return {
    canReview: purchased && !review,
    hasDeliveredPurchase: purchased,
    review: review ? reviewToPublicDTO(review) : null,
  };
}

/**
 * Public, paginated list of a product's published reviews. The overall average
 * is served from the denormalized Product.rating (single-doc read).
 */
async function listProductReviews({ productId, page = 1, limit = 10 }) {
  const product = await Product.findById(productId).select("rating").lean();
  if (!product) {
    throw new StorefrontReviewError("PRODUCT_NOT_FOUND", "محصول یافت نشد");
  }

  const filter = { productId, status: "published" };
  const [items, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return {
    rating: {
      average: product.rating?.average ?? 0,
      count: product.rating?.count ?? 0,
    },
    items: items.map(reviewToPublicDTO),
    total,
    page,
    limit,
  };
}

/**
 * Seller-facing, paginated review list for one store. The seller sees every
 * review (published and hidden) across the store's products with the real
 * buyer name snapshot — anonymity only hides the name from the PUBLIC list.
 *
 * @param {object} params
 * @param {string} params.sellerId
 * @param {number} [params.page] 1-based
 * @param {number} [params.limit]
 * @param {string} [params.status] "published" | "hidden" (all when omitted)
 * @param {string} [params.productId] filter down to one product
 */
async function listSellerReviews({ sellerId, page = 1, limit = 10, status, productId }) {
  const filter = { sellerId: toObjectId(sellerId) };
  if (status === "published" || status === "hidden") filter.status = status;
  if (productId) filter.productId = toObjectId(productId);

  const skip = Math.max(0, (page - 1) * limit);
  const [items, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("productId", "title")
      .lean(),
    Review.countDocuments(filter),
  ]);

  return {
    items: items.map(reviewToSellerDTO).map((dto) => ({
      ...dto,
      productId: String(dto.productId),
    })),
    total,
    page,
    limit,
  };
}

/**
 * Moderate one review: hide or re-publish it. Ownership is enforced on the
 * review's sellerId, so a seller can never touch another store's reviews.
 * Aggregates are recomputed afterwards because the public/product aggregates
 * only ever count `published` reviews.
 */
async function setReviewVisibility({ reviewId, sellerId, status }) {
  if (status !== "published" && status !== "hidden") {
    throw new StorefrontReviewError("VALIDATION_ERROR", "وضعیت دیدگاه نامعتبر است");
  }
  const review = await Review.findOneAndUpdate(
    { _id: toObjectId(reviewId), sellerId: toObjectId(sellerId) },
    { $set: { status } },
    { new: true },
  )
    .populate("productId", "title")
    .lean();
  if (!review) {
    throw new StorefrontReviewError("REVIEW_NOT_FOUND", "دیدگاه یافت نشد");
  }

  await refreshProductRating(review.productId?._id || review.productId);
  await refreshSellerRating(sellerId);

  return {
    ...reviewToSellerDTO(review),
    productId: String(review.productId?._id ?? review.productId),
  };
}

module.exports = {
  StorefrontReviewError,
  ANONYMOUS_NAME,
  hasDeliveredPurchase,
  submitReview,
  getMyReview,
  listProductReviews,
  listSellerReviews,
  setReviewVisibility,
};