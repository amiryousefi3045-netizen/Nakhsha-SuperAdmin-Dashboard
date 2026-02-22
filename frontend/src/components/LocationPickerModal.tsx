/**
 * LocationPickerModal
 *
 * Opens a full-screen modal with a Leaflet map centred on Iran.
 * Click anywhere on the map (or drag the marker) to:
 *   1. Place a draggable marker
 *   2. Trigger debounced reverse geocoding (Nominatim by default)
 *   3. Preview the resolved address
 *
 * On "ØªØ£ÛŒÛŒØ¯ Ù…ÙˆÙ‚Ø¹ÛŒØª" the parent receives:
 *   { geo: [lng, lat], city?, state?, address?, formattedAddress? }
 *
 * To swap the geocoding backend, call `setReverseGeocodeProvider` from
 * utils/reverseGeocode.ts at app startup.
 */
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin, X } from "lucide-react";

// Fix Leaflet default marker icons for Vite bundling
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

import {
  reverseGeocode,
  type ReverseGeocodeResult,
} from "../utils/reverseGeocode";

// Apply icon fix once (idempotent)
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// â”€â”€â”€ Public types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface LocationPickerResult extends ReverseGeocodeResult {
  /** GeoJSON Point coordinates [lng, lat] */
  geo: [number, number];
}

export interface LocationPickerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: LocationPickerResult) => void;
  /** Pre-existing coordinates [lng, lat] to show as marker on open */
  initialGeo?: [number, number];
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Geographic centre of Iran */
const IRAN_CENTER: [number, number] = [32.4279, 53.688];
const IRAN_ZOOM = 5;
const SELECTED_ZOOM = 14;
const DEBOUNCE_MS = 600;

// â”€â”€â”€ Inner map (plain Leaflet, no react-leaflet â€“ avoids v5 TS issues) â”€â”€â”€â”€â”€â”€â”€

interface MapCoreProps {
  initialGeo?: [number, number];
  onPick: (lat: number, lng: number) => void;
  markerPos: [number, number] | null;
}

const MapCore: FC<MapCoreProps> = ({ initialGeo, onPick, markerPos }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ReturnType<typeof L.map> | null>(null);
  const markerRef = useRef<ReturnType<typeof L.marker> | null>(null);

  // Initialise map once on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // geo is [lng, lat] â†’ Leaflet wants [lat, lng]
    const startCenter: [number, number] = initialGeo
      ? [initialGeo[1], initialGeo[0]]
      : IRAN_CENTER;
    const startZoom = initialGeo ? SELECTED_ZOOM : IRAN_ZOOM;

    const map = L.map(containerRef.current, {
      center: startCenter,
      zoom: startZoom,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        'Â© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
      onPick(e.latlng.lat, e.latlng.lng);
    });

    if (initialGeo) {
      const m = L.marker([initialGeo[1], initialGeo[0]], {
        draggable: true,
      }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        onPick(p.lat, p.lng);
      });
      markerRef.current = m;
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!markerPos) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng(markerPos);
    } else {
      const m = L.marker(markerPos, { draggable: true }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        onPick(p.lat, p.lng);
      });
      markerRef.current = m;
    }

    map.flyTo(markerPos, Math.max(map.getZoom(), SELECTED_ZOOM), {
      duration: 0.5,
    });
  }, [markerPos, onPick]);

  return <div ref={containerRef} className="w-full h-full" />;
};

// â”€â”€â”€ Modal shell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const LocationPickerModal: FC<LocationPickerModalProps> = ({
  open,
  onClose,
  onConfirm,
  initialGeo,
}) => {
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(
    initialGeo ? [initialGeo[1], initialGeo[0]] : null,
  );
  const [geocodeResult, setGeocodeResult] =
    useState<ReverseGeocodeResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const pendingGeoRef = useRef<[number, number] | null>(initialGeo ?? null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state whenever the modal re-opens
  useEffect(() => {
    if (open) {
      const pos: [number, number] | null = initialGeo
        ? [initialGeo[1], initialGeo[0]]
        : null;
      setMarkerPos(pos);
      pendingGeoRef.current = initialGeo ?? null;
      setGeocodeResult(null);
      setStatus("idle");
    }
  }, [open, initialGeo]);

  const handlePick = useCallback((lat: number, lng: number) => {
    setMarkerPos([lat, lng]);
    pendingGeoRef.current = [lng, lat]; // GeoJSON order: [lng, lat]

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus("loading");
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await reverseGeocode(lat, lng);
        setGeocodeResult(result);
        setStatus("ok");
      } catch {
        setGeocodeResult(null);
        setStatus("error");
      }
    }, DEBOUNCE_MS);
  }, []);

  const handleConfirm = () => {
    if (!pendingGeoRef.current) return;
    onConfirm({ geo: pendingGeoRef.current, ...(geocodeResult ?? {}) });
  };

  // Escape key closes modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasPin = markerPos !== null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      dir="rtl"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-3xl h-[90dvh] max-h-[720px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-base font-bold text-[var(--color-text)]">
              Ø§Ù†ØªØ®Ø§Ø¨ Ù…ÙˆÙ‚Ø¹ÛŒØª Ø±ÙˆÛŒ Ù†Ù‚Ø´Ù‡
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Ø¨Ø³ØªÙ†"
          >
            <X className="w-5 h-5 text-[var(--color-muted)]" />
          </button>
        </div>

        {/* Hint */}
        <div className="px-5 py-2.5 bg-sky-50 border-b border-sky-100 text-xs text-sky-700 shrink-0">
          Ø±ÙˆÛŒ Ù†Ù‚Ø´Ù‡ Ú©Ù„ÛŒÚ© Ú©Ù†ÛŒØ¯ ØªØ§ Ù…ÙˆÙ‚Ø¹ÛŒØª Ø§Ù†ØªØ®Ø§Ø¨
          Ø´ÙˆØ¯. Ù…Ø§Ø±Ú©Ø± Ù‚Ø§Ø¨Ù„ Ú©Ø´ÛŒØ¯Ù† Ø§Ø³Øª.
        </div>

        {/* Map area */}
        <div className="flex-1 min-h-0">
          <MapCore
            initialGeo={initialGeo}
            onPick={handlePick}
            markerPos={markerPos}
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] bg-white shrink-0 space-y-3">
          {/* Geocode status */}
          {status === "loading" && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Ø¯Ø± Ø­Ø§Ù„ Ø¯Ø±ÛŒØ§ÙØª Ø¢Ø¯Ø±Ø³â€¦
            </div>
          )}

          {status === "ok" && geocodeResult?.formattedAddress && (
            <div className="flex items-start gap-2 p-3 bg-green-50 rounded-xl border border-green-200 text-xs text-green-800 leading-relaxed">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-600" />
              <span className="line-clamp-2">
                {geocodeResult.formattedAddress}
              </span>
            </div>
          )}

          {status === "error" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
              Ø¢Ø¯Ø±Ø³ ÛŒØ§ÙØª Ù†Ø´Ø¯ØŒ Ø¯Ø³ØªÛŒ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯.
            </p>
          )}

          {hasPin && markerPos && (
            <p className="text-[11px] font-mono text-[var(--color-muted)]">
              {markerPos[0].toFixed(5)}, {markerPos[1].toFixed(5)}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-gray-50 transition-colors"
            >
              Ø§Ù†ØµØ±Ø§Ù
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!hasPin}
              className="px-5 py-2 text-sm font-semibold rounded-xl bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ØªØ£ÛŒÛŒØ¯ Ù…ÙˆÙ‚Ø¹ÛŒØª
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LocationPickerModal;
