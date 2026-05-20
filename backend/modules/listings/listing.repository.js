/**
 * listing.repository.js — Data access layer for listings module.
 *
 * Provides abstracted database operations for:
 * - Listing model (primary, with discriminator types)
 * - Craft model (legacy support, gradual deprecation)
 * - Ownership validation
 * - Optimized partial updates with revision control
 * - Edit history tracking
 * - Pagination and bulk operations
 *
 * All operations are model-agnostic where possible.
 */

const {
  Listing,
  PostListing,
  TourListing,
  TrainingListing,
  AcademyListing,
} = require("../models/Listing");
const { Craft } = require("../models/Craft");

// Map listing types to discriminator models
const LISTING_TYPE_MODELS = {
  post: PostListing,
  tour: TourListing,
  training: TrainingListing,
  academy: AcademyListing,
};

class ListingRepository {
  /**
   * Get the appropriate model based on type.
   * Supports both Listing discriminators and legacy Craft model.
   *
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {import('mongoose').Model}
   */
  _getModel(modelType = "Listing") {
    if (modelType === "Craft") return Craft;
    return Listing;
  }

  /**
   * Get listing by ID (lean for read-only operations).
   *
   * @param {string} listingId - MongoDB ObjectId string
   * @param {string} modelType - 'Listing' | 'Craft' (default: 'Listing')
   * @returns {Promise<object|null>} Listing document or null
   */
  async getListingById(listingId, modelType = "Listing") {
    const Model = this._getModel(modelType);
    return Model.findById(listingId).lean();
  }

  /**
   * Verify listing ownership.
   * Returns the listing if owned by the user, null otherwise.
   *
   * @param {string} listingId - MongoDB ObjectId string
   * @param {string} userId - Owner's user ID
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<object|null>} Listing if owned by user, null otherwise
   */
  async getListingIfOwned(listingId, userId, modelType = "Listing") {
    const Model = this._getModel(modelType);
    return Model.findOne({
      _id: listingId,
      owner: userId,
    }).lean();
  }

  /**
   * Get listing with revision check for optimistic concurrency control.
   * Ensures the client has the expected revision before allowing updates.
   *
   * @param {string} listingId - MongoDB ObjectId string
   * @param {number} expectedRevision - Client's expected revision
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<{listing: object|null, revisionMatch: boolean}>}
   */
  async getListingWithRevisionCheck(
    listingId,
    expectedRevision,
    modelType = "Listing",
  ) {
    const listing = await this.getListingById(listingId, modelType);

    if (!listing) {
      return { listing: null, revisionMatch: false };
    }

    const revisionMatch = listing.revision === expectedRevision;

    return { listing, revisionMatch };
  }

  /**
   * Perform an optimistic concurrent update with revision control.
   * Updates only if the current revision matches expectedRevision.
   * Atomically increments revision and appends to editHistory.
   *
   * @param {string} listingId - MongoDB ObjectId string
   * @param {number} expectedRevision - Client's expected revision (optimistic lock)
   * @param {object} updateData - Fields to update (partial update)
   * @param {string} editorId - User ID making the edit
   * @param {string} reason - Optional reason for the edit
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<{success: boolean, listing: object|null, revisionConflict: boolean, error?: string}>}
   */
  async updateWithOptimisticLock(
    listingId,
    expectedRevision,
    updateData,
    editorId,
    reason = null,
    modelType = "Listing",
  ) {
    const Model = this._getModel(modelType);
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
      const result = await Model.findOneAndUpdate(
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
        const listing = await Model.findById(listingId).lean();
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
   * @param {string} listingId - MongoDB ObjectId string
   * @param {object} updateData - Fields to update
   * @param {string} editorId - User ID making the edit
   * @param {string} reason - Optional reason for the edit
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<{success: boolean, listing: object|null, error?: string}>}
   */
  async updateWithoutRevisionControl(
    listingId,
    updateData,
    editorId,
    reason = null,
    modelType = "Listing",
  ) {
    const Model = this._getModel(modelType);

    try {
      const listing = await Model.findById(listingId).lean();

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

      await Model.findByIdAndUpdate(listingId, {
        $set: updateQuery,
        $push: {
          editHistory: editHistoryEntry,
        },
      });

      const updated = await Model.findById(listingId).lean();

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
   * Create a new listing.
   * Automatically sets initial revision to 0 and empty editHistory.
   *
   * @param {object} listingData - Document to create
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<object|null>} Created listing or null on error
   */
  async createListing(listingData, modelType = "Listing") {
    const Model = this._getModel(modelType);

    const document = new Model({
      ...listingData,
      revision: 0,
      editHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      const saved = await document.save();
      return saved.toObject ? saved.toObject() : saved;
    } catch (err) {
      return null;
    }
  }

  /**
   * Delete a listing.
   *
   * @param {string} listingId - MongoDB ObjectId string
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<boolean>} True if deleted, false otherwise
   */
  async deleteListing(listingId, modelType = "Listing") {
    const Model = this._getModel(modelType);
    const result = await Model.findByIdAndDelete(listingId);
    return !!result;
  }

  /**
   * Build a changes map from updateData.
   * Maps field names to their new values.
   * A more sophisticated version would track old → new values.
   *
   * @param {object} updateData - Fields being updated
   * @returns {object} Map of changes
   */
  _buildChangesMap(updateData) {
    const changes = {};

    for (const [key, value] of Object.entries(updateData)) {
      changes[key] = value;
    }

    return changes;
  }

  /**
   * Get edit history for a listing.
   * Returns entries in reverse chronological order (newest first).
   *
   * @param {string} listingId - MongoDB ObjectId string
   * @param {number} limit - Max number of entries to return (default: 50)
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<array>} Array of edit history entries
   */
  async getEditHistory(listingId, limit = 50, modelType = "Listing") {
    const Model = this._getModel(modelType);
    const listing = await Model.findById(listingId, {
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
   * Get diff for a specific revision.
   * Shows what changed in that edit.
   *
   * @param {string} listingId - MongoDB ObjectId string
   * @param {number} revision - The revision to look up in edit history
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<object|null>} Edit history entry or null
   */
  async getRevisionDiff(listingId, revision, modelType = "Listing") {
    const Model = this._getModel(modelType);
    const listing = await Model.findById(listingId, {
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
   *
   * @param {string[]} listingIds - Array of MongoDB ObjectId strings
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<array>} Array of listing documents
   */
  async getListingsByIds(listingIds, modelType = "Listing") {
    const Model = this._getModel(modelType);
    return Model.find({ _id: { $in: listingIds } }).lean();
  }

  /**
   * Get user's listings with pagination.
   *
   * @param {string} userId - Owner's user ID
   * @param {number} limit - Results per page (default: 20)
   * @param {number} skip - Pagination offset (default: 0)
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<array>} Array of listing documents
   */
  async getListingsByOwner(
    userId,
    limit = 20,
    skip = 0,
    modelType = "Listing",
  ) {
    const Model = this._getModel(modelType);
    return Model.find({ owner: userId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
  }

  /**
   * Count user's listings.
   *
   * @param {string} userId - Owner's user ID
   * @param {string} modelType - 'Listing' | 'Craft'
   * @returns {Promise<number>} Total count
   */
  async countListingsByOwner(userId, modelType = "Listing") {
    const Model = this._getModel(modelType);
    return Model.countDocuments({ owner: userId });
  }
}

module.exports = ListingRepository;
