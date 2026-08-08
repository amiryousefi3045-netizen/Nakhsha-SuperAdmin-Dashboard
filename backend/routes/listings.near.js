/**
 * listings.near.js — GET /api/listings/near
 *
 * Production-grade geospatial "nearby listings" endpoint for the canonical
 * Listing model (collection: user_listings).
 *
 * Powered by GeoService for advanced multi-filter queries.
 *
 * Mounted at /api/listings in server.js BEFORE the main listings router so
 * that the /near path is resolved before any generic /:id handler.
 *
 * Query Parameters:
 *   lat           – latitude  [-90, 90]          (required)
 *   lng           – longitude [-180, 180]        (required)
 *   radiusKm      – search radius km, default 5, min 0.1, max 50
 *   limit         – max results, default 100, min 1, max 500
 *   skip          – pagination offset, default 0
 *   category      – filter by category (pottery, carpet, etc.)
 *   type          – filter by type: post | tour | training | academy
 *   status        – filter by status: published (default) | draft | archived
 *   minPrice      – minimum price filter
 *   maxPrice      – maximum price filter
 *   minRating     – minimum rating (0-5)
 *   owner         – filter by owner ID (admin/user-specific)
 *   query         – text search query
 *   verified      – filter by verification status (true/false)
 *   useCache      – enable/disable caching (default true)
 *
 * Response envelope (backward compatible):
 *   { success: true, data: { items, meta: { radiusKm, limit, count, totalCount, hasMore } }, reqId }
 *
 * Each item includes: id, type, title, images, imagesAbs, location,
 *   distanceMeters, distanceKm, price, rating (+ all base listing fields).
 */
"use strict";

const express = require("express");
const router = express.Router();
const { Listing } = require("../models/Listing");
const { toAbsoluteUrl } = require("../utils/urls");
const {
  createSuccessResponse,
  createErrorResponse,
} = require("../utils/response");
const logger = require("../utils/logger");
const { heavyLimiter } = require("../middleware/rateLimiter");
const GeoService = require("../services/GeoService");
const GeoValidator = require("../utils/geoValidator");

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_TIMEOUT_MS = 8000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format marker DTO to include images with absolute URLs.
 * Maintains backward compatibility with existing response format.
 *
 * @param {object} marker – Marker DTO from GeoService
 * @param {object} req    – Express request (for URL generation)
 * @returns {object}
 */
function formatMarkerItem(marker, req) {
  return {
    id: marker.id,
    title: marker.title,
    type: marker.type,
    status: marker.status,
    category: marker.category,
    coordinates: marker.coordinates,
    city: marker.city,
    province: marker.province,
    distanceMeters: marker.distanceMeters,
    distanceKm: marker.distanceKm,
    location: marker.city
      ? marker.province
        ? `${marker.city}، ${marker.province}`
        : marker.city
      : "نامشخص",
    preview: marker.preview ? toAbsoluteUrl(marker.preview, req) : null,
    price: marker.price || null,
    rating: marker.rating || null,
    verified: marker.verified || false,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/listings/near
 *
 * Enhanced geospatial query with multi-filter support, powered by GeoService.
 * Uses $geoNear aggregation stage which requires the sparse 2dsphere index
 * defined in models/Listing.js.
 *
 * Example:
 *   GET /api/listings/near?lat=35.69&lng=51.42&radiusKm=5&category=pottery&minPrice=100&maxPrice=5000&limit=20
 */
router.get("/near", heavyLimiter, async (req, res) => {
  const reqId = req.id;

  try {
    // Validate all query parameters using GeoValidator
    const validation = GeoValidator.validateQueryParams(req.query);
    if (!validation.valid) {
      return res.status(400).json(
        createErrorResponse(
          "VALIDATION_ERROR",
          "خطای اعتبارسنجی پارامترها",
          {
            errors: validation.errors,
            hint: "Please check your query parameters",
          },
          reqId,
        ),
      );
    }

    const params = validation.normalized;

    // Execute geospatial query via GeoService
    const result = await GeoService.findNearbyListings(
      params.lat,
      params.lng,
      params.radiusKm,
      {
        category: params.category,
        type: params.type,
        status: params.status,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        owner: params.owner,
        minRating: params.minRating,
        query: params.query,
        verified: params.verified,
      },
      {
        limit: params.limit,
        skip: params.skip,
        lean: true,
      },
    );

    if (!result.success) {
      return res
        .status(400)
        .json(
          createErrorResponse("GEO_QUERY_ERROR", result.error, null, reqId),
        );
    }

    // Format markers with absolute image URLs for backward compatibility
    const items = result.data.map((marker) => formatMarkerItem(marker, req));

    // Return response in backward-compatible format
    return res.json(
      createSuccessResponse(
        {
          data: {
            items,
            meta: {
              radiusKm: params.radiusKm,
              limit: params.limit,
              skip: params.skip,
              count: items.length,
              totalCount: result.pagination.totalCount,
              hasMore: result.pagination.hasMore,
              executionTime: result.metadata.executionTime,
            },
          },
        },
        reqId,
      ),
    );
  } catch (err) {
    // MongoDB $geoNear requires a 2dsphere index; surface a clear 500 if missing
    if (
      err.message &&
      (err.message.includes("2dsphere") ||
        err.message.includes("geo near") ||
        err.message.includes("geoNear"))
    ) {
      logger.error("GET /api/listings/near — geo index error", {
        reqId,
        error: err.message,
      });
      return res
        .status(500)
        .json(
          createErrorResponse(
            "GEO_INDEX_ERROR",
            "ایندکس جغرافیایی پیکربندی نشده است. لطفاً با پشتیبانی تماس بگیرید",
            process.env.NODE_ENV !== "production"
              ? { detail: err.message }
              : null,
            reqId,
          ),
        );
    }

    logger.error("GET /api/listings/near — unexpected error", {
      reqId,
      error: err.message,
      stack: err.stack,
      query: req.query,
    });

    return res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_ERROR",
          "خطای داخلی سرور رخ داد",
          null,
          reqId,
        ),
      );
  }
});

