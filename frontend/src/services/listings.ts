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
import type { ListingDraftPayload } from "./listingDraft";
import type { GeoPoint } from "../types/listing";
import { toAbsoluteMediaUrl } from "./media";

// ── Listing (API response item) ────────────────────────────────────────────

/**
 * Shape of a Listing item as returned by POST /api/listings or
 * embedded inside GET /api/listings/:id responses.
 */
export interface Listing {
  _id: string;
  /** Normalised `id` alias (may equal `_id`). */
  id?: string;
  type: "post" | "tour" | "training" | "academy";
  title: string;
  description?: string;
  tags?: string[];
  /** Stored relative paths as returned by the backend (may need toAbsoluteMediaUrl). */
  images?: string[];
  /** Fully-resolved absolute image URLs, populated when X-Client header is sent. */
  imagesAbs?: string[];
  location?: GeoPoint | null;
  details?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/** Backend success envelope for POST /api/listings. */
interface CreateListingEnvelope {
  success: true;
  data: { item: Listing };
  reqId: string | null;
}

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

  // Prefer server-resolved absolute URLs; fall back to toAbsoluteMediaUrl on raw paths.
  const images: string[] =
    Array.isArray(raw.imagesAbs) && raw.imagesAbs.length > 0
      ? raw.imagesAbs
      : (Array.isArray(raw.images) ? raw.images : []).map(toAbsoluteMediaUrl);
  const image = raw.image ? toAbsoluteMediaUrl(raw.image) : (images[0] ?? null);

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

/**
 * Create a new listing.
 *
 * @param payload  Built via `buildListingDraftPayload`; images should be
 *                 pre-uploaded paths returned by `uploadImages`.
 * @returns        The created `Listing` item from the backend envelope.
 * @throws         `ApiError` when the request fails.
 */
export async function createListing(
  payload: ListingDraftPayload,
): Promise<Listing> {
  const result = await apiClient.post<CreateListingEnvelope>(
    "/listings",
    payload,
  );
  if (!result.success) throw result.error!;
  const item = result.data?.data?.item;
  if (!item) throw new Error("پاسخ سرور نامعتبر است: آیتم بازگردانده نشد");
  return item;
}
