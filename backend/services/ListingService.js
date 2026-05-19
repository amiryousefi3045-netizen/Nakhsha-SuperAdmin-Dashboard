/**
 * ListingService — Business logic layer for listing operations.
 *
 * Handles:
 * - Validation and authorization
 * - Image diffing and processing
 * - Revision conflict detection
 * - Generating optimized update queries
 * - Preparing frontend responses
 */

const ListingRepository = require("../repository/ListingRepository");
const {
  diffImages,
  sanitizeImages,
  validateImagePaths,
  getImageDeltaForResponse,
} = require("../utils/imageDiffing");
const logger = require("../utils/logger");

class ListingService {
  constructor() {
    this.repository = new ListingRepository();
  }

  /**
   * Update a listing with full validation and revision control.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {string} userId - User making the edit (ownership check)
   * @param {object} updatePayload - { title?, description?, tags?, images?, location?, revision, details?, reason? }
   * @param {string} listingType - Listing type (post, tour, training, academy) for schema validation
   * @returns {Promise<{success: boolean, listing?: object, error?: object}>}
   */
  async updateListing(listingId, userId, updatePayload, listingType) {
    try {
      // ── 1. Verify ownership ──────────────────────────────────────────────

      const existingListing = await this.repository.getListingIfOwned(
        listingId,
        userId,
      );

      if (!existingListing) {
        return {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "آن را مجاز نیستید برای ویرایش این آگهی",
          },
        };
      }

      // ── 2. Revision check (optimistic concurrency control) ──────────────

      const expectedRevision =
        updatePayload.revision ?? existingListing.revision;

      if (existingListing.revision !== expectedRevision) {
        // Revision mismatch: client is out of sync
        return {
          success: false,
          error: {
            code: "REVISION_CONFLICT",
            message:
              "آگهی توسط کاربر دیگری تغییر کرده است. لطفاً مجدداً بارگذاری کنید.",
            currentRevision: existingListing.revision,
            clientRevision: expectedRevision,
          },
        };
      }

      // ── 3. Sanitize and validate inputs ──────────────────────────────────

      const sanitizedUpdate = this._sanitizeUpdate(updatePayload);

      // If images are being updated, validate them
      if (sanitizedUpdate.images !== undefined) {
        const imageValidation = validateImagePaths(sanitizedUpdate.images);

        if (!imageValidation.valid) {
          return {
            success: false,
            error: {
              code: "INVALID_IMAGES",
              message: "یک یا چند مسیر تصویر نامعتبر است",
              details: imageValidation.errors,
            },
          };
        }
      }

      // ── 4. Handle image diffing ──────────────────────────────────────────

      let imageDiff = null;

      if (sanitizedUpdate.images !== undefined) {
        imageDiff = diffImages(
          existingListing.images || [],
          sanitizedUpdate.images,
        );

        // Log image changes for audit
        if (imageDiff.hasChanges) {
          logger.info("Image changes detected during listing update", {
            listingId,
            userId,
            added: imageDiff.added.length,
            removed: imageDiff.removed.length,
            reordered: imageDiff.reordered,
          });
        }
      }

      // ── 5. Build the update document ─────────────────────────────────────

      // Only include fields that were actually provided (sparse update)
      const updateDoc = this._buildUpdateDocument(sanitizedUpdate);

      if (Object.keys(updateDoc).length === 0) {
        // No fields to update
        return {
          success: false,
          error: {
            code: "NO_CHANGES",
            message: "هیچ تغییری برای اعمال وجود ندارد",
          },
        };
      }

      // ── 6. Perform optimistic lock update ────────────────────────────────

      const reason = sanitizedUpdate.reason || null;

      const updateResult = await this.repository.updateWithOptimisticLock(
        listingId,
        existingListing.revision,
        updateDoc,
        userId,
        reason,
      );

      if (!updateResult.success) {
        if (updateResult.revisionConflict) {
          // Another concurrent update occurred
          const currentListing =
            await this.repository.getListingById(listingId);

          return {
            success: false,
            error: {
              code: "REVISION_CONFLICT",
              message:
                "تغییر همزمان شناسایی شد. لطفاً تغییرات خود را مجدداً انجام دهید.",
              currentRevision: currentListing?.revision,
              clientRevision: expectedRevision,
            },
          };
        }

        return {
          success: false,
          error: {
            code: updateResult.error || "UPDATE_FAILED",
            message: "خطا در به‌روز‌رسانی آگهی",
          },
        };
      }

      // ── 7. Return success with updated listing ───────────────────────────

      return {
        success: true,
        listing: updateResult.listing,
        imageDiff,
      };
    } catch (err) {
      logger.error("Error in ListingService.updateListing", {
        listingId,
        userId,
        error: err.message,
        stack: err.stack,
      });

      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "خطای داخلی سرور",
        },
      };
    }
  }

  /**
   * Get edit history for a listing with ownership check.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {string} userId - User requesting history (optional ownership check)
   * @param {number} limit - Max entries to return
   * @returns {Promise<{success: boolean, history?: array, error?: object}>}
   */
  async getEditHistory(listingId, userId = null, limit = 50) {
    try {
      const listing = await this.repository.getListingById(listingId);

      if (!listing) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "آگهی یافت نشد",
          },
        };
      }

      // Optional: restrict history to owner
      if (userId && listing.owner.toString() !== userId.toString()) {
        // In production, you might want to hide history from non-owners
        // For now, allow public read
      }

      const history = await this.repository.getEditHistory(listingId, limit);

      return {
        success: true,
        history,
        totalRevisions: listing.revision + 1,
      };
    } catch (err) {
      logger.error("Error in ListingService.getEditHistory", {
        listingId,
        error: err.message,
      });

      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "خطای داخلی سرور",
        },
      };
    }
  }

  /**
   * Get a specific revision/diff.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {number} revision - Revision number
   * @returns {Promise<{success: boolean, diff?: object, error?: object}>}
   */
  async getRevisionDiff(listingId, revision) {
    try {
      const diff = await this.repository.getRevisionDiff(listingId, revision);

      if (!diff) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "نسخه درخواست شده یافت نشد",
          },
        };
      }

      return {
        success: true,
        diff,
      };
    } catch (err) {
      logger.error("Error in ListingService.getRevisionDiff", {
        listingId,
        revision,
        error: err.message,
      });

      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "خطای داخلی سرور",
        },
      };
    }
  }

  /**
   * Sanitize update payload.
   * Removes null/undefined fields and trims strings.
   *
   * @param {object} payload - Raw update payload
   * @returns {object} Sanitized update
   * @private
   */
  _sanitizeUpdate(payload) {
    const sanitized = {};

    // Define allowed fields
    const allowedFields = [
      "title",
      "description",
      "tags",
      "images",
      "location",
      "revision",
      "reason",
      "details",
    ];

    for (const field of allowedFields) {
      if (
        field in payload &&
        payload[field] !== null &&
        payload[field] !== undefined
      ) {
        let value = payload[field];

        // Trim strings
        if (typeof value === "string") {
          value = value.trim();
          if (!value) continue; // Skip empty strings
        }

        // Sanitize images array
        if (field === "images" && Array.isArray(value)) {
          value = sanitizeImages(value);
        }

        sanitized[field] = value;
      }
    }

    return sanitized;
  }

  /**
   * Build the MongoDB update document from sanitized updates.
   * Only includes fields that should be updated.
   *
   * @param {object} sanitized - Sanitized update object
   * @returns {object} Update document ready for MongoDB
   * @private
   */
  _buildUpdateDocument(sanitized) {
    const updateDoc = {};

    // Direct field mappings
    const directFields = ["title", "description", "tags", "images", "location"];

    for (const field of directFields) {
      if (field in sanitized) {
        updateDoc[field] = sanitized[field];
      }
    }

    // Type-specific details are spread at document root
    if (sanitized.details && typeof sanitized.details === "object") {
      Object.assign(updateDoc, sanitized.details);
    }

    return updateDoc;
  }
}

module.exports = ListingService;
