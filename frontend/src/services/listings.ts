/**
 * Listings Service
 *
 * Geospatial and traditional listing queries.
 * Uses the centralized apiClient for consistent normalizeError handling.
 */

import { apiClient } from "../lib/apiClient";
import type {
  NearListingsParams,
  NearListingsResponse,
  ListingWithDistance,
  ListingItem,
} from "../types/listings";

// ── Normalization helpers ──────────────────────────────────────────────────

/**
 * Convert a raw backend ListingWithDistance into a frontend ListingItem.
 *
 * Coordinate resolution order:
 *   1. Top-level `lat` / `lng` fields (including 0).
 *   2. `location.coordinates` GeoJSON Point array → [lng, lat] → {lat, lng}.
 */
export function normalizeListingItem(raw: ListingWithDistance): ListingItem {
  let lat: number | undefined;
  let lng: number | undefined;

  // Priority 1: flat lat/lng
  if (typeof raw.lat === "number" && Number.isFinite(raw.lat)) lat = raw.lat;
  if (typeof raw.lng === "number" && Number.isFinite(raw.lng)) lng = raw.lng;

  // Priority 2: GeoJSON location.coordinates [lng, lat]
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && raw.location) {
    const loc =
      typeof raw.location === "object" && raw.location !== null
        ? raw.location
        : null;
    if (loc && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      const rawLng = Number(loc.coordinates[0]);
      const rawLat = Number(loc.coordinates[1]);
      if (Number.isFinite(rawLat) && Number.isFinite(rawLng)) {
        lat = rawLat;
        lng = rawLng;
      }
    }
  }

  const images: string[] = Array.isArray(raw.images) ? raw.images : [];
  const image = raw.image ?? images[0] ?? null;

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    lat,
    lng,
    image,
    images,
    type: raw.listingType ?? raw.type,
    location: raw.location ?? null,
    distanceMeters: raw.distanceMeters,
  };
}

export type { ListingItem };

// ── API functions ──────────────────────────────────────────────────────────

/**
 * Fetch listings near a location using a radius query.
 * Requires `lng` and `lat`; `radiusKm` defaults to 10.
 */
export async function fetchNearListings(
  params: NearListingsParams,
): Promise<NearListingsResponse> {
  const queryParams = { ...params, radiusKm: params.radiusKm ?? 10 };
  const result = await apiClient.get<NearListingsResponse>("/listings/near", {
    params: queryParams,
  });
  if (!result.success) throw result.error!;
  return result.data!;
}

/**
 * Fetch listings with keyword / filter params (no location required).
 */
export async function fetchListings(
  params: Omit<NearListingsParams, "lng" | "lat" | "radiusKm">,
): Promise<{
  items: ListingWithDistance[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}> {
  const result = await apiClient.getPaginated<ListingWithDistance>(
    "/listings",
    params,
  );
  if (!result.success) throw result.error!;
  return {
    items: result.data ?? [],
    total: result.meta?.total ?? 0,
    page: result.meta?.page ?? 1,
    limit: result.meta?.limit ?? 20,
    hasMore: false,
  };
}

/**
 * Smart fetch: uses geospatial search when coordinates are provided,
 * falls back to keyword search otherwise.
 */
export async function fetchListingsAuto(
  params: Partial<NearListingsParams>,
): Promise<NearListingsResponse> {
  const { lng, lat, ...rest } = params;
  if (typeof lng === "number" && typeof lat === "number") {
    return fetchNearListings({ lng, lat, ...rest });
  }
  const flat = await fetchListings(rest);
  return {
    items: flat.items,
    total: flat.total,
    page: flat.page,
    limit: flat.limit,
  };
}

/**
 * Fetch listings near a point and return normalised `ListingItem[]`.
 *
 * This is the preferred function for map markers — coordinates are always
 * extracted (from flat lat/lng or GeoJSON coordinates) before being returned.
 *
 * @param params.lat      Latitude of search centre.
 * @param params.lng      Longitude of search centre.
 * @param params.radiusKm Search radius in kilometres (default 50).
 * @param params.limit    Max results (default 100).
 * @param params.type     Optional listing type filter (post/tour/training/academy).
 */
export async function fetchListingsNear(params: {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
  type?: string;
}): Promise<ListingItem[]> {
  const response = await fetchNearListings({
    lat: params.lat,
    lng: params.lng,
    radiusKm: params.radiusKm ?? 50,
    limit: params.limit ?? 100,
    ...(params.type ? { type: params.type } : {}),
  });
  return (response.items ?? []).map(normalizeListingItem);
}
