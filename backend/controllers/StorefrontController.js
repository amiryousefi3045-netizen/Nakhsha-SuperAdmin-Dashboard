const mongoose = require("mongoose");
const { StorefrontService } = require("../services/StorefrontService");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const logger = require("../utils/logger");

// Public (unauthenticated) storefront surface. Only the service decides what
// is visible: published + active stores, active products, privacy-safe DTOs.

async function getStorefront(req, res) {
  try {
    const storefront = await StorefrontService.getStorefront(req.params.slug);
    if (!storefront) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "ویترین فروشگاه یافت نشد", null, req.id));
    }
    res.json(createSuccessResponse({ storefront }, req.id));
  } catch (e) {
    logger.error("Storefront getStorefront error", { error: e.message, slug: req.params?.slug });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function getStorefrontProducts(req, res) {
  try {
    const result = await StorefrontService.listStorefrontProducts({
      slug: req.params.slug,
      page: req.query.page,
      limit: req.query.limit,
      category: req.query.category,
      q: req.query.q,
      sort: req.query.sort,
    });
    if (!result) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "ویترین فروشگاه یافت نشد", null, req.id));
    }
    res.json(
      createSuccessResponse(
        { items: result.items, total: result.total, page: result.page, limit: result.limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Storefront getStorefrontProducts error", { error: e.message, slug: req.params?.slug });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function getStorefrontProduct(req, res) {
  try {
    const { slug, productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه محصول نامعتبر است", { field: "productId" }, req.id));
    }

    const result = await StorefrontService.getStorefrontProduct({ slug, productId });
    if (!result) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "محصول یافت نشد", null, req.id));
    }
    res.json(createSuccessResponse({ product: result.product }, req.id));
  } catch (e) {
    logger.error("Storefront getStorefrontProduct error", { error: e.message, slug: req.params?.slug, productId: req.params?.productId });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

module.exports = {
  getStorefront,
  getStorefrontProducts,
  getStorefrontProduct,
};