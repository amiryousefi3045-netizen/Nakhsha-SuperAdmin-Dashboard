/**
 * listing.geo.js — Geospatial service for listings module.
 *
 * Delegates to GeoService for MongoDB aggregation pipeline operations.
 * Provides a clean interface for geospatial queries within the listings module context.
 *
 * Features:
 * - Nearby listings (proximity queries)
 * - Clustered listings (geohash-based)
 * - Heatmap data generation
 * - Within-boundary queries
 * - Comprehensive parameter validation
 *
 * All queries return lean documents for performance.
 */

const geoService = require("../../services/GeoService");

class ListingGeoService {
  constructor() {
    this.geoService = geoService; // GeoService exports a singleton instance
  }

  /**
   * Find listings near a geographic point with advanced filtering.
   *
   * @param {number} latitude - Must be -90 to 90
   * @param {number} longitude - Must be -180 to 180
   * @param {number} radiusKm - Search radius in kilometers (0.1 to 50)
   * @param {object} filters - Optional filters
   *   - category: string (e.g., 'pottery')
   *   - type: string ('post', 'tour', 'training', 'academy')
   *   - status: string ('draft', 'published', 'archived')
   *   - minPrice: number
   *   - maxPrice: number
   *   - owner: ObjectId or string
   *   - minRating: number (0-5)
   *   - query: string (text search)
   *   - verified: boolean
   * @param {object} options - Query options
   *   - limit: number (default 100, max 500)
   *   - skip: number (default 0)
   *   - useCache: boolean (default true)
   * @returns {Promise<{success: boolean, data: array, pagination: object, metadata: object, error?: string}>}
   */
  async findNearby(latitude, longitude, radiusKm, filters = {}, options = {}) {
    return this.geoService.findNearbyListings(
      latitude,
      longitude,
      radiusKm,
      filters,
      {
        limit: options.limit,
        skip: options.skip,
        lean: true,
      },
    );
  }

  /**
   * Generate heatmap data for a geographic area.
   * Divides area into grid cells with aggregated statistics.
   *
   * @param {number} latitude - Center latitude
   * @param {number} longitude - Center longitude
   * @param {number} radiusKm - Search radius
   * @param {object} filters - Optional filters
   * @param {object} options - Query options
   *   - gridSize: number (5-50, default 10)
   *   - aggregateBy: 'count' | 'avgPrice' | 'avgRating'
   *   - includeDetails: boolean
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  async generateHeatmap(
    latitude,
    longitude,
    radiusKm,
    filters = {},
    options = {},
  ) {
    return this.geoService.generateHeatmapData(
      latitude,
      longitude,
      radiusKm,
      filters,
      {
        gridSize: options.gridSize,
        aggregateBy: options.aggregateBy,
        includeDetails: options.includeDetails,
      },
    );
  }

  /**
   * Find listings within a geographic boundary (bounding box).
   *
   * @param {number} minLat - Minimum latitude (south)
   * @param {number} maxLat - Maximum latitude (north)
   * @param {number} minLng - Minimum longitude (west)
   * @param {number} maxLng - Maximum longitude (east)
   * @param {object} filters - Optional filters
   * @param {object} options - Query options
   *   - limit: number (default 100, max 500)
   *   - skip: number (default 0)
   * @returns {Promise<{success: boolean, data: array, pagination: object, error?: string}>}
   */
  async findWithinBoundary(
    minLat,
    maxLat,
    minLng,
    maxLng,
    filters = {},
    options = {},
  ) {
    // Validate boundary coordinates
    if (
      !Number.isFinite(minLat) ||
      !Number.isFinite(maxLat) ||
      !Number.isFinite(minLng) ||
      !Number.isFinite(maxLng)
    ) {
      return {
        success: false,
        error: "مختصات مرزی نامعتبر هستند",
        data: [],
        pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
      };
    }

    if (minLat > maxLat) {
      return {
        success: false,
        error: "حداقل عرض جغرافیایی نباید بزرگتر از حداکثر باشد",
        data: [],
        pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
      };
    }

    if (minLng > maxLng) {
      return {
        success: false,
        error: "حداقل طول جغرافیایی نباید بزرگتر از حداکثر باشد",
        data: [],
        pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
      };
    }

    // Delegate to existing boundary query in GeoService
    // Note: This would need to be implemented in GeoService if not already
    return (
      this.geoService.findWithinBoundary?.(
        minLat,
        maxLat,
        minLng,
        maxLng,
        filters,
        options,
      ) || {
        success: false,
        error: "Within-boundary query not yet implemented",
        data: [],
        pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
      }
    );
  }

