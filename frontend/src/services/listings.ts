import { http, buildQuery } from "../lib/http";
import type {
  NearListingsParams,
  NearListingsResponse,
  ListingWithDistance,
} from "../types/listings";
import type { ApiResponse } from "../types/api";

/**
 * Fetch listings near a location with optional filters
 */
export async function fetchNearListings(
  params: NearListingsParams
): Promise<NearListingsResponse> {
  const query = buildQuery({
    ...params,
    radiusKm: params.radiusKm || 10,
  });

  const { data } = await http.get<NearListingsResponse>("/listings/near", {
    params: query,
  });
  return data;
}

/**
 * Fetch listings with traditional filters (no location)
 */
export async function fetchListings(
  params: Omit<NearListingsParams, "lng" | "lat" | "radiusKm">
) {
  const { data } = await http.get<ApiResponse<ListingWithDistance[]>>(
    "/listings",
    {
      params: buildQuery(params),
    }
  );

  const items = Array.isArray(data?.items)
    ? (data.items as ListingWithDistance[])
    : [];
  return {
    items,
    total: data.total || 0,
    page: data.page || 1,
    limit: data.limit || 20,
    hasMore: false, // Backend needs to implement this
  };
}

/**
 * Smart fetch that uses near search when coordinates are provided
 */
export async function fetchListingsAuto(
  params: Partial<NearListingsParams>
): Promise<NearListingsResponse> {
  const { lng, lat, ...rest } = params;

  if (typeof lng === "number" && typeof lat === "number") {
    return fetchNearListings({ lng, lat, ...rest });
  }

  return fetchListings(rest);
}
