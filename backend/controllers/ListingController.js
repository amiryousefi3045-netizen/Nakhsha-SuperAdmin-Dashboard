/**
 * ListingController — HTTP handler for listing endpoints.
 *
 * Handles:
 * - PATCH /api/listings/:id — Update listing with revision control
 * - GET /api/listings/:id/edit — Get listing for edit form
 * - GET /api/listings/:id/history — Get edit history
 * - GET /api/listings/:id/revisions/:revision — Get specific revision diff
 */

const ListingService = require("../services/ListingService");
const { Listing } = require("../models/Listing");
const {
  updateListingBaseSchema,
  UPDATE_DETAILS_SCHEMAS,
} = require("../utils/listingValidation");
const {
  mapUpdateResponse,
  mapListingToEditFormResponse,
  mapEditHistoryToResponse,
  buildRevisionConflictResponse,
  mapListingToResponse,
} = require("../utils/listingResponseDTO");
const {
  createSuccessResponse,
  createErrorResponse,
} = require("../utils/response");
const logger = require("../utils/logger");

class ListingController {
  constructor() {
    this.service = new ListingService();
  }

  /**
   * PATCH /api/listings/:id
   *
   * Update a listing with partial updates, image diffing, and revision control.
   *
   * Body:
   * {
   *   title?: string                     (optional, min 5 chars)
   *   description?: string               (optional, min 1 char)
   *   tags?: string[]                    (optional)
   *   images?: string[]                  (optional, relative paths)
   *   location?: { type:'Point', coordinates:[lng,lat] }  (optional)
   *   revision: number                   (required for optimistic lock)
   *   details?: { …type-specific fields… }  (optional)
   *   reason?: string                    (optional: why this edit)
   * }
   *
   * Response (success):
   * {
   *   success: true
   *   data: {
   *     id, revision, updatedAt,
   *     images: { current, imagesAbs, added, removed, reordered }  (if changed)
   *   }
   * }
   *
   * Response (error):
   * {
   *   success: false
   *   error: { code, message, issues? }
   * }
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async patchListing(req, res) {
    try {
      const { id: listingId } = req.params;
      const userId = req.user?.id;

      // ── 1. Verify authentication ────────────────────────────────────────

      if (!userId) {
        return res
          .status(401)
          .json(
            createErrorResponse(
              "UNAUTHORIZED",
              "ورود الزامی است برای ویرایش آگهی",
              null,
              req.id,
            ),
          );
      }

      // ── 2. Validate listing ID ──────────────────────────────────────────

      if (!this._isValidMongoId(listingId)) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "شناسه آگهی نامعتبر است",
              null,
              req.id,
            ),
          );
      }

      // ── 3. Get existing listing to check type ───────────────────────────

      const existingListing = await Listing.findById(listingId).lean();

      if (!existingListing) {
        return res
          .status(404)
          .json(
            createErrorResponse("NOT_FOUND", "آگهی یافت نشد", null, req.id),
          );
      }

      const listingType = existingListing.type;

      // ── 4. Validate base fields ─────────────────────────────────────────

      const baseValidation = updateListingBaseSchema.safeParse(req.body);

      if (!baseValidation.success) {
        const issues = baseValidation.error.issues.map((i) => ({
          field: i.path.join(".") || undefined,
          message: i.message,
          code: i.code,
        }));

        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "اطلاعات ورودی نامعتبر است",
              { issues },
              req.id,
            ),
          );
      }

      // ── 5. Validate type-specific details ────────────────────────────────

      if (req.body.details) {
        const detailsSchema = UPDATE_DETAILS_SCHEMAS[listingType];

        if (!detailsSchema) {
          return res
            .status(400)
            .json(
              createErrorResponse(
                "VALIDATION_ERROR",
                `نوع آگهی نامعتبر: ${listingType}`,
                null,
                req.id,
              ),
            );
        }

        const detailsValidation = detailsSchema.safeParse(req.body.details);

        if (!detailsValidation.success) {
          const issues = detailsValidation.error.issues.map((i) => ({
            field: i.path.join(".") || undefined,
            message: i.message,
            code: i.code,
          }));

          return res
            .status(400)
            .json(
              createErrorResponse(
                "VALIDATION_ERROR",
                "جزئیات نوع آگهی نامعتبر است",
                { issues },
                req.id,
              ),
            );
        }

        // Use validated details
        req.body.details = detailsValidation.data;
      }

      // ── 6. Call service to perform update ───────────────────────────────

      const updateResult = await this.service.updateListing(
        listingId,
        userId,
        req.body,
        listingType,
      );

      // ── 7. Handle service response ──────────────────────────────────────

      if (!updateResult.success) {
        const error = updateResult.error;

        // Handle specific error codes
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

        if (error.code === "INVALID_IMAGES") {
          return res
            .status(400)
            .json(
              createErrorResponse(
                error.code,
                error.message,
                { imageErrors: error.details },
                req.id,
              ),
            );
        }

        if (error.code === "NO_CHANGES") {
          return res
            .status(400)
            .json(createErrorResponse(error.code, error.message, null, req.id));
        }

        return res
          .status(500)
          .json(
            createErrorResponse(
              error.code || "INTERNAL_ERROR",
              error.message || "خطای داخلی سرور",
              null,
              req.id,
            ),
          );
      }

      // ── 8. Format and return success response ────────────────────────────

      const responseData = mapUpdateResponse(
        updateResult.listing,
        updateResult.imageDiff,
        req,
      );

      return res
        .status(200)
        .json(createSuccessResponse({ item: responseData }, req.id));
    } catch (err) {
      logger.error("Error in ListingController.patchListing", {
        listingId: req.params.id,
        userId: req.user?.id,
        error: err.message,
        stack: err.stack,
      });

      return res
        .status(500)
        .json(
          createErrorResponse(
            "INTERNAL_ERROR",
            "خطای داخلی سرور رخ داد",
            null,
            req.id,
          ),
        );
    }
  }

  /**
   * GET /api/listings/:id/edit
   *
   * Get listing data optimized for edit form population.
   * Includes all necessary fields but excludes heavy audit data.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getListingForEdit(req, res) {
    try {
      const { id: listingId } = req.params;
      const userId = req.user?.id;

      if (!this._isValidMongoId(listingId)) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "شناسه آگهی نامعتبر است",
              null,
              req.id,
            ),
          );
      }

      const listing = await Listing.findById(listingId).lean();

      if (!listing) {
        return res
          .status(404)
          .json(
            createErrorResponse("NOT_FOUND", "آگهی یافت نشد", null, req.id),
          );
      }

      // Optional: restrict edit form access to owner
      if (userId && listing.owner.toString() !== userId.toString()) {
        return res
          .status(403)
          .json(
            createErrorResponse(
              "FORBIDDEN",
              "شما مجاز به ویرایش این آگهی نیستید",
              null,
              req.id,
            ),
          );
      }

      const editForm = mapListingToEditFormResponse(listing, req);

      return res.json(createSuccessResponse({ item: editForm }, req.id));
    } catch (err) {
      logger.error("Error in ListingController.getListingForEdit", {
        listingId: req.params.id,
        error: err.message,
      });

      return res
        .status(500)
        .json(
          createErrorResponse(
            "INTERNAL_ERROR",
            "خطای داخلی سرور رخ داد",
            null,
            req.id,
          ),
        );
    }
  }

  /**
   * GET /api/listings/:id/history
   *
   * Get edit history for a listing.
   * Shows who edited what and when.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getListingHistory(req, res) {
    try {
      const { id: listingId } = req.params;
      const limit = Math.min(parseInt(req.query.limit || "50"), 100);

      if (!this._isValidMongoId(listingId)) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "شناسه آگهی نامعتبر است",
              null,
              req.id,
            ),
          );
      }

      const historyResult = await this.service.getEditHistory(
        listingId,
        null,
        limit,
      );

      if (!historyResult.success) {
        return res
          .status(404)
          .json(
            createErrorResponse("NOT_FOUND", "آگهی یافت نشد", null, req.id),
          );
      }

      const formattedHistory = mapEditHistoryToResponse(historyResult.history);

      return res.json(
        createSuccessResponse(
          {
            history: formattedHistory,
            totalRevisions: historyResult.totalRevisions,
          },
          req.id,
        ),
      );
    } catch (err) {
      logger.error("Error in ListingController.getListingHistory", {
        listingId: req.params.id,
        error: err.message,
      });

      return res
        .status(500)
        .json(
          createErrorResponse(
            "INTERNAL_ERROR",
            "خطای داخلی سرور رخ داد",
            null,
            req.id,
          ),
        );
    }
  }

  /**
   * GET /api/listings/:id/revisions/:revision
   *
   * Get specific revision diff.
   * Shows what changed in a particular revision.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getRevisionDiff(req, res) {
    try {
      const { id: listingId, revision } = req.params;

      if (!this._isValidMongoId(listingId)) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "شناسه آگهی نامعتبر است",
              null,
              req.id,
            ),
          );
      }

      const revisionNum = parseInt(revision);

      if (isNaN(revisionNum) || revisionNum < 0) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "نسخه باید یک عدد صحیح غیر منفی باشد",
              null,
              req.id,
            ),
          );
      }

      const diffResult = await this.service.getRevisionDiff(
        listingId,
        revisionNum,
      );

      if (!diffResult.success) {
        return res
          .status(404)
          .json(
            createErrorResponse(
              diffResult.error.code,
              diffResult.error.message,
              null,
              req.id,
            ),
          );
      }

      return res.json(createSuccessResponse({ diff: diffResult.diff }, req.id));
    } catch (err) {
      logger.error("Error in ListingController.getRevisionDiff", {
        listingId: req.params.id,
        revision: req.params.revision,
        error: err.message,
      });

      return res
        .status(500)
        .json(
          createErrorResponse(
            "INTERNAL_ERROR",
            "خطای داخلی سرور رخ داد",
            null,
            req.id,
          ),
        );
    }
  }

  /**
   * Validate MongoDB ObjectId format.
   *
   * @param {string} id - ID to validate
   * @returns {boolean} True if valid MongoDB ID format
   * @private
   */
  _isValidMongoId(id) {
    return /^[a-f\d]{24}$/i.test(id);
  }
}

module.exports = ListingController;
