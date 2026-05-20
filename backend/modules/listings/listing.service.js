/**
 * listing.service.js — Business logic layer for listings module.
 *
 * Orchestrates all listing operations:
 * - Create, read, update, delete listings
 * - Validation and authorization
 * - Image diffing and processing
 * - Revision conflict detection (optimistic concurrency)
 * - Geospatial queries
 * - Cache invalidation
 * - Edit history tracking
 *
 * All methods return standardized success/error responses.
 */

const ListingRepository = require("./listing.repository");
const {
  diffImages,
  sanitizeImages,
  validateImagePaths,
} = require("../utils/imageDiffing");
const {
  validateCreateListing,
  validateCreateDetails,
  validateUpdateListing,
  validateUpdateDetails,
} = require("./listing.validation");
const CacheManager = require("../utils/cacheManager");
const logger = require("../utils/logger");
const listingGeoService = require("./listing.geo");

class ListingService {
  constructor() {
    this.repository = new ListingRepository();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create a new listing.
   * Validates input, checks permissions, stores in database.
   *
   * @param {string} userId - Owner's user ID
   * @param {object} payload - { type, title, description, tags?, images?, location?, status?, details? }
   * @param {string} modelType - 'Listing' | 'Craft' (default: 'Listing')
   * @returns {Promise<{success: boolean, listing?: object, error?: object}>}
   */
  async createListing(userId, payload, modelType = "Listing") {
    try {
      // Validate base fields
      const baseValidation = validateCreateListing(payload);
      if (!baseValidation.ok) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: baseValidation.error.message,
            issues: baseValidation.error.issues,
          },
        };
      }

      const { type, details, ...baseData } = baseValidation.data;

