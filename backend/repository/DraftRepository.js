const Draft = require("../models/Draft");

/**
 * DraftRepository - Data access layer for draft persistence
 * Handles CRUD, optimistic concurrency control, and draft lifecycle management
 */

class DraftRepository {
  /**
   * Create a new draft
   * @param {object} params - { owner, type, data }
   * @returns {Promise<object>} Created draft document
   */
  async createDraft({ owner, type, data }) {
    const draft = new Draft({
      owner,
      type,
      _version: 0,
      draftVersion: 0,
      ...data,
    });

    await draft.save();
    return draft;
  }

  /**
   * Get draft by ID
   * @param {string} draftId - Draft MongoDB ID
   * @returns {Promise<object|null>} Draft document or null
   */
  async getDraftById(draftId) {
    return Draft.findById(draftId).lean();
  }

  /**
   * Get draft by ID (non-lean for updates)
   * @param {string} draftId - Draft MongoDB ID
   * @returns {Promise<object|null>} Draft document or null
   */
  async getDraftByIdForUpdate(draftId) {
    return Draft.findById(draftId);
  }

  /**
   * Get all active drafts for a user, paginated
   * @param {string} ownerId - Owner's user ID
   * @param {number} limit - Pagination limit
   * @param {number} skip - Pagination offset
   * @returns {Promise<array>} Array of draft documents
   */
  async getDraftsByOwner(ownerId, limit = 10, skip = 0) {
    return Draft.find({
      owner: ownerId,
      status: "active",
    })
      .sort({ lastAutosavedAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
  }

  /**
   * Get draft count for a user
   * @param {string} ownerId - Owner's user ID
   * @returns {Promise<number>} Draft count
   */
  async getDraftCountByOwner(ownerId) {
    return Draft.countDocuments({
      owner: ownerId,
      status: "active",
    });
  }

  /**
   * Get latest active draft for a user filtered by type
   * @param {string} ownerId - Owner's user ID
   * @param {string} type - Draft type (post, tour, training, academy)
   * @returns {Promise<object|null>} Latest draft or null
   */
  async getLatestDraftByOwnerAndType(ownerId, type) {
    return Draft.findOne({
      owner: ownerId,
      type,
      status: "active",
    })
      .sort({ lastAutosavedAt: -1 })
      .lean();
  }

  /**
   * Update draft with optimistic concurrency control
   * Ensures incoming _version matches database version before updating
   *
   * @param {string} draftId - Draft ID
   * @param {object} changes - Fields to update (partial)
   * @param {number} expectedVersion - Client's expected version (optimistic lock)
   * @param {boolean} incrementVersion - Whether to increment _version and draftVersion
   * @returns {Promise<object>} Result: { success, draft, versionConflict, currentVersion }
   */
  async updateDraftPartial(
    draftId,
    changes,
    expectedVersion,
    incrementVersion = true,
  ) {
    const draft = await this.getDraftByIdForUpdate(draftId);

    if (!draft) {
      return {
        success: false,
        draft: null,
        versionConflict: false,
        error: "DRAFT_NOT_FOUND",
      };
    }

    // Optimistic lock check
    if (draft._version !== expectedVersion) {
      return {
        success: false,
        draft: draft.toObject(),
        versionConflict: true,
        currentVersion: draft._version,
        expectedVersion,
        error: "VERSION_CONFLICT",
      };
    }

    // Apply changes
    Object.keys(changes).forEach((key) => {
      draft[key] = changes[key];
    });

    // Increment versions only if requested (and changes detected by service layer)
    if (incrementVersion) {
      draft._version += 1;
      draft.draftVersion += 1;
    }

    // Always update timestamp
    draft.lastAutosavedAt = new Date();

    await draft.save();

    return {
      success: true,
      draft: draft.toObject(),
      versionConflict: false,
      currentVersion: draft._version,
    };
  }

  /**
   * Update draft fields without version check (admin/internal use only)
   * @param {string} draftId - Draft ID
   * @param {object} changes - Fields to update
   * @returns {Promise<object|null>} Updated draft
   */
  async updateDraftUnsafe(draftId, changes) {
    return Draft.findByIdAndUpdate(
      draftId,
      {
        ...changes,
        lastAutosavedAt: new Date(),
      },
      { new: true },
    ).lean();
  }

  /**
   * Soft delete (mark as discarded)
   * @param {string} draftId - Draft ID
   * @returns {Promise<object|null>} Updated draft
   */
  async softDeleteDraft(draftId) {
    return Draft.findByIdAndUpdate(
      draftId,
      {
        status: "discarded",
        lastAutosavedAt: new Date(),
      },
      { new: true },
    ).lean();
  }

  /**
   * Mark draft as published
   * @param {string} draftId - Draft ID
   * @param {string} listingId - Linked listing ID
   * @returns {Promise<object|null>} Updated draft
   */
  async publishDraft(draftId, listingId) {
    return Draft.findByIdAndUpdate(
      draftId,
      {
        status: "published",
        listingId,
        lastAutosavedAt: new Date(),
      },
      { new: true },
    ).lean();
  }

  /**
   * Get all drafts nearing expiry (older than threshold)
   * Useful for admin reporting or cleanup tasks
   * @param {number} daysThreshold - Days since last autosave
   * @param {number} limit - Limit query results
   * @returns {Promise<array>} Drafts matching criteria
   */
  async getDraftsNearingExpiry(daysThreshold = 80, limit = 100) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

    return Draft.find({
      status: "active",
      lastAutosavedAt: { $lt: cutoffDate },
    })
      .sort({ lastAutosavedAt: 1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get all active drafts by owner and type
   * @param {string} ownerId - Owner ID
   * @param {string} type - Draft type
   * @returns {Promise<array>} All matching drafts
   */
  async getDraftsByOwnerAndType(ownerId, type) {
    return Draft.find({
      owner: ownerId,
      type,
      status: "active",
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Check if owner has drafts of a specific type
   * @param {string} ownerId - Owner ID
   * @param {string} type - Draft type
   * @returns {Promise<boolean>}
   */
  async ownerHasDraftOfType(ownerId, type) {
    const count = await Draft.countDocuments({
      owner: ownerId,
      type,
      status: "active",
    });
    return count > 0;
  }

  /**
   * Get draft and verify ownership
   * @param {string} draftId - Draft ID
   * @param {string} ownerId - Expected owner ID
   * @returns {Promise<object|null>} Draft if owner matches, null otherwise
   */
  async getDraftIfOwner(draftId, ownerId) {
    return Draft.findOne({
      _id: draftId,
      owner: ownerId,
    }).lean();
  }

  /**
   * Count total drafts by owner and status
   * @param {string} ownerId - Owner ID
   * @param {string} status - Draft status
   * @returns {Promise<number>}
   */
  async countDraftsByStatus(ownerId, status) {
    return Draft.countDocuments({
      owner: ownerId,
      status,
    });
  }

  /**
   * Get drafts grouped by type
   * @param {string} ownerId - Owner ID
   * @returns {Promise<object>} { post: count, tour: count, training: count, academy: count }
   */
  async getDraftDistributionByType(ownerId) {
    const result = await Draft.aggregate([
      {
        $match: {
          owner: mongoose.Types.ObjectId(ownerId),
          status: "active",
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const distribution = { post: 0, tour: 0, training: 0, academy: 0 };
    result.forEach((r) => {
      distribution[r._id] = r.count;
    });
    return distribution;
  }
}

module.exports = new DraftRepository();
