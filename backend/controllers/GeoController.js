/**
 * GeoController — HTTP request handlers for geospatial endpoints.
 *
 * Handles:
 * - GET /api/listings/near — Find listings near coordinates
 * - Parameter validation
 * - Response formatting
 * - Error handling
 *
 * All responses follow a consistent format:
 * {
 *   success: boolean,
 *   data: [...],
 *   pagination: {...},
 *   metadata: {...},
 *   error?: string
 * }
 */

const GeoService = require("../services/GeoService");
const CacheManager = require("../utils/cacheManager");

class GeoController {
  /**
   * GET /api/listings/near
   * Find listings near a geographic point with advanced filtering.
   *
   * Query Parameters:
   * - lat (required): latitude -90 to 90
   * - lng (required): longitude -180 to 180
   * - radiusKm (optional): search radius in km, default 5, min 0.1, max 50
   * - limit (optional): results per page, default 100, min 1, max 500
   * - skip (optional): pagination offset, default 0
   * - category (optional): filter by category (pottery, carpet, etc.)
   * - type (optional): filter by type (post, tour, training, academy)
   * - status (optional): filter by status (published, draft), default published
   * - minPrice (optional): minimum price filter
   * - maxPrice (optional): maximum price filter
   * - minRating (optional): minimum rating filter (0-5)
   * - owner (optional): filter by owner ID (admin/user-specific)
   * - query (optional): text search query
   * - useCache (optional): enable/disable Redis cache, default true
   *
   * Response (200 OK):
   * {
   *   success: true,
   *   data: [
   *     {
   *       id, title, coordinates, category, type, status,
   *       distanceKm, distanceMeters, preview,
   *       price?, rating?, verified?
   *     },
   *     ...
   *   ],
   *   pagination: {
   *     limit: 100,
   *     skip: 0,
   *     totalCount: 542,
   *     hasMore: true
   *   },
   *   metadata: {
   *     executionTime: 125,
   *     queryRadius: 5,
   *     resultsCount: 100,
   *     fromCache: false
   *   }
   * }
   *
   * Error Response (400/500):
   * {
   *   success: false,
   *   error: "Error message",
   *   data: [],
   *   pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false }
   * }
   */
  async getListingsNear(req, res) {
    try {
      const startTime = Date.now();

      // Extract and validate query parameters
      const validation = GeoService.validateQueryParams(req.query);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: "خطای اعتبارسنجی پارامترها",
          details: validation.errors,
          data: [],
          pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
        });
      }

      const params = validation.normalized;
      const useCache = req.query.useCache !== "false"; // Default to true

      // Generate cache key
      const cacheKey = CacheManager.generateKey(
        params.lat,
        params.lng,
        params.radiusKm,
        params,
      );

      // Try cache first
      if (useCache) {
        const cachedResult = await CacheManager.get(cacheKey);
        if (cachedResult) {
          cachedResult.metadata.fromCache = true;
          cachedResult.metadata.cacheLookupTime = Date.now() - startTime;
          return res.status(200).json(cachedResult);
        }
      }

      // Execute geospatial query
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
        return res.status(400).json({
          success: false,
          error: result.error,
          data: [],
          pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
        });
      }

      // Enrich response with location names
      result.data = result.data.map((marker) => ({
        ...marker,
        location: marker.city
          ? marker.province
            ? `${marker.city}، ${marker.province}`
            : marker.city
          : "نامشخص",
      }));

      // Cache the result (unless skip is used for pagination)
      if (useCache && params.skip === 0) {
        await CacheManager.set(cacheKey, result, 300); // 5 min TTL
      }

      result.metadata.totalExecutionTime = Date.now() - startTime;
      result.metadata.fromCache = false;

      return res.status(200).json(result);
    } catch (error) {
      console.error("[GeoController] Error in getListingsNear:", error);

      return res.status(500).json({
        success: false,
        error: "خطا در پردازش درخواست. لطفا دوباره تلاش کنید.",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
        data: [],
        pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
      });
    }
  }

  /**
   * GET /api/listings/near/stats
   * Get statistics about nearby listings (aggregated).
   *
   * Returns:
   * {
   *   success: true,
   *   stats: {
   *     totalInRadius: 1200,
   *     byType: { post: 800, tour: 300, training: 100 },
   *     byCategory: { pottery: 400, carpet: 350, ... },
   *     priceRange: { min: 50000, max: 5000000, avg: 250000 },
   *     averageRating: 4.2,
   *     verifiedCount: 900,
   *     boundingBox: { minLat, maxLat, minLng, maxLng }
   *   }
   * }
   */
  async getListingsNearStats(req, res) {
    try {
      const validation = GeoService.validateQueryParams(req.query);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: "خطای اعتبارسنجی پارامترها",
          details: validation.errors,
        });
      }

      const params = validation.normalized;
      const mongoose = require("mongoose");
      const Listing = mongoose.model("Listing");

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
              {
                $match: { type: "post", price: { $exists: true } },
              },
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
              {
                $match: { rating: { $exists: true } },
              },
              {
                $group: {
                  _id: null,
                  avgRating: { $avg: "$rating" },
                  verifiedCount: {
                    $sum: { $cond: ["$verified", 1, 0] },
                  },
                },
              },
            ],
            totalCount: [{ $count: "count" }],
          },
        },
      ];

      const stats = await Listing.aggregate(pipeline);
      const result = stats[0];

      return res.status(200).json({
        success: true,
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
      });
    } catch (error) {
      console.error("[GeoController] Error in getListingsNearStats:", error);
      return res.status(500).json({
        success: false,
        error: "خطا در دریافت آمار",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  /**
   * Middleware to rate-limit geospatial queries.
   * Can be used with express-rate-limit.
   */
  static rateLimitConfig() {
    return {
      windowMs: 60 * 1000, // 1 minute
      max: 100, // max 100 requests per minute per IP
      message:
        "درخواست‌های زیادی از این آدرس IP دریافت شد. لطفا بعدا دوباره تلاش کنید.",
      standardHeaders: true,
      legacyHeaders: false,
    };
  }
}

module.exports = new GeoController();
