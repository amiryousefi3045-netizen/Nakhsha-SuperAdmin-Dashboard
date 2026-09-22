const OrderService = require("../services/OrderService");
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
      };
      return res
        .status(statusMap[e.code] || 400)
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
    res.json(createSuccessResponse({ order }, req.id));
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

module.exports = {
  checkout,
  paymentCallback,
  listBuyerOrders: listBuyerOrdersHandler,
  getBuyerOrder: getBuyerOrderHandler,
};