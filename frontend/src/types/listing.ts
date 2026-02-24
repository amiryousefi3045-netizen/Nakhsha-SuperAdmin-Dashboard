/**
 * Shared listing types for the Nakhsha wizard and backend payload builder.
 *
 * ListingType is the canonical discriminant used across the wizard and API.
 * WizardListingDraft is the discriminated-union draft state used by the
 * payload builder (buildListingDraftPayload in services/listingDraft.ts).
 */

// ── Primitive types ──────────────────────────────────────────────────────────

/** All supported listing categories in Nakhsha. */
export type ListingType = "post" | "tour" | "training" | "academy";

/** GeoJSON Point — coordinates are [longitude, latitude] per GeoJSON spec. */
export type GeoPoint = { type: "Point"; coordinates: [number, number] };

// ── Base fields shared across ALL listing types ───────────────────────────────

interface BaseListingFields {
  title: string;
  description: string;
  tags: string[];
  /** Raw File objects; serialised separately before API upload. */
  images: File[];
  /** Raw map-picker output; converted to GeoPoint by buildListingDraftPayload. */
  location: { lat: number | null; lng: number | null };
}

// ── Type-specific field interfaces ───────────────────────────────────────────

export interface PostListingFields {
  price?: number;
  forSale?: boolean;
  category?: string;
  /** Free-form key/value attributes (e.g. material, size). */
  attributes?: Record<string, string>;
}

export interface TourListingFields {
  /** ISO date string: "YYYY-MM-DD" */
  startDate?: string;
  durationDays?: number;
  capacity?: number;
  itinerary?: string;
}

export interface TrainingListingFields {
  /** Weekly recurring schedule; required for training listings. */
  schedule: Array<{
    /** 0 = Sunday … 6 = Saturday (ISO-like; 1 = Monday common convention). */
    dayOfWeek: number;
    startTime: string; // "HH:mm"
    endTime: string; // "HH:mm"
  }>;
  level?: string; // e.g. "beginner" | "intermediate" | "advanced"
  instructor?: string;
}

export interface AcademyListingFields {
  addressDetails?: string;
  phone?: string;
  workingHours?: string; // e.g. "شنبه تا چهارشنبه ۹–۱۷"
  website?: string;
}

// ── Discriminated union ──────────────────────────────────────────────────────

/**
 * Discriminated union representing the wizard draft before submission.
 * Narrow on `listingType` to access type-specific fields safely.
 *
 * @example
 *   if (draft.listingType === 'training') {
 *     console.log(draft.schedule); // typed as TrainingListingFields["schedule"]
 *   }
 */
export type WizardListingDraft =
  | (BaseListingFields & { listingType: "post" } & PostListingFields)
  | (BaseListingFields & { listingType: "tour" } & TourListingFields)
  | (BaseListingFields & { listingType: "training" } & TrainingListingFields)
  | (BaseListingFields & { listingType: "academy" } & AcademyListingFields);
