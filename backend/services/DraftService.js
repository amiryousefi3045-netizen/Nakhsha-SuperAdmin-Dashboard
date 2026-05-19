const DraftRepository = require("../repository/DraftRepository");
const {
  validateDraftForPublish,
  detectChanges,
} = require("../utils/draftValidation");
const Listing = require("../models/Listing");

/**
 * DraftService - Business logic layer for draft persistence and autosave
 * Handles:
 * - Draft initialization
 * - Autosave with change detection
 * - Promotion to listing
 * - Conflict resolution
 * - Error handling
 */

class DraftService {
  /**
   * Initialize a new draft
   * @param {string} ownerId - Owner user ID
   * @param {string} type - Draft type (post, tour, training, academy)
   * @param {object} initialData - Optional initial data (step 1)
   * @returns {Promise<object>} Created draft
   */
  async initializeDraft(ownerId, type, initialData = {}) {
    const draftData = {
      type,
      currentStep: initialData.currentStep || 1,
      isCompleted: false,
      _version: 0,
      draftVersion: 0,
      lastAutosavedAt: new Date(),
      ...initialData,
    };

    const draft = await DraftRepository.createDraft({
      owner: ownerId,
      type,
      data: draftData,
    });

    return this._formatDraftResponse(draft);
  }

  /**
   * Autosave draft with change detection and optimistic locking
   * Only increments version if actual changes detected
   *
   * @param {string} draftId - Draft ID
   * @param {string} ownerId - Expected owner (for auth check)
   * @param {object} autosavePayload - { _version, currentStep, data, changeLog }
   * @returns {Promise<object>} { success, draft, versionConflict, error? }
   */
  async autosaveDraft(draftId, ownerId, autosavePayload) {
    // Verify ownership
    const draft = await DraftRepository.getDraftById(draftId);

    if (!draft) {
      return {
        success: false,
        error: "DRAFT_NOT_FOUND",
        message: "Draft not found",
      };
    }

    if (draft.owner.toString() !== ownerId.toString()) {
      return {
        success: false,
        error: "UNAUTHORIZED",
        message: "You do not own this draft",
      };
    }

    // Check draft status (must be active)
    if (draft.status !== "active") {
      return {
        success: false,
        error: "DRAFT_NOT_ACTIVE",
        message: `Cannot autosave draft with status: ${draft.status}`,
      };
    }

    // Detect changes
    const { changedFields, hasChanges } = detectChanges(
      draft,
      autosavePayload.data || {},
    );

    // Prepare update object
    const updateData = {
      ...autosavePayload.data,
      currentStep: autosavePayload.currentStep || draft.currentStep,
      lastChangedFields: changedFields,
    };

    // Increment version only if changes detected
    const shouldIncrementVersion = hasChanges;

    // Update with optimistic lock
    const updateResult = await DraftRepository.updateDraftPartial(
      draftId,
      updateData,
      autosavePayload._version,
      shouldIncrementVersion,
    );

    if (!updateResult.success) {
      if (updateResult.versionConflict) {
        return {
          success: false,
          error: "VERSION_CONFLICT",
          message: "Draft was updated elsewhere. Please refresh.",
          currentVersion: updateResult.currentVersion,
          expectedVersion: updateResult.expectedVersion,
          draft: updateResult.draft,
        };
      }
      return {
        success: false,
        error: updateResult.error,
        message: "Failed to autosave draft",
      };
    }

    // Fetch updated draft
    const updatedDraft = await DraftRepository.getDraftById(draftId);

    return {
      success: true,
      draft: this._formatDraftResponse(updatedDraft),
      changedFields,
      hasChanges,
      versionConflict: false,
    };
  }

  /**
   * Get latest active draft for a user (by type if specified)
   * @param {string} ownerId - Owner ID
   * @param {string} type - Optional draft type filter
   * @returns {Promise<object|null>} Latest draft or null
   */
  async getLatestDraft(ownerId, type = null) {
    let draft;

    if (type) {
      draft = await DraftRepository.getLatestDraftByOwnerAndType(ownerId, type);
    } else {
      // Get most recent by lastAutosavedAt
      const drafts = await DraftRepository.getDraftsByOwner(ownerId, 1, 0);
      draft = drafts?.[0] || null;
    }

    if (!draft) return null;

    return this._formatDraftResponse(draft);
  }

