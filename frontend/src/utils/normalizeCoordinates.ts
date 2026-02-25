/**
 * normalizeCoordinates
 *
 * Resolves lat/lng from various shapes an API item might carry:
 *   1. Top-level `lat` / `lng` numbers (including 0, which is valid)
 *   2. GeoJSON Point `location.coordinates` array  → [lng, lat]
 *   3. `location.lat` / `location.lng` (non-GeoJSON fallback)
 *
 * Returns `null` when no finite coordinate pair can be determined.
 */

export interface NormalizedCoords {
  lat: number;
  lng: number;
}

/** Minimal shape of anything that might carry coordinate data */
export interface CoordSource {
  lat?: number | null;
  lng?: number | null;
  location?:
    | string
    | {
        coordinates?: [number, number] | number[];
        lat?: number | null;
        lng?: number | null;
        [key: string]: unknown;
      }
    | null;
}

/**
 * Normalize coordinates from an arbitrary API item.
 *
 * @example
 *   normalizeCoordinates({ lat: 35.6892, lng: 51.389 })
 *   // → { lat: 35.6892, lng: 51.389 }
 *
 *   normalizeCoordinates({ location: { coordinates: [51.389, 35.6892] } })
 *   // → { lat: 35.6892, lng: 51.389 }  (GeoJSON [lng, lat] flipped)
 */
export function normalizeCoordinates(
  item: CoordSource,
): NormalizedCoords | null {
  if (!item) return null;

  // ── Priority 1: top-level lat / lng (typeof check preserves 0) ──────────
  if (
    typeof item.lat === "number" &&
    typeof item.lng === "number" &&
    Number.isFinite(item.lat) &&
    Number.isFinite(item.lng)
  ) {
    return { lat: item.lat, lng: item.lng };
  }

  // ── Priority 2: GeoJSON Point coordinates [lng, lat] ────────────────────
  if (
    item.location !== null &&
    item.location !== undefined &&
    typeof item.location === "object"
  ) {
    const loc = item.location as Exclude<
      CoordSource["location"],
      string | null | undefined
    >;

    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      const lng = Number(loc.coordinates[0]);
      const lat = Number(loc.coordinates[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }

    // ── Priority 3: location.lat / location.lng ────────────────────────────
    if (
      typeof loc.lat === "number" &&
      typeof loc.lng === "number" &&
      Number.isFinite(loc.lat) &&
      Number.isFinite(loc.lng)
    ) {
      return { lat: loc.lat, lng: loc.lng };
    }
  }

  return null;
}
