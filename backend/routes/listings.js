/**
 * listings.js — CRUD router for the canonical Listing collection.
 *
 * Mounted at /api/listings in server.js.
 *
 * Note: the GET /api/listings/near endpoint is handled by a separate
 * router (routes/listings.near.js) which is mounted first in server.js
 * so that the /near path is resolved before any generic handlers here.
 */
const express = require("express");
const {
  Listing,
  PostListing,
  TourListing,
  TrainingListing,
  AcademyListing,
} = require("../models/Listing");
const { requireAuth } = require("../middleware/auth");
const {
  createSuccessResponse,
  createErrorResponse,
} = require("../utils/response");
const { toAbsoluteUrl } = require("../utils/urls");
const {
  createListingBaseSchema,
  DETAILS_SCHEMAS,
} = require("../utils/listingValidation");
const logger = require("../utils/logger");

const router = express.Router();

// ── Discriminator model map ───────────────────────────────────────────────────

const TYPE_MODEL = {
  post: PostListing,
  tour: TourListing,
  training: TrainingListing,
  academy: AcademyListing,
};

// ── Response formatter ────────────────────────────────────────────────────────

/**
 * Format a Mongoose Listing document for the API response.
 *
 * Stored images are relative paths ("/uploads/…"). We add an `imagesAbs`
 * field with fully-qualified URLs without mutating the stored value.
 *
 * @param {import('mongoose').Document} doc
 * @param {import('express').Request} req  – used for PUBLIC_BASE_URL fallback
 * @returns {object}
 */
function formatListingItem(doc, req) {
  const base = {
    id: doc._id,
    type: doc.type,
    title: doc.title,
    description: doc.description,
    tags: doc.tags,
    images: doc.images,
    imagesAbs: (doc.images ?? []).map((p) => toAbsoluteUrl(p, req)),
    location: doc.location ?? null,
    status: doc.status,
    owner: doc.owner,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  // Append type-specific fields that live at the document root (discriminator props)
  switch (doc.type) {
    case "post":
      return {
        ...base,
        price: doc.price,
        forSale: doc.forSale,
        category: doc.category,
        attributes: doc.attributes
          ? Object.fromEntries(doc.attributes)
          : undefined,
      };
    case "tour":
      return {
        ...base,
        startDate: doc.startDate,
        durationDays: doc.durationDays,
        capacity: doc.capacity,
        itinerary: doc.itinerary,
      };
    case "training":
      return {
        ...base,
        schedule: doc.schedule,
        level: doc.level,
        instructor: doc.instructor,
      };
    case "academy":
      return {
        ...base,
        addressDetails: doc.addressDetails,
        phone: doc.phone,
        workingHours: doc.workingHours,
        website: doc.website,
      };
    default:
      return base;
  }
}

// ── Validation helper ─────────────────────────────────────────────────────────

/**
 * Run Zod validation and return { ok, data, error }.
 * Never throws.
 */
function zodParse(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const firstIssue = result.error.issues[0];
  return {
    ok: false,
    error: {
      message: firstIssue ? firstIssue.message : "اطلاعات ورودی نامعتبر است",
      issues: result.error.issues.map((i) => ({
        field: i.path.join(".") || undefined,
        message: i.message,
        code: i.code,
      })),
    },
  };
}

// ── POST /api/listings ────────────────────────────────────────────────────────

/**
 * Create a new listing (draft or published).
 *
 * Body shape:
 * {
 *   type:        'post' | 'tour' | 'training' | 'academy'   (required)
 *   title:       string  (required, min 5)
 *   description: string  (required)
 *   tags?:       string[]
 *   images?:     string[]  (relative paths stored; absolute in response)
 *   location?:   { type:'Point', coordinates:[lng, lat] }
 *   status?:     'draft' | 'published'   default 'draft'
 *   details?:    { …type-specific fields… }
 * }
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    // ── 1. Validate base fields ──────────────────────────────────────────────
    const baseResult = zodParse(createListingBaseSchema, req.body);
    if (!baseResult.ok) {
      return res.status(400).json(
        createErrorResponse(
          "VALIDATION_ERROR",
          baseResult.error.message,
          {
            issues: baseResult.error.issues,
          },
          req.id,
        ),
      );
    }

    const {
      type,
      title,
      description,
      tags,
      images,
      location,
      status,
      details,
    } = baseResult.data;

    // ── 2. Validate type-specific details ────────────────────────────────────
    const detailsSchema = DETAILS_SCHEMAS[type];
    const detailsResult = zodParse(detailsSchema, details ?? {});
    if (!detailsResult.ok) {
      return res.status(400).json(
        createErrorResponse(
          "VALIDATION_ERROR",
          detailsResult.error.message,
          {
            issues: detailsResult.error.issues,
          },
          req.id,
        ),
      );
    }
    const validDetails = detailsResult.data;

    // ── 3. Build document ────────────────────────────────────────────────────
    const Model = TYPE_MODEL[type];

    const docData = {
      title,
      description,
      tags,
      images,
      owner: req.user.id,
      status,
    };

    if (location) {
      docData.location = location;
    }

    // Spread type-specific details at document root (discriminator fields live
    // there, not inside a nested object)
    Object.assign(docData, validDetails);

    // ── 4. Persist ───────────────────────────────────────────────────────────
    const doc = await Model.create(docData);

    // ── 5. Format & respond ──────────────────────────────────────────────────
    const item = formatListingItem(doc, req);

    return res.status(201).json(createSuccessResponse({ item }, req.id));
  } catch (err) {
    // Mongoose validation errors
    if (err.name === "ValidationError") {
      const issues = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
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

    logger.error("POST /api/listings — unexpected error", {
      reqId: req.id,
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
});

// ── GET /api/listings/:id ─────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const doc = await Listing.findById(req.params.id).lean();
    if (!doc) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "آگهی یافت نشد", null, req.id));
    }
    return res.json(
      createSuccessResponse({ item: formatListingItem(doc, req) }, req.id),
    );
  } catch (err) {
    if (err.name === "CastError") {
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
    logger.error("GET /api/listings/:id — unexpected error", {
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
});

module.exports = router;
