/**
 * Media Service v2
 *
 * Refactored to use centralized apiClient with standardized responses.
 *
 * Features:
 * - All functions return ApiResult<T>
 * - Automatic token management via interceptor
 * - File upload support with FormData
 * - Reverse geocoding for location names
 * - Full TypeScript support with generic types
 *
 * @example
 * ```ts
 * const result = await uploadImage(file);
 * if (result.success) {
 *   console.log("Uploaded to:", result.data);
 * }
 * ```
 */

import { apiClient, type ApiResult } from "../lib/apiClient";

// ============================================================================
// Configuration
// ============================================================================

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
  // Ignore URL parsing errors
}

// ============================================================================
// Backend Response Types
// ============================================================================

/**
 * Backend response for upload operations
 */
interface UploadResponse {
  url?: string;
}

/**
 * OpenStreetMap Nominatim response format
 */
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

/**
 * Parsed reverse geocode result
 */
export interface ReverseGeocodeResult {
  city: string;
  neighborhood: string;
  displayName: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Upload an image file to the server
 *
 * Uploads a single image and returns its URL.
 * Automatically constructs full URL if backend returns relative path.
 *
 * @param file - File or Blob to upload
 * @returns ApiResult with uploaded file URL
 *
 * @example
 * ```ts
 * const fileInput = document.querySelector('input[type="file"]');
 * const file = fileInput.files[0];
 *
 * const result = await uploadImage(file);
 *
 * if (result.success) {
 *   console.log("Image URL:", result.data);
 *   // Use result.data as src for <img>
 * } else {
 *   console.error("Upload failed:", result.error?.message);
 * }
 * ```
 */
export async function uploadImage(
  file: File | Blob,
): Promise<ApiResult<string>> {
  const formData = new FormData();
  formData.append("file", file, file instanceof File ? file.name : "upload");

  const result = await apiClient.post<UploadResponse>("/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  if (result.success && result.data?.url) {
    const url = result.data.url;
    const fullUrl = url.startsWith("http")
      ? url
      : `${SERVER_ORIGIN}${url.startsWith("/") ? url : "/" + url}`;

    return {
      success: true,
      data: fullUrl,
    };
  }

  if (result.success && !result.data?.url) {
    return {
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "آپلود ناموفق: پاسخ سرور بدون URL",
        status: 500,
      },
    };
  }

  return result as unknown as ApiResult<string>;
}

/**
 * Reverse geocode coordinates to Persian location names
 *
 * Uses OpenStreetMap Nominatim API to convert lat/lng to city and neighborhood.
 * Returns Persian language results when available.
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns ApiResult with location information
 *
 * @example
 * ```ts
 * const result = await reverseGeocode(35.7306, 51.4138);
 *
 * if (result.success && result.data) {
 *   console.log("شهر:", result.data.city);
 *   console.log("محله:", result.data.neighborhood);
 *   console.log("آدرس کامل:", result.data.displayName);
 * }
 * ```
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ApiResult<ReverseGeocodeResult>> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat,
    )}&lon=${encodeURIComponent(lng)}&zoom=14&accept-language=fa`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Nakhsha/1.0 (+https://nakhsha.ir)",
      },
    });

    if (!response.ok) {
      throw new Error("Reverse geocode request failed");
    }

    const data: GeocodeResponse = await response.json();
    const address = data?.address || {};

    const city =
      address.city || address.town || address.village || address.state || "";
    const neighborhood =
      address.neighbourhood || address.suburb || address.city_district || "";

    return {
      success: true,
      data: {
        city,
        neighborhood,
        displayName:
          data.display_name || [city, neighborhood].filter(Boolean).join("، "),
      },
    };
  } catch (error) {
    // Return empty result instead of error for graceful fallback
    return {
      success: true,
      data: {
        city: "",
        neighborhood: "",
        displayName: "",
      },
    };
  }
}

// ============================================================================
// Type Exports for Consumers
// ============================================================================

export type { UploadResponse };
