const DraftService = require("../services/DraftService");
const { buildResponse } = require("../utils/response");
const logger = require("winston");

/**
 * DraftController - HTTP request handlers for draft endpoints
 * Implements:
 * - POST /api/listings/draft - Create draft
 * - PATCH /api/listings/:id/draft - Autosave draft
 * - GET /api/listings/draft/latest - Get latest draft
 * - GET /api/listings/draft/:id - Get draft by ID
 * - DELETE /api/listings/draft/:id - Delete draft
 * - POST /api/listings/:draftId/publish - Promote draft to listing
 */

class DraftController {
  /**
   * POST /api/listings/draft
   * Create a new draft for multi-step form
   */
  async createDraft(req, res, next) {
    try {
      const { type, currentStep, isCompleted, ...data } = req.body;
      const ownerId = req.user.id;

      const initialData = {
        type,
        currentStep: currentStep || 1,
        isCompleted: isCompleted || false,
        ...data,
      };

      const draft = await DraftService.initializeDraft(
        ownerId,
        type,
        initialData,
      );

      logger.info("Draft created", {
        draftId: draft._id,
        type,
        ownerId,
      });

      return res.status(201).json(
        buildResponse({
          success: true,
          data: {
            draft,
          },
          reqId: req.id,
        }),
      );
    } catch (error) {
      logger.error("Error creating draft", {
        error: error.message,
        userId: req.user.id,
      });
      next(error);
    }
  }

