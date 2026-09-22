const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { heavyLimiter } = require("../middleware/rateLimiter");
const {
  submitReview,
  myReview,
  listReviews,
} = require("../controllers/StorefrontReviewController");

/**
 * Buyer product reviews (Phase 14), mounted at the same `/api/storefront`
 * base as the catalog. Every path here starts with a literal `/products/…`
 * segment, so they can never be shadowed by — nor shadow — the catalog's
 * `/:slug`, `/:slug/products` or `/:slug/products/:productId` routes.
 */

const PRODUCT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const productParamsSchema = z.object({
  productId: z
    .string({ required_error: "شناسه محصول الزامی است" })
    .regex(PRODUCT_ID_PATTERN, "شناسه محصول نامعتبر است"),
});

const listReviewsQuerySchema = z.object({
  page: z
    .coerce.number()
    .int("صفحه باید عدد صحیح مثبت باشد")
    .min(1, "صفحه باید عدد صحیح مثبت باشد")
    .default(1),
  limit: z
    .coerce.number()
    .int("تعداد در هر صفحه باید بین ۱ تا ۵۰ باشد")
    .min(1, "تعداد در هر صفحه باید بین ۱ تا ۵۰ باشد")
    .max(50, "تعداد در هر صفحه باید بین ۱ تا ۵۰ باشد")
    .default(10),
});

const reviewBodySchema = z.object({
  rating: z
    .number({ required_error: "امتیاز الزامی است" })
    .int("امتیاز باید عدد صحیح باشد")
    .min(1, "امتیاز باید بین ۱ تا ۵ باشد")
    .max(5, "امتیاز باید بین ۱ تا ۵ باشد"),
  comment: z
    .string()
    .trim()
    .max(1000, "متن دیدگاه نباید بیش از ۱۰۰۰ کاراکتر باشد")
    .optional()
    .default(""),
  isAnonymous: z.boolean().optional().default(false),
});

const router = express.Router();

router.get(
  "/products/:productId/reviews",
  heavyLimiter,
  validate(productParamsSchema, "params"),
  validate(listReviewsQuerySchema, "query"),
  listReviews,
);

router.get(
  "/products/:productId/review/mine",
  requireAuth,
  validate(productParamsSchema, "params"),
  myReview,
);

router.post(
  "/products/:productId/review",
  requireAuth,
  heavyLimiter,
  validate(productParamsSchema, "params"),
  validate(reviewBodySchema, "body"),
  submitReview,
);

module.exports = router;