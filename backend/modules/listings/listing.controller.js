/**
 * listing.controller.js — HTTP handler layer for listings module.
 *
 * All endpoints wrapped with asyncHandler for centralized error catching.
 * Delegates business logic to ListingService.
 *
 * Endpoints:
 * - POST   /api/listings
 * - GET    /api/listings/:id
 * - PATCH  /api/listings/:id
 * - GET    /api/listings/:id/edit
 * - GET    /api/listings/:id/history
 * - GET    /api/listings/:id/revisions/:revision
 * - GET    /api/listings/geo/near
 * - GET    /api/listings/geo/clusters
 * - GET    /api/listings/geo/heatmap
 * - GET    /api/listings/geo/within-boundary
 * - GET    /api/listings/geo/stats/near
 */

const ListingService = require("./listing.service");
const {
  mapListingToResponse,
  mapListingToEditFormResponse,
  mapEditHistoryToResponse,
  buildRevisionConflictResponse,
  mapUpdateResponse,
  formatMarkerItem,
} = require("./listing.mapper");
const {
  createSuccessResponse,
  createErrorResponse,
} = require("../utils/response");
const logger = require("../utils/logger");

// ────────────────────────────────────────────────────────────────────────────
// Async Wrapper for Centralized Error Handling
// ────────────────────────────────────────────────────────────────────────────

