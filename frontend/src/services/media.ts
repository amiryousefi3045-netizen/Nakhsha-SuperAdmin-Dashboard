import { apiClient } from "../lib/apiClient";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
let SERVER_ORIGIN = "";
try {
  if (/^https?:\/\//i.test(API_BASE)) {
    SERVER_ORIGIN = new URL(API_BASE).origin;
  } else if (import.meta.env.VITE_SERVER_ORIGIN) {
    SERVER_ORIGIN = import.meta.env.VITE_SERVER_ORIGIN;
  } else if (typeof window !== "undefined" && window.location) {
    SERVER_ORIGIN = `${window.location.protocol}//${window.location.hostname}:5000`;
  }
} catch {
  // ignore
}

interface UploadResponse {
  url?: string;
}

interface GeocodeAddress {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
}

interface GeocodeResponse {
  address?: GeocodeAddress;
  display_name?: string;
}

export interface ReverseGeocodeResult {
  city: string;
  neighborhood: string;
  displayName: string;
}

export async function uploadImage(file: File | Blob): Promise<string> {
  const form = new FormData();
  form.append("file", file, file instanceof File ? file.name : "upload");
  const { data } = await apiClient.axios.post<UploadResponse>(
    "/uploads",
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  const url = data?.url || "";
  if (!url) throw new Error("Upload failed: No url in response");
  return url.startsWith("http")
    ? url
    : `${SERVER_ORIGIN}${url.startsWith("/") ? url : "/" + url}`;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat,
    )}&lon=${encodeURIComponent(lng)}&zoom=14&accept-language=fa`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Nakhsha/1.0 (+https://example.com)",
      },
    });
    if (!res.ok) throw new Error("reverse geocode failed");
    const data: GeocodeResponse = await res.json();
    const a = data?.address || {};
    const city = a.city || a.town || a.village || a.state || "";
    const neighborhood = a.neighbourhood || a.suburb || a.city_district || "";
    return {
      city,
      neighborhood,
      displayName:
        data.display_name || [city, neighborhood].filter(Boolean).join("، "),
    };
  } catch {
    return { city: "", neighborhood: "", displayName: "" };
  }
}
