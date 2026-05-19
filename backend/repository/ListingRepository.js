/**
 * ListingRepository — Data access layer for listings.
 *
 * Provides methods for:
 * - Fetching listings with ownership validation
 * - Optimized partial updates with revision control
 * - Generating efficient MongoDB update queries
 * - Tracking edit history
 *
 * All operations include proper error handling and validation.
 */

const { Listing } = require("../models/Listing");

class ListingRepository {
  /**
   * Get listing by ID (lean for read-only operations).
   *
   * @param {string} listingId - Listing MongoDB ID
   * @returns {Promise<object|null>} Listing document or null
   */
  async getListingById(listingId) {
    return Listing.findById(listingId).lean();
  }

  /**
   * Get listing by ID (non-lean for updates).
   * Used internally for update operations.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @returns {Promise<object|null>} Listing document or null
   */
  async getListingByIdForUpdate(listingId) {
    return Listing.findById(listingId);
  }

  /**
   * Verify listing ownership.
   * Returns the listing if owned by the user, null otherwise.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {string} userId - Expected owner user ID
   * @returns {Promise<object|null>} Listing if owned by user, null otherwise
   */
  async getListingIfOwned(listingId, userId) {
    return Listing.findOne({
      _id: listingId,
      owner: userId,
    }).lean();
  }

  /**
   * Get listing with revision check for optimistic concurrency control.
   * Ensures the client has the expected revision before allowing updates.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {number} expectedRevision - Client's expected revision
   * @returns {Promise<{listing: object|null, revisionMatch: boolean}>}
   */
  async getListingWithRevisionCheck(listingId, expectedRevision) {
    const listing = await Listing.findById(listingId).lean();

    if (!listing) {
      return { listing: null, revisionMatch: false };
    }

    const revisionMatch = listing.revision === expectedRevision;

    return { listing, revisionMatch };
  }

  /**
   * Perform an optimistic concurrent update with revision control.
   *
   * Updates only if the current revision matches expectedRevision.
   * Atomically increments revision and appends to editHistory.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {number} expectedRevision - Client's expected revision (optimistic lock)
   * @param {object} updateData - Fields to update (partial update)
   * @param {string} editorId - User ID making the edit
   * @param {string} reason - Optional reason for the edit
   * @returns {Promise<{success: boolean, listing: object|null, revisionConflict: boolean, error?: string}>}
   */
  async updateWithOptimisticLock(
    listingId,
    expectedRevision,
    updateData,
    editorId,
    reason = null,
  ) {
    // Build update document with atomic operations
    const newRevision = expectedRevision + 1;

    // Prepare the edit history entry
    const editHistoryEntry = {
      timestamp: new Date(),
      editor: editorId,
      changes: this._buildChangesMap(updateData),
      newRevision,
    };

    if (reason) {
      editHistoryEntry.reason = reason;
    }

    // Construct the update query
    const updateQuery = {
      ...updateData,
      revision: newRevision,
      updatedAt: new Date(),
    };

    try {
      // Perform the update with optimistic lock condition
      const result = await Listing.findOneAndUpdate(
        {
          _id: listingId,
          revision: expectedRevision, // Optimistic lock condition
        },
        {
          $set: updateQuery,
          $push: {
            editHistory: editHistoryEntry,
          },
        },
        {
          new: true, // Return updated document
          lean: true, // Return plain object
        },
      );

      if (!result) {
        // Update failed: either listing not found or revision mismatch
        const listing = await Listing.findById(listingId).lean();
        return {
          success: false,
          listing: null,
          revisionConflict: listing !== null, // True if exists but revision mismatches
          error: listing ? "REVISION_CONFLICT" : "LISTING_NOT_FOUND",
        };
      }

      return {
        success: true,
        listing: result,
        revisionConflict: false,
      };
    } catch (err) {
      return {
        success: false,
        listing: null,
        revisionConflict: false,
        error: err.message,
      };
    }
  }

