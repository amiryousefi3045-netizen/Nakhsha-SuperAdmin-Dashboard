/**
 * listings.heatmap.js — GET /api/listings/heatmap
 *
 * Production-grade heatmap data endpoint for geospatial visualization.
 * Returns grid-based aggregation (density, price, rating) for map heatmap rendering.
 *
 * Mounted at /api/listings in server.js BEFORE the main listings router.
 *
 * Query Parameters:
 *   lat           – latitude  [-90, 90]          (required)
 *   lng           – longitude [-180, 180]        (required)
 *   radiusKm      – search radius km, default 5, min 0.1, max 50
 *   gridSize      – cells per edge, default 10, min 5, max 50
 *   aggregateBy   – aggregation type: count (default) | avgPrice | avgRating
 *   category      – filter by category
 *   type          – filter by type (post | tour | training | academy)
 *   status        – filter by status (default: published)
 *   minPrice      – minimum price filter
 *   maxPrice      – maximum price filter
 *   minRating     – minimum rating (0-5)
 *   includeDetails – include min/max per cell (true/false, default false)
 *
 * Response envelope:
 *   {
 *     success: true,
 *     data: {
 *       grid: [{lat, lng, value, cellCount, details?}],
 *       bounds: {north, south, east, west},
 *       center: {lat, lng},
 *       gridSize: number,
 *       aggregateBy: string,
 *       cellCount: number,
 *       totalListings: number
 *     },
 *     metadata: {executionTime, queryRadius},
 *     reqId
 *   }
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
 * GET /api/listings/heatmap
 *
 * Generate heatmap data for geospatial visualization.
 * Divides search area into grid and aggregates data per cell.
 *
 * Example:
 *   GET /api/listings/heatmap?lat=35.69&lng=51.42&radiusKm=5&gridSize=10&aggregateBy=count
 */
router.get("/heatmap", heavyLimiter, async (req, res) => {
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

    // Validate gridSize
    const gridSize = parseInt(req.query.gridSize) || 10;
    if (gridSize < 5 || gridSize > 50) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "INVALID_GRID_SIZE",
            "Grid size must be between 5 and 50",
            null,
            reqId,
          ),
        );
    }

    // Validate aggregateBy
    const validAggregations = ["count", "avgPrice", "avgRating"];
    const aggregateBy = (req.query.aggregateBy || "count").toLowerCase();
    if (!validAggregations.includes(aggregateBy)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "INVALID_AGGREGATION",
            `Aggregation must be one of: ${validAggregations.join(", ")}`,
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
    const result = await GeoService.generateHeatmapData(
      lat,
      lng,
      radiusKm,
      filters,
      {
        gridSize,
        aggregateBy,
        includeDetails: req.query.includeDetails === "true",
      },
    );

    if (!result.success) {
      return res
        .status(400)
        .json(createErrorResponse("HEATMAP_ERROR", result.error, null, reqId));
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
    logger.error("[Heatmap Route] Error:", error);
    return res.status(500).json(
      createErrorResponse(
        "SERVER_ERROR",
        "Failed to generate heatmap data",
        {
          error: error.message,
        },
        reqId,
      ),
    );
  }
});

module.exports = router;
