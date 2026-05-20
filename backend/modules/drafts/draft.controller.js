/**
 * modules/drafts/draft.controller.js — HTTP handlers for draft endpoints.
 */

const DraftService = require("./draft.service");
const {
  createSuccessResponse,
  createErrorResponse,
} = require("../../utils/response");
const logger = require("../../utils/logger");

/**
 * Async wrapper for centralized error handling.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ────────────────────────────────────────────────────────────────────────────

class DraftController {
  constructor() {
    this.service = new DraftService();
  }

  /**
   * POST /api/listings/draft
   * Create a new draft.
   */
  createDraft = asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          createErrorResponse("UNAUTHORIZED", "ورود الزامی است", null, req.id),
        );
    }

    const result = await this.service.createDraft(userId, req.body);

    if (!result.success) {
      return res
        .status(500)
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
      .status(201)
      .json(createSuccessResponse({ draft: result.draft }, req.id));
  });

  /**
   * GET /api/listings/draft/latest
   * Get latest draft for user.
   */
  getLatestDraft = asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          createErrorResponse("UNAUTHORIZED", "ورود الزامی است", null, req.id),
        );
    }

    const type = req.query.type;

    const result = await this.service.getLatestDraft(userId, type);

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
      .json(createSuccessResponse({ draft: result.draft }, req.id));
  });

  /**
   * PATCH /api/listings/:id/draft
   * Autosave draft with optimistic locking.
   */
  updateDraft = asyncHandler(async (req, res) => {
    const { id: draftId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          createErrorResponse("UNAUTHORIZED", "ورود الزامی است", null, req.id),
        );
    }

    const { _version, ...updateData } = req.body;

    if (!Number.isFinite(_version)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "نسخه پیش‌نویس نامعتبر",
            null,
            req.id,
          ),
        );
    }

    const result = await this.service.updateDraftOptimistic(
      draftId,
      userId,
      _version,
      updateData,
    );

    if (!result.success) {
      const status = result.error.code === "VERSION_CONFLICT" ? 409 : 500;

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

    return res
      .status(200)
      .json(createSuccessResponse({ draft: result.draft }, req.id));
  });

  /**
   * DELETE /api/listings/:id/draft
   * Delete draft.
   */
  deleteDraft = asyncHandler(async (req, res) => {
    const { id: draftId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json(
          createErrorResponse("UNAUTHORIZED", "ورود الزامی است", null, req.id),
        );
    }

    const result = await this.service.deleteDraft(draftId, userId);

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

    return res.status(204).send();
  });
}

module.exports = DraftController;
