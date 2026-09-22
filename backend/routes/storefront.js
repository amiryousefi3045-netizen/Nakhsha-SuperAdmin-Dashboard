const express = require("express");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { heavyLimiter } = require("../middleware/rateLimiter");
const {
  getStorefront,
  getStorefrontProducts,
  getStorefrontProduct,
} = require("../controllers/StorefrontController");
const { PRODUCT_CATEGORIES } = require("../services/StorefrontService");

/**
 * Public storefront — read-only window into a seller's published shop.
 * No authentication: guests and buyers browse the catalog. The publish gate
 * (settings.storefrontPublished + status active) is enforced in the service
 * and every non-visible store answers 404, never leaking existence.
 */

const SLUG_PATTERN = /^[a-z0-9\u0600-\u06FF]+(?:-[a-z0-9\u0600-\u06FF]+)*$/i;

const slugField = z
  .string({ required_error: "اسلاگ فروشگاه الزامی است" })
  .trim()
  .min(1, "اسلاگ فروشگاه نامعتبر است")
  .max(100, "اسلاگ فروشگاه نامعتبر است")
  .regex(SLUG_PATTERN, "اسلاگ فروشگاه نامعتبر است");

const storefrontParamsSchema = z.object({ slug: slugField });

const storefrontProductParamsSchema = z.object({
  slug: slugField,
  productId: z
    .string({ required_error: "شناسه محصول الزامی است" })
    .regex(/^[0-9a-f]{24}$/i, "شناسه محصول نامعتبر است"),
});

const storefrontProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "صفحه باید عدد صحیح مثبت باشد").default(1),
  limit: z.coerce.number().int().min(1, "تعداد در هر صفحه باید بین ۱ تا ۵۰ باشد").max(50, "تعداد در هر صفحه باید بین ۱ تا ۵۰ باشد").default(25),
  q: z.string().trim().max(100, "جستجو نباید بیش از ۱۰۰ کاراکتر باشد").optional(),
  category: z.enum(PRODUCT_CATEGORIES, { errorMap: () => ({ message: "دسته‌بندی نامعتبر است" }) }).optional(),
  sort: z.enum(["newest", "priceAsc", "priceDesc"], { errorMap: () => ({ message: "ترتیب نمایش نامعتبر است" }) }).default("newest"),
});

const router = express.Router();

router.get(
  "/:slug",
  heavyLimiter,
  validate(storefrontParamsSchema, "params"),
  getStorefront,
);

router.get(
  "/:slug/products",
  heavyLimiter,
  validate(storefrontParamsSchema, "params"),
  validate(storefrontProductsQuerySchema, "query"),
  getStorefrontProducts,
);

router.get(
  "/:slug/products/:productId",
  heavyLimiter,
  validate(storefrontProductParamsSchema, "params"),
  getStorefrontProduct,
);

module.exports = router;