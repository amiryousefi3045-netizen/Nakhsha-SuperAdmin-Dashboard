import { useState, useEffect } from "react";
import useGeolocation from "../hooks/useGeolocation";
import type { GeoPoint as ApiGeoPoint } from "../types/api";

type LatLng = { lat: number; lng: number };

interface LocationControlProps {
  onChange: (location: ApiGeoPoint | LatLng | null) => void;
  className?: string;
}

export default function LocationControl({
  onChange,
  className = "",
}: LocationControlProps) {
  const [useLocation, setUseLocation] = useState(false);
  const [radius, setRadius] = useState(10);
  const { position, error, loading } = useGeolocation();

  // When position changes or toggle changes, notify parent
  useEffect(() => {
    if (useLocation && position?.coords) {
      onChange({
        lng: position.coords.longitude,
        lat: position.coords.latitude,
      });
    } else {
      onChange(null);
    }
  }, [useLocation, position, onChange]);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={useLocation}
            onChange={(e) => setUseLocation(e.target.checked)}
          />
          <span>استفاده از موقعیت مکانی من</span>
        </label>
        {loading && (
          <span className="text-sm text-gray-500">در حال یافتن موقعیت...</span>
        )}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>

      {useLocation && position?.coords && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              شعاع جستجو: {radius} کیلومتر
            </label>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>۱ کیلومتر</span>
            <span>۵۰ کیلومتر</span>
          </div>
        </div>
      )}
    </div>
  );
}