/**
 * Wraps async route handlers to catch errors and pass to middleware.
 *
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped function
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ────────────────────────────────────────────────────────────────────────────
// Helper Methods
// ────────────────────────────────────────────────────────────────────────────

function isValidMongoId(id) {
  return /^[0-9a-f]{24}$/i.test(id);
}

// ────────────────────────────────────────────────────────────────────────────
// Controller Class
// ────────────────────────────────────────────────────────────────────────────

class ListingController {
  constructor() {
    this.service = new ListingService();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CRUD Endpoints
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/listings
   * Create a new listing.
   */
  createListing = asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          createErrorResponse("UNAUTHORIZED", "ورود الزامی است", null, req.id),
        );
    }

    const result = await this.service.createListing(userId, req.body);

    if (!result.success) {
      const error = result.error;
      const status = error.code === "VALIDATION_ERROR" ? 400 : 500;

      return res
        .status(status)
        .json(
          createErrorResponse(
            error.code,
            error.message,
            error.issues ? { issues: error.issues } : null,
            req.id,
          ),
        );
    }

    const mapped = mapListingToResponse(result.listing, req);

    return res
      .status(201)
      .json(createSuccessResponse({ item: mapped }, req.id));
  });

  /**
   * GET /api/listings/:id
   * Get a single listing.
   */
  getListingById = asyncHandler(async (req, res) => {
    const { id: listingId } = req.params;

    if (!isValidMongoId(listingId)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه نامعتبر",
            null,
            req.id,
          ),
        );
    }

    const result = await this.service.getListingById(listingId);

    if (!result.success) {
      return res
        .status(404)
        .json(
          createErrorResponse("NOT_FOUND", result.error.message, null, req.id),
        );
    }

    const mapped = mapListingToResponse(result.listing, req);

    return res
      .status(200)
      .json(createSuccessResponse({ item: mapped }, req.id));
  });

  /**
   * PATCH /api/listings/:id
   * Update listing with revision control.
   */
  updateListing = asyncHandler(async (req, res) => {
    const { id: listingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          createErrorResponse("UNAUTHORIZED", "ورود الزامی است", null, req.id),
        );
    }

    if (!isValidMongoId(listingId)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه نامعتبر",
            null,
            req.id,
          ),
        );
    }

    // Get listing to determine type
    const getListing = await this.service.getListingById(listingId);
    if (!getListing.success) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "آگهی یافت نشد", null, req.id));
    }

    const listingType = getListing.listing.type;

    const result = await this.service.updateListing(
      listingId,
      userId,
      req.body,
      listingType,
    );

    if (!result.success) {
      const error = result.error;

      if (error.code === "UNAUTHORIZED") {
        return res
          .status(403)
          .json(createErrorResponse(error.code, error.message, null, req.id));
      }

      if (error.code === "REVISION_CONFLICT") {
        return res.status(409).json(
          createErrorResponse(
            error.code,
            error.message,
            {
              currentRevision: error.currentRevision,
              clientRevision: error.clientRevision,
            },
            req.id,
          ),
        );
      }

      const status = error.code === "VALIDATION_ERROR" ? 400 : 500;

      return res
        .status(status)
        .json(
          createErrorResponse(
            error.code,
            error.message,
            error.issues ? { issues: error.issues } : null,
            req.id,
          ),
        );
    }

    const mapped = mapUpdateResponse(result.listing, result.imageDiff, req);

    return res
      .status(200)
      .json(createSuccessResponse({ item: mapped }, req.id));
  });

  /**
   * DELETE /api/listings/:id
   * Delete a listing.
   */
  deleteListing = asyncHandler(async (req, res) => {
    const { id: listingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          createErrorResponse("UNAUTHORIZED", "ورود الزامی است", null, req.id),
        );
    }

    if (!isValidMongoId(listingId)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه نامعتبر",
            null,
            req.id,
          ),
        );
    }

    const result = await this.service.deleteListing(listingId, userId);

    if (!result.success) {
      const status = result.error.code === "UNAUTHORIZED" ? 403 : 500;

      return res
        .status(status)
        .json(
          createErrorResponse(
            result.error.code,
            result.error.message,
            null,
            req.id,
          ),
        );
    }

    return res.status(204).send();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Form & History Endpoints
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/listings/:id/edit
   * Get listing for edit form (lightweight).
   */
  getListingForEdit = asyncHandler(async (req, res) => {
    const { id: listingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          createErrorResponse("UNAUTHORIZED", "ورود الزامی است", null, req.id),
        );
    }

    if (!isValidMongoId(listingId)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه نامعتبر",
            null,
            req.id,
          ),
        );
    }

    const result = await this.service.getListingForEditing(listingId, userId);

    if (!result.success) {
      const status = result.error.code === "UNAUTHORIZED" ? 403 : 404;

      return res
        .status(status)
        .json(
          createErrorResponse(
            result.error.code,
            result.error.message,
            null,
            req.id,
          ),
        );
    }

    const mapped = mapListingToEditFormResponse(result.listing, req);

    return res
      .status(200)
      .json(createSuccessResponse({ item: mapped }, req.id));
  });

  /**
   * GET /api/listings/:id/history
   * Get listing edit history.
   */
  getListingHistory = asyncHandler(async (req, res) => {
    const { id: listingId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    if (!isValidMongoId(listingId)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه نامعتبر",
            null,
            req.id,
          ),
        );
    }

    const result = await this.service.getEditHistory(listingId, limit);

    if (!result.success) {
      return res
        .status(404)
        .json(
          createErrorResponse(
            result.error.code,
            result.error.message,
            null,
            req.id,
          ),
        );
    }

    const mapped = mapEditHistoryToResponse(result.history);

    return res.status(200).json(
      createSuccessResponse(
        {
          items: mapped,
          totalRevisions: result.totalRevisions,
        },
        req.id,
      ),
    );
  });

  /**
   * GET /api/listings/:id/revisions/:revision
   * Get specific revision diff.
   */
  getListingRevision = asyncHandler(async (req, res) => {
    const { id: listingId, revision: revisionStr } = req.params;
    const revision = parseInt(revisionStr);

    if (!isValidMongoId(listingId)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه نامعتبر",
            null,
            req.id,
          ),
        );
    }

    if (!Number.isFinite(revision) || revision < 0) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شماره نسخه نامعتبر",
            null,
            req.id,
          ),
        );
    }

    const result = await this.service.getRevisionDiff(listingId, revision);

    if (!result.success) {
      return res
        .status(404)
        .json(
          createErrorResponse(
            result.error.code,
            result.error.message,
            null,
            req.id,
          ),
        );
    }

    return res
      .status(200)
      .json(createSuccessResponse({ item: result.diff }, req.id));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Geospatial Endpoints
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/listings/geo/near
   * Find nearby listings.
   */
  findNearby = asyncHandler(async (req, res) => {
    const { lat, lng, radiusKm, limit, skip } = req.query;

    // Build filters from query params
    const filters = {
      category: req.query.category,
      type: req.query.type,
      status: req.query.status,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      owner: req.query.owner,
      minRating: req.query.minRating,
      query: req.query.query,
      verified: req.query.verified,
    };

    const result = await this.service.findNearby(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radiusKm),
      filters,
      { limit: parseInt(limit), skip: parseInt(skip) },
    );

    if (!result.success) {
      return res
        .status(400)
        .json(
          createErrorResponse("VALIDATION_ERROR", result.error, null, req.id),
        );
    }

    const formatted = result.data.map((marker) =>
      formatMarkerItem(marker, req),
    );

    return res.status(200).json(
      createSuccessResponse(
        {
          items: formatted,
          meta: result.pagination,
          metadata: result.metadata,
        },
        req.id,
      ),
    );
  });

  /**
   * GET /api/listings/geo/heatmap
   * Generate heatmap data.
   */
  generateHeatmap = asyncHandler(async (req, res) => {
    const { lat, lng, radiusKm, gridSize, aggregateBy } = req.query;

    const result = await this.service.generateHeatmap(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radiusKm),
      {},
      { gridSize: parseInt(gridSize), aggregateBy },
    );

    if (!result.success) {
      return res
        .status(400)
        .json(
          createErrorResponse("VALIDATION_ERROR", result.error, null, req.id),
        );
    }

    return res
      .status(200)
      .json(createSuccessResponse({ data: result.data }, req.id));
  });

  /**
   * GET /api/listings/geo/stats/near
   * Get geospatial statistics.
   */
  getStatsNearby = asyncHandler(async (req, res) => {
    const { lat, lng, radiusKm } = req.query;

    const result = await this.service.getStatsNearby(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radiusKm),
      {},
    );

    if (!result.success) {
      return res
        .status(400)
        .json(
          createErrorResponse("VALIDATION_ERROR", result.error, null, req.id),
        );
    }

    return res
      .status(200)
      .json(createSuccessResponse({ data: result.data }, req.id));
  });
}

module.exports = ListingController;
