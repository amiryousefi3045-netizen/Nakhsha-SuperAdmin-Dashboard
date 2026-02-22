/**
 * reverseGeocode.ts
 *
 * Provider abstraction for reverse geocoding.
 * Default implementation uses Nominatim (OpenStreetMap) – free, no key needed.
 *
 * ─── To switch to Map.ir / Neshan ────────────────────────────────────────────
 * Replace the `reverseGeocodeNominatim` function below and re-export it as
 * `reverseGeocode`, or inject your own provider via `setReverseGeocodeProvider`.
 *
 * Map.ir endpoint (example):
 *   GET https://map.ir/reverse?lat={lat}&lon={lng}
 *   Headers: x-api-key: <YOUR_KEY>
 *
 * Neshan endpoint (example):
 *   GET https://api.neshan.org/v5/reverse?lat={lat}&lng={lng}
 *   Headers: Api-Key: <YOUR_KEY>
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ReverseGeocodeResult {
  /** City/town name in Persian */
  city?: string;
  /** Province/state name in Persian */
  state?: string;
  /** Short street-level address */
  address?: string;
  /** Full human-readable address string */
  formattedAddress?: string;
}

export type ReverseGeocodeProvider = (
  lat: number,
  lng: number,
) => Promise<ReverseGeocodeResult>;

// ─── Nominatim (default) ──────────────────────────────────────────────────────

/**
 * Calls Nominatim reverse geocode API.
 * NOTE: For production use, replace with Map.ir or Neshan for better
 * Persian address coverage and higher rate limits.
 */
export async function reverseGeocodeNominatim(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=json&lat=${lat}&lon=${lng}&accept-language=fa`;

  const resp = await fetch(url, {
    headers: {
      // Nominatim usage policy requires a descriptive User-Agent
      "User-Agent": "Nakhsha/1.0 (nakhsha.ir contact@nakhsha.ir)",
      "Accept-Language": "fa",
    },
  });

  if (!resp.ok) {
    throw new Error(`Nominatim responded with ${resp.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await resp.json();
  const a = data.address ?? {};

  return {
    city: a.city ?? a.town ?? a.village ?? a.county ?? undefined,
    state: a.state ?? undefined,
    address: a.road
      ? [a.house_number, a.road, a.neighbourhood].filter(Boolean).join("، ")
      : undefined,
    formattedAddress: data.display_name ?? undefined,
  };
}

// ─── Active provider (swap here) ──────────────────────────────────────────────

let activeProvider: ReverseGeocodeProvider = reverseGeocodeNominatim;

/**
 * Override the global reverse-geocode provider at runtime.
 * Call once at app startup if you want to use Map.ir / Neshan.
 */
export function setReverseGeocodeProvider(fn: ReverseGeocodeProvider): void {
  activeProvider = fn;
}

/**
 * Reverse-geocode a coordinate pair.
 * Returns the result or throws on network/parse failure.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  return activeProvider(lat, lng);
}
