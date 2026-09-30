const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Product = require("../models/Product");
const StockAdjustment = require("../models/StockAdjustment");
const Craft = require("../models/Craft");
const Order = require("../models/Order");
const ShippingProfile = require("../models/ShippingProfile");
const OrderService = require("../services/OrderService");
const ReturnService = require("../services/ReturnService");
const CouponService = require("../services/CouponService");
const ShippingService = require("../services/ShippingService");
const Coupon = require("../models/Coupon");
const CouponRedemption = require("../models/CouponRedemption");
const FinanceService = require("../services/FinanceService");
const SalesReportService = require("../services/SalesReportService");
const AuditService = require("../services/AuditService");
const SettingsService = require("../services/SettingsService");
const StorefrontReviewService = require("../services/StorefrontReviewService");
const sellerEventHub = require("../services/SellerEventHub");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const { toCsv, sendCsv } = require("../utils/csv");
const { ReportRangeError, resolveRange, dayKey, addDaysUtc } = require("../utils/reportRange");
const logger = require("../utils/logger");

const MAX_PAGE_SIZE = 100;
const PRODUCT_STATUSES = ["draft", "pending_review", "active", "paused", "archived", "rejected"];

function safePageSize(raw) {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return 25;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function safePage(raw) {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return 1;
  return parsed;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Bulk actions (P1-06) ─────────────────────────────────────────────────────
// Same contract as the admin bulk endpoints: every selected id is reported
// individually so one bad row can never hide the fate of the rest.

const BATCH_MAX_IDS = 50;

/**
 * Deduplicate, cap and validate an array of ids for a bulk operation.
 * Returns `null` when there is nothing to process or an id is malformed.
 */
function normalizeBatchIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const unique = [...new Set(ids.map((i) => String(i).trim()).filter(Boolean))];
  if (unique.length === 0 || unique.some((id) => !mongoose.Types.ObjectId.isValid(id))) return null;
  return unique.slice(0, BATCH_MAX_IDS);
}

function batchSummary(succeeded, skipped, failed) {
  return {
    total: succeeded.length + skipped.length + failed.length,
    succeeded: succeeded.length,
    skipped: skipped.length,
    failed: failed.length,
  };
}

function productToDTO(product) {
  const p = product.toObject ? product.toObject({ virtuals: true }) : product;
  return {
    id: String(p._id),
    sellerId: String(p.sellerId),
    title: p.title,
    description: p.description,
    images: p.images || [],
    category: p.category,
    price: p.price,
    currency: p.currency,
    sku: p.sku,
    status: p.status,
    rejectionReason: p.rejectionReason,
    stock: {
      onHand: p.stock?.onHand ?? 0,
      reserved: p.stock?.reserved ?? 0,
      incoming: p.stock?.incoming ?? 0,
      available: Math.max(0, (p.stock?.onHand ?? 0) - (p.stock?.reserved ?? 0)),
    },
    isLowStock: typeof p.isLowStock === "boolean" ? p.isLowStock : false,
    isOutOfStock: typeof p.isOutOfStock === "boolean" ? p.isOutOfStock : false,
    stockPolicy: p.stockPolicy,
    lowStockThreshold: p.lowStockThreshold,
    sourceCraftId: p.sourceCraftId || null,
    tags: p.tags || [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function sellerProfileToDTO(profile, myRole) {
  return {
    id: String(profile._id),
    userId: String(profile.userId),
    storeName: profile.storeName,
    slug: profile.slug,
    description: profile.description,
    logo: profile.logo,
    cover: profile.cover,
    contact: profile.contact || {},
    location: profile.location || {},
    verification: {
      status: profile.verification?.status || "pending",
      verifiedAt: profile.verification?.verifiedAt || null,
    },
    policies: profile.policies || {},
    status: profile.status,
    stats: profile.stats || {},
    finance: profile.finance || { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    // The caller's own roster role ("owner" for the profile holder). The
    // dashboard hides surfaces the caller cannot use, so the client needs it
    // to match what `requireOwnerOnly` / `requireManagerOrOwner` allow.
    myRole: myRole || "owner",
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════

async function getDashboard(req, res) {
  try {
    const sellerId = req.seller._id;
    const [totalProducts, activeProducts, lowStock, outOfStock, pendingProducts, orderCounts, revenueRows] =
      await Promise.all([
        Product.countDocuments({ sellerId }),
        Product.countDocuments({ sellerId, status: "active" }),
        Product.countDocuments({
          sellerId,
          status: { $in: ["active", "paused"] },
          stockPolicy: "tracked",
          $expr: {
            $lte: [{ $subtract: [{ $ifNull: ["$stock.onHand", 0] }, { $ifNull: ["$stock.reserved", 0] }] }, "$lowStockThreshold"],
          },
        }),
        Product.countDocuments({
          sellerId,
          status: { $in: ["active", "paused"] },
          stockPolicy: "tracked",
          $expr: {
            $lte: [{ $subtract: [{ $ifNull: ["$stock.onHand", 0] }, { $ifNull: ["$stock.reserved", 0] }] }, 0],
          },
        }),
        Product.countDocuments({ sellerId, status: "pending_review" }),
        OrderService.countsByStatus(sellerId),
        Order.aggregate([
          { $match: { sellerId, status: { $in: ["shipped", "delivered"] } } },
          { $group: { _id: "$status", total: { $sum: "$total" } } },
        ]),
      ]);

    const revenueByStatus = {};
    for (const row of revenueRows) {
      revenueByStatus[row._id] = row.total;
    }
    const needAction = orderCounts.pending + orderCounts.confirmed + orderCounts.processing;
    const openOrders = needAction + orderCounts.shipped;
    const totalOrders =
      orderCounts.pending +
      orderCounts.confirmed +
      orderCounts.processing +
      orderCounts.shipped +
      orderCounts.delivered +
      orderCounts.cancelled +
      orderCounts.returned;

    const recentProducts = await Product.find({ sellerId })
      .select("title price status images stock lowStockThreshold stockPolicy")
      .sort({ updatedAt: -1 })
      .limit(8)
      .lean();

    res.json(
      createSuccessResponse(
        {
          overview: {
            totalProducts,
            activeProducts,
            lowStock,
            outOfStock,
            pendingProducts,
          },
          orders: {
            byStatus: orderCounts,
            total: totalOrders,
            needAction,
            open: openOrders,
          },
          revenue: {
            shipped: revenueByStatus.shipped || 0,
            delivered: revenueByStatus.delivered || 0,
            total: (revenueByStatus.shipped || 0) + (revenueByStatus.delivered || 0),
          },
          recentProducts: recentProducts.map(productToDTO),
          profile: sellerProfileToDTO(req.seller, req.sellerMember?.role),
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller getDashboard error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════════════════════════════

async function getProfile(req, res) {
  try {
    res.json(
      createSuccessResponse({ profile: sellerProfileToDTO(req.seller, req.sellerMember?.role) }, req.id),
    );
  } catch (e) {
    logger.error("Seller getProfile error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function updateProfile(req, res) {
  const ALLOWED_FIELDS = [
    "storeName",
    "description",
    "logo",
    "cover",
    "contact",
    "location",
    "policies",
  ];
  try {
    // Server-controlled fields are never accepted from the client.
    const updates = {};
    for (const key of ALLOWED_FIELDS) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "فیلدی برای به‌روزرسانی ارسال نشده است", null, req.id));
    }

    const profile = await SellerProfile.findOneAndUpdate(
      { _id: req.seller._id, userId: req.seller.userId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!profile) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "پروفایل فروشنده یافت نشد", null, req.id));
    }

    await AuditService.log({
      userId: req.user.id,
      action: "SELLER_PROFILE_UPDATE",
      resource: { type: "USER", id: String(req.user.id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: { updatedFields: Object.keys(updates) },
    });

    res.json(
      createSuccessResponse({ profile: sellerProfileToDTO(profile, req.sellerMember?.role) }, req.id),
    );
  } catch (e) {
    logger.error("Seller updateProfile error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════════════════════════════

async function listProducts(req, res) {
  try {
    const sellerId = req.seller._id;
    const { status, category, q, page: pageRaw, limit: limitRaw } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);
    const skip = (page - 1) * limit;

    const filter = { sellerId };
    if (status && PRODUCT_STATUSES.includes(status)) filter.status = status;
    if (category) filter.category = category;
    if (q && String(q).trim()) {
      const safe = escapeRegex(String(q).trim());
      filter.$or = [{ title: { $regex: safe, $options: "i" } }, { sku: { $regex: safe, $options: "i" } }];
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    res.json(
      createSuccessResponse(
        { items: products.map((p) => productToDTO(p)), total, page, limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller listProducts error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function createProduct(req, res) {
  const ALLOWED_FIELDS = [
    "title",
    "description",
    "images",
    "category",
    "price",
    "currency",
    "sku",
    "status",
    "stock",
    "stockPolicy",
    "lowStockThreshold",
    "variants",
    "shipping",
    "tags",
    "metadata",
    "sourceCraftId",
  ];
  try {
    const payload = {};
    for (const key of ALLOWED_FIELDS) {
      if (req.body?.[key] !== undefined) payload[key] = req.body[key];
    }

    // Validation
    if (!payload.title || !String(payload.title).trim()) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "عنوان محصول الزامی است", { field: "title" }, req.id));
    }
    if (payload.price === undefined || payload.price < 0) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "قیمت معتبر الزامی است", { field: "price" }, req.id));
    }
    if (payload.status && !PRODUCT_STATUSES.includes(payload.status)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "وضعیت محصول نامعتبر است", { field: "status" }, req.id));
    }
    if (payload.stock) {
      const allowed = {};
      if (Number.isInteger(payload.stock.onHand) && payload.stock.onHand >= 0) {
        allowed.onHand = payload.stock.onHand;
      } else if (payload.stock.onHand !== undefined) {
        return res
          .status(400)
          .json(createErrorResponse("VALIDATION_ERROR", "موجودی اولیه نامعتبر است", { field: "stock.onHand" }, req.id));
      }
      if (Number.isInteger(payload.stock.reserved) && payload.stock.reserved >= 0) {
        allowed.reserved = payload.stock.reserved;
      } else if (payload.stock.reserved !== undefined) {
        return res
          .status(400)
          .json(createErrorResponse("VALIDATION_ERROR", "موجودی رزرو نامعتبر است", { field: "stock.reserved" }, req.id));
      }
      if (Number.isInteger(payload.stock.incoming) && payload.stock.incoming >= 0) {
        allowed.incoming = payload.stock.incoming;
      } else if (payload.stock.incoming !== undefined) {
        return res
          .status(400)
          .json(createErrorResponse("VALIDATION_ERROR", "موجودی در راه نامعتبر است", { field: "stock.incoming" }, req.id));
      }
      payload.stock = allowed;
    }
    if (payload.sourceCraftId) {
      const craft = await Craft.findById(payload.sourceCraftId).select("_id").lean();
      if (!craft) {
        return res
          .status(400)
          .json(createErrorResponse("VALIDATION_ERROR", "اثر مرجع (Craft) یافت نشد", { field: "sourceCraftId" }, req.id));
      }
    }

    // Server-controlled ownership — never from client.
    const product = await Product.create({
      ...payload,
      sellerId: req.seller._id,
      sellerUserId: req.seller.userId,
      status: payload.status || "draft",
    });

    await SellerProfile.updateOne(
      { _id: req.seller._id },
      { $inc: { "stats.totalProducts": 1 } },
    );

    await AuditService.log({
      userId: req.user.id,
      action: "PRODUCT_CREATED",
      resource: { type: "TRANSACTION", id: String(product._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: { title: product.title, status: product.status },
    });

    res.status(201).json(createSuccessResponse({ product: productToDTO(product) }, req.id));
  } catch (e) {
    logger.error("Seller createProduct error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function getProduct(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه محصول نامعتبر است", { field: "id" }, req.id));
    }

    const product = await Product.findOne({ _id: id, sellerId: req.seller._id }).lean();
    if (!product) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "محصول یافت نشد", null, req.id));
    }

    res.json(createSuccessResponse({ product: productToDTO(product) }, req.id));
  } catch (e) {
    logger.error("Seller getProduct error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function updateProduct(req, res) {
  const ALLOWED_FIELDS = [
    "title",
    "description",
    "images",
    "category",
    "price",
    "currency",
    "sku",
    "stockPolicy",
    "lowStockThreshold",
    "variants",
    "shipping",
    "tags",
    "metadata",
  ];
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه محصول نامعتبر است", { field: "id" }, req.id));
    }

    const updates = {};
    for (const key of ALLOWED_FIELDS) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "فیلدی برای به‌روزرسانی ارسال نشده است", null, req.id));
    }
    if (updates.price !== undefined && updates.price < 0) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "قیمت نمی‌تواند منفی باشد", { field: "price" }, req.id));
    }

    const product = await Product.findOneAndUpdate(
      { _id: id, sellerId: req.seller._id },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!product) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "محصول یافت نشد", null, req.id));
    }

    await AuditService.log({
      userId: req.user.id,
      action: "PRODUCT_UPDATED",
      resource: { type: "TRANSACTION", id: String(product._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: { title: product.title, updatedFields: Object.keys(updates) },
    });

    res.json(createSuccessResponse({ product: productToDTO(product) }, req.id));
  } catch (e) {
    logger.error("Seller updateProduct error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه محصول نامعتبر است", { field: "id" }, req.id));
    }

    const product = await Product.findOne({ _id: id, sellerId: req.seller._id });
    if (!product) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "محصول یافت نشد", null, req.id));
    }

    // Soft delete — archive instead of hard delete to preserve order history.
    product.status = "archived";
    await product.save();

    await SellerProfile.updateOne(
      { _id: req.seller._id, "stats.totalProducts": { $gt: 0 } },
      { $inc: { "stats.totalProducts": -1 } },
    );

    await AuditService.log({
      userId: req.user.id,
      action: "PRODUCT_ARCHIVED",
      resource: { type: "TRANSACTION", id: String(product._id) },
      result: "SUCCESS",
      riskLevel: "HIGH",
      requestContext: req,
      metadata: { title: product.title },
    });

    res.json(createSuccessResponse({ message: "محصول بایگانی شد", id: String(product._id) }, req.id));
  } catch (e) {
    logger.error("Seller deleteProduct error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function updateProductStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه محصول نامعتبر است", { field: "id" }, req.id));
    }
    if (!status || !PRODUCT_STATUSES.includes(status)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "وضعیت محصول نامعتبر است", { field: "status" }, req.id));
    }

    const product = await Product.findOneAndUpdate(
      { _id: id, sellerId: req.seller._id },
      { $set: { status, rejectionReason: "" } },
      { new: true, runValidators: true },
    );

    if (!product) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "محصول یافت نشد", null, req.id));
    }

    await AuditService.log({
      userId: req.user.id,
      action: "PRODUCT_STATUS_CHANGED",
      resource: { type: "TRANSACTION", id: String(product._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: { title: product.title, status },
    });

    res.json(createSuccessResponse({ product: productToDTO(product) }, req.id));
  } catch (e) {
    logger.error("Seller updateProductStatus error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * Bulk status change for products (P1-06). Reused by the inventory page: a
 * merchant pausing a batch of out-of-stock items is the same write.
 *
 * Ownership is enforced by the `sellerId` filter, so an id belonging to
 * another store is reported as NOT_FOUND and never modified — the response
 * cannot be used to probe for foreign ids.
 */
async function bulkUpdateProductStatus(req, res) {
  try {
    const { ids, status } = req.body || {};

    const batchIds = normalizeBatchIds(ids);
    if (!batchIds) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه معتبری ارائه نشده است",
            { field: "ids", max: BATCH_MAX_IDS },
            req.id,
          ),
        );
    }
    if (!status || !PRODUCT_STATUSES.includes(status)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "وضعیت مورد نظر نامعتبر است",
            { field: "status", allowed: PRODUCT_STATUSES },
            req.id,
          ),
        );
    }

    const batchId = randomUUID();
    const products = await Product.find({ _id: { $in: batchIds }, sellerId: req.seller._id });
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const succeeded = [];
    const skipped = [];
    const failed = [];

    for (const id of batchIds) {
      const product = byId.get(id);
      if (!product) {
        skipped.push({ id, reason: "NOT_FOUND" });
        continue;
      }
      if (product.status === status) {
        skipped.push({ id, reason: "UNCHANGED" });
        continue;
      }
      try {
        product.status = status;
        product.rejectionReason = "";
        await product.save();
        succeeded.push({ id: String(product._id) });
      } catch (e) {
        logger.warn("Bulk product status change failed", { productId: id, error: e.message });
        failed.push({ id, reason: "ERROR" });
      }
    }

    // One audit row per bulk gesture, not one per product: a 50-item selection
    // would otherwise flood the very activity feed the seller reads.
    if (succeeded.length > 0) {
      await AuditService.log({
        userId: req.user.id,
        action: "DATA_BULK_OPERATION",
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        requestContext: req,
        metadata: {
          batch: batchId,
          operation: "PRODUCT_STATUS_CHANGE",
          status,
          affectedCount: succeeded.length,
          ids: succeeded.map((s) => s.id),
        },
      });
    }

    res.json(
      createSuccessResponse(
        {
          batchId,
          summary: batchSummary(succeeded, skipped, failed),
          succeeded,
          skipped,
          failed,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller bulkUpdateProductStatus error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// INVENTORY
// ════════════════════════════════════════════════════════════════════════════

function buildInventoryFilter(sellerId, { status, q } = {}) {
  const filter = { sellerId, stockPolicy: "tracked" };
  if (status === "low") {
    filter.$expr = {
      $lte: [{ $subtract: [{ $ifNull: ["$stock.onHand", 0] }, { $ifNull: ["$stock.reserved", 0] }] }, "$lowStockThreshold"],
    };
  } else if (status === "out") {
    filter.$expr = {
      $lte: [{ $subtract: [{ $ifNull: ["$stock.onHand", 0] }, { $ifNull: ["$stock.reserved", 0] }] }, 0],
    };
  }
  if (q && String(q).trim()) {
    const safe = escapeRegex(String(q).trim());
    filter.$or = [{ title: { $regex: safe, $options: "i" } }, { sku: { $regex: safe, $options: "i" } }];
  }
  return filter;
}

async function listInventory(req, res) {
  try {
    const sellerId = req.seller._id;
    const { status, page: pageRaw, limit: limitRaw, q } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);
    const skip = (page - 1) * limit;

    const filter = buildInventoryFilter(sellerId, { status, q });

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select("title sku price images stock stockPolicy lowStockThreshold status")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    res.json(
      createSuccessResponse({ items: products.map(productToDTO), total, page, limit }, req.id),
    );
  } catch (e) {
    logger.error("Seller listInventory error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function exportInventory(req, res) {
  try {
    const sellerId = req.seller._id;
    const { status, q } = req.query;
    const filter = buildInventoryFilter(sellerId, { status, q });

    const products = await Product.find(filter)
      .select("title sku price currency images stock stockPolicy lowStockThreshold status createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(50000)
      .lean();

    const rows = products.map((p) => [
      p.sku ?? "",
      p.title ?? "",
      p.price ?? 0,
      p.currency ?? "IRR",
      p.status ?? "",
      p.stockPolicy ?? "tracked",
      p.stock?.onHand ?? 0,
      p.stock?.reserved ?? 0,
      p.stock?.incoming ?? 0,
      Math.max(0, (p.stock?.onHand ?? 0) - (p.stock?.reserved ?? 0)),
      p.lowStockThreshold ?? 0,
      (p.createdAt || new Date(0)).toISOString(),
      (p.updatedAt || new Date(0)).toISOString(),
    ]);

    const csv = toCsv([
      ["sku", "title", "price", "currency", "status", "stockPolicy", "onHand", "reserved", "incoming", "available", "lowStockThreshold", "createdAt", "updatedAt"],
      ...rows,
    ]);
    sendCsv(res, "inventory", csv);
  } catch (e) {
    logger.error("Seller exportInventory error", { error: e.message, sellerId: req.seller?._id });
    if (!res.headersSent) {
      res
        .status(500)
        .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
    }
  }
}

async function adjustStock(req, res) {
  const { productId } = req.params;
  const { delta, reason, type } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res
      .status(400)
      .json(createErrorResponse("VALIDATION_ERROR", "شناسه محصول نامعتبر است", { field: "productId" }, req.id));
  }
  if (!Number.isInteger(delta) || delta === 0) {
    return res
      .status(400)
      .json(createErrorResponse("VALIDATION_ERROR", "مقدار تغییر موجودی باید عدد صحیح غیرصفر باشد", { field: "delta" }, req.id));
  }

  const ALLOWED_TYPES = ["receipt", "adjustment", "correction", "count"];
  const adjType = type && ALLOWED_TYPES.includes(type) ? type : "adjustment";

  try {
    const sellerId = req.seller._id;

    // Atomic owner-scoped update — a concurrent request can never change
    // another seller's stock or drive onHand below zero.
    const product = await Product.findOneAndUpdate(
      {
        _id: productId,
        sellerId,
        stockPolicy: "tracked",
        "stock.onHand": { $gte: delta < 0 ? -delta : 0 },
      },
      [
        {
          $set: {
            "stock.onHand": {
              $max: [{ $add: [{ $ifNull: ["$stock.onHand", 0] }, delta] }, 0],
            },
          },
        },
      ],
      { new: true, runValidators: true },
    );

    if (!product) {
      const exists = await Product.exists({ _id: productId, sellerId });
      if (!exists) {
        return res
          .status(404)
          .json(createErrorResponse("NOT_FOUND", "محصول یافت نشد", null, req.id));
      }
      return res
        .status(400)
        .json(
          createErrorResponse(
            "INSUFFICIENT_STOCK",
            "موجودی کافی برای این تغییر وجود ندارد",
            null,
            req.id,
          ),
        );
    }

    // Record adjustment history
    await StockAdjustment.create({
      productId: product._id,
      sellerId,
      delta,
      type: adjType,
      reason: reason || "",
      before: { onHand: product.stock.onHand - delta, reserved: product.stock.reserved },
      after: { onHand: product.stock.onHand, reserved: product.stock.reserved },
      actor: req.user.id,
      source: "seller_ui",
    });

    await AuditService.log({
      userId: req.user.id,
      action: "STOCK_ADJUSTED",
      resource: { type: "TRANSACTION", id: String(product._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: { productId: String(product._id), delta, reason: reason || "" },
    });

    res.json(createSuccessResponse({ product: productToDTO(product) }, req.id));
  } catch (e) {
    logger.error("Seller adjustStock error", { error: e.message, sellerId: req.seller?._id, productId });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function getStockHistory(req, res) {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res
      .status(400)
      .json(createErrorResponse("VALIDATION_ERROR", "شناسه محصول نامعتبر است", { field: "productId" }, req.id));
  }

  try {
    const sellerId = req.seller._id;
    const { page: pageRaw, limit: limitRaw } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);
    const skip = (page - 1) * limit;

    const product = await Product.findOne({ _id: productId, sellerId }).select("_id title sku").lean();
    if (!product) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "محصول یافت نشد", null, req.id));
    }

    const [history, total] = await Promise.all([
      StockAdjustment.find({ productId, sellerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockAdjustment.countDocuments({ productId, sellerId }),
    ]);

    res.json(
      createSuccessResponse(
        {
          product: { id: String(product._id), title: product.title, sku: product.sku },
          items: history.map((h) => ({
            id: String(h._id),
            delta: h.delta,
            type: h.type,
            reason: h.reason,
            before: h.before,
            after: h.after,
            createdAt: h.createdAt,
          })),
          total,
          page,
          limit,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller getStockHistory error", { error: e.message, sellerId: req.seller?._id, productId });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Seller analytics (Phase 29, P1-01/P1-03): real product/inventory aggregates
 * PLUS a sales performance block computed from the live order ledger for the
 * selected window (default last 30 days) with a full period-over-period
 * comparison against the equally-long preceding window, and a continuous
 * daily revenue series. Window handling reuses utils/reportRange so charts,
 * validation and the JSON payload always agree on the same UTC days.
 */
async function getAnalytics(req, res) {
  try {
    const sellerId = req.seller._id;

    const { start, end } = resolveRange({ from: req.query.from, to: req.query.to });
    const windowMs = end.getTime() - start.getTime() + 1;
    const days = Math.round(windowMs / 86400000);
    const prevStart = new Date(start.getTime() - windowMs);
    const prevEnd = new Date(start.getTime() - 1);

    const orderMatch = (from, to) => ({ sellerId, createdAt: { $gte: from, $lte: to } });

    const [inventory, statusDist, current, previous, dailyRows] = await Promise.all([
      Product.aggregate([
        { $match: { sellerId } },
        {
          $group: {
            _id: null,
            totalOnHand: { $sum: "$stock.onHand" },
            totalReserved: { $sum: "$stock.reserved" },
            products: { $sum: 1 },
            soldUnits: { $sum: "$metadata.totalSold" },
          },
        },
      ]),
      Product.aggregate([
        { $match: { sellerId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: orderMatch(start, end) },
        {
          $facet: {
            orders: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  subtotal: { $sum: "$subtotal" },
                  shippingFee: { $sum: "$shippingFee" },
                  discount: { $sum: "$discount" },
                  total: { $sum: "$total" },
                },
              },
            ],
            units: [
              { $unwind: "$items" },
              { $group: { _id: null, qty: { $sum: "$items.qty" } } },
            ],
            byStatus: [
              { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$total" } } },
            ],
          },
        },
      ]),
      Order.aggregate([
        { $match: orderMatch(prevStart, prevEnd) },
        {
          $facet: {
            orders: [
              { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } },
            ],
            units: [
              { $unwind: "$items" },
              { $group: { _id: null, qty: { $sum: "$items.qty" } } },
            ],
          },
        },
      ]),
      Order.aggregate([
        { $match: orderMatch(start, end) },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
            orders: { $sum: 1 },
            total: { $sum: "$total" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const inventoryRow = inventory[0] || { totalOnHand: 0, totalReserved: 0, products: 0, soldUnits: 0 };

    const cOrders = current[0]?.orders?.[0] || {
      count: 0,
      subtotal: 0,
      shippingFee: 0,
      discount: 0,
      total: 0,
    };
    const cUnits = current[0]?.units?.[0]?.qty || 0;

    const statusMap = {};
    for (const row of current[0]?.byStatus || []) statusMap[row._id] = row;
    const byOrderStatus = (Order.ORDER_STATUSES || []).map((s) => ({
      status: s,
      count: statusMap[s]?.count || 0,
      total: statusMap[s]?.total || 0,
    }));

    const dailyMap = {};
    for (const row of dailyRows) dailyMap[row._id] = row;
    const daily = [];
    for (let d = new Date(start); d <= end; d = addDaysUtc(d, 1)) {
      const key = dayKey(d);
      daily.push({
        day: key,
        orders: dailyMap[key]?.orders || 0,
        total: dailyMap[key]?.total || 0,
      });
    }

    const pOrders = previous[0]?.orders?.[0] || { count: 0, total: 0 };
    const pUnits = previous[0]?.units?.[0]?.qty || 0;

    res.json(
      createSuccessResponse(
        {
          inventory: {
            totalOnHand: inventoryRow.totalOnHand,
            totalReserved: inventoryRow.totalReserved,
            available: Math.max(0, inventoryRow.totalOnHand - inventoryRow.totalReserved),
            products: inventoryRow.products,
          },
          byStatus: Object.fromEntries(statusDist.map((s) => [s._id, s.count])),
          sales: {
            period: { from: start, to: end },
            days,
            current: {
              orders: cOrders.count,
              units: cUnits,
              subtotal: cOrders.subtotal,
              shippingFee: cOrders.shippingFee,
              discount: cOrders.discount,
              total: cOrders.total,
              avgOrderValue: cOrders.count > 0 ? Math.round(cOrders.total / cOrders.count) : 0,
              byStatus: byOrderStatus,
            },
            previous: {
              orders: pOrders.count,
              units: pUnits,
              total: pOrders.total,
            },
            daily,
            currency: "IRR",
          },
        },
        req.id,
      ),
    );
  } catch (e) {
    if (e instanceof ReportRangeError) {
      return res
        .status(400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller getAnalytics error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function getSalesReport(req, res) {
  try {
    const { from, to, top } = req.query;
    const report = await SalesReportService.salesReport(req.seller._id, {
      from,
      to,
      top,
    });
    res.json(createSuccessResponse({ report }, req.id));
  } catch (e) {
    if (e instanceof SalesReportService.SalesReportDomainError) {
      return res
        .status(e.code === "VALIDATION_ERROR" ? 400 : 422)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller getSalesReport error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function exportSalesReport(req, res) {
  try {
    const { from, to } = req.query;
    const csv = await SalesReportService.salesReportCsv(req.seller._id, { from, to });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales-report-${date}.csv"`,
    );
    res.write("\uFEFF");
    res.end(csv);
  } catch (e) {
    if (e instanceof SalesReportService.SalesReportDomainError) {
      return res
        .status(400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller exportSalesReport error", { error: e.message, sellerId: req.seller?._id });
    if (!res.headersSent) {
      res
        .status(500)
        .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
    }
  }
}

/**
 * Period settlement report (Phase 28, P0-04): per-status/per-method/daily
 * aggregates for the authenticated seller. Owner-only route.
 */
async function getPayoutReport(req, res) {
  try {
    const { from, to } = req.query;
    const report = await FinanceService.payoutReport(req.seller._id, { from, to });
    res.json(createSuccessResponse({ report }, req.id));
  } catch (e) {
    if (e instanceof ReportRangeError) {
      return res
        .status(400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller getPayoutReport error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/** CSV export of the settlement report window. Owner-only route. */
async function exportPayoutReport(req, res) {
  try {
    const { from, to } = req.query;
    const csv = await FinanceService.payoutReportCsv(req.seller._id, { from, to });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payout-report-${date}.csv"`,
    );
    res.write("\uFEFF");
    res.end(csv);
  } catch (e) {
    if (e instanceof ReportRangeError) {
      return res
        .status(400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller exportPayoutReport error", { error: e.message, sellerId: req.seller?._id });
    if (!res.headersSent) {
      res
        .status(500)
        .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
    }
  }
}

function activityToDTO(log) {
  const l = log.toObject ? log.toObject({ virtuals: true }) : log;
  return {
    id: String(l._id),
    action: l.action,
    riskLevel: l.riskLevel,
    result: l.result,
    resource: l.resource
      ? { type: l.resource.type, id: l.resource.id ? String(l.resource.id) : null }
      : null,
    after: l.changes?.after ?? null,
    metadata: l.metadata || {},
    endpoint: l.requestContext?.endpoint ?? null,
    createdAt: l.createdAt,
  };
}

/**
 * Seller store activity feed (Phase 26): audit entries of the owner plus all
 * roster members, newest first. `changes.before` is never exposed (the query
 * strips it server-side) — a seller watches what happened in their store, not
 * raw prior state.
 */
async function getActivity(req, res) {
  try {
    const page = safePage(req.query.page);
    const limit = safePageSize(req.query.limit);

    const team = await TeamMember.find({ sellerProfileId: req.seller._id })
      .select("userId role")
      .lean();
    const memberIds = (team || [])
      .map((m) => m.userId)
      .filter(Boolean);
    const userIds = [req.seller.userId, ...memberIds];

    const { logs, total } = await AuditService.getTeamAuditLogs(userIds, {
      limit,
      skip: (page - 1) * limit,
    });

    res.json(
      createSuccessResponse(
        { items: logs.map(activityToDTO), total, page, limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller getActivity error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * Row-level CSV export of the store activity feed (Phase 30, P1-02): newest
 * first, capped so the payload stays reasonable. Same ownership scoping and
 * `changes.before` stripping as the paginated feed.
 */
async function exportActivity(req, res) {
  try {
    const team = await TeamMember.find({ sellerProfileId: req.seller._id })
      .select("userId role")
      .lean();
    const memberIds = (team || [])
      .map((m) => m.userId)
      .filter(Boolean);
    const userIds = [req.seller.userId, ...memberIds];

    const { logs } = await AuditService.getTeamAuditLogs(userIds, {
      limit: 5000,
      skip: 0,
    });

    const rows = logs.map((log) => {
      const dto = activityToDTO(log);
      return [
        dto.id,
        dto.createdAt.toISOString(),
        dto.action ?? "",
        dto.riskLevel ?? "",
        dto.result ?? "",
        (dto.resource && dto.resource.type) || "",
        dto.resource && dto.resource.id ? dto.resource.id : "",
        dto.endpoint ?? "",
        JSON.stringify(dto.after ?? {}),
      ];
    });

    const csv = toCsv([
      ["id", "createdAt", "action", "riskLevel", "result", "resourceType", "resourceId", "endpoint", "after"],
      ...rows,
    ]);
    sendCsv(res, "store-activity", csv);
  } catch (e) {
    logger.error("Seller exportActivity error", { error: e.message, sellerId: req.seller?._id });
    if (!res.headersSent) {
      res
        .status(500)
        .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
    }
  }
}

// ── Live events (SSE, Phase 31, P1-05) ─────────────────────────────────────

/**
 * Server-Sent Events stream of store activity + order/payout changes. Clients
 * are bound to the authenticated seller profile, so an event published for
 * another store is never delivered here. Mirrors the admin live-events
 * contract (event names: `initial`, `activity`, `order`, `payout`, `heartbeat`).
 */
function streamSellerEvents(req, res) {
  // Capacity is checked first: once the event-stream headers are on the wire
  // the only honest answer left is a truncated stream, so a refusal has to
  // happen while we can still send a clean JSON 503.
  if (!sellerEventHub.canAccept(req.seller._id)) {
    return res
      .status(503)
      .json(
        createErrorResponse(
          "TOO_MANY_CONNECTIONS",
          "تعداد اتصال‌های زنده بیش از حد مجاز است؛ لطفاً بعداً دوباره تلاش کنید",
          null,
          req.id,
        ),
      );
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const { id, unsubscribe } = sellerEventHub.subscribe(res, {
    sellerId: req.seller._id,
    userId: req.user.id,
    initialPayload: { at: new Date().toISOString() },
  });

  // One timer per stream, pinging only its own connection (a shared hub-wide
  // ping would multiply traffic by the number of open tabs).
  const heartbeat = setInterval(() => sellerEventHub.heartbeat(id), 25000);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  };
  req.on("close", close);
}

// ════════════════════════════════════════════════════════════════════════════
// ORDERS & FULFILLMENT  (real domain — see services/OrderService.js)
// ════════════════════════════════════════════════════════════════════════════

const ORDER_STATUSES = Order.ORDER_STATUSES;

async function listSellerOrders(req, res) {
  try {
    const sellerId = req.seller._id;
    const {
      status,
      q,
      page: pageRaw,
      limit: limitRaw,
      from,
      to,
      payment,
      minTotal,
      maxTotal,
    } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);

    const result = await OrderService.listOrders(sellerId, {
      page,
      limit,
      status,
      q,
      from,
      to,
      payment,
      minTotal,
      maxTotal,
    });

    res.json(
      createSuccessResponse(
        { items: result.items, total: result.total, page, limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller listOrders error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function exportOrders(req, res) {
  try {
    const sellerId = req.seller._id;
    const { status, q, from, to, payment, minTotal, maxTotal } = req.query;

    const orders = await OrderService.exportOrders(sellerId, {
      status,
      q,
      from,
      to,
      payment,
      minTotal,
      maxTotal,
    });

    const rows = orders.map((o) => [
      String(o._id),
      o.orderNumber ?? "",
      o.status ?? "",
      o.payment?.status ?? "unpaid",
      o.currency ?? "IRR",
      o.subtotal ?? 0,
      o.shippingFee ?? 0,
      o.discount ?? 0,
      o.total ?? 0,
      o.itemCount ?? (o.items?.length ?? 0),
      o.customer?.name ?? "",
      o.customer?.phone ?? "",
      o.createdAt.toISOString(),
      (o.items || [])
        .map((item) => `${item.title || ""} x${item.qty} (${item.price ?? 0})`)
        .join("; "),
    ]);

    const csv = toCsv([
      ["id", "orderNumber", "status", "payment", "currency", "subtotal", "shippingFee", "discount", "total", "itemCount", "customerName", "customerPhone", "createdAt", "items"],
      ...rows,
    ]);
    sendCsv(res, "orders", csv);
  } catch (e) {
    logger.error("Seller exportOrders error", { error: e.message, sellerId: req.seller?._id });
    if (!res.headersSent) {
      res
        .status(500)
        .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
    }
  }
}

async function getSellerOrder(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه سفارش نامعتبر است", { field: "id" }, req.id));
    }

    const order = await OrderService.getOrder(req.seller._id, id);
    if (!order) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "سفارش یافت نشد", null, req.id));
    }
    res.json(createSuccessResponse({ order }, req.id));
  } catch (e) {
    logger.error("Seller getOrder error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function changeOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه سفارش نامعتبر است", { field: "id" }, req.id));
    }
    if (!status || !ORDER_STATUSES.includes(status)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "وضعیت سفارش نامعتبر است", { field: "status" }, req.id));
    }

    const order = await OrderService.transitionOrder({
      orderId: id,
      sellerId: req.seller._id,
      nextStatus: status,
      sellerUserId: req.user.id,
      reason: typeof reason === "string" ? reason : "",
    });

    if (!order) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "سفارش یافت نشد", null, req.id));
    }

    await AuditService.log({
      userId: req.user.id,
      action: "ORDER_STATUS_CHANGED",
      resource: { type: "TRANSACTION", id: String(order._id) },
      result: "SUCCESS",
      riskLevel: status === "cancelled" || status === "returned" ? "HIGH" : "MEDIUM",
      requestContext: req,
      metadata: { orderNumber: order.orderNumber, status },
    });

    res.json(
      createSuccessResponse({ order: OrderService.orderToDTO(order, { includeCost: true }) }, req.id),
    );
  } catch (e) {
    if (e instanceof OrderService.OrderDomainError) {
      const statusMap = {
        INVALID_TRANSITION: 409,
        INSUFFICIENT_STOCK: 400,
        VALIDATION_ERROR: 400,
        // The order has nowhere to go (Phase 36). 409 rather than 400: the
        // request is well-formed, the order is simply not ready to be shipped.
        SHIPPING_DESTINATION_REQUIRED: 409,
      };
      return res
        .status(statusMap[e.code] || 400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller changeOrderStatus error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * Bulk order status change (P1-06).
 *
 * A selection almost never sits in one status ("confirm all"), so each order
 * is driven through the normal `transitionOrder` state machine and reported
 * on its own: a row that cannot legally move is `failed` with the domain
 * reason while its neighbours still succeed. Side effects (stock restore,
 * buyer notifications, live events) therefore stay identical to the
 * single-order path instead of being re-implemented here.
 */
async function bulkUpdateOrderStatus(req, res) {
  try {
    const { ids, status, reason } = req.body || {};

    const batchIds = normalizeBatchIds(ids);
    if (!batchIds) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه معتبری ارائه نشده است",
            { field: "ids", max: BATCH_MAX_IDS },
            req.id,
          ),
        );
    }
    if (!status || !ORDER_STATUSES.includes(status)) {
      return res
        .status(400)
        .json(
          createErrorResponse("VALIDATION_ERROR", "وضعیت سفارش نامعتبر است", { field: "status" }, req.id),
        );
    }

    const batchId = randomUUID();
    const reasonText = typeof reason === "string" ? reason : "";
    const orders = await Order.find({ _id: { $in: batchIds }, sellerId: req.seller._id }).select(
      "status orderNumber",
    );
    const byId = new Map(orders.map((o) => [String(o._id), o]));
    const succeeded = [];
    const skipped = [];
    const failed = [];

    for (const id of batchIds) {
      const existing = byId.get(id);
      if (!existing) {
        skipped.push({ id, reason: "NOT_FOUND" });
        continue;
      }
      if (existing.status === status) {
        skipped.push({ id, reason: "UNCHANGED" });
        continue;
      }
      try {
        await OrderService.transitionOrder({
          orderId: id,
          sellerId: req.seller._id,
          nextStatus: status,
          sellerUserId: req.user.id,
          reason: reasonText,
        });
        succeeded.push({ id, orderNumber: existing.orderNumber });
      } catch (e) {
        if (e instanceof OrderService.OrderDomainError) {
          // INVALID_TRANSITION / INSUFFICIENT_STOCK are expected outcomes of a
          // mixed selection, not server faults.
          logger.info("Bulk order transition rejected", {
            orderId: id,
            from: existing.status,
            to: status,
            reason: e.code,
          });
          failed.push({ id, reason: e.code });
          continue;
        }
        logger.warn("Bulk order status change failed", { orderId: id, error: e.message });
        failed.push({ id, reason: "ERROR" });
      }
    }

    if (succeeded.length > 0) {
      await AuditService.log({
        userId: req.user.id,
        action: "DATA_BULK_OPERATION",
        result: "SUCCESS",
        riskLevel: status === "cancelled" || status === "returned" ? "HIGH" : "MEDIUM",
        requestContext: req,
        metadata: {
          batch: batchId,
          operation: "ORDER_STATUS_CHANGE",
          status,
          affectedCount: succeeded.length,
          orderNumbers: succeeded.map((s) => s.orderNumber),
        },
      });
    }

    res.json(
      createSuccessResponse(
        {
          batchId,
          summary: batchSummary(succeeded, skipped, failed),
          succeeded,
          skipped,
          failed,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller bulkUpdateOrderStatus error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RETURNS / RMA (Phase 33, P1-04)
// ════════════════════════════════════════════════════════════════════════════

/** HTTP mapping for the RMA domain errors (mirrors the order domain mapping). */
function returnErrorStatus(code) {
  switch (code) {
    case "ORDER_NOT_FOUND":
    case "RETURN_NOT_FOUND":
      return 404;
    // A second claim on an order that already has one is a conflict, not a
    // malformed request — the caller can act on it by reading the open RMA.
    case "RETURN_ALREADY_OPEN":
    case "INVALID_RETURN_TRANSITION":
      return 409;
    default:
      return 400;
  }
}

function sendReturnError(res, e, req) {
  return res
    .status(returnErrorStatus(e.code))
    .json(createErrorResponse(e.code, e.message, e.details, req.id));
}

/**
 * GET /api/seller/returns — the RMA queue. `counts` rides along so the page's
 * status tabs do not need a second round trip.
 */
async function listReturns(req, res) {
  try {
    const page = safePage(req.query.page);
    const limit = safePageSize(req.query.limit);
    const [result, counts] = await Promise.all([
      ReturnService.listSellerReturns(req.seller._id, {
        page,
        limit,
        status: req.query.status,
      }),
      ReturnService.countByStatus(req.seller._id),
    ]);
    res.json(createSuccessResponse({ ...result, counts }, req.id));
  } catch (e) {
    if (e instanceof ReturnService.ReturnDomainError) return sendReturnError(res, e, req);
    logger.error("Seller listReturns error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/** GET /api/seller/returns/:id */
async function getReturn(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه مرجوعی نامعتبر است", { field: "id" }, req.id));
    }
    const ret = await ReturnService.getSellerReturn(req.seller._id, req.params.id);
    if (!ret) {
      return res
        .status(404)
        .json(createErrorResponse("RETURN_NOT_FOUND", "درخواست مرجوعی یافت نشد", null, req.id));
    }
    res.json(createSuccessResponse({ return: ret }, req.id));
  } catch (e) {
    logger.error("Seller getReturn error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * POST /api/seller/returns — file a return on the buyer's behalf (a walk-in
 * return, or a request the buyer cannot file online). Filed straight into
 * `approved`: the seller is the approver, so nothing is left to wait for.
 */
async function createReturn(req, res) {
  try {
    const { orderId, reason } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه سفارش نامعتبر است", { field: "orderId" }, req.id));
    }

    const ret = await ReturnService.createSellerReturnRequest({
      sellerId: req.seller._id,
      orderId,
      reason,
      sellerUserId: req.user.id,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "RETURN_FILED",
      resource: { type: "TRANSACTION", id: String(ret._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: {
        rmaNumber: ret.rmaNumber,
        orderId: String(ret.orderId),
        orderNumber: ret.orderNumber,
        total: ret.items.reduce((sum, item) => sum + item.price * item.qty, 0),
        currency: ret.refundCurrency,
        filedBy: "seller",
      },
    });

    res.status(201).json(createSuccessResponse({ return: ReturnService.returnToDTO(ret) }, req.id));
  } catch (e) {
    if (e instanceof ReturnService.ReturnDomainError) return sendReturnError(res, e, req);
    logger.error("Seller createReturn error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/** PATCH /api/seller/returns/:id/status — approve / reject / receive / cancel. */
async function changeReturnStatus(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه مرجوعی نامعتبر است", { field: "id" }, req.id));
    }
    const { status, note } = req.body || {};

    const ret = await ReturnService.transitionReturn({
      sellerId: req.seller._id,
      returnId: req.params.id,
      nextStatus: status,
      sellerUserId: req.user.id,
      note: typeof note === "string" ? note : "",
    });

    await AuditService.log({
      userId: req.user.id,
      action: "RETURN_STATUS_CHANGED",
      resource: { type: "TRANSACTION", id: String(ret._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: {
        rmaNumber: ret.rmaNumber,
        orderNumber: ret.orderNumber,
        from: ret.timeline[ret.timeline.length - 2]?.status || null,
        to: ret.status,
        note: ret.resolutionNote,
      },
    });

    res.json(createSuccessResponse({ return: ReturnService.returnToDTO(ret) }, req.id));
  } catch (e) {
    if (e instanceof ReturnService.ReturnDomainError) return sendReturnError(res, e, req);
    logger.error("Seller changeReturnStatus error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * POST /api/seller/returns/:id/refund — the money movement. Guarded by
 * `requireOwnerOnly` at the route: refunding is a payout in the opposite
 * direction and belongs to the account holder, not to a manager or staff.
 */
async function refundReturn(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه مرجوعی نامعتبر است", { field: "id" }, req.id));
    }
    const { refundAmount, note } = req.body || {};

    const { ret, order, refundedNow, outstanding } = await ReturnService.refundReturn({
      sellerId: req.seller._id,
      returnId: req.params.id,
      refundAmount: Number(refundAmount),
      sellerUserId: req.user.id,
      note: typeof note === "string" ? note : "",
    });

    await AuditService.log({
      userId: req.user.id,
      action: "REFUND_ISSUED",
      resource: { type: "TRANSACTION", id: String(ret._id) },
      result: "SUCCESS",
      riskLevel: "HIGH",
      requestContext: req,
      metadata: {
        rmaNumber: ret.rmaNumber,
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        // The increment actually released in THIS call, not the RMA's running
        // total — a top-up must never be logged as a second full refund.
        amount: refundedNow,
        orderRefundedTotal: ret.refundAmount,
        outstandingAfter: outstanding,
        currency: ret.refundCurrency,
        orderTotal: order.total,
      },
    });

    res.json(
      createSuccessResponse(
        {
        return: ReturnService.returnToDTO(ret),
        order: OrderService.orderToDTO(order, { includeCost: true }),
      },
        req.id,
      ),
    );
  } catch (e) {
    if (e instanceof ReturnService.ReturnDomainError) return sendReturnError(res, e, req);
    // The order transition runs before the refund write; a domain failure there
    // must still reach the caller as a domain error, not a 500.
    if (e instanceof OrderService.OrderDomainError) {
      return res
        .status(400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller refundReturn error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Coupons / campaigns (Phase 35, P1-07) ───────────────────────────────────

/**
 * Map a CouponDomainError onto the HTTP surface like the other domain errors.
 *
 * A code that does not exist and a code belonging to another store both answer
 * `COUPON_NOT_FOUND` with the same status, so this endpoint is not an oracle
 * for guessing which campaigns other sellers are running.
 */
function sendCouponError(res, e, req) {
  return res.status(400).json(createErrorResponse(e.code, e.message, e.details, req.id));
}

/**
 * Push a live coupon event to the store's own dashboard (P1-05 parity).
 *
 * The dashboard refetches on every event, so the payload is only a nudge plus
 * the identity of what changed. Never throws: a live update must not be able to
 * fail the seller request that triggered it.
 */
function publishCouponEvent(sellerId, event, coupon) {
  try {
    sellerEventHub.publish(sellerId, "coupon", {
      id: String(coupon._id),
      code: coupon.code,
      type: coupon.type,
      status: coupon.status,
      event,
      at: new Date().toISOString(),
    });
  } catch (e) {
    logger.warn("Failed to publish seller coupon event", { error: e.message });
  }
}

/** Attach per-coupon usage aggregates to a list of coupons. */
async function withUsage(sellerId, coupons) {
  const { byCoupon } = await CouponService.couponUsageStats({ sellerId });
  return coupons.map((c) => {
    const usage = byCoupon[String(c._id)] || { redemptions: 0, discountGiven: 0 };
    return CouponService.couponToDTO(c, { usage });
  });
}

async function listCoupons(req, res) {
  try {
    const sellerId = req.seller._id;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = safePageSize(req.query.limit);
    const filter = { sellerId };
    if (req.query.status && CouponService.COUPON_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const [docs, total] = await Promise.all([
      Coupon.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Coupon.countDocuments(filter),
    ]);

    res.json(
      createSuccessResponse(
        { items: await withUsage(sellerId, docs), total, page, limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller listCoupons error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function getCoupon(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسهٔ کوپن نامعتبر است", { field: "id" }, req.id));
    }
    const sellerId = req.seller._id;
    const coupon = await CouponService.getCoupon({ sellerId, couponId: req.params.id });
    const [dto] = await withUsage(sellerId, [coupon]);
    res.json(createSuccessResponse({ coupon: dto }, req.id));
  } catch (e) {
    if (e instanceof CouponService.CouponDomainError) return sendCouponError(res, e, req);
    logger.error("Seller getCoupon error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function createCoupon(req, res) {
  try {
    const sellerId = req.seller._id;
    const { code, description, type, value, maxDiscount, minPurchase, maxUses, maxUsesPerBuyer, startsAt, expiresAt, status } = req.body || {};
    const coupon = await CouponService.createCoupon({
      sellerId,
      sellerUserId: req.user.id,
      code,
      description,
      type,
      value,
      maxDiscount,
      minPurchase,
      maxUses,
      maxUsesPerBuyer,
      startsAt,
      expiresAt,
      status,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "COUPON_CREATED",
      resource: { type: "COUPON", id: String(coupon._id) },
      result: "SUCCESS",
      riskLevel: "LOW",
      requestContext: req,
      metadata: { code: coupon.code, type: coupon.type, value: coupon.value },
    });

    publishCouponEvent(req.seller._id, "created", coupon);
    res.status(201).json(
      createSuccessResponse({ coupon: CouponService.couponToDTO(coupon) }, req.id),
    );
  } catch (e) {
    if (e instanceof CouponService.CouponDomainError) return sendCouponError(res, e, req);
    logger.error("Seller createCoupon error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function updateCoupon(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسهٔ کوپن نامعتبر است", { field: "id" }, req.id));
    }
    const { code, description, type, value, maxDiscount, minPurchase, maxUses, maxUsesPerBuyer, startsAt, expiresAt, status } = req.body || {};
    const coupon = await CouponService.updateCoupon({
      sellerId: req.seller._id,
      couponId: req.params.id,
      code,
      description,
      type,
      value,
      maxDiscount,
      minPurchase,
      maxUses,
      maxUsesPerBuyer,
      startsAt,
      expiresAt,
      status,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "COUPON_UPDATED",
      resource: { type: "COUPON", id: String(coupon._id) },
      result: "SUCCESS",
      riskLevel: "LOW",
      requestContext: req,
      metadata: { code: coupon.code },
    });

    publishCouponEvent(req.seller._id, "updated", coupon);
    res.json(createSuccessResponse({ coupon: CouponService.couponToDTO(coupon) }, req.id));
  } catch (e) {
    if (e instanceof CouponService.CouponDomainError) return sendCouponError(res, e, req);
    logger.error("Seller updateCoupon error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function setCouponStatus(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسهٔ کوپن نامعتبر است", { field: "id" }, req.id));
    }
    const { status } = req.body || {};
    const coupon = await CouponService.setCouponStatus({
      sellerId: req.seller._id,
      couponId: req.params.id,
      status,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "COUPON_UPDATED",
      resource: { type: "COUPON", id: String(coupon._id) },
      result: "SUCCESS",
      riskLevel: "LOW",
      requestContext: req,
      metadata: { code: coupon.code, status: coupon.status },
    });

    publishCouponEvent(req.seller._id, "status_changed", coupon);
    res.json(createSuccessResponse({ coupon: CouponService.couponToDTO(coupon) }, req.id));
  } catch (e) {
    if (e instanceof CouponService.CouponDomainError) return sendCouponError(res, e, req);
    logger.error("Seller setCouponStatus error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/** CSV row-level export of coupon redemptions (how much was given away). */
async function exportCouponUsage(req, res) {
  try {
    const sellerId = req.seller._id;
    const rows = await CouponRedemption.find({ sellerId })
      .populate("buyerUserId", "phone")
      .sort({ redeemedAt: -1 })
      .limit(5000)
      .lean();

    const csv = toCsv([
      ["code", "orderId", "buyerPhone", "discount", "redeemedAt"],
      ...rows.map((r) => [
        r.code,
        String(r.orderId),
        r.buyerUserId?.phone || "",
        r.discount,
        r.redeemedAt ? new Date(r.redeemedAt).toISOString() : "",
      ]),
    ]);
    sendCsv(res, "coupon-usage", csv);
  } catch (e) {
    logger.error("Seller exportCouponUsage error", { error: e.message, sellerId: req.seller?._id });
    if (!res.headersSent) {
      res
        .status(500)
        .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
    }
  }
}

async function getSellerFulfillment(req, res) {
  try {
    const sellerId = req.seller._id;
    const counts = await OrderService.countsByStatus(sellerId);

    // Orders that need seller action right now vs. in-transit history.
    const actionable = await OrderService.listOrders(sellerId, {
      page: 1,
      limit: 20,
      status: undefined,
    });

    res.json(
      createSuccessResponse(
        {
          counts,
          needAction: counts.pending + counts.confirmed + counts.processing,
          needingShipment: counts.confirmed + counts.processing,
          recent: actionable.items.filter((o) =>
            ["pending", "confirmed", "processing", "shipped"].includes(o.status),
          ),
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller getFulfillment error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * Record the courier cost the seller actually paid (Phase 36, P1-08).
 *
 * This is the seller's own expense, so it is never accepted from the buyer side
 * and never inferred from the rate card: the rate card says what a parcel
 * *should* cost, this says what it *did*. The window and the locking rule live
 * in `OrderService.recordShippingCost`; this handler only maps errors and writes
 * the audit row, because a cost that silently changes is a cost nobody can
 * reconstruct later.
 */
async function setOrderShippingCost(req, res) {
  try {
    const result = await OrderService.recordShippingCost({
      orderId: req.params.id,
      sellerId: req.seller._id,
      cost: req.body.cost,
      actorUserId: req.user.id,
    });
    if (!result) {
      return res
        .status(404)
        .json(createErrorResponse("ORDER_NOT_FOUND", "سفارش یافت نشد", null, req.id));
    }

    await AuditService.log({
      userId: req.user.id,
      action: "ORDER_SHIPPING_COST_SET",
      resource: { type: "ORDER", id: String(result.order._id) },
      result: "SUCCESS",
      metadata: {
        previous: result.previous,
        current: result.current,
        status: result.order.status,
      },
    });

    res.json(
      createSuccessResponse(
        {
          orderId: String(result.order._id),
          shipping: {
            fee: result.order.shipping.fee,
            cost: result.order.shipping.cost,
            margin: result.order.shipping.fee - result.order.shipping.cost,
            costRecordedAt: result.order.shipping.costRecordedAt,
          },
        },
        req.id,
      ),
    );
  } catch (e) {
    if (e instanceof OrderService.OrderDomainError) {
      const status = e.code === "SHIPPING_COST_LOCKED" ? 409 : 400;
      return res.status(status).json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller setOrderShippingCost error", {
      error: e.message,
      sellerId: req.seller?._id,
      orderId: req.params?.id,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SHIPPING (Phase 36, P1-08)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Read the seller's own rate card.
 *
 * A store that has never configured shipping is a normal state, not an error, so
 * this returns an empty `configured: false` shape rather than a 404. The seller
 * dashboard needs to render "you have no rates yet" from one response instead of
 * special-casing a missing resource.
 */
async function getShippingProfile(req, res) {
  try {
    const sellerId = req.seller._id;
    const profile = await ShippingService.getProfile(sellerId);
    if (!profile) {
      return res.json(
        createSuccessResponse(
          { configured: false, isEnabled: false, methods: [], freeShippingThreshold: 0 },
          req.id,
        ),
      );
    }
    const fresh = await ShippingProfile.findById(profile._id)
      .select(
        "isEnabled freeShippingThreshold methods updatedAt",
      )
      .lean();
    res.json(
      createSuccessResponse(
        {
          configured: true,
          isEnabled: fresh.isEnabled !== false,
          freeShippingThreshold: fresh.freeShippingThreshold || 0,
          methods: fresh.methods || [],
          updatedAt: fresh.updatedAt,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller getShippingProfile error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * Save the seller's rate card.
 *
 * The whole profile is replaced rather than patched: a zone list, a pricing
 * mode and a threshold only make sense together, and a partial merge would let a
 * seller end up with a method whose zones and pricing no longer agree.
 */
async function updateShippingProfile(req, res) {
  try {
    const sellerId = req.seller._id;
    const saved = await ShippingService.saveProfile({
      sellerId,
      sellerUserId: req.user._id,
      payload: req.body,
    });
    res.json(
      createSuccessResponse(
        {
          configured: true,
          isEnabled: saved.isEnabled !== false,
          freeShippingThreshold: saved.freeShippingThreshold || 0,
          methods: saved.methods || [],
        },
        req.id,
      ),
    );
  } catch (e) {
    if (e instanceof ShippingService.ShippingDomainError) {
      return res
        .status(e.code === "SELLER_REQUIRED" ? 403 : 400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller updateShippingProfile error", {
      error: e.message,
      sellerId: req.seller?._id,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

/**
 * Try a rate card against a candidate address without saving anything.
 *
 * A seller configuring zones needs to know whether "16" really covers the
 * postcode they think it does. Reading their own profile back through the same
 * quoting path the buyer will use is the only preview that cannot disagree with
 * production.
 */
async function previewShippingQuote(req, res) {
  try {
    const sellerId = req.seller._id;
    const address = ShippingService.isEmptyAddress(req.body.shippingAddress)
      ? {}
      : ShippingService.normalizeAddress(req.body.shippingAddress).value || {};
    const subtotal = Math.max(0, Number(req.body.subtotal) || 0);

    const quote = ShippingService.quoteProfile({
      profile: await ShippingService.getProfile(sellerId),
      address,
      subtotal,
      totalWeightKg: Math.max(0, Number(req.body.totalWeightKg) || 0),
      totalQty: Math.max(0, Number(req.body.totalQty) || 0),
    });
    res.json(createSuccessResponse(quote, req.id));
  } catch (e) {
    if (e instanceof ShippingService.ShippingDomainError) {
      return res.status(400).json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller previewShippingQuote error", {
      error: e.message,
      sellerId: req.seller?._id,
    });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FINANCE & PAYOUTS
// ════════════════════════════════════════════════════════════════════════════

async function getFinance(req, res) {
  try {
    const summary = await FinanceService.summary(req.seller._id);
    res.json(createSuccessResponse({ finance: summary }, req.id));
  } catch (e) {
    logger.error("Seller getFinance error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function getPayouts(req, res) {
  try {
    const page = safePage(req.query.page);
    const limit = safePageSize(req.query.limit);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const result = await FinanceService.listPayouts(req.seller._id, { page, limit, status });
    res.json(createSuccessResponse(result, req.id));
  } catch (e) {
    logger.error("Seller getPayouts error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function requestPayout(req, res) {
  try {
    const { amount, method, note } = req.body || {};
    const payout = await FinanceService.requestPayout({
      sellerId: req.seller._id,
      sellerUserId: req.user.id,
      amount,
      method,
      note: typeof note === "string" ? note : "",
    });

    await AuditService.log({
      userId: req.user.id,
      action: "PAYOUT_REQUESTED",
      resource: { type: "TRANSACTION", id: String(payout._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: { amount: payout.amount, method: payout.method },
    });

    res.json(createSuccessResponse({ payout: FinanceService.payoutToDTO(payout) }, req.id));
  } catch (e) {
    if (e instanceof FinanceService.PayoutDomainError) {
      const statusMap = {
        INSUFFICIENT_PAYOUT_BALANCE: 400,
        PAYOUT_BELOW_MINIMUM: 400,
        PAYOUT_BALANCE_EXCEEDED: 409,
        VALIDATION_ERROR: 400,
      };
      return res
        .status(statusMap[e.code] || 400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller requestPayout error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function cancelPayout(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه درخواست تسویه نامعتبر است", { field: "id" }, req.id));
    }

    const payout = await FinanceService.cancelPayout({
      sellerId: req.seller._id,
      payoutId: id,
      sellerUserId: req.user.id,
      note: typeof req.body?.note === "string" ? req.body.note : "",
    });

    await AuditService.log({
      userId: req.user.id,
      action: "PAYOUT_CANCELLED",
      resource: { type: "TRANSACTION", id: String(payout._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: { amount: payout.amount },
    });

    res.json(createSuccessResponse({ payout: FinanceService.payoutToDTO(payout) }, req.id));
  } catch (e) {
    if (e instanceof FinanceService.PayoutDomainError) {
      const statusMap = {
        PAYOUT_NOT_FOUND: 404,
        INVALID_PAYOUT_TRANSITION: 409,
        VALIDATION_ERROR: 400,
      };
      return res
        .status(statusMap[e.code] || 400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller cancelPayout error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Settings & team ─────────────────────────────────────────────────────────

const SETTINGS_ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  TEAM_MEMBER_USER_NOT_FOUND: 404,
  TEAM_MEMBER_SELF_INVITE: 400,
  TEAM_MEMBER_INVALID_USER: 400,
  TEAM_MEMBER_IS_OWNER: 400,
  TEAM_MEMBER_ALREADY_EXISTS: 409,
  TEAM_MEMBER_NOT_FOUND: 404,
};

function settingsError(res, e, req) {
  if (e instanceof SettingsService.SettingsDomainError) {
    return res
      .status(SETTINGS_ERROR_STATUS[e.code] || 400)
      .json(createErrorResponse(e.code, e.message, e.details, req.id));
  }
  logger.error("Seller settings/team error", {
    error: e.message,
    sellerId: req.seller?._id,
  });
  return res
    .status(500)
    .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
}

async function getSettings(req, res) {
  try {
    const settings = await SettingsService.getSettings(req.seller._id);
    res.json(createSuccessResponse({ settings }, req.id));
  } catch (e) {
    settingsError(res, e, req);
  }
}

async function updateSettings(req, res) {
  try {
    const updates = req.body || {};
    const settings = await SettingsService.updateSettings(req.seller._id, updates);

    const updatedFields = SettingsService.SETTINGS_KEYS.filter((k) => updates[k] !== undefined);
    await AuditService.log({
      userId: req.user.id,
      action: "SELLER_SETTINGS_UPDATED",
      resource: { type: "SELLER_PROFILE", id: String(req.seller._id) },
      result: "SUCCESS",
      riskLevel: "LOW",
      requestContext: req,
      metadata: { updatedFields },
    });

    res.json(createSuccessResponse({ settings }, req.id));
  } catch (e) {
    settingsError(res, e, req);
  }
}

async function listTeam(req, res) {
  try {
    const team = await SettingsService.listTeam(req.seller._id);
    res.json(createSuccessResponse(team, req.id));
  } catch (e) {
    settingsError(res, e, req);
  }
}

async function inviteTeam(req, res) {
  try {
    const { phone, role, note } = req.body || {};
    const result = await SettingsService.inviteTeam({
      sellerId: req.seller._id,
      ownerUserId: req.user.id,
      phone: typeof phone === "string" ? phone : "",
      role,
      note,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "TEAM_MEMBER_INVITED",
      resource: { type: "SELLER_PROFILE", id: String(req.seller._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: {
        userId: result.member.userId,
        name: result.member.name,
        role: result.member.role,
        roleChanged: result.roleChanged,
      },
    });

    res.json(createSuccessResponse({ member: result.member }, req.id));
  } catch (e) {
    settingsError(res, e, req);
  }
}

async function changeTeamRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body || {};
    const result = await SettingsService.changeTeamRole({
      sellerId: req.seller._id,
      memberId: id,
      role,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "TEAM_MEMBER_ROLE_CHANGED",
      resource: { type: "SELLER_PROFILE", id: String(req.seller._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: {
        userId: result.member.userId,
        from: result.from,
        to: result.member.role,
      },
    });

    res.json(createSuccessResponse({ member: result.member }, req.id));
  } catch (e) {
    settingsError(res, e, req);
  }
}

async function removeTeamMember(req, res) {
  try {
    const { id } = req.params;
    const removed = await SettingsService.removeTeamMember({
      sellerId: req.seller._id,
      memberId: id,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "TEAM_MEMBER_REMOVED",
      resource: { type: "SELLER_PROFILE", id: String(req.seller._id) },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      requestContext: req,
      metadata: { userId: removed.userId, role: removed.role },
    });

    res.json(
      createSuccessResponse({ id: removed.id, message: "عضو تیم حذف شد" }, req.id),
    );
  } catch (e) {
    settingsError(res, e, req);
  }
}

async function listSellerReviews(req, res) {
  try {
    const sellerId = req.seller._id;
    const { status, productId, page: pageRaw, limit: limitRaw } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);

    if (status && status !== "published" && status !== "hidden") {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "وضعیت دیدگاه نامعتبر است", { field: "status" }, req.id));
    }

    const result = await StorefrontReviewService.listSellerReviews({
      sellerId,
      page,
      limit,
      status,
      productId,
    });

    res.json(
      createSuccessResponse(
        { items: result.items, total: result.total, page, limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Seller listSellerReviews error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function setReviewVisibility(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه دیدگاه نامعتبر است", { field: "id" }, req.id));
    }

    const review = await StorefrontReviewService.setReviewVisibility({
      reviewId: id,
      sellerId: req.seller._id,
      status,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "REVIEW_VISIBILITY_CHANGED",
      resource: { type: "REVIEW", id: String(review.id) },
      result: "SUCCESS",
      riskLevel: status === "hidden" ? "MEDIUM" : "LOW",
      requestContext: req,
      metadata: { status },
    });

    res.json(createSuccessResponse({ review }, req.id));
  } catch (e) {
    if (e instanceof StorefrontReviewService.StorefrontReviewError) {
      const statusMap = {
        VALIDATION_ERROR: 400,
        REVIEW_NOT_FOUND: 404,
      };
      return res
        .status(statusMap[e.code] || 400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller setReviewVisibility error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function setSellerReviewReply(req, res) {
  try {
    const { id } = req.params;
    const { comment } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه دیدگاه نامعتبر است", { field: "id" }, req.id));
    }

    const review = await StorefrontReviewService.setSellerReply({
      reviewId: id,
      sellerId: req.seller._id,
      comment,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "SELLER_REVIEW_REPLIED",
      resource: { type: "REVIEW", id: String(review.id) },
      result: "SUCCESS",
      riskLevel: "LOW",
      requestContext: req,
      metadata: { productId: review.productId },
    });

    res.json(createSuccessResponse({ review }, req.id));
  } catch (e) {
    if (e instanceof StorefrontReviewService.StorefrontReviewError) {
      const statusMap = {
        VALIDATION_ERROR: 400,
        REVIEW_NOT_FOUND: 404,
      };
      return res
        .status(statusMap[e.code] || 400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller setSellerReviewReply error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function deleteSellerReviewReply(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه دیدگاه نامعتبر است", { field: "id" }, req.id));
    }

    const review = await StorefrontReviewService.removeSellerReply({
      reviewId: id,
      sellerId: req.seller._id,
    });

    await AuditService.log({
      userId: req.user.id,
      action: "SELLER_REVIEW_REPLY_REMOVED",
      resource: { type: "REVIEW", id: String(review.id) },
      result: "SUCCESS",
      riskLevel: "LOW",
      requestContext: req,
      metadata: { productId: review.productId },
    });

    res.json(createSuccessResponse({ review }, req.id));
  } catch (e) {
    if (e instanceof StorefrontReviewService.StorefrontReviewError) {
      const statusMap = {
        VALIDATION_ERROR: 400,
        REVIEW_NOT_FOUND: 404,
      };
      return res
        .status(statusMap[e.code] || 400)
        .json(createErrorResponse(e.code, e.message, e.details, req.id));
    }
    logger.error("Seller deleteSellerReviewReply error", { error: e.message, sellerId: req.seller?._id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

module.exports = {
  getDashboard,
  getProfile,
  updateProfile,
  listProducts,
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  updateProductStatus,
  bulkUpdateProductStatus,
  listInventory,
  exportInventory,
  adjustStock,
  getStockHistory,
  getAnalytics,
  getSalesReport,
  exportSalesReport,
  getPayoutReport,
  exportPayoutReport,
  getActivity,
  exportActivity,
  streamSellerEvents,
  listSellerOrders,
  exportOrders,
  getSellerOrder,
  changeOrderStatus,
  bulkUpdateOrderStatus,
  listReturns,
  getReturn,
  createReturn,
  changeReturnStatus,
  refundReturn,
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  setCouponStatus,
  exportCouponUsage,
  getSellerFulfillment,
  getShippingProfile,
  updateShippingProfile,
  previewShippingQuote,
  setOrderShippingCost,
  getFinance,
  getPayouts,
  requestPayout,
  cancelPayout,
  getSettings,
  updateSettings,
  listTeam,
  inviteTeam,
  changeTeamRole,
  removeTeamMember,
  listSellerReviews,
  setReviewVisibility,
  setSellerReviewReply,
  deleteSellerReviewReply,
};