  /**
   * Get draft by ID with ownership verification
   * @param {string} draftId - Draft ID
   * @param {string} ownerId - Expected owner ID
   * @returns {Promise<object|null>} Draft or null if not found or unauthorized
   */
  async getDraftById(draftId, ownerId) {
    const draft = await DraftRepository.getDraftIfOwner(draftId, ownerId);

    if (!draft) return null;

    return this._formatDraftResponse(draft);
  }

  /**
   * Get all active drafts for a user (paginated)
   * @param {string} ownerId - Owner ID
   * @param {number} limit - Pagination limit
   * @param {number} skip - Pagination offset
   * @returns {Promise<object>} { drafts, total, hasMore }
   */
  async listUserDrafts(ownerId, limit = 10, skip = 0) {
    const [drafts, total] = await Promise.all([
      DraftRepository.getDraftsByOwner(ownerId, limit, skip),
      DraftRepository.getDraftCountByOwner(ownerId),
    ]);

    return {
      drafts: drafts.map((d) => this._formatDraftResponse(d)),
      total,
      hasMore: skip + limit < total,
      limit,
      skip,
    };
  }

  /**
   * Promote draft to published listing
   * Validates all required fields are present before promotion
   *
   * @param {string} draftId - Draft ID
   * @param {string} ownerId - Expected owner
   * @param {object} finalData - Optional final data overrides
   * @returns {Promise<object>} { success, listing, draft, error? }
   */
  async promoteDraftToListing(draftId, ownerId, finalData = {}) {
    const draft = await DraftRepository.getDraftById(draftId);

    if (!draft) {
      return {
        success: false,
        error: "DRAFT_NOT_FOUND",
        message: "Draft not found",
      };
    }

    if (draft.owner.toString() !== ownerId.toString()) {
      return {
        success: false,
        error: "UNAUTHORIZED",
        message: "You do not own this draft",
      };
    }

    if (draft.status !== "active") {
      return {
        success: false,
        error: "DRAFT_NOT_ACTIVE",
        message: `Draft is already ${draft.status}`,
      };
    }

    // Merge final data with draft data
    const listingData = { ...draft, ...finalData };

    // Validate all required fields present
    const validation = validateDraftForPublish(listingData, draft.type);
    if (!validation.valid) {
      return {
        success: false,
        error: "INCOMPLETE_DRAFT",
        message: `Missing required fields: ${validation.missingFields.join(", ")}`,
        missingFields: validation.missingFields,
      };
    }

    try {
      // Create listing from draft data
      const listingPayload = {
        title: listingData.title,
        description: listingData.description,
        type: listingData.type,
        owner: ownerId,
        tags: listingData.tags || [],
        images: listingData.images || [],
        location: listingData.location,
        status: "published",
        // Type-specific fields
        ...(listingData.type === "post" && {
          price: listingData.price,
          forSale: listingData.forSale,
          category: listingData.category,
          attributes: listingData.attributes,
        }),
        ...(listingData.type === "tour" && {
          startDate: listingData.startDate,
          endDate: listingData.endDate,
          duration: listingData.duration,
          durationDays: listingData.durationDays,
          capacity: listingData.capacity,
          itinerary: listingData.itinerary,
        }),
        ...(listingData.type === "training" && {
          schedule: listingData.schedule,
          startDate: listingData.startDate,
          endDate: listingData.endDate,
          duration: listingData.duration,
          capacity: listingData.capacity,
          level: listingData.level,
          instructor: listingData.instructor,
        }),
        ...(listingData.type === "academy" && {
          addressDetails: listingData.addressDetails,
          phone: listingData.phone,
          workingHours: listingData.workingHours,
          website: listingData.website,
        }),
      };

      const listing = await Listing.create(listingPayload);

      // Mark draft as published
      await DraftRepository.publishDraft(draftId, listing._id);

      return {
        success: true,
        listing: listing.toObject(),
        draft: this._formatDraftResponse(draft),
        message: "Draft published successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: "PUBLISH_FAILED",
        message: error.message,
      };
    }
  }

