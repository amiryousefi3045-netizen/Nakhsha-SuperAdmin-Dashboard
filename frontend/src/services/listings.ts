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
} from "../types/listings";

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
