/**
 * listings.clusters.js — GET /api/listings/clusters
 *
 * Production-grade clustering endpoint for map views at different zoom levels.
 * Groups nearby listings into geohash-based clusters for efficient visualization.
 *
 * Mounted at /api/listings in server.js BEFORE the main listings router.
 *
 * Query Parameters:
 *   lat           – latitude  [-90, 90]          (required)
 *   lng           – longitude [-180, 180]        (required)
 *   radiusKm      – search radius km, default 5, min 0.1, max 50
 *   zoomLevel     – map zoom level 0-20, default 12 (city level)
 *   limit         – max clusters to return, default 100, max 500
 *   skip          – pagination offset, default 0
 *   category      – filter by category
 *   type          – filter by type (post | tour | training | academy)
 *   status        – filter by status (default: published)
 *   minPrice      – minimum price filter
 *   maxPrice      – maximum price filter
 *   minRating     – minimum rating (0-5)
 *
 * Response envelope:
 *   {
 *     success: true,
 *     data: {
 *       clusters: [{
 *         geohash: string,
 *         bounds: {north, south, east, west},
 *         count: number,
 *         sample: {id, title, coordinates, price, preview}
 *       }],
 *       center: {lat, lng},
 *       zoomLevel: number,
 *       zoomRecommendation: string,
 *       totalClusters: number,
 *       geohashPrecision: number
 *     },
 *     metadata: {executionTime, queryRadius},
 *     reqId
 *   }
 *
 * Zoom Level Mapping:
 *   0-2    → Precision 1 (continent/ocean scale)
 *   3-5    → Precision 2-3 (country scale)
 *   6-8    → Precision 4-5 (region scale)
 *   9-11   → Precision 6 (city scale)
 *   12-14  → Precision 7-8 (neighborhood scale)
 *   15-17  → Precision 9 (street scale)
 *   18-20  → Precision 10-11 (building scale)
 */
"use strict";

const express = require("express");
const router = express.Router();
const {
  createSuccessResponse,
  createErrorResponse,
} = require("../utils/response");
const logger = require("../utils/logger");
const { heavyLimiter } = require("../middleware/rateLimiter");
const GeoService = require("../services/GeoService");
const GeoValidator = require("../utils/geoValidator");

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/listings/clusters
 *
 * Cluster nearby listings by geohash for efficient map rendering.
 * Precision adapts to zoom level for consistent cluster sizes.
 *
 * Example:
 *   GET /api/listings/clusters?lat=35.69&lng=51.42&radiusKm=5&zoomLevel=12&category=pottery
 */
router.get("/clusters", heavyLimiter, async (req, res) => {
  const reqId = req.id;

  try {
    // Validate geographic point
    const geoValidation = GeoValidator.validateGeoPoint(
      req.query.lat,
      req.query.lng,
    );
    if (!geoValidation.valid) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "INVALID_GEO_POINT",
            geoValidation.error,
            null,
            reqId,
          ),
        );
    }

    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    // Validate radius
    const radiusValidation = GeoValidator.validateRadius(req.query.radiusKm);
    if (!radiusValidation.valid) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "INVALID_RADIUS",
            radiusValidation.error,
            null,
            reqId,
          ),
        );
    }

    const radiusKm = parseFloat(req.query.radiusKm) || 5;

    // Validate zoomLevel
    const zoomLevel = parseInt(req.query.zoomLevel) || 12;
    if (zoomLevel < 0 || zoomLevel > 20) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "INVALID_ZOOM_LEVEL",
            "Zoom level must be between 0 and 20",
            null,
            reqId,
          ),
        );
    }

    // Validate pagination
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);

    if (limit < 1 || skip < 0) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "INVALID_PAGINATION",
            "Limit must be >= 1 and skip must be >= 0",
            null,
            reqId,
          ),
        );
    }

    // Build filters from query parameters
    const filters = {
      category: req.query.category,
      type: req.query.type,
      status: req.query.status || "published",
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      minRating: req.query.minRating,
    };

    // Call GeoService
    const result = await GeoService.clusterNearbyByGeohash(
      lat,
      lng,
      radiusKm,
      filters,
      {
        zoomLevel,
        limit,
        skip,
      },
    );

    if (!result.success) {
      return res
        .status(400)
        .json(
          createErrorResponse("CLUSTERING_ERROR", result.error, null, reqId),
        );
    }

    // Return success response
    return res.status(200).json(
      createSuccessResponse(
        result.data,
        {
          executionTime: result.metadata.executionTime,
          queryRadius: result.metadata.queryRadius,
        },
        reqId,
      ),
    );
  } catch (error) {
    logger.error("[Clusters Route] Error:", error);
    return res.status(500).json(
      createErrorResponse(
        "SERVER_ERROR",
        "Failed to generate clusters",
        {
          error: error.message,
        },
        reqId,
      ),
    );
  }
});

module.exports = router;
