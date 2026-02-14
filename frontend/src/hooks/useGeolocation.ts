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

interface IranCoords {
  lat: number;
  lng: number;
  ts: number;
}

// Prefer GPS first. If GPS fails and caller explicitly allows it,
// fall back to CORS-friendly IP-location services. IP results are
// returned for auxiliary UI only and must NOT be used to update the
// Iran-only safe coords.
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
  getPosition: (allowIpFallback?: boolean) => Promise<void>;
  usedIpFallback: boolean;
  lastIranGood: IranCoords | null;
  providerBlocked: boolean;
  geoError: string | null;
}

export default function useGeolocation(): UseGeolocationReturn {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [usedIpFallback, setUsedIpFallback] = useState(false);
  const [providerBlocked, setProviderBlocked] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Last known good Iran-only coords (kept in-memory and persisted to localStorage)
  const [lastIranGood, setLastIranGood] = useState<IranCoords | null>(() => {
    try {
      const v = localStorage.getItem("geo.ir.good");
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  });

  const isInIran = (lat: number, lng: number): boolean => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return lat >= 25 && lat <= 40 && lng >= 44 && lng <= 64;
  };

  const clampIran = (
    lat: number,
    lng: number,
  ): { lat: number; lng: number } => ({
    lat: Math.min(40, Math.max(25, lat)),
    lng: Math.min(64, Math.max(44, lng)),
  });

  // getPosition(allowIpFallback = false)
  // - allowIpFallback: when true, if browser GPS fails we attempt IP-based services
  // Default is false to avoid auto-using IP geolocation (which may return a coarse/incorrect country)
  // If IP fallback is used we set usedIpFallback=true but we DO NOT update the Iran-only
  // persisted coords from IP results. Only valid GPS inside Iran updates that store.
  const getPosition = useCallback(async (allowIpFallback = false) => {
    setLoading(true);
    setError("");
    setGeoError(null);
    setProviderBlocked(false);

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
              resolve({ pos, took });
            },
            (err) => reject(err),
            {
              // Use the conservative options requested
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            },
          );
        },
      );

    try {
      const { pos, took } = await tryBrowserGPS();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      console.debug("geo: GPS success", {
        latitude: lat,
        longitude: lng,
        accuracy: Math.round(pos.coords.accuracy || 0),
        took,
        source: "GPS",
      });

      // If GPS result is inside Iran, persist as last good Iran coords and
      // clamp them to the safe bounding box. If outside Iran, we still return
      // the GPS location for auxiliary UI but do not update Iran-only storage.
      if (isInIran(lat, lng)) {
        const clamped = clampIran(lat, lng);
        const coords = {
          latitude: clamped.lat,
          longitude: clamped.lng,
          accuracy: pos.coords.accuracy || 0,
        };
        setPosition({
          coords,
          timestamp: pos.timestamp || Date.now(),
          source: "GPS",
        });
        setUsedIpFallback(false);
        const saved: IranCoords = {
          lat: clamped.lat,
          lng: clamped.lng,
          ts: Date.now(),
        };
        try {
          localStorage.setItem("geo.ir.good", JSON.stringify(saved));
        } catch {
          // ignore storage errors (privacy mode, quota, etc.)
        }
        setLastIranGood(saved);
      } else {
        // outside Iran: keep raw GPS for UI but don't treat it as 'safe'
        setPosition({
          coords: {
            latitude: lat,
            longitude: lng,
            accuracy: pos.coords.accuracy || 0,
          },
          timestamp: pos.timestamp || Date.now(),
          source: "GPS",
        });
        setUsedIpFallback(false);
      }

      setLoading(false);
      return;
    } catch (gpsErr) {
      // If GPS fails or is unavailable, we'll fall back to IP-based lookups
      console.warn("geo: GPS failed", gpsErr);

      // Detect Google provider block: check for 403 or googleapis.com references
      if (gpsErr && (gpsErr as Error).message) {
        const errMsg = (gpsErr as Error).message;
        if (
          errMsg.includes("403") ||
          errMsg.includes("www.googleapis.com") ||
          errMsg.includes("Returned error code 403")
        ) {
          setProviderBlocked(true);
          setGeoError("سرویس Google برای موقعیت‌یابی مسدود است (403)");
          setLoading(false);
          return;
        }
      }
      // Store the error for diagnostics
      setGeoError(
        gpsErr && (gpsErr as Error).message
          ? (gpsErr as Error).message
          : "GPS ناموفق بود",
      );
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

    // Only attempt IP-based services if caller explicitly allows it. This
    // prevents silently using coarse IP-derived locations and unexpectedly
    // recentering the map. If used, IP-based results will set `usedIpFallback`
    // but will NOT be stored as the Iran-only last-good coords.
    if (allowIpFallback) {
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
            setUsedIpFallback(true);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.debug(
            `geo: ${service.url} failed`,
            err && (err as Error).message ? (err as Error).message : err,
          );
        }
      }
    }

    // nothing worked
    setError("پیدا کردن موقعیت ممکن نشد (GPS و سرویس‌های IP ناموفق بودند)");
    setLoading(false);
  }, []);

  // درخواست موقعیت به محض mount — no IP fallback on mount
  useEffect(() => {
    getPosition(false);
  }, [getPosition]);

  return {
    position,
    error,
    loading,
    getPosition, // برای درخواست مجدد: call getPosition(true) to allow IP fallback
    usedIpFallback,
    lastIranGood,
    providerBlocked,
    geoError,
  };
}
