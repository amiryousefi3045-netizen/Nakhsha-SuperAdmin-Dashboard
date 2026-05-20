/**
 * modules/listings/index.js — Listings module entry point.
 *
 * Exports:
 * - Express router with all listing endpoints
 * - Service, repository, and utility exports for potential reuse
 *
 * Routes:
 * - POST   /
 * - GET    /geo/near
 * - GET    /geo/heatmap
 * - GET    /geo/stats/near
 * - GET    /:id
 * - PATCH  /:id
 * - DELETE /:id
 * - GET    /:id/edit
 * - GET    /:id/history
 * - GET    /:id/revisions/:revision
 *
 * IMPORTANT: Geospatial routes must come BEFORE /:id to avoid path conflicts
 *
 * Mounted at: /api/listings
 */

const express = require("express");
const { requireAuth } = require("../../middleware/auth");
const { heavyLimiter } = require("../../middleware/rateLimiter");

const ListingController = require("./listing.controller");
const ListingService = require("./listing.service");
const ListingRepository = require("./listing.repository");
const listingGeoService = require("./listing.geo");

// ────────────────────────────────────────────────────────────────────────────
// Initialize Module Components
// ────────────────────────────────────────────────────────────────────────────

const router = express.Router();
const controller = new ListingController();

// ────────────────────────────────────────────────────────────────────────────
// Geospatial Routes (MUST come BEFORE /:id to avoid path conflicts)
// ────────────────────────────────────────────────────────────────────────────

// GET /api/listings/geo/near — Nearby listings
router.get("/geo/near", heavyLimiter, controller.findNearby);

// GET /api/listings/geo/heatmap — Heatmap data
router.get("/geo/heatmap", heavyLimiter, controller.generateHeatmap);

// GET /api/listings/geo/stats/near — Geospatial stats
router.get("/geo/stats/near", heavyLimiter, controller.getStatsNearby);

// ────────────────────────────────────────────────────────────────────────────
// CRUD Routes
// ────────────────────────────────────────────────────────────────────────────

// POST /api/listings — Create listing
router.post("/", requireAuth, controller.createListing);

// GET /api/listings/:id — Get single listing
router.get("/:id", controller.getListingById);

// PATCH /api/listings/:id — Update listing
router.patch("/:id", requireAuth, controller.updateListing);

// DELETE /api/listings/:id — Delete listing
router.delete("/:id", requireAuth, controller.deleteListing);

// ────────────────────────────────────────────────────────────────────────────
// Form & History Routes (under /:id path)
// ────────────────────────────────────────────────────────────────────────────

// GET /api/listings/:id/edit — Get for edit form
router.get("/:id/edit", requireAuth, controller.getListingForEdit);

// GET /api/listings/:id/history — Get edit history
router.get("/:id/history", controller.getListingHistory);

// GET /api/listings/:id/revisions/:revision — Get revision diff
router.get("/:id/revisions/:revision", controller.getListingRevision);

// ────────────────────────────────────────────────────────────────────────────
// Module Exports
// ────────────────────────────────────────────────────────────────────────────

module.exports = router;

// Also export services/utilities for potential cross-module use
module.exports.ListingService = ListingService;
module.exports.ListingRepository = ListingRepository;
module.exports.listingGeoService = listingGeoService;