  /**
   * Delete draft (soft delete - mark as discarded)
   * @param {string} draftId - Draft ID
   * @param {string} ownerId - Expected owner
   * @returns {Promise<object>} { success, error? }
   */
  async deleteDraft(draftId, ownerId) {
    const draft = await DraftRepository.getDraftById(draftId);

    if (!draft) {
      return {
        success: false,
        error: "DRAFT_NOT_FOUND",
        message: "Draft not found",
      };
    }

    if (draft.owner.toString() !== ownerId.toString()) {
      return {
        success: false,
        error: "UNAUTHORIZED",
        message: "You do not own this draft",
      };
    }

    await DraftRepository.softDeleteDraft(draftId);

    return {
      success: true,
      message: "Draft deleted successfully",
    };
  }

  /**
   * Resolve conflict when version mismatch occurs
   * Strategy: Take server's latest version (last-write-wins)
   * Alternative: Could implement field-level merge for better UX
   *
   * @param {string} draftId - Draft ID
   * @returns {Promise<object>} Current draft state
   */
  async resolveConflict(draftId) {
    const draft = await DraftRepository.getDraftById(draftId);
    if (!draft) {
      throw new Error("Draft not found");
    }
    return this._formatDraftResponse(draft);
  }

  /**
   * Get draft statistics for a user
   * @param {string} ownerId - Owner ID
   * @returns {Promise<object>} { activeCount, publishedCount, discardedCount, typeDistribution }
   */
  async getDraftStats(ownerId) {
    const [activeCount, publishedCount, discardedCount, typeDistribution] =
      await Promise.all([
        DraftRepository.countDraftsByStatus(ownerId, "active"),
        DraftRepository.countDraftsByStatus(ownerId, "published"),
        DraftRepository.countDraftsByStatus(ownerId, "discarded"),
        DraftRepository.getDraftDistributionByType(ownerId),
      ]);

    return {
      activeCount,
      publishedCount,
      discardedCount,
      typeDistribution,
    };
  }

  /**
   * Private: Format draft response (remove sensitive fields, add metadata)
   * @private
   * @param {object} draft - Draft document
   * @returns {object} Formatted response
   */
  _formatDraftResponse(draft) {
    if (!draft) return null;

    const obj = draft._id ? draft.toObject() : draft;

    return {
      _id: obj._id,
      type: obj.type,
      status: obj.status,
      currentStep: obj.currentStep,
      isCompleted: obj.isCompleted,
      _version: obj._version,
      draftVersion: obj.draftVersion,
      lastAutosavedAt: obj.lastAutosavedAt,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      // Content
      title: obj.title,
      description: obj.description,
      tags: obj.tags,
      images: obj.images,
      location: obj.location,
      // Type-specific (post)
      ...(obj.type === "post" && {
        price: obj.price,
        forSale: obj.forSale,
        category: obj.category,
        attributes: obj.attributes,
      }),
      // Type-specific (tour)
      ...(obj.type === "tour" && {
        startDate: obj.startDate,
        endDate: obj.endDate,
        duration: obj.duration,
        durationDays: obj.durationDays,
        capacity: obj.capacity,
        itinerary: obj.itinerary,
      }),
      // Type-specific (training)
      ...(obj.type === "training" && {
        schedule: obj.schedule,
        startDate: obj.startDate,
        endDate: obj.endDate,
        duration: obj.duration,
        capacity: obj.capacity,
        level: obj.level,
        instructor: obj.instructor,
      }),
      // Type-specific (academy)
      ...(obj.type === "academy" && {
        addressDetails: obj.addressDetails,
        phone: obj.phone,
        workingHours: obj.workingHours,
        website: obj.website,
      }),
    };
  }
}

module.exports = new DraftService();
