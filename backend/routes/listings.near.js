/**
 * listings.near.js — GET /api/listings/near
 *
 * Production-grade geospatial "nearby listings" endpoint for the canonical
 * Listing model (collection: user_listings).
 *
 * Mounted at /api/listings in server.js BEFORE the main listings router so
 * that the /near path is resolved before any generic /:id handler.
 *
 * Query Parameters:
 *   lat       – latitude  [-90, 90]          (required)
 *   lng       – longitude [-180, 180]         (required)
 *   radiusKm  – search radius km, default 5, min 0.1, max 50
 *   limit     – max results, default 100, min 1, max 500
 *   type      – filter by listing type: post | tour | training | academy
 *
 * Response envelope:
 *   { success: true, data: { items, meta: { radiusKm, limit, count } }, reqId }
 *
 * Each item includes: id, type, title, images, imagesAbs, location,
 *   distanceMeters (+ all base listing fields).
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

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_RADIUS_KM = 5;
const MIN_RADIUS_KM = 0.1;
const MAX_RADIUS_KM = 50;
const DEFAULT_LIMIT = 100;
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
const VALID_TYPES = ["post", "tour", "training", "academy"];
const PIPELINE_TIMEOUT_MS = 8000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a float from a query string value.
 * Returns NaN when the string is absent or not numeric.
 */
function qFloat(raw) {
  if (raw === undefined || raw === null || raw === "") return NaN;
  return parseFloat(raw);
}

/**
 * Parse an integer from a query string value.
 * Returns NaN when the string is absent or not numeric.
 */
function qInt(raw) {
  if (raw === undefined || raw === null || raw === "") return NaN;
  const n = parseInt(raw, 10);
  return isNaN(n) ? NaN : n;
}

/**
 * Format a single pipeline result document for the API response.
 * Adds imagesAbs (absolute URLs) without mutating stored paths.
 *
 * @param {object} doc   – Plain object from aggregate (lean)
 * @param {object} req   – Express request (for PUBLIC_BASE_URL fallback)
 * @returns {object}
 */
