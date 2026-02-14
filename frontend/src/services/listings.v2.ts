/**
 * Listings Service v2
 *
 * Refactored to use centralized apiClient with standardized responses.
 *
 * Features:
 * - All functions return ApiResult<T> or PaginatedResult<T>
 * - Automatic token management via interceptor
 * - Standardized error handling with Persian messages
 * - Geospatial queries for location-based search
 * - Full TypeScript support with generic types
 *
 * @example
 * ```ts
 * const result = await fetchNearListings({ lng: 51.41, lat: 35.73 });
 * if (result.success) {
 *   console.log(result.data?.items);
 * }
 * ```
 */

import {
  apiClient,
  type ApiResult,
  type PaginatedResult,
} from "../lib/apiClient";
import type {
  NearListingsParams,
  ListingWithDistance,
} from "../types/listings";

// ============================================================================
// Backend Response Types
// ============================================================================

/**
 * Backend response for near listings query
 */
interface NearListingsResponse {
  items?: ListingWithDistance[];
  total?: number;
  page?: number;
  limit?: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch listings near a location with optional filters
 *
 * Uses geospatial queries to find listings within a radius.
 *
 * @param params - Search parameters including coordinates and filters
 * @returns ApiResult with listings and metadata
 *
 * @example
 * ```ts
 * const result = await fetchNearListings({
 *   lng: 51.4138,
 *   lat: 35.7306,
 *   radiusKm: 10,
 *   q: "گلیم",
 *   page: 1,
 *   limit: 20
 * });
 *
 * if (result.success) {
 *   result.data?.items?.forEach(listing => {
 *     console.log(listing.title, listing.distanceMeters);
 *   });
 * }
 * ```
 */
export async function fetchNearListings(
  params: NearListingsParams,
): Promise<ApiResult<NearListingsResponse>> {
  const queryParams = {
    ...params,
    radiusKm: params.radiusKm || 10,
  };

  return apiClient.get<NearListingsResponse>("/listings/near", {
    params: queryParams,
  });
}

/**
 * Fetch listings with traditional filters (no location requirement)
 *
 * Returns paginated results without distance calculations.
 *
 * @param params - Filter parameters (excluding location)
 * @returns PaginatedResult with listings
 *
 * @example
 * ```ts
 * const result = await fetchListings({
 *   q: "کارگاه هنری",
 *   page: 1,
 *   limit: 20
 * });
 *
 * if (result.success) {
 *   console.log("Total listings:", result.meta?.total);
 *   console.log("Items:", result.data);
 * }
 * ```
 */
export async function fetchListings(
  params: Omit<NearListingsParams, "lng" | "lat" | "radiusKm">,
): Promise<PaginatedResult<ListingWithDistance>> {
  return apiClient.getPaginated<ListingWithDistance>("/listings", params);
}

/**
 * Smart fetch that uses near search when coordinates are provided
 *
 * Automatically chooses between geospatial and traditional search
 * based on whether coordinates are included in params.
 *
 * @param params - Search parameters (coordinates optional)
 * @returns ApiResult with listings response
 *
 * @example
 * ```ts
 * // With coordinates - uses near search
 * const nearResult = await fetchListingsAuto({
 *   lng: 51.41,
 *   lat: 35.73,
 *   q: "سفال"
 * });
 *
 * // Without coordinates - uses traditional search
 * const result = await fetchListingsAuto({ q: "سفال" });
 * ```
 */
export async function fetchListingsAuto(
  params: Partial<NearListingsParams>,
): Promise<
  ApiResult<NearListingsResponse> | PaginatedResult<ListingWithDistance>
> {
  const { lng, lat, ...rest } = params;

  // If coordinates provided, use geospatial search
  if (typeof lng === "number" && typeof lat === "number") {
    return fetchNearListings({ lng, lat, ...rest });
  }

  // Otherwise use traditional paginated search
  return fetchListings(rest);
}

// ============================================================================
// Type Exports for Consumers
// ============================================================================

export type { NearListingsResponse };
