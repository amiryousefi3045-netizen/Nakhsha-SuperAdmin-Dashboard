import { useState, useEffect, useCallback } from "react";

interface LocationService {
  url: string;
  parse: (data: any) => {
    latitude: number;
    longitude: number;
    source: string;
  };
}

interface GeoPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  timestamp: number;
  source: string;
}

// Prefer GPS first. If GPS fails, fall back to CORS-friendly IP-location services.
const IP_LOCATION_SERVICES: LocationService[] = [
  // ipwho.is is CORS-friendly and commonly available
  {
    url: "https://ipwho.is/",
    parse: (data) => ({
      latitude: parseFloat(data.latitude || data.lat),
      longitude: parseFloat(data.longitude || data.lon),
      source: "ipwho.is",
    }),
  },
  // keep nowapi.ir as Iranian option (may be DNS-blocked outside Iran)
  {
    url: "https://ip.nowapi.ir/",
    parse: (data) => ({
      latitude: parseFloat(data.lat),
      longitude: parseFloat(data.lon),
      source: "nowapi.ir",
    }),
  },
];

interface UseGeolocationReturn {
  position: GeoPosition | null;
  error: string;
  loading: boolean;
  getPosition: () => Promise<void>;
}

export default function useGeolocation(): UseGeolocationReturn {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const getPosition = useCallback(async () => {
    setLoading(true);
    setError("");

    // 1. Try browser GPS first (preferred) with conservative timeout/options
    const tryBrowserGPS = () =>
      new Promise<{ pos: GeolocationPosition; took: number }>(
        (resolve, reject) => {
          if (!navigator.geolocation) {
            return reject(new Error("No geolocation API"));
          }

          const start = Date.now();
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const took = Date.now() - start;
              // If the browser returns a position extremely quickly it's likely
              // a cached/network provider (sometimes backed by Google). We still
              // accept it, but we log the timing so the app can react if needed.
              resolve({ pos, took });
            },
            (err) => reject(err),
            {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0,
              // vendor hints (may be ignored by browsers)
              mozSystem: true,
              webkitSkipLowAccuracy: true,
            } as PositionOptions & {
              mozSystem?: boolean;
              webkitSkipLowAccuracy?: boolean;
            }
          );
        }
      );

    try {
      const { pos, took } = await tryBrowserGPS();
      console.debug("geo: GPS success", {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0),
        took,
        source: "GPS",
      });

      setPosition({ ...pos, source: "GPS" } as GeoPosition);
      setLoading(false);
      return;
    } catch (gpsErr) {
      // If GPS fails or is unavailable, we'll fall back to IP-based lookups
      console.warn("geo: GPS failed", gpsErr);
    }

    // 2. If GPS didn't provide a usable result, attempt CORS-friendly IP services
    // Use a small fetch timeout so the hook doesn't hang on DNS/CORS failures.
    const fetchWithTimeout = (url: string, timeout = 4000): Promise<Response> =>
      new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, timeout);

        fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        })
          .then((r) => {
            clearTimeout(timer);
            resolve(r);
          })
          .catch((e) => {
            clearTimeout(timer);
            reject(e);
          });
      });

    for (const service of IP_LOCATION_SERVICES) {
      try {
        const resp = await fetchWithTimeout(service.url, 4000);
        if (!resp.ok) {
          console.debug(`geo: ${service.url} returned ${resp.status}`);
          continue;
        }
        const data = await resp.json();
        const pos = service.parse(data);
        if (Number.isFinite(pos.latitude) && Number.isFinite(pos.longitude)) {
          console.debug(`geo: ${service.url} success`, pos);
          setPosition({
            coords: {
              latitude: pos.latitude,
              longitude: pos.longitude,
              accuracy: 5000,
            },
            timestamp: Date.now(),
            source: pos.source,
          });
          setLoading(false);
          return;
        }
      } catch (err) {
        // DNS/CORS or other network error for this service: try next one
        console.debug(
          `geo: ${service.url} failed`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // nothing worked
    setError("پیدا کردن موقعیت ممکن نشد (GPS و سرویس‌های IP ناموفق بودند)");
    setLoading(false);
  }, []);

  // درخواست موقعیت به محض mount
  useEffect(() => {
    getPosition();
  }, [getPosition]);

  return {
    position,
    error,
    loading,
    getPosition, // برای درخواست مجدد
  };
}
