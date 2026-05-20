/**
 * listings.within-boundary.js — POST /api/listings/within-boundary
 *
 * Production-grade polygon/boundary search endpoint.
 * Finds listings within a geographic polygon using $geoWithin operator.
 *
 * Mounted at /api/listings in server.js BEFORE the main listings router.
 *
 * Request Body:
 *   {
 *     polygon: [[lng, lat], [lng, lat], ...], // Must be closed (first == last)
 *     filters?: {
 *       category: string,
 *       type: 'post' | 'tour' | 'training' | 'academy',
 *       status: 'published' | 'draft' | 'archived',
 *       minPrice: number,
 *       maxPrice: number,
 *       minRating: 0-5
 *     },
 *     pagination?: {
 *       limit: number (default 100, max 500),
 *       skip: number (default 0)
 *     }
 *   }
 *
 * Query Parameters:
 *   includeDetails – include min/max values for numeric filters (true/false)
 *
 * Response envelope:
 *   {
 *     success: true,
 *     data: {
 *       items: [{id, title, coordinates, distanceKm, price, rating, ...}],
 *       polygon: {type: "Polygon", coordinates: [...]},
 *       bounds: {north, south, east, west},
 *       pagination: {limit, skip, totalCount, hasMore}
 *     },
 *     metadata: {executionTime, polygonPointCount},
 *     reqId
 *   }
 *
 * Constraints:
 *   - Polygon must be closed (first point == last point)
 *   - Polygon must have 4+ points (including closing point)
 *   - Polygon must have <100 points (complexity limit)
 *   - All points must be valid [lng, lat] pairs within coordinate bounds
 *
 * Use Cases:
 *   - Regional/administrative boundary searches
 *   - Custom user-drawn area selection
 *   - Neighborhood-level filtering
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate request body structure.
 *
 * @param {object} body
 * @returns {{valid: boolean, error?: string, normalized?: object}}
 */
function validateRequest(body) {
  if (!body) {
    return { valid: false, error: "Request body is required" };
  }

  if (!Array.isArray(body.polygon)) {
    return {
      valid: false,
      error: "Field 'polygon' must be an array of [lng, lat] pairs",
    };
  }

  // Pagination defaults
  const limit = Math.min(parseInt(body.pagination?.limit) || 100, 500);
  const skip = Math.max(parseInt(body.pagination?.skip) || 0, 0);

  if (limit < 1) {
    return { valid: false, error: "Pagination limit must be >= 1" };
  }

  return {
    valid: true,
    normalized: {
      polygon: body.polygon,
      filters: body.filters || {},
      limit,
      skip,
    },
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/listings/within-boundary
 *
 * Search listings within a geographic polygon.
 * Useful for region selection, custom area searches, boundary-based filtering.
 *
 * Example:
 *   POST /api/listings/within-boundary
 *   {
 *     "polygon": [
 *       [51.30, 35.65],
 *       [51.50, 35.65],
 *       [51.50, 35.75],
 *       [51.30, 35.75],
 *       [51.30, 35.65]
 *     ],
 *     "filters": {
 *       "category": "pottery",
 *       "status": "published"
 *     },
 *     "pagination": {
 *       "limit": 50,
 *       "skip": 0
 *     }
 *   }
 */
router.post("/within-boundary", heavyLimiter, async (req, res) => {
  const reqId = req.id;

  try {
    // Validate request body
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      return res
        .status(400)
        .json(
          createErrorResponse("INVALID_REQUEST", validation.error, null, reqId),
        );
    }

    const { polygon, filters, limit, skip } = validation.normalized;

    // Call GeoService to execute polygon search
    const result = await GeoService.findWithinPolygon(polygon, filters, {
      limit,
      skip,
      lean: true,
    });

    if (!result.success) {
      // Distinguish validation errors from query errors
      const statusCode = result.error?.includes("Polygon") ? 400 : 500;
      return res
        .status(statusCode)
        .json(
          createErrorResponse(
            "POLYGON_SEARCH_ERROR",
            result.error,
            null,
            reqId,
          ),
        );
    }

    // Return success response
    return res.status(200).json(
      createSuccessResponse(
        result.data,
        {
          executionTime: result.metadata.executionTime,
          polygonPointCount: result.metadata.polygonPointCount,
        },
        reqId,
      ),
    );
  } catch (error) {
    logger.error("[Polygon Search Route] Error:", error);
    return res.status(500).json(
      createErrorResponse(
        "SERVER_ERROR",
        "Failed to search within polygon",
        {
          error: error.message,
        },
        reqId,
      ),
    );
  }
});

module.exports = router;
