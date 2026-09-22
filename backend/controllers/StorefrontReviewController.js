const {
  StorefrontReviewError,
  submitReview,
  getMyReview,
  listProductReviews,
} = require("../services/StorefrontReviewService");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const logger = require("../utils/logger");

// Buyer storefront reviews — Phase 14 surface:
//   POST /api/storefront/products/:productId/review       (authenticated)
//   GET  /api/storefront/products/:productId/review/mine  (authenticated)
//   GET  /api/storefront/products/:productId/reviews      (public)

function reviewErrorStatus(code) {
  switch (code) {
    case "PRODUCT_NOT_FOUND":
      return 404;
    case "REVIEW_NOT_ALLOWED":
      return 403;
    default:
      return 400;
  }
}

async function submitReviewHandler(req, res) {
  try {
    const result = await submitReview({
      productId: req.params.productId,
      buyerUserId: req.user.id,
      rating: req.body.rating,
      comment: req.body.comment,
      isAnonymous: req.body.isAnonymous,
    });
    res.json(createSuccessResponse(result, req.id));
  } catch (e) {
    if (e instanceof StorefrontReviewError) {
      return res
        .status(reviewErrorStatus(e.code))
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront submitReview error", {
      error: e.message,
      buyer: req.user?.id,
      productId: req.params?.productId,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function myReviewHandler(req, res) {
  try {
    const result = await getMyReview({
      productId: req.params.productId,
      buyerUserId: req.user.id,
    });
    res.json(createSuccessResponse(result, req.id));
  } catch (e) {
    if (e instanceof StorefrontReviewError) {
      return res
        .status(reviewErrorStatus(e.code))
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront myReview error", {
      error: e.message,
      buyer: req.user?.id,
      productId: req.params?.productId,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function listReviewsHandler(req, res) {
  try {
    const result = await listProductReviews({
      productId: req.params.productId,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
    });
    res.json(createSuccessResponse(result, req.id));
  } catch (e) {
    if (e instanceof StorefrontReviewError) {
      return res
        .status(reviewErrorStatus(e.code))
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront listReviews error", {
      error: e.message,
      productId: req.params?.productId,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

module.exports = {
  submitReview: submitReviewHandler,
  myReview: myReviewHandler,
  listReviews: listReviewsHandler,
};