  /**
   * PATCH /api/listings/:id/draft
   * Autosave draft with partial updates and optimistic locking
   */
  async updateDraft(req, res, next) {
    try {
      const draftId = req.params.id;
      const ownerId = req.user.id;
      const { _version, currentStep, data } = req.body;

      // Validate version is provided
      if (_version === undefined) {
        return res.status(400).json(
          buildResponse({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "_version is required for optimistic locking",
            },
            reqId: req.id,
          }),
        );
      }

      const autosavePayload = {
        _version,
        currentStep,
        data,
      };

      const result = await DraftService.autosaveDraft(
        draftId,
        ownerId,
        autosavePayload,
      );

      if (!result.success) {
        const statusCode = result.error === "VERSION_CONFLICT" ? 409 : 400;

        logger.warn("Autosave failed", {
          draftId,
          error: result.error,
          ownerId,
        });

        return res.status(statusCode).json(
          buildResponse({
            success: false,
            error: {
              code: result.error,
              message: result.message,
              ...(result.error === "VERSION_CONFLICT" && {
                currentVersion: result.currentVersion,
                expectedVersion: result.expectedVersion,
                draft: result.draft,
              }),
            },
            reqId: req.id,
          }),
        );
      }

      logger.debug("Draft autosaved", {
        draftId,
        changedFields: result.changedFields,
        newVersion: result.draft._version,
        ownerId,
      });

      return res.status(200).json(
        buildResponse({
          success: true,
          data: {
            draft: result.draft,
            changedFields: result.changedFields,
            hasChanges: result.hasChanges,
          },
          reqId: req.id,
        }),
      );
    } catch (error) {
      logger.error("Error autosaving draft", {
        error: error.message,
        userId: req.user.id,
      });
      next(error);
    }
  }

  /**
   * GET /api/listings/draft/latest
   * Get latest active draft for user (optionally filtered by type)
   */
  async getLatestDraft(req, res, next) {
    try {
      const ownerId = req.user.id;
      const { type } = req.query; // Optional filter

      const draft = await DraftService.getLatestDraft(ownerId, type);

      if (!draft) {
        return res.status(404).json(
          buildResponse({
            success: false,
            error: {
              code: "DRAFT_NOT_FOUND",
              message: "No active draft found",
            },
            reqId: req.id,
          }),
        );
      }

      return res.status(200).json(
        buildResponse({
          success: true,
          data: {
            draft,
          },
          reqId: req.id,
        }),
      );
    } catch (error) {
      logger.error("Error fetching latest draft", {
        error: error.message,
        userId: req.user.id,
      });
      next(error);
    }
  }

  /**
   * GET /api/listings/draft/:id
   * Get specific draft by ID (with ownership check)
   */
  async getDraftById(req, res, next) {
    try {
      const draftId = req.params.id;
      const ownerId = req.user.id;

      const draft = await DraftService.getDraftById(draftId, ownerId);

      if (!draft) {
        return res.status(404).json(
          buildResponse({
            success: false,
            error: {
              code: "DRAFT_NOT_FOUND",
              message: "Draft not found or you do not have access",
            },
            reqId: req.id,
          }),
        );
      }

      return res.status(200).json(
        buildResponse({
          success: true,
          data: {
            draft,
          },
          reqId: req.id,
        }),
      );
    } catch (error) {
      logger.error("Error fetching draft", {
        error: error.message,
        userId: req.user.id,
      });
      next(error);
    }
  }

  /**
   * GET /api/listings/draft
   * List all active drafts for user (paginated)
   */
  async listDrafts(req, res, next) {
    try {
      const ownerId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100); // Max 100
      const skip = parseInt(req.query.skip, 10) || 0;

      const result = await DraftService.listUserDrafts(ownerId, limit, skip);

      return res.status(200).json(
        buildResponse({
          success: true,
          data: result,
          reqId: req.id,
        }),
      );
    } catch (error) {
      logger.error("Error listing drafts", {
        error: error.message,
        userId: req.user.id,
      });
      next(error);
    }
  }

  /**
   * DELETE /api/listings/draft/:id
   * Soft delete (mark as discarded)
   */
  async deleteDraft(req, res, next) {
    try {
      const draftId = req.params.id;
      const ownerId = req.user.id;

      const result = await DraftService.deleteDraft(draftId, ownerId);

      if (!result.success) {
        const statusCode = result.error === "UNAUTHORIZED" ? 403 : 404;
        return res.status(statusCode).json(
          buildResponse({
            success: false,
            error: {
              code: result.error,
              message: result.message,
            },
            reqId: req.id,
          }),
        );
      }

      logger.info("Draft deleted", { draftId, ownerId });

      return res.status(200).json(
        buildResponse({
          success: true,
          data: {
            message: result.message,
          },
          reqId: req.id,
        }),
      );
    } catch (error) {
      logger.error("Error deleting draft", {
        error: error.message,
        userId: req.user.id,
      });
      next(error);
    }
  }

  /**
   * POST /api/listings/:draftId/publish
   * Promote draft to published listing
   */
  async publishDraft(req, res, next) {
    try {
      const draftId = req.params.draftId;
      const ownerId = req.user.id;
      const finalData = req.body; // Optional overrides for final data

      const result = await DraftService.promoteDraftToListing(
        draftId,
        ownerId,
        finalData,
      );

      if (!result.success) {
        const statusCodeMap = {
          UNAUTHORIZED: 403,
          DRAFT_NOT_FOUND: 404,
          DRAFT_NOT_ACTIVE: 400,
          INCOMPLETE_DRAFT: 422, // 422 Unprocessable Entity
          PUBLISH_FAILED: 500,
        };

        const statusCode = statusCodeMap[result.error] || 400;

        logger.warn("Draft publish failed", {
          draftId,
          error: result.error,
          ownerId,
        });

        return res.status(statusCode).json(
          buildResponse({
            success: false,
            error: {
              code: result.error,
              message: result.message,
              ...(result.missingFields && {
                missingFields: result.missingFields,
              }),
            },
            reqId: req.id,
          }),
        );
      }

      logger.info("Draft published to listing", {
        draftId,
        listingId: result.listing._id,
        ownerId,
      });

      return res.status(201).json(
        buildResponse({
          success: true,
          data: {
            listing: result.listing,
            draft: result.draft,
            message: result.message,
          },
          reqId: req.id,
        }),
      );
    } catch (error) {
      logger.error("Error publishing draft", {
        error: error.message,
        userId: req.user.id,
      });
      next(error);
    }
  }

  /**
   * GET /api/listings/draft/stats/:userId
   * Get draft statistics for a user (admin/user own data)
   */
  async getDraftStats(req, res, next) {
    try {
      const userId = req.params.userId;
      const ownerId = req.user.id;

      // Only allow users to view their own stats (unless admin)
      if (userId !== ownerId && req.user.role !== "admin") {
        return res.status(403).json(
          buildResponse({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "You cannot view other users' draft statistics",
            },
            reqId: req.id,
          }),
        );
      }

      const stats = await DraftService.getDraftStats(userId);

      return res.status(200).json(
        buildResponse({
          success: true,
          data: {
            stats,
          },
          reqId: req.id,
        }),
      );
    } catch (error) {
      logger.error("Error fetching draft stats", {
        error: error.message,
        userId: req.user.id,
      });
      next(error);
    }
  }
}

module.exports = new DraftController();
