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
import type { WizardData } from "../context/WizardContext";

// ── Output type ───────────────────────────────────────────────────────────────

export interface ListingDraftPayload {
  type: ListingType;
  title: string;
  description: string;
  tags: string[];
  /**
   * Relative paths of pre-uploaded images; empty array at draft stage,
   * filled with server paths after `uploadImages()` is called.
   */
  images: string[];
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

// ── Wizard-data → API payload converter ──────────────────────────────────────

/**
 * Build the POST /api/listings payload directly from the WizardData state.
 *
 * Unlike `buildListingDraftPayload` (which takes `WizardListingDraft`), this
 * function works with the flat `WizardData` shape produced by WizardContext.
 *
 * @param data        Live wizard state (title, description, geo, tags, etc.).
 * @param imagePaths  Relative server paths from `uploadImages()` — e.g.
 *                    ["/uploads/craft.webp"]. Pass [] when no images were added.
 */
export function buildPayloadFromWizard(
  data: WizardData,
  imagePaths: string[],
): ListingDraftPayload {
  // data.geo is stored as [lng, lat] (GeoJSON convention from the map picker)
  const location: GeoPoint | null = data.geo
    ? { type: "Point", coordinates: data.geo }
    : null;

  const tags = data.tags.filter(Boolean);

  const details: Record<string, unknown> = {};

  // Location city/province are useful search/display metadata in the backend.
  if (data.city.trim()) details.city = data.city.trim();
  if (data.province) details.province = data.province;
  if (data.address.trim()) details.address = data.address.trim();

  switch (data.type) {
    case "post": {
      details.forSale = data.forSale;
      if (data.forSale && data.price !== "") {
        details.price = Number(data.price);
        details.currency = data.currency;
      }
      if (data.category.trim()) details.category = data.category.trim();
      break;
    }
    case "tour": {
      if (data.startDate) details.startDate = data.startDate;
      if (data.endDate) details.endDate = data.endDate;
      if (data.duration.trim()) details.duration = data.duration.trim();
      if (data.capacity !== "") details.capacity = Number(data.capacity);
      break;
    }
    case "training": {
      // Training uses date-range schedule (wizard collects startDate/endDate/duration)
      if (data.startDate) details.startDate = data.startDate;
      if (data.endDate) details.endDate = data.endDate;
      if (data.duration.trim()) details.duration = data.duration.trim();
      if (data.capacity !== "") details.capacity = Number(data.capacity);
      break;
    }
    case "academy": {
      // Address is the primary academy-specific detail available from the wizard.
      // phone / workingHours / website can be added post-creation via profile edit.
      if (data.address.trim()) details.addressDetails = data.address.trim();
      break;
    }
  }

  return {
    type: data.type,
    title: data.title.trim(),
    description: data.description.trim(),
    tags,
    images: imagePaths,
    location,
    details,
  };
}
