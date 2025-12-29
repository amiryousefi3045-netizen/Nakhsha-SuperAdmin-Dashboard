import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";

const MapContainerAny = MapContainer as any;

interface Coordinates {
  lat: number;
  lng: number;
}

interface LocationConfirmData {
  lat: number;
  lng: number;
  addressText?: string;
  city?: string;
  neighborhood?: string;
}

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCoordinates?: Coordinates | null;
  onConfirm: (data: LocationConfirmData) => void;
}

interface MapClickHandlerProps {
  onMapClick: (latlng: any) => void;
}

const MapClickHandler = ({ onMapClick }: MapClickHandlerProps) => {
  useMapEvents({
    click: (e: any) => {
      onMapClick(e.latlng);
    },
  });
  return null;
};

const LocationPickerModal = ({
  isOpen,
  onClose,
  initialCoordinates,
  onConfirm,
}: LocationPickerModalProps) => {
  const [selectedPosition, setSelectedPosition] = useState<Coordinates | null>(
    initialCoordinates || null
  );
  const [addressText, setAddressText] = useState<string>("");
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(false);
  const [geocodeError, setGeocodeError] = useState<boolean>(false);

  // Default to Tehran center
  const defaultCenter = { lat: 35.6892, lng: 51.389 };
  const mapCenter = initialCoordinates || defaultCenter;

  useEffect(() => {
    if (selectedPosition) {
      reverseGeocode(selectedPosition.lat, selectedPosition.lng);
    }
  }, [selectedPosition]);

  const reverseGeocode = async (lat: number, lng: number): Promise<void> => {
    setIsLoadingAddress(true);
    setGeocodeError(false);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=fa`
      );

      if (!response.ok) {
        throw new Error("Geocoding failed");
      }

      const data = await response.json();

      if (data.display_name) {
        setAddressText(data.display_name);
      } else {
        setGeocodeError(true);
        setAddressText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      setGeocodeError(true);
      setAddressText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const handleMapClick = (latlng: any): void => {
    setSelectedPosition({ lat: latlng.lat, lng: latlng.lng });
  };

  const handleConfirm = async (): Promise<void> => {
    if (!selectedPosition) return;

    // Try to extract city and neighborhood from the geocoded data
    let city = "";
    let neighborhood = "";

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${selectedPosition.lat}&lon=${selectedPosition.lng}&addressdetails=1&accept-language=fa`
      );

      if (response.ok) {
        const data = await response.json();
        const address = data.address || {};

        city = address.city || address.town || address.village || "";
        neighborhood = address.suburb || address.neighbourhood || "";
      }
    } catch (error) {
      console.error("Error getting detailed address:", error);
    }

    onConfirm({
      lat: selectedPosition.lat,
      lng: selectedPosition.lng,
      addressText,
      city,
      neighborhood,
    });
  };

  const handleCancel = (): void => {
    setSelectedPosition(initialCoordinates || null);
    setAddressText("");
    setGeocodeError(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      dir="rtl"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              انتخاب موقعیت روی نقشه
            </h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            روی نقشه کلیک کنید تا موقعیت مورد نظر را انتخاب کنید
          </p>
        </div>

        {/* Map */}
        <div className="flex-1 p-4">
          <div className="h-80 rounded-lg overflow-hidden border border-gray-300">
            <MapContainerAny
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapClickHandler onMapClick={handleMapClick} />
              {selectedPosition && (
                <Marker
                  position={[selectedPosition.lat, selectedPosition.lng]}
                />
              )}
            </MapContainerAny>
          </div>

          {/* Selected Location Info */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            {selectedPosition ? (
              <div className="space-y-2">
                <div className="text-sm text-gray-600">
                  <strong>مختصات انتخاب‌شده:</strong>{" "}
                  {selectedPosition.lat.toFixed(6)},{" "}
                  {selectedPosition.lng.toFixed(6)}
                </div>
                <div className="text-sm text-gray-600">
                  <strong>آدرس:</strong>
                  {isLoadingAddress ? (
                    <span className="text-blue-600 mr-2">
                      در حال دریافت آدرس...
                    </span>
                  ) : (
                    <span
                      className={`mr-2 ${
                        geocodeError ? "text-orange-600" : "text-gray-800"
                      }`}
                    >
                      {addressText || "آدرس در دسترس نیست"}
                      {geocodeError && " (فقط مختصات)"}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-2">
                روی نقشه کلیک کنید تا موقعیت انتخاب شود
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedPosition || isLoadingAddress}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              selectedPosition && !isLoadingAddress
                ? "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            تأیید موقعیت
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationPickerModal;
