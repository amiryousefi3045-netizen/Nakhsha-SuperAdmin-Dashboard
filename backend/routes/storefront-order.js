const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { heavyLimiter, couponValidateLimiter, shippingQuoteLimiter } = require("../middleware/rateLimiter");
const { ORDER_STATUSES } = require("../models/Order");
const {
  checkout,
  paymentCallback,
  listBuyerOrders,
  getBuyerOrder,
  createBuyerReturn,
  listBuyerReturns,
  validateCoupon,
  quoteShipping,
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

const returnBodySchema = z.object({
  reason: z
    .string({ required_error: "علت مرجوعی الزامی است" })
    .trim()
    .min(5, "علت مرجوعی را کمی کامل‌تر بنویسید")
    .max(1000, "علت مرجوعی نامعتبر است"),
});

const listReturnsQuerySchema = z.object({
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
  // A lookup key only. The amount is decided server-side in OrderService, so a
  // client that tampers with this gains nothing except a validation error.
  couponCode: z.string().trim().max(64, "کد تخفیف نامعتبر است").optional().default(""),
  /**
   * Structured destination (Phase 36). Kept separate from the legacy free-text
   * `customer.address` because a zone has to be matched against a province, a
   * postal code and a coordinate pair — none of which survive a single string.
   * Optional, because pickup legitimately has no destination; the `shipped`
   * transition is where a missing destination is refused.
   */
  shippingAddress: z
    .object({
      receiverName: z.string().trim().max(80, "نام گیرنده نامعتبر است").optional().default(""),
      receiverPhone: z.string().trim().max(20, "شماره گیرنده نامعتبر است").optional().default(""),
      province: z.string().trim().max(80, "استان نامعتبر است").optional().default(""),
      city: z.string().trim().max(80, "شهر نامعتبر است").optional().default(""),
      postalCode: z.string().trim().max(20, "کدپستی نامعتبر است").optional().default(""),
      line1: z.string().trim().max(300, "نشانی نامعتبر است").optional().default(""),
      line2: z.string().trim().max(300, "نشانی نامعتبر است").optional().default(""),
      note: z.string().trim().max(200, "یادداشت نامعتبر است").optional().default(""),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .optional(),
  /**
   * The seller's method KEY. A lookup, never an amount: a tampered body can pick
   * a different method but cannot buy a cheaper one, because the price is
   * computed from the seller's own rate card in ShippingService.
   */
  shippingMethodId: z.string().trim().max(40, "روش ارسال نامعتبر است").optional().default(""),
});

// Delivery preview (Phase 36, P1-08). Takes the basket and the destination
// because a per-kilogram rate cannot be priced without knowing what is in the
// basket. The `shippingAddress` shape is deliberately identical to the checkout
// field, so the client validates one form, not two.
const shippingQuoteBodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().regex(REF_ID_PATTERN, "شناسهٔ کالا نامعتبر است"),
        qty: z.number().int().min(1).max(99),
      }),
    )
    .min(1, "سبد خرید خالی است")
    .max(50, "تعداد اقلام بیش از حد مجاز است"),
  shippingAddress: checkoutBodySchema.shape.shippingAddress,
});

const callbackBodySchema = z.object({  result: z.enum(["SUCCESS", "FAIL"], {
    errorMap: () => ({ message: "نتیجه پرداخت نامعتبر است" }),
  }),
  reason: z.string().trim().max(200, "دلیل نامعتبر است").optional().default(""),
});

// Coupon preview (Phase 35, P1-07). `code` is bounded here so an oversized
// string never reaches the regex guard in the service.
const couponBodySchema = z.object({
  code: z
    .string({ required_error: "کد تخفیف الزامی است" })
    .trim()
    .min(1, "کد تخفیف الزامی است")
    .max(64, "کد تخفیف نامعتبر است"),
  items: z
    .array(
      z.object({
        productId: z.string().regex(REF_ID_PATTERN, "شناسهٔ کالا نامعتبر است"),
        qty: z.number().int().min(1).max(99),
      }),
    )
    .min(1, "سبد خرید خالی است")
    .max(50, "تعداد اقلام بیش از حد مجاز است"),
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

// Coupon preview. `couponValidateLimiter` is the anti-enumeration budget: this
// endpoint answers whether a code is real, so an unlimited version of it is a
// free brute-force oracle against every campaign a seller ever runs.
router.post(
  "/:slug/coupons/validate",
  requireAuth,
  couponValidateLimiter,
  validate(storefrontParamsSchema, "params"),
  validate(couponBodySchema, "body"),
  validateCoupon,
);

// Delivery preview. Authenticated, like checkout, so an anonymous crawler
// cannot walk every seller's rate card; `shippingQuoteLimiter` bounds the cost
// of the ones that are logged in.
router.post(
  "/:slug/shipping/quote",
  requireAuth,
  shippingQuoteLimiter,
  validate(storefrontParamsSchema, "params"),
  validate(shippingQuoteBodySchema, "body"),
  quoteShipping,
);

router.post(
  "/payments/:refId/callback",  heavyLimiter,
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

// Return requests (Phase 33, P1-04). Declared after `/orders/:orderId` because
// they extend that path; the one-segment `/returns` list is safe because this
// router is mounted BEFORE the catalog router (which owns a `/:slug` GET).
router.post(
  "/orders/:orderId/returns",
  requireAuth,
  heavyLimiter,
  validate(orderParamsSchema, "params"),
  validate(returnBodySchema, "body"),
  createBuyerReturn,
);

router.get(
  "/returns",
  requireAuth,
  validate(listReturnsQuerySchema, "query"),
  listBuyerReturns,
);

module.exports = router;