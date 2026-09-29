const OrderService = require("../services/OrderService");
const ReturnService = require("../services/ReturnService");
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
  paymentCallback,
  listBuyerOrders: listBuyerOrdersHandler,
  getBuyerOrder: getBuyerOrderHandler,
  createBuyerReturn: createBuyerReturnHandler,
  listBuyerReturns: listBuyerReturnsHandler,
};