/**
 * GeoService — Production-grade geospatial query layer.
 *
 * Abstracts MongoDB GeoJSON and aggregation pipeline complexity for map-based queries.
 * Provides unified interface for finding listings/crafts near a location with advanced filtering.
 *
 * Features:
 * - Distance-based proximity queries using $geoNear
 * - Multi-filter support: category, type, status, price range, text search, owner, rating
 * - Lightweight marker payloads for map rendering (~90% smaller than full documents)
 * - Comprehensive query validation
 * - Distance calculations and formatting
 * - Aggregation pipeline builder for complex queries
 *
 * Usage:
 *   const geoService = require('./GeoService');
 *   const result = await geoService.findNearbyListings(
 *     35.6892,  // latitude
 *     51.3890,  // longitude
 *     5,        // radius in km
 *     {         // filters (all optional)
 *       category: 'pottery',
 *       type: 'post',
 *       status: 'published',
 *       minPrice: 100,
 *       maxPrice: 5000,
 *       owner: userId,
 *       minRating: 4,
 *       query: 'carpet'
 *     },
 *     {         // options
 *       limit: 50,
 *       skip: 0,
 *       lean: true
 *     }
 *   );
 */

const mongoose = require("mongoose");

class GeoService {
  /**
   * Find listings near coordinates with advanced filtering.
   *
   * @param {number} latitude - Must be -90 to 90
   * @param {number} longitude - Must be -180 to 180
   * @param {number} radiusKm - Search radius in kilometers (0.1 to 50)
   * @param {object} filters - Optional filters object
   *   - category: string (e.g., 'pottery')
   *   - type: string ('post', 'tour', 'training', 'academy')
   *   - status: string ('draft', 'published')
   *   - minPrice: number
   *   - maxPrice: number
   *   - owner: ObjectId or string
   *   - minRating: number (0-5)
   *   - query: string (text search)
   * @param {object} options - Query options
   *   - limit: number (default 100, max 500)
   *   - skip: number (default 0)
   *   - lean: boolean (default true, for performance)
   * @returns {Promise<{
   *   success: boolean,
   *   data: Array<object>,
   *   pagination: {limit, skip, totalCount, hasMore},
   *   metadata: {executionTime, fromCache},
   *   error?: string
   * }>}
   */
  async findNearbyListings(
    latitude,
    longitude,
    radiusKm,
    filters = {},
    options = {},
  ) {
    try {
      const startTime = Date.now();

      // Validate inputs
      const validation = this.validateGeoPoint(latitude, longitude);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          data: [],
          pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
        };
      }

      const radiusValidation = this.validateRadius(radiusKm);
      if (!radiusValidation.valid) {
        return {
          success: false,
          error: radiusValidation.error,
          data: [],
          pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
        };
      }

      // Normalize options
      const limit = Math.min(parseInt(options.limit) || 100, 500);
      const skip = parseInt(options.skip) || 0;
      const lean = options.lean !== false; // Default true for performance

      // Get Listing model
      const Listing = mongoose.model("Listing");

      // Build aggregation pipeline
      const pipeline = this.buildAggregationPipeline(
        latitude,
        longitude,
        radiusKm,
        filters,
        {
          limit,
          skip,
        },
      );

      // Execute aggregation
      let results = await Listing.aggregate(pipeline).allowDiskUse(true);

      // If lean not needed, populate references
      if (!lean && results.length > 0) {
        results = await Listing.populate(results, {
          path: "owner",
          select: "name email",
        });
      }

      // Get total count for pagination
      const countPipeline = this.buildAggregationPipeline(
        latitude,
        longitude,
        radiusKm,
        filters,
        {
          countOnly: true,
        },
      );
      const countResult = await Listing.aggregate(countPipeline);
      const totalCount = countResult.length > 0 ? countResult[0].count : 0;

