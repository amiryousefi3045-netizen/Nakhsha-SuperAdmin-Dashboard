/**
 * modules/drafts/index.js — Drafts module entry point.
 *
 * Routes:
 * - POST   /draft — Create draft
 * - GET    /draft/latest — Get latest draft
 * - PATCH  /:id/draft — Autosave draft
 * - DELETE /:id/draft — Delete draft
 *
 * Mounted at: /api/listings
 */

const express = require("express");
const { requireAuth } = require("../../middleware/auth");

const DraftController = require("./draft.controller");

// ────────────────────────────────────────────────────────────────────────────

const router = express.Router();
const controller = new DraftController();

// ────────────────────────────────────────────────────────────────────────────
// Draft Routes
// ────────────────────────────────────────────────────────────────────────────

// POST /api/listings/draft — Create draft
router.post("/draft", requireAuth, controller.createDraft);

// GET /api/listings/draft/latest — Get latest draft
router.get("/draft/latest", requireAuth, controller.getLatestDraft);

// PATCH /api/listings/:id/draft — Autosave draft
router.patch("/:id/draft", requireAuth, controller.updateDraft);

// DELETE /api/listings/:id/draft — Delete draft
router.delete("/:id/draft", requireAuth, controller.deleteDraft);

// ────────────────────────────────────────────────────────────────────────────

module.exports = router;
