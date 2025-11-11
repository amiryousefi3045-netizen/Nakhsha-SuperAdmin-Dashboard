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
  [k: string]: any;
};

export type ListingWithDistance = {
  id: string;
  title?: string;
  description?: string;
  distanceMeters?: number;
  location?: any;
};

export type NearListingsResponse = {
  items?: ListingWithDistance[];
  total?: number;
  page?: number;
  limit?: number;
};
