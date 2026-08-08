const express = require("express");
const DraftController = require("../controllers/DraftController");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const {
  createDraftSchema,
  autosaveDraftSchema,
  publishDraftSchema,
} = require("../utils/draftValidation");

const router = express.Router();

/**
 * Draft Routes
 * All routes require authentication
 * Supports multi-step listing creation with autosave
 */

// ========== DRAFT CREATION & RETRIEVAL ==========

/**
 * POST /api/listings/draft
 * Create a new draft
 * Body: { type, currentStep?, isCompleted?, ...initialData }
 * Response: 201 { success: true, data: { draft } }
 */
router.post(
  "/draft",
  requireAuth,
  validate(createDraftSchema, "body"),
  DraftController.createDraft,
);

/**
 * PATCH /api/listings/:id/draft
 * Autosave draft with optimistic locking
 * Body: { _version, currentStep?, data }
 * Response: 200 { success: true, data: { draft, changedFields, hasChanges } }
 * Response: 409 { success: false, error: { code: 'VERSION_CONFLICT', ... } }
 */
router.patch(
  "/:id/draft",
  requireAuth,
  validate(autosaveDraftSchema, "body"),
  DraftController.updateDraft,
);

/**
 * GET /api/listings/draft/latest
 * Get latest active draft for user (optionally by type)
 * Query: ?type=post|tour|training|academy
 * Response: 200 { success: true, data: { draft } }
 * Response: 404 { success: false, error: { code: 'DRAFT_NOT_FOUND' } }
 */
router.get("/draft/latest", requireAuth, DraftController.getLatestDraft);

/**
 * GET /api/listings/draft/:id
 * Get specific draft by ID
 * Response: 200 { success: true, data: { draft } }
 * Response: 404 { success: false, error: { code: 'DRAFT_NOT_FOUND' } }
 */
router.get("/draft/:id", requireAuth, DraftController.getDraftById);

/**
 * GET /api/listings/draft
 * List all active drafts for user (paginated)
 * Query: ?limit=10&skip=0
 * Response: 200 { success: true, data: { drafts, total, hasMore } }
 */
router.get("/draft", requireAuth, DraftController.listDrafts);

/**
 * DELETE /api/listings/draft/:id
 * Soft delete (mark as discarded)
 * Response: 200 { success: true, data: { message } }
 * Response: 404 { success: false, error: { code: 'DRAFT_NOT_FOUND' } }
 */
router.delete("/draft/:id", requireAuth, DraftController.deleteDraft);

// ========== DRAFT PUBLISHING ==========

/**
 * POST /api/listings/:draftId/publish
 * Promote draft to published listing
 * Body: { ...finalDataOverrides }
 * Response: 201 { success: true, data: { listing, draft } }
 * Response: 422 { success: false, error: { code: 'INCOMPLETE_DRAFT', missingFields } }
 */
router.post("/:draftId/publish", requireAuth, DraftController.publishDraft);

// ========== DRAFT STATISTICS ==========

/**
 * GET /api/listings/draft/stats/:userId
 * Get draft statistics (only own or admin)
 * Response: 200 { success: true, data: { stats: { activeCount, publishedCount, etc } } }
 */
router.get("/draft/stats/:userId", requireAuth, DraftController.getDraftStats);

module.exports = router;
