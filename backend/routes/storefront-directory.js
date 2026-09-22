const express = require("express");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { heavyLimiter } = require("../middleware/rateLimiter");
const {
  listStorefronts,
} = require("../controllers/StorefrontController");

/**
 * Public storefront directory — discover every published + active shop.
 * No authentication: guests and buyers browse the directory. It is mounted at
 * /api/storefronts (plural) so it never shadows the catalog /:slug routes,
 * and it enforces the same visibility gate (published + active) as the rest
 * of the public storefront surface.
 */

const storefrontsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "صفحه باید عدد صحیح مثبت باشد").default(1),
  limit: z.coerce.number().int().min(1, "تعداد در هر صفحه باید بین ۱ تا ۵۰ باشد").max(50, "تعداد در هر صفحه باید بین ۱ تا ۵۰ باشد").default(25),
  q: z.string().trim().max(100, "جستجو نباید بیش از ۱۰۰ کاراکتر باشد").optional(),
  sort: z.enum(["newest", "rating", "products"], { errorMap: () => ({ message: "ترتیب نمایش نامعتبر است" }) }).default("newest"),
});

const router = express.Router();

router.get(
  "/",
  heavyLimiter,
  validate(storefrontsQuerySchema, "query"),
  listStorefronts,
);

module.exports = router;