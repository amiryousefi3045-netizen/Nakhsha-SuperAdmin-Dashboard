import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// Create a shared axios instance with defaults
export const http = axios.create({ baseURL: API_BASE });

// Add token to all requests if it exists
http.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Ignore storage errors
  }
  return config;
});

/**
 * Build a query string from a params object, skipping empty values
 * @param params Record of string keys to any values
 * @returns Record with non-empty values only
 */
export function buildQuery(params: Record<string, any>): Record<string, any> {
  return Object.entries(params || {}).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);
}

// Export common response types for services
export interface ApiResponse<T> {
  items?: T[];
  total?: number;
  page?: number;
  limit?: number;
  data?: T;
}

// Re-export axios types for convenience
export type { AxiosError, AxiosResponse } from "axios";