      // Validate type-specific details
      const detailsValidation = validateCreateDetails(type, details);
      if (!detailsValidation.ok) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: detailsValidation.error.message,
            issues: detailsValidation.error.issues,
          },
        };
      }

      // Validate images if provided
      if (baseData.images && baseData.images.length > 0) {
        const imageValidation = validateImagePaths(baseData.images);
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

      // Build listing document
      const listingDocument = {
        ...baseData,
        type,
        owner: userId,
        ...detailsValidation.data,
      };

      // Create in database
      const created = await this.repository.createListing(
        listingDocument,
        modelType,
      );

      if (!created) {
        return {
          success: false,
          error: {
            code: "CREATE_FAILED",
            message: "خطا در ایجاد آگهی",
          },
        };
      }

      logger.info("Listing created", {
        listingId: created._id,
        userId,
        type,
      });

      return {
        success: true,
        listing: created,
      };
    } catch (err) {
      logger.error("Error in ListingService.createListing", {
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

  // ──────────────────────────────────────────────────────────────────────────
  // READ OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get a single listing by ID.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<{success: boolean, listing?: object, error?: object}>}
   */
  async getListingById(listingId, modelType = "Listing") {
    try {
      const listing = await this.repository.getListingById(
        listingId,
        modelType,
      );

      if (!listing) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "آگهی یافت نشد",
          },
        };
      }

      return {
        success: true,
        listing,
      };
    } catch (err) {
      logger.error("Error in ListingService.getListingById", {
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
   * Get listing for editing (lightweight DTO with revision).
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {string} userId - User requesting (ownership check)
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<{success: boolean, listing?: object, error?: object}>}
   */
  async getListingForEditing(listingId, userId, modelType = "Listing") {
    try {
      const listing = await this.repository.getListingIfOwned(
        listingId,
        userId,
        modelType,
      );

      if (!listing) {
        return {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "مجاز نیستید برای دسترسی به این آگهی",
          },
        };
      }

      return {
        success: true,
        listing,
      };
    } catch (err) {
      logger.error("Error in ListingService.getListingForEditing", {
        listingId,
        userId,
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
   * Get edit history for a listing.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {number} limit - Max entries (default: 50)
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<{success: boolean, history?: array, totalRevisions?: number, error?: object}>}
   */
  async getEditHistory(listingId, limit = 50, modelType = "Listing") {
    try {
      const listing = await this.repository.getListingById(
        listingId,
        modelType,
      );

      if (!listing) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "آگهی یافت نشد",
          },
        };
      }

      const history = await this.repository.getEditHistory(
        listingId,
        limit,
        modelType,
      );

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
   * Get a specific revision diff.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {number} revision - Revision number
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<{success: boolean, diff?: object, error?: object}>}
   */
  async getRevisionDiff(listingId, revision, modelType = "Listing") {
    try {
      const diff = await this.repository.getRevisionDiff(
        listingId,
        revision,
        modelType,
      );

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

  // ──────────────────────────────────────────────────────────────────────────
  // UPDATE OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Update a listing with full validation and revision control.
   * Implements optimistic concurrency control and image diffing.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {string} userId - User making the edit (ownership check)
   * @param {object} payload - { title?, description?, tags?, images?, location?, revision, details?, reason? }
   * @param {string} listingType - Type (post, tour, training, academy) for validation
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<{success: boolean, listing?: object, imageDiff?: object, error?: object}>}
   */
  async updateListing(
    listingId,
    userId,
    payload,
    listingType,
    modelType = "Listing",
  ) {
    try {
      // ── 1. Verify ownership ──────────────────────────────────────────────

      const existingListing = await this.repository.getListingIfOwned(
        listingId,
        userId,
        modelType,
      );

      if (!existingListing) {
        return {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "مجاز نیستید برای ویرایش این آگهی",
          },
        };
      }

      // ── 2. Validate base update fields ───────────────────────────────────

      const baseValidation = validateUpdateListing(payload);
      if (!baseValidation.ok) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: baseValidation.error.message,
            issues: baseValidation.error.issues,
          },
        };
      }

      const sanitizedUpdate = baseValidation.data;

      // Validate type-specific details if provided
      if (sanitizedUpdate.details) {
        const detailsValidation = validateUpdateDetails(
          listingType,
          sanitizedUpdate.details,
        );
        if (!detailsValidation.ok) {
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: detailsValidation.error.message,
              issues: detailsValidation.error.issues,
            },
          };
        }
        // Merge validated details
        Object.assign(sanitizedUpdate, detailsValidation.data);
        delete sanitizedUpdate.details;
      }

      // ── 3. Check revision (optimistic lock) ──────────────────────────────

      const expectedRevision =
        sanitizedUpdate.revision ?? existingListing.revision;

      if (existingListing.revision !== expectedRevision) {
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

      // ── 4. Validate images ──────────────────────────────────────────────

      let imageDiff = null;

      if (sanitizedUpdate.images !== undefined) {
        // Sanitize and validate image paths
        const sanitized = sanitizeImages(sanitizedUpdate.images);
        const imageValidation = validateImagePaths(sanitized);

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

        // Compute image delta
        imageDiff = diffImages(existingListing.images || [], sanitized);

        if (imageDiff.hasChanges) {
          logger.info("Image changes detected", {
            listingId,
            userId,
            added: imageDiff.added.length,
            removed: imageDiff.removed.length,
            reordered: imageDiff.reordered,
          });
        }

        sanitizedUpdate.images = sanitized;
      }

      // ── 5. Build the update document ─────────────────────────────────────

      const updateDoc = this._buildUpdateDocument(sanitizedUpdate);

      if (Object.keys(updateDoc).length === 0) {
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
      delete sanitizedUpdate.reason; // Don't include reason in update doc

      const updateResult = await this.repository.updateWithOptimisticLock(
        listingId,
        existingListing.revision,
        updateDoc,
        userId,
        reason,
        modelType,
      );

      if (!updateResult.success) {
        if (updateResult.revisionConflict) {
          // Another edit occurred concurrently
          const currentListing = await this.repository.getListingById(
            listingId,
            modelType,
          );

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

      // ── 7. Invalidate geospatial cache ───────────────────────────────────

      if (updateDoc.location && existingListing.location?.coordinates) {
        const [lng, lat] = existingListing.location.coordinates;
        await CacheManager.invalidateRegion(lat, lng, 10).catch(() => {});
      }

      if (updateDoc.location?.coordinates) {
        const [lng, lat] = updateDoc.location.coordinates;
        await CacheManager.invalidateRegion(lat, lng, 10).catch(() => {});
      }

      logger.info("Listing updated", {
        listingId,
        userId,
        revision: updateResult.listing.revision,
      });

      return {
        success: true,
        listing: updateResult.listing,
        imageDiff: imageDiff && imageDiff.hasChanges ? imageDiff : undefined,
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

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Delete a listing.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {string} userId - User requesting delete (ownership check)
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<{success: boolean, error?: object}>}
   */
  async deleteListing(listingId, userId, modelType = "Listing") {
    try {
      // Verify ownership
      const listing = await this.repository.getListingIfOwned(
        listingId,
        userId,
        modelType,
      );

      if (!listing) {
        return {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "مجاز نیستید برای حذف این آگهی",
          },
        };
      }

      // Delete
      const deleted = await this.repository.deleteListing(listingId, modelType);

      if (!deleted) {
        return {
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "خطا در حذف آگهی",
          },
        };
      }

      logger.info("Listing deleted", { listingId, userId });

      return { success: true };
    } catch (err) {
      logger.error("Error in ListingService.deleteListing", {
        listingId,
        userId,
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

  // ──────────────────────────────────────────────────────────────────────────
  // GEOSPATIAL OPERATIONS (delegated)
  // ──────────────────────────────────────────────────────────────────────────

  async findNearby(lat, lng, radiusKm, filters, options) {
    return listingGeoService.findNearby(lat, lng, radiusKm, filters, options);
  }

  async generateHeatmap(lat, lng, radiusKm, filters, options) {
    return listingGeoService.generateHeatmap(
      lat,
      lng,
      radiusKm,
      filters,
      options,
    );
  }

  async findWithinBoundary(minLat, maxLat, minLng, maxLng, filters, options) {
    return listingGeoService.findWithinBoundary(
      minLat,
      maxLat,
      minLng,
      maxLng,
      filters,
      options,
    );
  }

  async getStatsNearby(lat, lng, radiusKm, filters) {
    return listingGeoService.getStatsNearby(lat, lng, radiusKm, filters);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HELPER METHODS (Private)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build MongoDB update document from validated updates.
   * Only includes fields that should actually be updated.
   *
   * @param {object} validated - Validated update object
   * @returns {object} Update document
   * @private
   */
  _buildUpdateDocument(validated) {
    const updateDoc = {};

    // Direct field mappings
    const directFields = ["title", "description", "tags", "images", "location"];

    for (const field of directFields) {
      if (field in validated) {
        updateDoc[field] = validated[field];
      }
    }

    // Type-specific fields (details are merged at root)
    for (const key of Object.keys(validated)) {
      if (
        !directFields.includes(key) &&
        !["revision", "reason"].includes(key)
      ) {
        updateDoc[key] = validated[key];
      }
    }

    return updateDoc;
  }
}

module.exports = ListingService;
