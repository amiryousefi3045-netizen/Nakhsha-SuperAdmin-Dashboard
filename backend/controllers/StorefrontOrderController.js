const OrderService = require("../services/OrderService");
const ReturnService = require("../services/ReturnService");
const CouponService = require("../services/CouponService");
const ShippingService = require("../services/ShippingService");
const { IRAN_PROVINCES } = require("../utils/iranGeo");
const Product = require("../models/Product");
const SellerProfile = require("../models/SellerProfile");
const AuditService = require("../services/AuditService");
const {
  StorefrontOrderError,
  createBuyerOrder,
  submitPaymentResult,
  listBuyerOrders,
  getBuyerOrder,
} = require("../services/StorefrontOrderService");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const logger = require("../utils/logger");

// Buyer storefront checkout surface. Endpoints are constants:
//   POST /api/storefront/:slug/checkout            (authenticated)
//   POST /api/storefront/payments/:refId/callback  (public — the mock gateway
//                                                   webhook/redirect target)
//   GET  /api/storefront/orders                    (authenticated, own list)
//   GET  /api/storefront/orders/:orderId           (authenticated, own order only)
//   POST /api/storefront/orders/:orderId/returns   (authenticated, own order — P1-04)
//   GET  /api/storefront/returns                   (authenticated, own requests)

/** HTTP mapping for the RMA domain errors on the buyer surface. */
function returnErrorStatus(code) {
  switch (code) {
    case "ORDER_NOT_FOUND":
    case "RETURN_NOT_FOUND":
      return 404;
    case "RETURN_ALREADY_OPEN":
    case "INVALID_RETURN_TRANSITION":
      return 409;
    default:
      return 400;
  }
}

function storefrontOrderErrorStatus(code) {
  switch (code) {
    case "STORE_NOT_FOUND":
    case "PRODUCT_NOT_FOUND":
    case "PAYMENT_NOT_FOUND":
      return 404;
    default:
      return 400;
  }
}