  /**
   * Perform an update without revision control (admin-only or special cases).
   * Use with caution as this bypasses optimistic locking.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {object} updateData - Fields to update
   * @param {string} editorId - User ID making the edit
   * @param {string} reason - Optional reason for the edit
   * @returns {Promise<{success: boolean, listing: object|null, error?: string}>}
   */
  async updateWithoutRevisionControl(
    listingId,
    updateData,
    editorId,
    reason = null,
  ) {
    try {
      const listing = await Listing.findById(listingId).lean();

      if (!listing) {
        return {
          success: false,
          listing: null,
          error: "LISTING_NOT_FOUND",
        };
      }

      const newRevision = (listing.revision || 0) + 1;

      const editHistoryEntry = {
        timestamp: new Date(),
        editor: editorId,
        changes: this._buildChangesMap(updateData),
        newRevision,
      };

      if (reason) {
        editHistoryEntry.reason = reason;
      }

      const updateQuery = {
        ...updateData,
        revision: newRevision,
        updatedAt: new Date(),
      };

      const result = await Listing.findByIdAndUpdate(listingId, {
        $set: updateQuery,
        $push: {
          editHistory: editHistoryEntry,
        },
      });

      if (!result) {
        return {
          success: false,
          listing: null,
          error: "LISTING_NOT_FOUND",
        };
      }

      const updated = await Listing.findById(listingId).lean();

      return {
        success: true,
        listing: updated,
      };
    } catch (err) {
      return {
        success: false,
        listing: null,
        error: err.message,
      };
    }
  }

  /**
   * Build a changes map from updateData.
   * Maps field names to their old values (before update).
   * This is called before the update is applied.
   *
   * In a real scenario, you'd fetch the old values first. For now,
   * we'll structure it as { fieldName: newValue }.
   * A more sophisticated version would track old → new.
   *
   * @param {object} updateData - Fields being updated
   * @returns {object} Map of changes
   */
  _buildChangesMap(updateData) {
    const changes = {};

    for (const [key, value] of Object.entries(updateData)) {
      // Store what was changed
      // In production, track old → new for full audit trail
      changes[key] = value;
    }

    return changes;
  }

  /**
   * Get edit history for a listing.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {number} limit - Max number of entries to return (default: 50)
   * @returns {Promise<array>} Array of edit history entries
   */
  async getEditHistory(listingId, limit = 50) {
    const listing = await Listing.findById(listingId, {
      editHistory: { $slice: -limit },
    }).lean();

    if (!listing) {
      return [];
    }

    return (listing.editHistory || []).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  }

  /**
   * Get diff between two revisions.
   * Shows what changed between revision N and revision N+1.
   *
   * @param {string} listingId - Listing MongoDB ID
   * @param {number} revision - The revision to look up in edit history
   * @returns {Promise<object|null>} Edit history entry or null
   */
  async getRevisionDiff(listingId, revision) {
    const listing = await Listing.findById(listingId, {
      editHistory: 1,
    }).lean();

    if (!listing) {
      return null;
    }

    const entry = (listing.editHistory || []).find(
      (e) => e.newRevision === revision,
    );

    return entry || null;
  }

  /**
   * Bulk get listings by IDs.
   * Useful for fetching multiple listings in one query.
   *
   * @param {string[]} listingIds - Array of listing MongoDB IDs
   * @returns {Promise<array>} Array of listing documents
   */
  async getListingsByIds(listingIds) {
    return Listing.find({ _id: { $in: listingIds } }).lean();
  }

  /**
   * Get user's listings with pagination.
   *
   * @param {string} userId - Owner's user ID
   * @param {number} limit - Results per page
   * @param {number} skip - Pagination offset
   * @returns {Promise<array>} Array of listing documents
   */
  async getListingsByOwner(userId, limit = 20, skip = 0) {
    return Listing.find({ owner: userId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
  }

  /**
   * Count user's listings.
   *
   * @param {string} userId - Owner's user ID
   * @returns {Promise<number>} Total count
   */
  async countListingsByOwner(userId) {
    return Listing.countDocuments({ owner: userId });
  }
}

module.exports = ListingRepository;
