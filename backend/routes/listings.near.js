const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const Craft = require("../models/Craft");
const { isValidCoordinates } = require("../utils/geospatial");
const logger = require("../utils/logger");
const { heavyLimiter } = require("../middleware/rateLimiter");

// ============================================================================
// PRODUCTION GEOSPATIAL CONSTRAINTS
// ============================================================================
const MAX_RADIUS_KM = 50; // Maximum search radius: 50km
const DEFAULT_RADIUS_KM = 10; // Default search radius: 10km
const MIN_RADIUS_KM = 0.5; // Minimum search radius: 500m
const MAX_RESULTS_PER_PAGE = 100; // Prevent excessive data retrieval

/**
 * GET /api/listings/near
 * Find listings near a point with optional filters
 *
 * Query params:
 * - lng: longitude (-180 to 180) [REQUIRED for geo search]
 * - lat: latitude (-90 to 90) [REQUIRED for geo search]
 * - radiusKm: search radius in kilometers (default: 10, max: 50)
 * - q: text search
 * - kind: filter by listing type (artwork, class, service)
 * - minPrice: minimum price
 * - maxPrice: maximum price
 * - sort: distance (default), -createdAt, price, -price
 * - page: pagination page (default: 1)
 * - limit: items per page (default: 20, max: 100)
 *
 * Example:
 * GET /api/listings/near?lng=51.42&lat=35.69&radiusKm=5
 */