async function checkout(req, res) {
  try {
    const { order, paymentIntent } = await createBuyerOrder({
      slug: req.params.slug,
      buyerUserId: req.user.id,
      customer: req.body.customer,
      items: req.body.items,
      paymentMethod: req.body.paymentMethod,
      customerNote: req.body.customerNote,
      couponCode: req.body.couponCode,
      shippingAddress: req.body.shippingAddress,
      shippingMethodId: req.body.shippingMethodId,
      shippingDiscountCode: req.body.shippingDiscountCode,
    });

    res.json(
      createSuccessResponse(
        {
          order: OrderService.orderToDTO(order),
          paymentIntent,
        },
        req.id,
      ),
    );
  } catch (e) {
    if (e instanceof StorefrontOrderError) {
      return res
        .status(storefrontOrderErrorStatus(e.code))
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    if (e instanceof OrderService.OrderDomainError) {
      const statusMap = {
        INSUFFICIENT_STOCK: 400,
        PRODUCT_NOT_FOUND: 404,
        VALIDATION_ERROR: 400,
        // A bad destination or an unavailable method is a normal checkout
        // outcome: the buyer simply has to correct the address or pick another
        // method. 400 keeps it out of the 5xx noise.
        INVALID_SHIPPING_ADDRESS: 400,
        SHIPPING_METHOD_UNAVAILABLE: 400,
  SHIPPING_NOT_AVAILABLE: 400,
        // Defence in depth: `createOrder` rejects a leftover `shippingFee` key.
        // Reaching this means some caller still passes an amount, which would
        // otherwise become a silently free shipment.
        SHIPPING_FEE_NOT_ACCEPTED: 400,
      };
      return res
        .status(statusMap[e.code] || 400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    // A refused coupon is a normal outcome of a checkout, not a server fault.
    // Without this branch an exhausted or mistyped code would surface as a 500
    // and the buyer would be told to retry a request that can never succeed.
    if (e instanceof CouponService.CouponDomainError) {
      return res
        .status(400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront checkout error", {
      error: e.message,
      buyer: req.user?.id,
      slug: req.params?.slug,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * POST /api/storefront/:slug/coupons/validate — preview a code against a cart.
 *
 * The cart is re-priced HERE, from the store's own live products, and the
 * subtotal is never taken from the request. A client that posts a smaller
 * subtotal to sneak past a minimum-spend rule would otherwise be believed; by
 * deriving the number here, the preview and the eventual checkout necessarily
 * agree, because both call the same pricing path.
 */
async function validateCoupon(req, res) {
  try {
    // The same resolution the checkout path uses, so a preview can never
    // succeed against a store the checkout itself would refuse.
    const profile = await SellerProfile.findOne({
      slug: String(req.params.slug || "").trim().toLowerCase(),
      status: "active",
      "settings.storefrontPublished": true,
    }).select("_id");
    if (!profile) {
      return res
        .status(404)
        .json(createErrorResponse("STORE_NOT_FOUND", "ویترین فروشگاه یافت نشد", null, req.id));
    }

    const productIds = req.body.items.map((i) => i.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      sellerId: profile._id,
      status: "active",
    })
      .select("_id price")
      .lean();

    const byId = new Map(products.map((p) => [String(p._id), p]));
    let subtotal = 0;
    for (const item of req.body.items) {
      const product = byId.get(String(item.productId));
      if (!product) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "PRODUCT_NOT_AVAILABLE",
              "این محصول برای خرید در دسترس نیست",
              { productId: item.productId },
              req.id,
            ),
          );
      }
      subtotal += product.price * item.qty;
    }

    const { coupon, discount } = await CouponService.evaluateCoupon({
      sellerId: profile._id,
      code: req.body.code,
      subtotal,
      buyerUserId: req.user.id,
    });

    res.json(
      createSuccessResponse(
        {
          coupon: {
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            description: coupon.description || "",
          },
          discount,
          subtotal,
          // What the buyer will actually be charged. Sent back so the client
          // never has to do the arithmetic (and cannot get it wrong).
          total: Math.max(0, subtotal - discount),
          currency: "IRR",
        },
        req.id,
      ),
    );
  } catch (e) {
    if (e instanceof CouponService.CouponDomainError) {
      return res
        .status(400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront validateCoupon error", {
      error: e.message,
      buyer: req.user?.id,
      slug: req.params?.slug,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * Shipping preview (Phase 36, P1-08).
 *
 * Answers "what will this basket cost to send to this address" *before* the
 * buyer commits, which is the only reason a storefront like Digikala or
 * Basalam can show a delivery estimate. It is a read: no order, no reservation,
 * no stock touched. The amount in the response is computed from the seller's
 * own rate card, exactly as the checkout will compute it, so the preview cannot
 * promise a number the checkout then contradicts.
 */
async function quoteShipping(req, res) {
  try {
    const profile = await SellerProfile.findOne({
      slug: String(req.params.slug || "").trim().toLowerCase(),
      status: "active",
      "settings.storefrontPublished": true,
    }).select("_id");
    if (!profile) {
      return res
        .status(404)
        .json(createErrorResponse("STORE_NOT_FOUND", "فروشگاه مورد نظر یافت نشد", null, req.id));
    }

    const productIds = req.body.items.map((i) => i.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      sellerId: profile._id,
      status: "active",
    })
      .select("_id price shipping.weight")
      .lean();

    const byId = new Map(products.map((p) => [String(p._id), p]));
    let subtotal = 0;
    let totalQty = 0;
    let totalWeightKg = 0;
    for (const item of req.body.items) {
      const product = byId.get(String(item.productId));
      if (!product) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "PRODUCT_NOT_AVAILABLE",
              "این محصول برای خرید در دسترس نیست",
              { productId: item.productId },
              req.id,
            ),
          );
      }
      subtotal += product.price * item.qty;
      totalQty += item.qty;
      totalWeightKg += (Number(product.shipping?.weight) || 0) * item.qty;
    }

    // Same treatment as checkout: an all-blank address is "no address", so a
    // pickup buyer can see the pickup option without filling in a form.
    let address = {};
    if (ShippingService.isEmptyAddress(req.body.shippingAddress)) {
      address = {};
    } else {
      const normalized = ShippingService.normalizeAddress(req.body.shippingAddress);
      if (!normalized.ok) {
        return res
          .status(400)
          .json(
            createErrorResponse("INVALID_SHIPPING_ADDRESS", normalized.errors[0], {
              errors: normalized.errors,
            }, req.id),
          );
      }
      address = normalized.value;
    }

    const quote = ShippingService.quoteProfile({
      profile: await ShippingService.getProfile(profile._id),
      address,
      subtotal,
      totalWeightKg,
      totalQty,
      discountCode: req.body.shippingDiscountCode || "",
    });

    res.json(
      createSuccessResponse(
        {
          ...quote,
          subtotal,
          currency: "IRR",
        },
        req.id,
      ),
    );
  } catch (e) {
    if (e instanceof ShippingService.ShippingDomainError) {
      return res.status(400).json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront quoteShipping error", {
      error: e.message,
      buyer: req.user?.id,
      slug: req.params?.slug,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function listShippingProvinces(req, res) {
  // No profile lookup and no `OrderService` call on purpose: the answer is the
  // same 31 names for every slug, including an unknown one, so this endpoint
  // cannot be used to tell whether a store exists.
  res.json(
    createSuccessResponse(
      { provinces: IRAN_PROVINCES.slice(), currency: "IRR" },
      req.id,
    ),
  );
}

async function paymentCallback(req, res) {
  try {
    const { order, applied } = await submitPaymentResult({
      refId: req.params.refId,
      result: req.body.result,
      reason: req.body.reason,
    });

    res.json(
      createSuccessResponse(
        { order: OrderService.orderToDTO(order), applied },
        req.id,
      ),
    );
  } catch (e) {
    if (e instanceof StorefrontOrderError) {
      return res
        .status(storefrontOrderErrorStatus(e.code))
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    if (e instanceof OrderService.OrderDomainError) {
      return res
        .status(400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront paymentCallback error", {
      error: e.message,
      refId: req.params?.refId,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function listBuyerOrdersHandler(req, res) {
  try {
    const result = await listBuyerOrders({
      buyerUserId: req.user.id,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      status: req.query.status,
    });
    res.json(createSuccessResponse(result, req.id));
  } catch (e) {
    if (e instanceof StorefrontOrderError) {
      return res
        .status(400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront listBuyerOrders error", {
      error: e.message,
      buyer: req.user?.id,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function getBuyerOrderHandler(req, res) {
  try {
    const order = await getBuyerOrder({
      buyerUserId: req.user.id,
      orderId: req.params.orderId,
    });
    if (!order) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "سفارش یافت نشد", null, req.id));
    }

    // The return affordance (P1-04) is decided server-side: the client must not
    // be the one deciding whether a window is still open. Eligibility is
    // computed from the receipt itself (status + timeline), so it needs no
    // extra query, and the buyer's own RMAs ride along so the page can show
    // the current state instead of re-fetching after every action.
    const eligibility = ReturnService.returnEligibility({
      status: order.status,
      timeline: order.timeline,
    });
    const returns = await ReturnService.listBuyerReturns(req.user.id, { page: 1, limit: 50 });

    res.json(
      createSuccessResponse(
        {
          order,
          returns: returns.items.filter((r) => r.orderId === order.id),
          returnEligible: eligibility.ok,
          returnDeadline: eligibility.deadline,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Storefront getBuyerOrder error", {
      error: e.message,
      buyer: req.user?.id,
      orderId: req.params?.orderId,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * POST /api/storefront/orders/:orderId/returns — the buyer opens a return.
 * The order must be this buyer's own storefront order and still inside the
 * return window; the seller adjudicates from there.
 */
async function createBuyerReturnHandler(req, res) {
  try {
    const ret = await ReturnService.createReturnRequest({
      buyerUserId: req.user.id,
      orderId: req.params.orderId,
      reason: req.body?.reason,
    });

    // Buyer-initiated, so there is no `requestContext.seller` to target: the
    // seller's live dashboard is reached through the order event the service
    // publishes, not through the activity feed.
    await AuditService.log({
      userId: req.user.id,
      action: "RETURN_REQUESTED",
      resource: { type: "TRANSACTION", id: String(ret._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      metadata: {
        rmaNumber: ret.rmaNumber,
        orderId: String(ret.orderId),
        orderNumber: ret.orderNumber,
        reason: ret.reason,
        origin: "storefront",
      },
    });

    res.status(201).json(createSuccessResponse({ return: ReturnService.returnToDTO(ret) }, req.id));
  } catch (e) {
    if (e instanceof ReturnService.ReturnDomainError) {
      return res
        .status(returnErrorStatus(e.code))
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront createReturn error", {
      error: e.message,
      buyer: req.user?.id,
      orderId: req.params?.orderId,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/** GET /api/storefront/returns — the buyer's own requests, newest first. */
async function listBuyerReturnsHandler(req, res) {
  try {
    const result = await ReturnService.listBuyerReturns(req.user.id, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
    });
    res.json(createSuccessResponse(result, req.id));
  } catch (e) {
    if (e instanceof ReturnService.ReturnDomainError) {
      return res
        .status(returnErrorStatus(e.code))
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Storefront listBuyerReturns error", {
      error: e.message,
      buyer: req.user?.id,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

module.exports = {
  checkout,
  validateCoupon,
  quoteShipping,
  listShippingProvinces,
  paymentCallback,
  listBuyerOrders: listBuyerOrdersHandler,
  getBuyerOrder: getBuyerOrderHandler,
  createBuyerReturn: createBuyerReturnHandler,
  listBuyerReturns: listBuyerReturnsHandler,
};