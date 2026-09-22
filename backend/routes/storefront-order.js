const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { heavyLimiter } = require("../middleware/rateLimiter");
const { ORDER_STATUSES } = require("../models/Order");
const {
  checkout,
  paymentCallback,
  listBuyerOrders,
  getBuyerOrder,
} = require("../controllers/StorefrontOrderController");

/**
 * Buyer storefront checkout surface, mounted at the same `/api/storefront`
 * base as the public catalog. Unlike the catalog (fully public), checkout and
 * the receipt are authenticated; only the mock-gateway callback stays public.
 *
 * Mounted BEFORE the catalog router so the two-segment GET `/orders/:orderId`
 * is never shadowed by the catalog's one-segment GET `/:slug`.
 */

const SLUG_PATTERN = /^[a-z0-9\u0600-\u06FF]+(?:-[a-z0-9\u0600-\u06FF]+)*$/i;
const REF_ID_PATTERN = /^[0-9a-f]{24}$/i;

const slugField = z
  .string({ required_error: "اسلاگ فروشگاه الزامی است" })
  .trim()
  .min(1, "اسلاگ فروشگاه نامعتبر است")
  .max(100, "اسلاگ فروشگاه نامعتبر است")
  .regex(SLUG_PATTERN, "اسلاگ فروشگاه نامعتبر است");

const storefrontParamsSchema = z.object({ slug: slugField });

const callbackParamsSchema = z.object({
  refId: z
    .string({ required_error: "شناسه تراکنش الزامی است" })
    .regex(REF_ID_PATTERN, "شناسه تراکنش نامعتبر است"),
});

const orderParamsSchema = z.object({
  orderId: z
    .string({ required_error: "شناسه سفارش الزامی است" })
    .regex(REF_ID_PATTERN, "شناسه سفارش نامعتبر است"),
});

const listOrdersQuerySchema = z.object({
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
  status: z
    .enum(ORDER_STATUSES, { errorMap: () => ({ message: "وضعیت سفارش نامعتبر است" }) })
    .optional(),
});

const checkoutBodySchema = z.object({
  customer: z
    .object(
      {
        name: z
          .string({ required_error: "نام خریدار الزامی است" })
          .trim()
          .min(2, "نام خریدار الزامی است")
          .max(200, "نام خریدار نامعتبر است"),
        phone: z
          .string({ required_error: "شماره تماس الزامی است" })
          .trim()
          .regex(/^09\d{9}$/, "شماره تماس معتبر نیست"),
        email: z
          .string()
          .trim()
          .max(200, "ایمیل نامعتبر است")
          .refine((v) => !v || /.+@.+\..+/.test(v), "ایمیل معتبر نیست")
          .optional()
          .default(""),
        address: z.string().trim().max(1000, "آدرس نامعتبر است").optional().default(""),
      },
      { required_error: "اطلاعات مشتری الزامی است" },
    ),
  items: z
    .array(
      z.object({
        productId: z
          .string({ required_error: "شناسه محصول الزامی است" })
          .regex(REF_ID_PATTERN, "شناسه محصول نامعتبر است"),
        qty: z
          .number({ required_error: "تعداد الزامی است" })
          .int("تعداد باید عدد صحیح باشد")
          .min(1, "تعداد باید حداقل ۱ باشد")
          .max(99, "تعداد بیش از حد مجاز است"),
      }),
    )
    .min(1, "حداقل یک قلم سفارش الزامی است"),
  paymentMethod: z
    .enum(["card", "wallet", "other"], {
      errorMap: () => ({ message: "روش پرداخت نامعتبر است" }),
    })
    .default("card"),
  customerNote: z.string().trim().max(2000, "یادداشت نامعتبر است").optional().default(""),
});

const callbackBodySchema = z.object({
  result: z.enum(["SUCCESS", "FAIL"], {
    errorMap: () => ({ message: "نتیجه پرداخت نامعتبر است" }),
  }),
  reason: z.string().trim().max(200, "دلیل نامعتبر است").optional().default(""),
});

const router = express.Router();

router.post(
  "/:slug/checkout",
  requireAuth,
  heavyLimiter,
  validate(storefrontParamsSchema, "params"),
  validate(checkoutBodySchema, "body"),
  checkout,
);

router.post(
  "/payments/:refId/callback",
  heavyLimiter,
  validate(callbackParamsSchema, "params"),
  validate(callbackBodySchema, "body"),
  paymentCallback,
);

router.get(
  "/orders",
  requireAuth,
  validate(listOrdersQuerySchema, "query"),
  listBuyerOrders,
);

router.get(
  "/orders/:orderId",
  requireAuth,
  validate(orderParamsSchema, "params"),
  getBuyerOrder,
);

module.exports = router;