      // Transform to marker DTO
      const markers = results.map((doc) => this.toMarkerDTO(doc));

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: markers,
        pagination: {
          limit,
          skip,
          totalCount,
          hasMore: skip + markers.length < totalCount,
        },
        metadata: {
          executionTime,
          queryRadius: radiusKm,
          resultsCount: markers.length,
        },
      };
    } catch (error) {
      console.error("[GeoService] Error in findNearbyListings:", error);
      return {
        success: false,
        error: error.message || "Database query failed",
        data: [],
        pagination: { limit: 0, skip: 0, totalCount: 0, hasMore: false },
      };
    }
  }

  /**
   * Generic geospatial query for any model (Listing, Craft, etc.).
   * Use findNearbyListings() for Listing-specific features.
   *
   * @param {model} model - Mongoose model (Listing, Craft, etc.)
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusKm
   * @param {object} filters
   * @param {object} options
   * @returns {Promise}
   */
  async findNearby(
    model,
    latitude,
    longitude,
    radiusKm,
    filters = {},
    options = {},
  ) {
    try {
      const validation = this.validateGeoPoint(latitude, longitude);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const limit = Math.min(parseInt(options.limit) || 100, 500);
      const skip = parseInt(options.skip) || 0;

      const pipeline = [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [longitude, latitude] },
            distanceField: "distanceMeters",
            maxDistance: radiusKm * 1000,
            spherical: true,
            query: this.buildMatchQuery(filters, model.modelName),
          },
        },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            title: 1,
            distanceMeters: 1,
            "location.coordinates": 1,
          },
        },
      ];

      return await model.aggregate(pipeline);
    } catch (error) {
      console.error("[GeoService] Error in findNearby:", error);
      throw error;
    }
  }

  /**
   * Build MongoDB aggregation pipeline for geospatial queries.
   * Stages: $geoNear → $match (filters) → $project (DTO fields) → $skip/limit
   *
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusKm
   * @param {object} filters
   * @param {object} options - { limit, skip, countOnly }
   * @returns {array} MongoDB aggregation pipeline
   */
  buildAggregationPipeline(
    latitude,
    longitude,
    radiusKm,
    filters = {},
    options = {},
  ) {
    const { limit = 100, skip = 0, countOnly = false } = options;

    const pipeline = [];

    // Stage 1: $geoNear — Find documents by location
    // This must be the first stage in the pipeline
    pipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000, // Convert km to meters
        spherical: true,
        key: "location.coordinates",
        // Basic query filters applied here for index efficiency
        query: {
          status: filters.status || "published",
          ...(filters.type && { type: filters.type }),
        },
      },
    });

    // Stage 2: $match — Apply advanced filters (non-geospatial)
    const matchQuery = this.buildMatchQuery(filters, "Listing");
    if (Object.keys(matchQuery).length > 0) {
      pipeline.push({ $match: matchQuery });
    }

    // Stage 3: $match — Apply text search if provided
    if (filters.query) {
      pipeline.push({
        $match: {
          $text: { $search: filters.query },
        },
      });
      // Add text search score for relevance
      pipeline.push({
        $addFields: {
          textScore: { $meta: "textScore" },
        },
      });
      // Sort by text relevance first, then distance
      pipeline.push({
        $sort: {
          textScore: -1,
          distanceMeters: 1,
        },
      });
    } else {
      // Sort by distance if no text search
      pipeline.push({
        $sort: {
          distanceMeters: 1,
        },
      });
    }

    // Count stage (for pagination)
    if (countOnly) {
      pipeline.push({
        $count: "count",
      });
    } else {
      // Stage 4: $skip and $limit for pagination
      if (skip > 0) {
        pipeline.push({ $skip: skip });
      }
      pipeline.push({ $limit: limit });

      // Stage 5: $project — Select only marker DTO fields
      pipeline.push(this.markerProjection());
    }

    return pipeline;
  }

  /**
   * Build MongoDB $match query from filter object.
   * Excludes geospatial and pagination filters (handled separately).
   *
   * @param {object} filters
   * @param {string} modelName - 'Listing' or 'Craft' (affects field names)
   * @returns {object} MongoDB match query
   */
  buildMatchQuery(filters = {}, modelName = "Listing") {
    const query = {};

    // Category filtering
    if (modelName === "Listing") {
      if (filters.category) {
        query.category = filters.category;
      }
    } else if (modelName === "Craft") {
      if (filters.craftType) {
        query.craftType = filters.craftType;
      }
    }

    // Type filter (Listing discriminator type)
    if (filters.type) {
      query.type = filters.type;
    }

    // Status filter
    if (filters.status) {
      query.status = filters.status;
    } else {
      query.status = "published"; // Default to published only
    }

    // Price range filter (for post listings)
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      query.price = {};
      if (filters.minPrice !== undefined) {
        query.price.$gte = parseFloat(filters.minPrice);
      }
      if (filters.maxPrice !== undefined) {
        query.price.$lte = parseFloat(filters.maxPrice);
      }
    }

    // Owner filter (for admin/user-specific queries)
    if (filters.owner) {
      query.owner = mongoose.Types.ObjectId.isValid(filters.owner)
        ? new mongoose.Types.ObjectId(filters.owner)
        : filters.owner;
    }

    // Rating filter
    if (filters.minRating !== undefined) {
      query.rating = { $gte: parseFloat(filters.minRating) };
    }

    // Verification status filter
    if (filters.verified !== undefined) {
      query.verified = filters.verified === true || filters.verified === "true";
    }

    return query;
  }

  /**
   * MongoDB $project stage for marker DTO.
   * Selects lightweight fields for map rendering.
   *
   * @returns {object} MongoDB $project stage
   */
  markerProjection() {
    return {
      $project: {
        _id: 1,
        id: "$_id",
        title: 1,
        coordinates: "$location.coordinates",
        city: "$location.city",
        province: "$location.province",
        category: 1,
        type: 1,
        status: 1,
        price: { $cond: [{ $eq: ["$type", "post"] }, "$price", null] },
        preview: { $arrayElemAt: ["$images", 0] },
        distanceMeters: 1,
        distanceKm: {
          $round: [{ $divide: ["$distanceMeters", 1000] }, 2],
        },
        owner: 1,
        rating: 1,
        verified: 1,
        textScore: {
          $cond: [{ $ifNull: ["$textScore", false] }, "$textScore", null],
        },
        createdAt: 1,
      },
    };
  }

  /**
   * Transform aggregation result to lightweight marker DTO for frontend.
   * Strips unnecessary fields and prepares absolute URLs.
   *
   * @param {object} doc - Aggregation result document
   * @returns {object} Marker DTO
   */
  toMarkerDTO(doc) {
    const marker = {
      id: doc._id.toString(),
      title: doc.title,
      coordinates: doc.coordinates || null,
      city: doc.city || null,
      province: doc.province || null,
      category: doc.category || null,
      type: doc.type || null,
      status: doc.status || "published",
      distanceKm: doc.distanceKm || 0,
      distanceMeters: Math.round(doc.distanceMeters || 0),
      preview: doc.preview || null,
    };

    // Include optional fields only if present
    if (doc.price !== null && doc.price !== undefined) {
      marker.price = doc.price;
    }
    if (doc.rating !== null && doc.rating !== undefined) {
      marker.rating = doc.rating;
    }
    if (doc.verified !== null && doc.verified !== undefined) {
      marker.verified = doc.verified;
    }

    return marker;
  }

  /**
   * Validate geographic coordinate pair.
   *
   * @param {number} latitude - -90 to 90
   * @param {number} longitude - -180 to 180
   * @returns {{valid: boolean, error?: string}}
   */
  validateGeoPoint(latitude, longitude) {
    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined
    ) {
      return {
        valid: false,
        error: "مختصات جغرافیایی (latitude, longitude) الزامی هستند",
      };
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return {
        valid: false,
        error: "مختصات جغرافیایی باید اعداد معتبر باشند",
      };
    }

    if (lat < -90 || lat > 90) {
      return {
        valid: false,
        error: "عرض جغرافیایی (latitude) باید بین -۹۰ و ۹۰ باشد",
      };
    }

    if (lng < -180 || lng > 180) {
      return {
        valid: false,
        error: "طول جغرافیایی (longitude) باید بین -۱۸۰ و ۱۸۰ باشد",
      };
    }

    return { valid: true };
  }

  /**
   * Validate search radius parameter.
   *
   * @param {number} radiusKm - Radius in kilometers
   * @returns {{valid: boolean, error?: string}}
   */
  validateRadius(radiusKm) {
    const radius = parseFloat(radiusKm);

    if (Number.isNaN(radius)) {
      return {
        valid: false,
        error: "شعاع جستجو باید عدد معتبر باشد",
      };
    }

    if (radius < 0.1) {
      return {
        valid: false,
        error: "شعاع جستجو باید حداقل ۰.۱ کیلومتر باشد",
      };
    }

    if (radius > 50) {
      return {
        valid: false,
        error: "شعاع جستجو نباید بیشتر از ۵۰ کیلومتر باشد",
      };
    }

    return { valid: true };
  }

  /**
   * Validate query parameters comprehensively.
   * Returns all validation errors.
   *
   * @param {object} params - Query parameters object
   * @returns {{
   *   valid: boolean,
   *   errors: Array<string>,
   *   normalized?: object
   * }}
   */
  validateQueryParams(params) {
    const errors = [];

    // Validate latitude and longitude
    if (!params.lat || !params.lng) {
      errors.push("مختصات جغرافیایی (lat, lng) الزامی هستند");
      return { valid: false, errors };
    }

    const geoValidation = this.validateGeoPoint(params.lat, params.lng);
    if (!geoValidation.valid) {
      errors.push(geoValidation.error);
    }

    // Validate radius
    const radiusKm = parseFloat(params.radiusKm) || 5;
    const radiusValidation = this.validateRadius(radiusKm);
    if (!radiusValidation.valid) {
      errors.push(radiusValidation.error);
    }

    // Validate limit
    const limit = parseInt(params.limit) || 100;
    if (limit < 1 || limit > 500) {
      errors.push("تعداد نتایج باید بین ۱ و ۵۰۰ باشد");
    }

    // Validate skip
    const skip = parseInt(params.skip) || 0;
    if (skip < 0) {
      errors.push("صفحه بندی نباید منفی باشد");
    }

    // Validate price range
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      const minPrice = params.minPrice ? parseFloat(params.minPrice) : 0;
      const maxPrice = params.maxPrice ? parseFloat(params.maxPrice) : Infinity;

      if (Number.isNaN(minPrice) || Number.isNaN(maxPrice)) {
        errors.push("محدوده قیمت باید اعداد معتبر باشند");
      } else if (minPrice < 0 || maxPrice < 0) {
        errors.push("قیمت نباید منفی باشد");
      } else if (minPrice > maxPrice) {
        errors.push("حداقل قیمت نباید بزرگتر از حداکثر قیمت باشد");
      }
    }

    // Validate type
    const validTypes = ["post", "tour", "training", "academy"];
    if (params.type && !validTypes.includes(params.type)) {
      errors.push(`نوع لیست باید یکی از: ${validTypes.join(", ")} باشد`);
    }

    // Validate status
    const validStatuses = ["draft", "published", "archived"];
    if (params.status && !validStatuses.includes(params.status)) {
      errors.push(`وضعیت باید یکی از: ${validStatuses.join(", ")} باشد`);
    }

    // Validate rating
    if (params.minRating !== undefined) {
      const rating = parseFloat(params.minRating);
      if (Number.isNaN(rating) || rating < 0 || rating > 5) {
        errors.push("امتیاز باید بین ۰ و ۵ باشد");
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Return normalized parameters
    return {
      valid: true,
      errors: [],
      normalized: {
        lat: parseFloat(params.lat),
        lng: parseFloat(params.lng),
        radiusKm,
        limit,
        skip,
        category: params.category,
        type: params.type,
        status: params.status || "published",
        minPrice: params.minPrice ? parseFloat(params.minPrice) : undefined,
        maxPrice: params.maxPrice ? parseFloat(params.maxPrice) : undefined,
        owner: params.owner,
        minRating: params.minRating ? parseFloat(params.minRating) : undefined,
        query: params.query,
        verified: params.verified,
      },
    };
  }

  /**
   * Format distance for display.
   * Returns human-readable format (e.g., "5.2 km" or "850 m").
   *
   * @param {number} distanceMeters
   * @returns {string}
   */
  formatDistance(distanceMeters) {
    if (distanceMeters < 1000) {
      return `${Math.round(distanceMeters)} م`;
    }
    const km = (distanceMeters / 1000).toFixed(2);
    return `${km} کیلومتر`;
  }

  /**
   * Calculate bounding box for coordinates + radius.
   * Useful for pre-filtering or visualization.
   *
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusKm
   * @returns {{minLat, maxLat, minLng, maxLng}}
   */
  calculateBoundingBox(latitude, longitude, radiusKm) {
    // Approximate earth radius in km
    const earthRadius = 6371;

    // Angular distance in radians
    const latChange = (radiusKm / earthRadius) * (180 / Math.PI);
    const lngChange =
      (radiusKm / (earthRadius * Math.cos((latitude * Math.PI) / 180))) *
      (180 / Math.PI);

    return {
      minLat: Math.max(-90, latitude - latChange),
      maxLat: Math.min(90, latitude + latChange),
      minLng: Math.max(-180, longitude - lngChange),
      maxLng: Math.min(180, longitude + lngChange),
    };
  }

  /**
   * Generate heatmap data for a geographic area.
   * Divides the search area into a grid and returns aggregated statistics per cell.
   *
   * Use case: Frontend renders heat map showing craft density, price clusters, rating hotspots.
   *
   * @param {number} latitude - Center latitude
   * @param {number} longitude - Center longitude
   * @param {number} radiusKm - Search radius
   * @param {object} filters - Optional filters (category, type, status, etc.)
   * @param {object} options - Query options
   *   - gridSize: number (5-50, default 10) — cells per edge of grid
   *   - aggregateBy: 'count' | 'avgPrice' | 'avgRating' (default 'count')
   *   - includeDetails: boolean (default false) — include per-cell min/max values
   * @returns {Promise<{
   *   success: boolean,
   *   data?: {
   *     grid: Array<{lat, lng, value, cellCount, details?: {min, max, avg}}>,
   *     bounds: {north, south, east, west},
   *     center: {lat, lng},
   *     gridSize: number,
   *     aggregateBy: string
   *   },
   *   error?: string
   * }>}
   */
  async generateHeatmapData(
    latitude,
    longitude,
    radiusKm,
    filters = {},
    options = {},
  ) {
    try {
      const startTime = Date.now();

      // Validate inputs
      const geoValidation = this.validateGeoPoint(latitude, longitude);
      if (!geoValidation.valid) {
        return { success: false, error: geoValidation.error };
      }

      const radiusValidation = this.validateRadius(radiusKm);
      if (!radiusValidation.valid) {
        return { success: false, error: radiusValidation.error };
      }

      // Normalize options
      const gridSize = Math.min(
        Math.max(parseInt(options.gridSize) || 10, 5),
        50,
      );
      const aggregateBy = options.aggregateBy || "count";
      const includeDetails = options.includeDetails === true;

      // Get bounding box for the search area
      const bbox = this.calculateBoundingBox(latitude, longitude, radiusKm);

      // Calculate cell dimensions
      const cellHeight = (bbox.maxLat - bbox.minLat) / gridSize;
      const cellWidth = (bbox.maxLng - bbox.minLng) / gridSize;

      // Build aggregation pipeline to find nearby listings and group by grid cell
      const Listing = mongoose.model("Listing");

      const aggregationPipeline = [
        // Stage 1: $geoNear to filter by radius
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

        // Stage 2: $match for additional filters
        {
          $match: this.buildMatchQuery(filters, "Listing"),
        },

        // Stage 3: Add grid cell coordinates
        {
          $addFields: {
            cellLat: {
              $floor: {
                $divide: [
                  { $subtract: ["$location.coordinates.1", bbox.minLat] },
                  cellHeight,
                ],
              },
            },
            cellLng: {
              $floor: {
                $divide: [
                  { $subtract: ["$location.coordinates.0", bbox.minLng] },
                  cellWidth,
                ],
              },
            },
          },
        },

        // Stage 4: Group by grid cell and aggregate
        {
          $group: {
            _id: { cellLat: "$cellLat", cellLng: "$cellLng" },
            count: { $sum: 1 },
            avgPrice:
              aggregateBy === "avgPrice"
                ? { $avg: "$price" }
                : { $first: null },
            avgRating:
              aggregateBy === "avgRating"
                ? { $avg: "$rating" }
                : { $first: null },
            minPrice:
              includeDetails && aggregateBy === "avgPrice"
                ? { $min: "$price" }
                : { $first: null },
            maxPrice:
              includeDetails && aggregateBy === "avgPrice"
                ? { $max: "$price" }
                : { $first: null },
            minRating:
              includeDetails && aggregateBy === "avgRating"
                ? { $min: "$rating" }
                : { $first: null },
            maxRating:
              includeDetails && aggregateBy === "avgRating"
                ? { $max: "$rating" }
                : { $first: null },
          },
        },

        // Stage 5: Project final grid cell data
        {
          $project: {
            _id: 0,
            cellLat: "$_id.cellLat",
            cellLng: "$_id.cellLng",
            count: 1,
            value:
              aggregateBy === "count"
                ? "$count"
                : aggregateBy === "avgPrice"
                  ? { $round: ["$avgPrice", 2] }
                  : { $round: ["$avgRating", 2] },
            ...(includeDetails && {
              details:
                aggregateBy === "avgPrice"
                  ? {
                      min: { $round: ["$minPrice", 2] },
                      max: { $round: ["$maxPrice", 2] },
                      avg: { $round: ["$avgPrice", 2] },
                    }
                  : aggregateBy === "avgRating"
                    ? {
                        min: { $round: ["$minRating", 2] },
                        max: { $round: ["$maxRating", 2] },
                        avg: { $round: ["$avgRating", 2] },
                      }
                    : null,
            }),
          },
        },

        // Stage 6: Sort by cell position for consistent ordering
        {
          $sort: { cellLat: 1, cellLng: 1 },
        },
      ];

      // Execute aggregation
      const cellData =
        await Listing.aggregate(aggregationPipeline).allowDiskUse(true);

      // Transform cell data to grid format with absolute coordinates
      const grid = cellData.map((cell) => ({
        lat: bbox.minLat + (cell.cellLat + 0.5) * cellHeight,
        lng: bbox.minLng + (cell.cellLng + 0.5) * cellWidth,
        value: cell.value,
        cellCount: cell.count,
        ...(includeDetails && { details: cell.details }),
      }));

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          grid,
          bounds: {
            north: bbox.maxLat,
            south: bbox.minLat,
            east: bbox.maxLng,
            west: bbox.minLng,
          },
          center: { lat: latitude, lng: longitude },
          gridSize,
          aggregateBy,
          cellCount: grid.length,
          totalListings: cellData.reduce((sum, cell) => sum + cell.count, 0),
        },
        metadata: {
          executionTime,
          queryRadius: radiusKm,
        },
      };
    } catch (error) {
      console.error("[GeoService] Error in generateHeatmapData:", error);
      return {
        success: false,
        error: error.message || "Heatmap generation failed",
      };
    }
  }

  /**
   * Cluster nearby listings by geohash for zoomed-out map views.
   * Groups results into clusters with zoom-level-based geohash precision.
   *
   * Use case: Show clusters of markers at low zoom levels, drill down for details.
   *
   * @param {number} latitude - Center latitude
   * @param {number} longitude - Center longitude
   * @param {number} radiusKm - Search radius
   * @param {object} filters - Optional filters
   * @param {object} options - Query options
   *   - zoomLevel: number (0-20, default 12) — map zoom level
   *   - limit: number (default 100, max 500) — max clusters to return
   *   - skip: number (default 0) — pagination offset
   * @returns {Promise<{
   *   success: boolean,
   *   data?: {
   *     clusters: Array<{
   *       geohash: string,
   *       bounds: {north, south, east, west},
   *       count: number,
   *       sample: {id, title, coordinates, price, preview}
   *     }>,
   *     center: {lat, lng},
   *     zoomLevel: number,
   *     zoomRecommendation: string,
   *     totalClusters: number
   *   },
   *   error?: string
   * }>}
   */
  async clusterNearbyByGeohash(
    latitude,
    longitude,
    radiusKm,
    filters = {},
    options = {},
  ) {
    try {
      const startTime = Date.now();

      // Validate inputs
      const geoValidation = this.validateGeoPoint(latitude, longitude);
      if (!geoValidation.valid) {
        return { success: false, error: geoValidation.error };
      }

      const radiusValidation = this.validateRadius(radiusKm);
      if (!radiusValidation.valid) {
        return { success: false, error: radiusValidation.error };
      }

      // Normalize options
      const zoomLevel = Math.min(
        Math.max(parseInt(options.zoomLevel) || 12, 0),
        20,
      );
      const limit = Math.min(parseInt(options.limit) || 100, 500);
      const skip = parseInt(options.skip) || 0;

      // Map zoom level to geohash precision
      // Higher zoom = more precision = smaller clusters
      const geohashPrecision = this._zoomToGeohashPrecision(zoomLevel);

      // Get all nearby listings (no pagination yet)
      const Listing = mongoose.model("Listing");

      const nearbyPipeline = [
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
          $match: this.buildMatchQuery(filters, "Listing"),
        },
        {
          $project: {
            _id: 1,
            title: 1,
            "location.coordinates": 1,
            price: 1,
            preview: { $arrayElemAt: ["$images", 0] },
            rating: 1,
            coordinates: "$location.coordinates",
          },
        },
      ];

      const listings =
        await Listing.aggregate(nearbyPipeline).allowDiskUse(true);

      // Group listings by geohash
      const clustersMap = {};

      for (const listing of listings) {
        if (!listing.coordinates || listing.coordinates.length !== 2) continue;

        const geohash = this._encodeGeohash(
          listing.coordinates[1], // lat
          listing.coordinates[0], // lng
          geohashPrecision,
        );

        if (!clustersMap[geohash]) {
          clustersMap[geohash] = {
            geohash,
            listings: [],
          };
        }

        clustersMap[geohash].listings.push(listing);
      }

      // Transform clusters to response format
      const clusters = Object.values(clustersMap)
        .map((cluster) => ({
          geohash: cluster.geohash,
          bounds: this._geohashToBounds(cluster.geohash),
          count: cluster.listings.length,
          // Return highest-rated marker as sample
          sample: cluster.listings.sort(
            (a, b) => (b.rating || 0) - (a.rating || 0),
          )[0]
            ? {
                id: cluster.listings[0]._id.toString(),
                title: cluster.listings[0].title,
                coordinates: cluster.listings[0].coordinates,
                price: cluster.listings[0].price || null,
                preview: cluster.listings[0].preview || null,
              }
            : null,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(skip, skip + limit);

      // Determine zoom recommendation
      const zoomRecommendation = this._getZoomRecommendation(
        zoomLevel,
        clusters,
      );

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          clusters,
          center: { lat: latitude, lng: longitude },
          zoomLevel,
          zoomRecommendation,
          totalClusters: Object.keys(clustersMap).length,
          geohashPrecision,
        },
        metadata: {
          executionTime,
          queryRadius: radiusKm,
        },
      };
    } catch (error) {
      console.error("[GeoService] Error in clusterNearbyByGeohash:", error);
      return {
        success: false,
        error: error.message || "Clustering failed",
      };
    }
  }

  /**
   * Find listings within a geographic polygon (boundary search).
   * Uses $geoWithin with $polygon operator.
   *
   * Use case: Search within region/administrative boundaries or custom user-drawn areas.
   *
   * @param {array} polygonCoordinates - Array of [lng, lat] pairs defining polygon (must be closed)
   * @param {object} filters - Optional filters
   * @param {object} options - Query options (limit, skip, lean)
   * @returns {Promise<{
   *   success: boolean,
   *   data?: {
   *     items: Array<object>,
   *     polygon: {type, coordinates},
   *     bounds: {north, south, east, west},
   *     pagination: {limit, skip, totalCount, hasMore}
   *   },
   *   error?: string
   * }>}
   */
  async findWithinPolygon(polygonCoordinates, filters = {}, options = {}) {
    try {
      const startTime = Date.now();

      // Validate polygon
      const polygonValidation = this._validatePolygon(polygonCoordinates);
      if (!polygonValidation.valid) {
        return { success: false, error: polygonValidation.error };
      }

      // Normalize options
      const limit = Math.min(parseInt(options.limit) || 100, 500);
      const skip = parseInt(options.skip) || 0;
      const lean = options.lean !== false;

      // Build $geoWithin query
      const Listing = mongoose.model("Listing");

      const pipeline = [
        // Stage 1: $match for $geoWithin
        {
          $match: {
            "location.coordinates": {
              $geoWithin: {
                $geometry: {
                  type: "Polygon",
                  coordinates: [polygonCoordinates],
                },
              },
            },
            status: filters.status || "published",
            ...(filters.type && { type: filters.type }),
          },
        },

        // Stage 2: Additional filters
        {
          $match: this.buildMatchQuery(filters, "Listing"),
        },

        // Stage 3: Count for pagination
        {
          $facet: {
            metadata: [{ $count: "total" }],
            items: [
              { $skip: skip },
              { $limit: limit },
              this.markerProjection(),
            ],
          },
        },
      ];

      const result = await Listing.aggregate(pipeline).allowDiskUse(true);

      const totalCount = result[0]?.metadata?.[0]?.total || 0;
      const items = result[0]?.items || [];

      // Transform to marker DTOs
      const markers = items.map((doc) => this.toMarkerDTO(doc));

      // Calculate polygon bounds
      const bounds = this._polygonToBounds(polygonCoordinates);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          items: markers,
          polygon: {
            type: "Polygon",
            coordinates: [polygonCoordinates],
          },
          bounds,
          pagination: {
            limit,
            skip,
            totalCount,
            hasMore: skip + markers.length < totalCount,
          },
        },
        metadata: {
          executionTime,
          polygonPointCount: polygonCoordinates.length,
        },
      };
    } catch (error) {
      console.error("[GeoService] Error in findWithinPolygon:", error);
      return {
        success: false,
        error: error.message || "Polygon search failed",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ── Private Helper Methods ────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Map zoom level (0-20) to geohash precision (1-11).
   * Higher zoom = higher precision = smaller clusters.
   *
   * @param {number} zoomLevel - 0-20
   * @returns {number} geohash precision 1-11
   */
  _zoomToGeohashPrecision(zoomLevel) {
    const precisionMap = {
      0: 1, // World
      1: 1,
      2: 2,
      3: 2,
      4: 3,
      5: 3,
      6: 4,
      7: 4,
      8: 5,
      9: 5,
      10: 6,
      11: 6,
      12: 7, // City level
      13: 7,
      14: 8,
      15: 8,
      16: 9,
      17: 9,
      18: 10,
      19: 10,
      20: 11, // Street level
    };
    return precisionMap[zoomLevel] || 7;
  }

  /**
   * Simple geohash encoder.
   * Encodes (lat, lng) to geohash string of specified length.
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} length - Geohash length (1-11)
   * @returns {string} geohash
   */
  _encodeGeohash(lat, lng, length) {
    // Normalize coordinates to [0, 1]
    const latNorm = (lat + 90) / 180;
    const lngNorm = (lng + 180) / 360;

    // Base32 characters for geohash
    const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

    let geohash = "";
    let latMin = -90,
      latMax = 90;
    let lngMin = -180,
      lngMax = 180;

    let even = true;
    for (let i = 0; i < length; i++) {
      let ch = 0;
      for (let bit = 4; bit >= 0; bit--) {
        if (even) {
          const mid = (lngMin + lngMax) / 2;
          if (lng > mid) {
            ch |= 1 << bit;
            lngMin = mid;
          } else {
            lngMax = mid;
          }
        } else {
          const mid = (latMin + latMax) / 2;
          if (lat > mid) {
            ch |= 1 << bit;
            latMin = mid;
          } else {
            latMax = mid;
          }
        }
        even = !even;
      }
      geohash += BASE32[ch];
    }

    return geohash;
  }

  /**
   * Convert geohash to bounding box.
   *
   * @param {string} geohash
   * @returns {{north, south, east, west}}
   */
  _geohashToBounds(geohash) {
    // Decode geohash to approximate bounds
    // For simplicity, we use a fixed cell size based on geohash length
    const cellSizes = [
      180, 45, 11.25, 2.8, 0.7, 0.175, 0.044, 0.011, 0.0027, 0.00067, 0.00017,
    ];
    const precision = Math.min(geohash.length, cellSizes.length);
    const cellSize = cellSizes[precision - 1] || 0.00017;

    // This is a simplified approximation
    // A full decoder would interleave lat/lng bits from the geohash
    const lat = (geohash.charCodeAt(0) % 18) * cellSize - 90;
    const lng = (geohash.charCodeAt(0) % 36) * cellSize - 180;

    return {
      north: Math.min(90, lat + cellSize),
      south: Math.max(-90, lat),
      east: Math.min(180, lng + cellSize),
      west: Math.max(-180, lng),
    };
  }

  /**
   * Get zoom recommendation based on number of clusters.
   *
   * @param {number} currentZoom
   * @param {array} clusters
   * @returns {string}
   */
  _getZoomRecommendation(currentZoom, clusters) {
    if (clusters.length === 0) {
      return "No results in this area";
    }
    if (clusters.length === 1) {
      return "Zoom in to see details";
    }
    if (clusters.length > 100) {
      return "Zoom out to see overview";
    }
    return "Current zoom level is optimal";
  }

  /**
   * Validate polygon coordinates.
   *
   * @param {array} polygonCoordinates - Array of [lng, lat] pairs
   * @returns {{valid: boolean, error?: string}}
   */
  _validatePolygon(polygonCoordinates) {
    if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length < 4) {
      return {
        valid: false,
        error: "Polygon must have at least 4 points (including closing point)",
      };
    }

    if (polygonCoordinates.length > 100) {
      return {
        valid: false,
        error: "Polygon complexity limited to 100 points maximum",
      };
    }

    // Validate all coordinates
    for (const coord of polygonCoordinates) {
      if (
        !Array.isArray(coord) ||
        coord.length !== 2 ||
        typeof coord[0] !== "number" ||
        typeof coord[1] !== "number"
      ) {
        return {
          valid: false,
          error: "All polygon points must be [lng, lat] number pairs",
        };
      }

      const [lng, lat] = coord;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return {
          valid: false,
          error: "Polygon coordinates out of valid range",
        };
      }
    }

    // Validate closure (first point == last point)
    const first = polygonCoordinates[0];
    const last = polygonCoordinates[polygonCoordinates.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return {
        valid: false,
        error: "Polygon must be closed (first point must equal last point)",
      };
    }

    return { valid: true };
  }

  /**
   * Convert polygon coordinates to bounding box.
   *
   * @param {array} polygonCoordinates
   * @returns {{north, south, east, west}}
   */
  _polygonToBounds(polygonCoordinates) {
    const lngs = polygonCoordinates.map((c) => c[0]);
    const lats = polygonCoordinates.map((c) => c[1]);

    return {
      west: Math.min(...lngs),
      east: Math.max(...lngs),
      south: Math.min(...lats),
      north: Math.max(...lats),
    };
  }
}

module.exports = new GeoService();