router.get("/near", heavyLimiter, async (req, res) => {
  try {
    const {
      lng,
      lat,
      radiusKm,
      q,
      kind,
      minPrice,
      maxPrice,
      sort = "distance",
      page = 1,
      limit = 20,
    } = req.query;

    // ========================================================================
    // INPUT VALIDATION & NORMALIZATION
    // ========================================================================

    // Parse and validate coordinates
    const longitude = lng !== undefined ? parseFloat(lng) : NaN;
    const latitude = lat !== undefined ? parseFloat(lat) : NaN;

    // Check for reversed coordinates (common mistake: passing lat before lng)
    if (!isNaN(longitude) && !isNaN(latitude)) {
      // Detect likely reversed input: if "lng" is in latitude range and "lat" is in longitude range
      if (
        Math.abs(longitude) <= 90 &&
        Math.abs(latitude) > 90 &&
        Math.abs(latitude) <= 180
      ) {
        return res.status(400).json({
          message: "مختصات جغرافیایی به اشتباه وارد شده است",
          error:
            "به نظر می‌رسد lng و lat جابجا شده‌اند. lng باید بین -180 تا 180 باشد، lat باید بین -90 تا 90 باشد",
          hint: "Did you reverse lng and lat? Check your coordinate order.",
        });
      }
    }

    // Validate numeric input
    if (lng !== undefined && isNaN(longitude)) {
      return res.status(400).json({
        message: "مقدار lng نامعتبر است",
        error: "lng must be a valid number",
      });
    }

    if (lat !== undefined && isNaN(latitude)) {
      return res.status(400).json({
        message: "مقدار lat نامعتبر است",
        error: "lat must be a valid number",
      });
    }

    // Validate coordinate ranges
    if (
      !isValidCoordinates(longitude, latitude) &&
      (lng !== undefined || lat !== undefined)
    ) {
      return res.status(400).json({
        message: "مختصات جغرافیایی نامعتبر است",
        error:
          "lng must be between -180 and 180, lat must be between -90 and 90",
        provided: { lng: longitude, lat: latitude },
      });
    }

    // Enforce radius limits
    const requestedRadius = radiusKm ? parseFloat(radiusKm) : DEFAULT_RADIUS_KM;
    if (isNaN(requestedRadius) || requestedRadius <= 0) {
      return res.status(400).json({
        message: "شعاع جستجو نامعتبر است",
        error: "radiusKm must be a positive number",
      });
    }

    const radius = Math.min(
      Math.max(MIN_RADIUS_KM, requestedRadius),
      MAX_RADIUS_KM,
    );

    // Log if radius was capped
    if (requestedRadius > MAX_RADIUS_KM) {
      logger.warn("Radius capped to maximum", {
        requested: requestedRadius,
        capped: MAX_RADIUS_KM,
      });
    }

    // Validate and cap pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(
      Math.max(1, parseInt(limit) || 20),
      MAX_RESULTS_PER_PAGE,
    );
    const skip = (pageNum - 1) * limitNum;

    // ========================================================================
    // BUILD QUERY FILTERS
    // ========================================================================

    let query = { isPublished: true };

    // Validate and add kind filter
    if (kind) {
      const validKinds = ["artwork", "class", "service"];
      if (!validKinds.includes(kind)) {
        return res.status(400).json({
          message: "نوع صنایع دستی نامعتبر است",
          error: `kind must be one of: ${validKinds.join(", ")}`,
        });
      }
      query.kind = kind;
    }

    // Validate and add price filters
    if (minPrice !== undefined) {
      const min = parseFloat(minPrice);
      if (isNaN(min) || min < 0) {
        return res.status(400).json({
          message: "حداقل قیمت نامعتبر است",
          error: "minPrice must be a non-negative number",
        });
      }
      query.price = { $gte: min };
    }

    if (maxPrice !== undefined) {
      const max = parseFloat(maxPrice);
      if (isNaN(max) || max < 0) {
        return res.status(400).json({
          message: "حداکثر قیمت نامعتبر است",
          error: "maxPrice must be a non-negative number",
        });
      }
      query.price = { ...(query.price || {}), $lte: max };
    }

    // Add text search if provided
    if (q) {
      query.$text = { $search: q };
    }

    let results;
    let useGeoSearch = false;

    // ========================================================================
    // GEOSPATIAL SEARCH EXECUTION
    // ========================================================================

    // Use $geoNear if coordinates are valid
    if (isValidCoordinates(longitude, latitude)) {
      useGeoSearch = true;

      // Performance guard: Verify 2dsphere index exists
      try {
        const indexes = await Craft.collection.getIndexes();
        const hasGeoIndex = Object.keys(indexes).some(
          (key) => key === "location.geometry_2dsphere",
        );

        if (!hasGeoIndex) {
          logger.error(
            "CRITICAL: Missing 2dsphere index on location.geometry. Nearby search will fail!",
          );
          return res.status(500).json({
            message: "خطا در پیکربندی جستجوی جغرافیایی",
            error: "Geospatial index not configured. Please contact support.",
          });
        }
      } catch (indexCheckError) {
        logger.error("Failed to check geospatial index", indexCheckError);
        // Continue anyway - the query will fail if index is missing
      }
      const geoNearPipeline = [
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            key: "location.geometry",
            distanceField: "distanceMeters",
            maxDistance: radius * 1000, // Convert km to meters
            spherical: true,
            query: query,
          },
        },
      ];

      // Add text search if needed (after $geoNear)
      if (q) {
        geoNearPipeline.push({
          $match: { $text: { $search: q } },
        });
      }

      // Add sorting
      if (sort === "-createdAt") {
        geoNearPipeline.push({ $sort: { createdAt: -1 } });
      } else if (sort === "price") {
        geoNearPipeline.push({ $sort: { price: 1 } });
      } else if (sort === "-price") {
        geoNearPipeline.push({ $sort: { price: -1 } });
      }
      // Default sort is by distance (already handled by $geoNear)

      // Add pagination
      geoNearPipeline.push(
        { $skip: skip },
        { $limit: parseInt(limit) },
        // Lookup author details
        {
          $lookup: {
            from: "users",
            localField: "author",
            foreignField: "_id",
            as: "author",
          },
        },
        { $unwind: "$author" },
        // Project only needed fields
        {
          $project: {
            _id: 1,
            title: 1,
            description: 1,
            images: 1,
            kind: 1,
            price: 1,
            currency: 1,
            forSale: 1,
            tags: 1,
            schedule: 1,
            location: 1,
            distanceMeters: 1,
            createdAt: 1,
            "author._id": 1,
            "author.name": 1,
            averageRating: 1,
            totalLikes: 1,
          },
        },
      );

      // Execute pipeline with timeout
      results = await Craft.aggregate(geoNearPipeline).maxTimeMS(5000); // 5s timeout

      // Convert distance to kilometers for response
      results = results.map((item) => ({
        ...item,
        distanceKm: (item.distanceMeters / 1000).toFixed(1),
      }));

      // Log if no results found (helps debugging)
      if (results.length === 0) {
        logger.info("No nearby listings found", {
          coordinates: [longitude, latitude],
          radiusKm: radius,
          filters: query,
        });
      }
    } else {
      // Fallback to regular search when no coordinates
      const sortOptions = {
        "-createdAt": { createdAt: -1 },
        price: { price: 1 },
        "-price": { price: -1 },
      };

      results = await Craft.find(query)
        .sort(sortOptions[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("author", "name")
        .select("-comments -likes -dislikes");
    }

    // Get total count for pagination
    const total = await Craft.countDocuments(query);

    // Build response with metadata
    const response = {
      items: results,
      total,
      page: pageNum,
      limit: limitNum,
      hasMore: skip + results.length < total,
      search: {
        method: useGeoSearch ? "geospatial" : "standard",
      },
    };

    // Add geo-specific metadata if geo search was used
    if (useGeoSearch) {
      response.search.center = {
        lng: longitude,
        lat: latitude,
      };
      response.search.radiusKm = radius;
      response.search.requestedRadiusKm = requestedRadius;
      if (requestedRadius > MAX_RADIUS_KM) {
        response.search.note = `Radius capped at ${MAX_RADIUS_KM}km for performance`;
      }
    }

    res.json(response);
  } catch (error) {
    // ========================================================================
    // ERROR HANDLING
    // ========================================================================

    logger.error("Error in /listings/near", {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });

    // Handle specific MongoDB errors
    if (error.name === "MongoError" && error.code === 2) {
      return res.status(500).json({
        message: "خطا در اجرای جستجوی جغرافیایی",
        error: "Geospatial index error. Please ensure location data is valid.",
      });
    }

    if (error.message && error.message.includes("2dsphere")) {
      return res.status(500).json({
        message: "خطا در پیکربندی ایندکس جغرافیایی",
        error: "Geospatial index configuration error",
      });
    }

    // Generic error response
    res.status(500).json({
      message: "خطا در جستجوی نزدیک‌ترین موارد",
      error:
        process.env.NODE_ENV === "production"
          ? "An error occurred during search"
          : error.message,
    });
  }
});

module.exports = router;
