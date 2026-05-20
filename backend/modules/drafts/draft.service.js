/**
 * modules/drafts/draft.service.js — Business logic for draft management.
 *
 * Handles:
 * - Draft creation and retrieval
 * - Autosave with optimistic locking
 * - Draft publication (convert to listing)
 * - Draft cleanup
 */

const { Draft } = require("../../models/Draft");
const logger = require("../../utils/logger");

class DraftService {
  /**
   * Create a new draft.
   *
   * @param {string} userId - Draft owner
   * @param {object} payload - Draft data
   * @returns {object} { success, draft?, error? }
   */
  async createDraft(userId, payload) {
    try {
      const draft = new Draft({
        userId,
        type: payload.type,
        currentStep: payload.currentStep || 1,
        isCompleted: payload.isCompleted || false,
        data: payload.data || {},
        version: 0,
        lastSavedAt: new Date(),
      });

      await draft.save();
      return { success: true, draft };
    } catch (err) {
      logger.error("Error in DraftService.createDraft", {
        userId,
        error: err.message,
      });

      return {
        success: false,
        error: {
          code: "DRAFT_CREATE_FAILED",
          message: "خطا در ایجاد پیش‌نویس",
        },
      };
    }
  }

  /**
   * Get latest draft for user by type.
   *
   * @param {string} userId - Draft owner
   * @param {string} type - Listing type filter
   * @returns {object} { success, draft?, error? }
   */
  async getLatestDraft(userId, type) {
    try {
      const query = { userId };
      if (type) query.type = type;

      const draft = await Draft.findOne(query).sort({ createdAt: -1 }).lean();

      if (!draft) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "پیش‌نویسی یافت نشد",
          },
        };
      }

      return { success: true, draft };
    } catch (err) {
      logger.error("Error in DraftService.getLatestDraft", {
        userId,
        error: err.message,
      });

      return {
        success: false,
        error: {
          code: "DRAFT_FETCH_FAILED",
          message: "خطا در دریافت پیش‌نویس",
        },
      };
    }
  }

  /**
   * Update draft with optimistic locking.
   *
   * @param {string} draftId - Draft ID
   * @param {string} userId - Must match draft owner
   * @param {number} currentVersion - Expected version
   * @param {object} updateData - Data to update
   * @returns {object} { success, draft?, error? }
   */
  async updateDraftOptimistic(draftId, userId, currentVersion, updateData) {
    try {
      const draft = await Draft.findOneAndUpdate(
        {
          _id: draftId,
          userId,
          version: currentVersion,
        },
        {
          $set: {
            ...updateData,
            lastSavedAt: new Date(),
          },
          $inc: { version: 1 },
        },
        { new: true, lean: true },
      );

      if (!draft) {
        return {
          success: false,
          error: {
            code: "VERSION_CONFLICT",
            message: "پیش‌نویس توسط دستگاه دیگری تغییر یافته است",
          },
        };
      }

      return { success: true, draft };
    } catch (err) {
      logger.error("Error in DraftService.updateDraftOptimistic", {
        draftId,
        userId,
        error: err.message,
      });

      return {
        success: false,
        error: {
          code: "DRAFT_UPDATE_FAILED",
          message: "خطا در بروزرسانی پیش‌نویس",
        },
      };
    }
  }

  /**
   * Delete draft.
   *
   * @param {string} draftId - Draft ID
   * @param {string} userId - Must match draft owner
   * @returns {object} { success, error? }
   */
  async deleteDraft(draftId, userId) {
    try {
      const result = await Draft.deleteOne({
        _id: draftId,
        userId,
      });

      if (result.deletedCount === 0) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "پیش‌نویسی یافت نشد",
          },
        };
      }

      return { success: true };
    } catch (err) {
      logger.error("Error in DraftService.deleteDraft", {
        draftId,
        userId,
        error: err.message,
      });

      return {
        success: false,
        error: {
          code: "DRAFT_DELETE_FAILED",
          message: "خطا در حذف پیش‌نویس",
        },
      };
    }
  }
}

module.exports = DraftService;