/**
 * GET /api/listings/near/stats
 * Get aggregated statistics about nearby listings.
 *
 * Example:
 *   GET /api/listings/near/stats?lat=35.69&lng=51.42&radiusKm=5
 */
router.get("/near/stats", heavyLimiter, async (req, res) => {
  const reqId = req.id;

  try {
    const validation = GeoValidator.validateQueryParams(req.query);
    if (!validation.valid) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "خطای اعتبارسنجی پارامترها",
            { errors: validation.errors },
            reqId,
          ),
        );
    }

    const params = validation.normalized;

    // Build aggregation pipeline for stats
    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [params.lng, params.lat],
          },
          distanceField: "distanceMeters",
          maxDistance: params.radiusKm * 1000,
          spherical: true,
          query: { status: "published" },
        },
      },
      {
        $facet: {
          byType: [{ $group: { _id: "$type", count: { $sum: 1 } } }],
          byCategory: [{ $group: { _id: "$category", count: { $sum: 1 } } }],
          priceStats: [
            { $match: { type: "post", price: { $exists: true } } },
            {
              $group: {
                _id: null,
                min: { $min: "$price" },
                max: { $max: "$price" },
                avg: { $avg: "$price" },
                count: { $sum: 1 },
              },
            },
          ],
          ratingStats: [
            { $match: { rating: { $exists: true } } },
            {
              $group: {
                _id: null,
                avgRating: { $avg: "$rating" },
                verifiedCount: { $sum: { $cond: ["$verified", 1, 0] } },
              },
            },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const stats = await Listing.aggregate(pipeline).option({
      maxTimeMS: PIPELINE_TIMEOUT_MS,
    });

    const result = stats[0];

    return res.json(
      createSuccessResponse(
        {
          stats: {
            totalInRadius: result.totalCount[0]?.count || 0,
            byType: Object.fromEntries(
              result.byType.map((item) => [item._id, item.count]),
            ),
            byCategory: Object.fromEntries(
              result.byCategory.map((item) => [item._id, item.count]),
            ),
            priceRange: result.priceStats[0]
              ? {
                  min: result.priceStats[0].min,
                  max: result.priceStats[0].max,
                  avg: Math.round(result.priceStats[0].avg),
                  count: result.priceStats[0].count,
                }
              : null,
            averageRating: result.ratingStats[0]?.avgRating || null,
            verifiedCount: result.ratingStats[0]?.verifiedCount || 0,
            boundingBox: GeoService.calculateBoundingBox(
              params.lat,
              params.lng,
              params.radiusKm,
            ),
          },
        },
        reqId,
      ),
    );
  } catch (err) {
    logger.error("GET /api/listings/near/stats — error", {
      reqId,
      error: err.message,
    });

    return res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_ERROR",
          "خطای داخلی سرور رخ داد",
          null,
          reqId,
        ),
      );
  }
});

module.exports = router;
