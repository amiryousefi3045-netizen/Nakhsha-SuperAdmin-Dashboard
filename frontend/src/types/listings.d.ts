export type { GeoPoint } from "./api";

// Some legacy modules import more listing-related types from ../types/listings.
// Provide minimal compatible definitions here to keep the incremental migration safe.

export type NearListingsParams = {
  lng?: number;
  lat?: number;
  radiusKm?: number;
  q?: string;
  page?: number;
  limit?: number;
  type?: string;
  [k: string]: any;
};

/** GeoJSON location shape returned by the backend. */
export type ApiLocation = {
  type?: string;
  /** GeoJSON Point coordinates: [longitude, latitude] */
  coordinates?: [number, number] | number[];
  city?: string;
  neighborhood?: string;
  [key: string]: unknown;
};

export type ListingWithDistance = {
  id: string;
  title?: string;
  description?: string;
  distanceMeters?: number;
  /** Backend-side flat coords (may be absent) */
  lat?: number;
  lng?: number;
  /** GeoJSON or city-based location object */
  location?: ApiLocation | string | null;
  /** Listing category/type */
  listingType?: string;
  type?: string;
  image?: string | null;
  images?: string[];
};

/**
 * Normalised frontend shape used in Map markers and cards.
 * lat/lng are always resolved from whichever source the API returned.
 */
export type ListingItem = {
  id: string;
  title?: string;
  description?: string;
  lat?: number;
  lng?: number;
  image?: string | null;
  images?: string[];
  type?: string;
  location?: ApiLocation | string | null;
  distanceMeters?: number;
};

export type NearListingsResponse = {
  items?: ListingWithDistance[];
  total?: number;
  page?: number;
  limit?: number;
};
