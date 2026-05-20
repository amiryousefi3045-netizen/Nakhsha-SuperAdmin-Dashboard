/**
 * listing.mapper.js — DTO mappers for listing API responses.
 *
 * Converts Mongoose documents to optimized frontend response objects.
 * Handles:
 * - Full listing responses with type-specific fields
 * - Edit-form responses (lightweight DTOs)
 * - Update responses with image delta
 * - Edit history formatting
 * - Geospatial marker DTOs
 * - Error response shaping
 */

const { toAbsoluteUrl } = require("../utils/urls");

// ────────────────────────────────────────────────────────────────────────────
// Full Listing Response Mappers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map a Mongoose Listing document to a complete API response.
 * Includes all fields and converts relative image paths to absolute URLs.
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

// ────────────────────────────────────────────────────────────────────────────
// Edit Form Response Mapper
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map listing to an optimized "edit form" response.
 * Lightweight DTO containing only fields needed to populate edit form.
 * Critical: includes revision for optimistic concurrency control.
 *
 * @param {object} doc - Mongoose Listing document
 * @param {object} req - Express request (for base URL)
 * @returns {object} Edit form DTO
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
    revision: doc.revision, // Required for optimistic lock
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

// ────────────────────────────────────────────────────────────────────────────
// Update Response Mapper
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Edit History Mappers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a human-readable summary of changes.
 * Converts change map to readable format for display.
 *
 * @param {object} changesMap - Map of field → value
 * @returns {object} Human-readable changes summary
 */
function buildChangesSummary(changesMap) {
  const summary = {};

  for (const [field, value] of Object.entries(changesMap)) {
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
 * Map a single edit history entry for API response.
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
    entry.changedFields = Object.keys(historyEntry.changes);
    entry.changesSummary = buildChangesSummary(historyEntry.changes);
  }

  // Include reason if provided
  if (historyEntry.reason) {
    entry.reason = historyEntry.reason;
  }

  return entry;
}

/**
 * Map full edit history to API response format.
 * Formats multiple history entries chronologically.
 *
 * @param {array} history - Array of edit history entries
 * @param {object} editors - Optional map of editor user objects by ID
 * @returns {array} Formatted history array
 */
function mapEditHistoryToResponse(history, editors = null) {
  return history.map((entry) => {
    const editorInfo = editors ? editors[entry.editor?.toString?.()] : null;
    return mapEditHistoryEntry(entry, editorInfo);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Conflict & Error Mappers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a revision conflict error response.
 * Indicates that the client's revision is out of sync with server.
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

// ────────────────────────────────────────────────────────────────────────────
// Geospatial Marker Mapper
// ────────────────────────────────────────────────────────────────────────────

/**
 * Format a lightweight marker DTO for geospatial responses.
 * Optimized for map rendering (~90% smaller than full listing).
 *
 * @param {object} marker - Marker DTO from GeoService
 * @param {object} req - Express request (for URL generation)
 * @returns {object} Formatted marker for map display
 */
function formatMarkerItem(marker, req) {
  return {
    id: marker.id,
    title: marker.title,
    type: marker.type,
    status: marker.status,
    category: marker.category,
    coordinates: marker.coordinates,
    city: marker.city,
    province: marker.province,
    distanceMeters: marker.distanceMeters,
    distanceKm: marker.distanceKm,
    location: marker.city
      ? marker.province
        ? `${marker.city}، ${marker.province}`
        : marker.city
      : "نامشخص",
    preview: marker.preview ? toAbsoluteUrl(marker.preview, req) : null,
    price: marker.price || null,
    rating: marker.rating || null,
    verified: marker.verified || false,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  mapListingToResponse,
  mapListingToEditFormResponse,
  mapUpdateResponse,
  mapEditHistoryEntry,
  mapEditHistoryToResponse,
  buildRevisionConflictResponse,
  formatMarkerItem,
  buildChangesSummary,
};