function formatItem(doc, req) {
  return {
    id: doc._id,
    type: doc.type,
    title: doc.title,
    description: doc.description,
    tags: doc.tags ?? [],
    images: doc.images ?? [],
    imagesAbs: (doc.images ?? []).map((p) => toAbsoluteUrl(p, req)),
    location: doc.location ?? null,
    status: doc.status,
    owner: doc.owner,
    distanceMeters: doc.distanceMeters,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/listings/near
 *
 * Uses $geoNear aggregation stage which requires the sparse 2dsphere index
 * defined in models/Listing.js:
 *   listingSchema.index({ location: "2dsphere" }, { sparse: true });
 *
 * Example:
 *   GET /api/listings/near?lat=35.69&lng=51.42&radiusKm=5&type=post&limit=20
 */
router.get("/near", heavyLimiter, async (req, res) => {
  const reqId = req.id;

  // ── 1. Parse & validate coordinates ───────────────────────────────────────

  const lat = qFloat(req.query.lat);
  const lng = qFloat(req.query.lng);

  if (req.query.lat === undefined || isNaN(lat)) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "VALIDATION_ERROR",
          "پارامتر lat الزامی و باید عدد باشد",
          { field: "lat", hint: "latitude in [-90, 90]" },
          reqId,
        ),
      );
  }

  if (req.query.lng === undefined || isNaN(lng)) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "VALIDATION_ERROR",
          "پارامتر lng الزامی و باید عدد باشد",
          { field: "lng", hint: "longitude in [-180, 180]" },
          reqId,
        ),
      );
  }

  if (lat < -90 || lat > 90) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "VALIDATION_ERROR",
          "lat باید بین ۹۰- و ۹۰ باشد",
          { field: "lat", provided: lat },
          reqId,
        ),
      );
  }

  if (lng < -180 || lng > 180) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "VALIDATION_ERROR",
          "lng باید بین ۱۸۰- و ۱۸۰ باشد",
          { field: "lng", provided: lng },
          reqId,
        ),
      );
  }

  // ── 2. Parse & validate radiusKm ──────────────────────────────────────────

  const rawRadius = qFloat(req.query.radiusKm);
  const radiusKmInput = isNaN(rawRadius) ? DEFAULT_RADIUS_KM : rawRadius;

  if (radiusKmInput < MIN_RADIUS_KM) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "VALIDATION_ERROR",
          `radiusKm باید حداقل ${MIN_RADIUS_KM} کیلومتر باشد`,
          { field: "radiusKm", min: MIN_RADIUS_KM, provided: radiusKmInput },
          reqId,
        ),
      );
  }

  // Cap silently at maximum (log a warning so ops can spot abusive clients)
  const effectiveRadiusKm = Math.min(radiusKmInput, MAX_RADIUS_KM);
  if (radiusKmInput > MAX_RADIUS_KM) {
    logger.warn("GET /api/listings/near — radiusKm capped", {
      reqId,
      requested: radiusKmInput,
      capped: MAX_RADIUS_KM,
    });
  }

  // ── 3. Parse & validate limit ─────────────────────────────────────────────

  const rawLimit = qInt(req.query.limit);
  const limitInput = isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit;

  if (limitInput < MIN_LIMIT) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "VALIDATION_ERROR",
          `limit باید حداقل ${MIN_LIMIT} باشد`,
          { field: "limit", min: MIN_LIMIT, provided: limitInput },
          reqId,
        ),
      );
  }

  // Cap silently at maximum
  const effectiveLimit = Math.min(limitInput, MAX_LIMIT);

  // ── 4. Parse & validate type filter ──────────────────────────────────────

  const typeFilter = req.query.type;
  if (typeFilter !== undefined && !VALID_TYPES.includes(typeFilter)) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          "VALIDATION_ERROR",
          `type باید یکی از مقادیر مجاز باشد: ${VALID_TYPES.join(", ")}`,
          { field: "type", valid: VALID_TYPES, provided: typeFilter },
          reqId,
        ),
      );
  }

  // ── 5. Build $geoNear pipeline ────────────────────────────────────────────

  try {
    /*
     * $geoNear must be the first stage in an aggregation pipeline.
     *
     * key: "location" — matches the field that carries the 2dsphere index
     *   defined as: listingSchema.index({ location: "2dsphere" }, { sparse: true })
     *
     * distanceField: "distanceMeters" — MongoDB adds this computed field to
     *   each output document with the distance in meters from the query point.
     *
     * maxDistance is in meters; we convert km → m here.
     * Results are automatically sorted by distance (ascending) by $geoNear.
     */
    const matchQuery = {};
    if (typeFilter) {
      matchQuery.type = typeFilter;
    }

    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [lng, lat], // GeoJSON order: [longitude, latitude]
          },
          key: "location",
          distanceField: "distanceMeters",
          maxDistance: effectiveRadiusKm * 1000, // km → meters
          spherical: true,
          query: matchQuery,
        },
      },
      { $limit: effectiveLimit },
    ];

    const docs = await Listing.aggregate(pipeline).option({
      maxTimeMS: PIPELINE_TIMEOUT_MS,
    });

    // ── 6. Format & respond ─────────────────────────────────────────────────

    const items = docs.map((doc) => formatItem(doc, req));

    return res.json(
      createSuccessResponse(
        {
          data: {
            items,
            meta: {
              radiusKm: effectiveRadiusKm,
              limit: effectiveLimit,
              count: items.length,
            },
          },
        },
        reqId,
      ),
    );
  } catch (err) {
    // ── 7. Error handling ────────────────────────────────────────────────────

    logger.error("GET /api/listings/near — unexpected error", {
      reqId,
      error: err.message,
      stack: err.stack,
      query: req.query,
    });

    // MongoDB $geoNear requires a 2dsphere index; surface a clear 500 if missing
    if (
      err.message &&
      (err.message.includes("2dsphere") ||
        err.message.includes("geo near") ||
        err.message.includes("geoNear"))
    ) {
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