  /**
   * Get geospatial statistics for a given area.
   * Returns aggregated counts, average ratings, price stats, etc.
   *
   * @param {number} latitude - Center latitude
   * @param {number} longitude - Center longitude
   * @param {number} radiusKm - Search radius
   * @param {object} filters - Optional filters
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  async getStatsNearby(latitude, longitude, radiusKm, filters = {}) {
    // Validate inputs
    const geoValidation = this.geoService.validateGeoPoint(latitude, longitude);
    if (!geoValidation.valid) {
      return { success: false, error: geoValidation.error };
    }

    const radiusValidation = this.geoService.validateRadius(radiusKm);
    if (!radiusValidation.valid) {
      return { success: false, error: radiusValidation.error };
    }

    try {
      const mongoose = require("mongoose");
      const { Listing } = require("../models/Listing");

      // Build aggregation pipeline for statistics
      const pipeline = [
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            distanceField: "distanceMeters",
            maxDistance: radiusKm * 1000,
            spherical: true,
            query: {
              status: filters.status || "published",
              ...(filters.type && { type: filters.type }),
            },
          },
        },
        {
          $match: this.geoService.buildMatchQuery(filters, "Listing"),
        },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            byType: [{ $group: { _id: "$type", count: { $sum: 1 } } }],
            byCategory: [{ $group: { _id: "$category", count: { $sum: 1 } } }],
            avgRating: [{ $group: { _id: null, avg: { $avg: "$rating" } } }],
            avgPrice: [
              {
                $match: { type: "post", price: { $exists: true } },
              },
              { $group: { _id: null, avg: { $avg: "$price" } } },
            ],
            verified: [{ $group: { _id: "$verified", count: { $sum: 1 } } }],
          },
        },
      ];

      const results = await Listing.aggregate(pipeline);

      if (results.length === 0) {
        return {
          success: true,
          data: {
            totalCount: 0,
            byType: [],
            byCategory: [],
            avgRating: null,
            avgPrice: null,
            verified: [],
          },
        };
      }

      const stats = results[0];

      return {
        success: true,
        data: {
          totalCount: stats.totalCount[0]?.count || 0,
          byType: stats.byType,
          byCategory: stats.byCategory,
          avgRating: stats.avgRating[0]?.avg || 0,
          avgPrice: stats.avgPrice[0]?.avg || 0,
          verified: stats.verified,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || "Statistics query failed",
      };
    }
  }

  /**
   * Validate geospatial query parameters.
   *
   * @param {object} params - Query parameters
   * @returns {{valid: boolean, errors: array, normalized?: object}}
   */
  validateGeoQuery(params) {
    return this.geoService.validateQueryParams(params);
  }

  /**
   * Format distance for display.
   *
   * @param {number} distanceMeters
   * @returns {string}
   */
  formatDistance(distanceMeters) {
    return this.geoService.formatDistance(distanceMeters);
  }

  /**
   * Invalidate geospatial cache for a region.
   * (Placeholder for future caching implementation)
   *
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusKm
   */
  invalidateRegionCache(latitude, longitude, radiusKm) {
    // TODO: Implement cache invalidation when CacheManager is integrated
    // This would be called when a listing location changes
  }
}

// Export singleton instance
module.exports = new ListingGeoService();
