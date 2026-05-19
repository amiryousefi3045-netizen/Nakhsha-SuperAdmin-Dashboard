/**
 * listingResponseDTO.js — DTO mappers for optimized listing API responses.
 *
 * Converts Mongoose documents to optimized frontend response objects.
 * Includes:
 * - Full listing responses
 * - Edit-form responses (lightweight for populating forms)
 * - Image delta responses
 * - Edit history formatting
 */

const { toAbsoluteUrl } = require("./urls");

/**
 * Map a Mongoose Listing document to a complete API response.
 * Converts relative image paths to absolute URLs for the frontend.
 *
 * @param {object} doc - Mongoose Listing document
 * @param {object} req - Express request (for base URL)
 * @returns {object} Formatted listing DTO
 */
function mapListingToResponse(doc, req) {
  const base = {
    id: doc._id,
    type: doc.type,
    title: doc.title,
    description: doc.description,
    tags: doc.tags || [],
    images: doc.images || [],
    imagesAbs: (doc.images || []).map((p) => toAbsoluteUrl(p, req)),
    location: doc.location || null,
    status: doc.status,
    owner: doc.owner,
    revision: doc.revision,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  // Append type-specific fields
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
        endDate: doc.endDate,
        duration: doc.duration,
        durationDays: doc.durationDays,
        capacity: doc.capacity,
        itinerary: doc.itinerary,
      };
    case "training":
      return {
        ...base,
        schedule: doc.schedule,
        startDate: doc.startDate,
        endDate: doc.endDate,
        duration: doc.duration,
        capacity: doc.capacity,
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

/**
 * Map listing to an optimized "edit form" response.
 * Lighter than full response — only includes data needed to populate edit form.
 *
 * @param {object} doc - Mongoose Listing document
 * @param {object} req - Express request (for base URL)
 * @returns {object} Edit form DTO with essential fields
 */
function mapListingToEditFormResponse(doc, req) {
  const base = {
    id: doc._id,
    type: doc.type,
    title: doc.title,
    description: doc.description,
    tags: doc.tags || [],
    images: doc.images || [],
    imagesAbs: (doc.images || []).map((p) => toAbsoluteUrl(p, req)),
    location: doc.location || null,
    revision: doc.revision, // Important: client must send this back for optimistic lock
  };

  // Include only type-specific fields needed for form
  switch (doc.type) {
    case "post":
      return {
        ...base,
        price: doc.price,
        forSale: doc.forSale,
        category: doc.category,
        attributes: doc.attributes ? Object.fromEntries(doc.attributes) : {},
      };
    case "tour":
      return {
        ...base,
        startDate: doc.startDate,
        endDate: doc.endDate,
        duration: doc.duration,
        durationDays: doc.durationDays,
        capacity: doc.capacity,
        itinerary: doc.itinerary,
      };
    case "training":
      return {
        ...base,
        schedule: doc.schedule || [],
        startDate: doc.startDate,
        endDate: doc.endDate,
        duration: doc.duration,
        capacity: doc.capacity,
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

/**
 * Map update response to PATCH endpoint response.
 * Minimal response showing what changed and new revision.
 *
 * @param {object} updatedDoc - Updated Mongoose document
 * @param {object} imageDiff - Image diff result (from service)
 * @param {object} req - Express request
 * @returns {object} Optimized PATCH response
 */
function mapUpdateResponse(updatedDoc, imageDiff, req) {
  const response = {
    id: updatedDoc._id,
    revision: updatedDoc.revision,
    updatedAt: updatedDoc.updatedAt,
  };

  // Include image changes summary if images were modified
  if (imageDiff && imageDiff.hasChanges) {
    response.images = {
      current: updatedDoc.images || [],
      imagesAbs: (updatedDoc.images || []).map((p) => toAbsoluteUrl(p, req)),
      added: imageDiff.added,
      removed: imageDiff.removed,
      reordered: imageDiff.reordered,
    };
  }

  return response;
}

/**
 * Map edit history entry for API response.
 * Formats timestamps and includes editor info.
 *
 * @param {object} historyEntry - Edit history entry from Listing document
 * @param {object} editorInfo - Optional editor user info
 * @returns {object} Formatted history entry
 */
function mapEditHistoryEntry(historyEntry, editorInfo = null) {
  const entry = {
    timestamp: historyEntry.timestamp,
    revision: historyEntry.newRevision,
    editor: editorInfo
      ? {
          id: editorInfo._id,
          name: editorInfo.name,
          email: editorInfo.email,
        }
      : {
          id: historyEntry.editor,
          name: "Unknown",
        },
  };

  // Include summary of changes
  if (historyEntry.changes && typeof historyEntry.changes === "object") {
    const changes = new Map(Object.entries(historyEntry.changes));
    entry.changedFields = Array.from(changes.keys());
    entry.changesSummary = buildChangesSummary(changes);
  }

  // Include reason if provided
  if (historyEntry.reason) {
    entry.reason = historyEntry.reason;
  }

  return entry;
}

/**
 * Build a human-readable summary of changes.
 * Converts change map to a readable format.
 *
 * @param {Map} changesMap - Map of field → value
 * @returns {object} Human-readable changes summary
 * @private
 */
function buildChangesSummary(changesMap) {
  const summary = {};

  for (const [field, value] of changesMap) {
    // Truncate long values for display
    let displayValue = value;

    if (typeof value === "string" && value.length > 100) {
      displayValue = value.substring(0, 100) + "...";
    } else if (typeof value === "object") {
      displayValue = "[Object]";
    } else if (Array.isArray(value)) {
      displayValue = `[Array of ${value.length}]`;
    }

    summary[field] = displayValue;
  }

  return summary;
}

/**
 * Map full edit history to API response format.
 * Formats multiple history entries.
 *
 * @param {array} history - Array of edit history entries
 * @param {array} editors - Optional map of editor user objects
 * @returns {array} Formatted history array
 */
function mapEditHistoryToResponse(history, editors = null) {
  return history.map((entry) => {
    const editorInfo = editors ? editors[entry.editor.toString?.()] : null;

    return mapEditHistoryEntry(entry, editorInfo);
  });
}

/**
 * Build a revision conflict error response.
 * Indicates that the client's revision is out of sync.
 *
 * @param {object} currentListing - Current database listing
 * @param {number} clientRevision - Revision the client expected
 * @returns {object} Conflict error DTO
 */
function buildRevisionConflictResponse(currentListing, clientRevision) {
  return {
    error: {
      code: "REVISION_CONFLICT",
      message:
        "آگهی توسط کاربر دیگری تغییر کرده است. لطفاً مجدداً بارگذاری کنید.",
      currentRevision: currentListing.revision,
      clientRevision,
      lastUpdatedAt: currentListing.updatedAt,
      lastEditor:
        currentListing.editHistory?.[currentListing.editHistory.length - 1]
          ?.editor,
    },
  };
}

module.exports = {
  mapListingToResponse,
  mapListingToEditFormResponse,
  mapUpdateResponse,
  mapEditHistoryEntry,
  mapEditHistoryToResponse,
  buildRevisionConflictResponse,
};
