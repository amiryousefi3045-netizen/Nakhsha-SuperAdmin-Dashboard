/**
 * listingDraft.ts
 *
 * Pure payload builder for the Nakhsha Listing API.
 * No network calls. Convert a WizardListingDraft into the shape expected by
 * the backend POST /api/listings endpoint.
 */
import type {
  GeoPoint,
  ListingType,
  WizardListingDraft,
} from "../types/listing";

// ── Output type ───────────────────────────────────────────────────────────────

export interface ListingDraftPayload {
  type: ListingType;
  title: string;
  description: string;
  tags: string[];
  /** Images are serialised separately (multipart); always empty at draft stage. */
  images: [];
  /** GeoJSON Point when both coordinates are valid finite numbers; null otherwise. */
  location: GeoPoint | null;
  /** Type-specific details — only fields relevant to the chosen listingType. */
  details: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert raw lat/lng from the map-picker into a GeoJSON Point.
 * Returns null when either coordinate is missing or non-finite.
 *
 * GeoJSON convention: coordinates are [longitude, latitude].
 */
function toGeoPoint(loc: {
  lat: number | null;
  lng: number | null;
}): GeoPoint | null {
  if (
    loc.lat !== null &&
    loc.lng !== null &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng)
  ) {
    return { type: "Point", coordinates: [loc.lng, loc.lat] };
  }
  return null;
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build the API payload from the wizard discriminated-union draft.
 *
 * Only fields relevant to the selected `listingType` are included in
 * `details`; irrelevant fields (e.g. `schedule` for a "post") are absent.
 *
 * @example
 *   const payload = buildListingDraftPayload(draft);
 *   // POST /api/listings  →  payload
 */
export function buildListingDraftPayload(
  draft: WizardListingDraft,
): ListingDraftPayload {
  const base: Omit<ListingDraftPayload, "details"> = {
    type: draft.listingType,
    title: draft.title,
    description: draft.description,
    tags: draft.tags,
    images: [],
    location: toGeoPoint(draft.location),
  };

  let details: Record<string, unknown> = {};

  switch (draft.listingType) {
    case "post": {
      if (draft.price !== undefined) details.price = draft.price;
      if (draft.forSale !== undefined) details.forSale = draft.forSale;
      if (draft.category) details.category = draft.category;
      if (draft.attributes) details.attributes = draft.attributes;
      break;
    }
    case "tour": {
      if (draft.startDate) details.startDate = draft.startDate;
      if (draft.durationDays !== undefined)
        details.durationDays = draft.durationDays;
      if (draft.capacity !== undefined) details.capacity = draft.capacity;
      if (draft.itinerary) details.itinerary = draft.itinerary;
      break;
    }
    case "training": {
      details.schedule = draft.schedule;
      if (draft.level) details.level = draft.level;
      if (draft.instructor) details.instructor = draft.instructor;
      break;
    }
    case "academy": {
      if (draft.addressDetails) details.addressDetails = draft.addressDetails;
      if (draft.phone) details.phone = draft.phone;
      if (draft.workingHours) details.workingHours = draft.workingHours;
      if (draft.website) details.website = draft.website;
      break;
    }
  }

  return { ...base, details };
}
