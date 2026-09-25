const mongoose = require("mongoose");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Product = require("../models/Product");
const StockAdjustment = require("../models/StockAdjustment");
const Craft = require("../models/Craft");
const Order = require("../models/Order");
const OrderService = require("../services/OrderService");
const FinanceService = require("../services/FinanceService");
const SalesReportService = require("../services/SalesReportService");
const AuditService = require("../services/AuditService");
const SettingsService = require("../services/SettingsService");
const StorefrontReviewService = require("../services/StorefrontReviewService");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
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

function sellerProfileToDTO(profile) {
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
          profile: sellerProfileToDTO(req.seller),
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
    res.json(createSuccessResponse({ profile: sellerProfileToDTO(req.seller) }, req.id));
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

    res.json(createSuccessResponse({ profile: sellerProfileToDTO(profile) }, req.id));
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

// ════════════════════════════════════════════════════════════════════════════
// INVENTORY
// ════════════════════════════════════════════════════════════════════════════

async function listInventory(req, res) {
  try {
    const sellerId = req.seller._id;
    const { status, page: pageRaw, limit: limitRaw, q } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);
    const skip = (page - 1) * limit;

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

async function getAnalytics(req, res) {
  try {
    const sellerId = req.seller._id;

    const [inventory, statusDist] = await Promise.all([
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
    ]);

    const inventoryRow = inventory[0] || { totalOnHand: 0, totalReserved: 0, products: 0, soldUnits: 0 };

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
          note: "گزارش متن کامل مالی و فروش به‌محض پیاده‌سازی دامنه سفارش/پرداخت فعال می‌شود.",
        },
        req.id,
      ),
    );
  } catch (e) {
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

// ════════════════════════════════════════════════════════════════════════════
// ORDERS & FULFILLMENT  (real domain — see services/OrderService.js)
// ════════════════════════════════════════════════════════════════════════════

const ORDER_STATUSES = Order.ORDER_STATUSES;

async function listSellerOrders(req, res) {
  try {
    const sellerId = req.seller._id;
    const { status, q, page: pageRaw, limit: limitRaw } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);

    const result = await OrderService.listOrders(sellerId, { page, limit, status, q });

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

    res.json(createSuccessResponse({ order: OrderService.orderToDTO(order) }, req.id));
  } catch (e) {
    if (e instanceof OrderService.OrderDomainError) {
      const statusMap = {
        INVALID_TRANSITION: 409,
        INSUFFICIENT_STOCK: 400,
        VALIDATION_ERROR: 400,
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
  listInventory,
  adjustStock,
  getStockHistory,
  getAnalytics,
  getSalesReport,
  exportSalesReport,
  getActivity,
  listSellerOrders,
  getSellerOrder,
  changeOrderStatus,
  getSellerFulfillment,
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