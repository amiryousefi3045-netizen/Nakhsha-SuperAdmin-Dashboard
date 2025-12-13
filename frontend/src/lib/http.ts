import axios from "axios";
import { getToken } from "../services/auth";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// Create a shared axios instance with defaults
export const http = axios.create({
  baseURL: API_BASE,
  timeout: 10000, // 10 second timeout
});

// Add token to all requests if it exists
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Build a query string from a params object, skipping empty values
 * @param params Record of string keys to any values
 * @returns Record with non-empty values only
 */
export function buildQuery(params: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};

  function walk(prefix: string | null, obj: any) {
    if (obj === undefined || obj === null || obj === "") return;
    if (typeof obj === "object" && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}[${k}]` : k;
        walk(key, v);
      }
    } else if (Array.isArray(obj)) {
      // repeat array items: key[]=v1&key[]=v2
      for (const v of obj) {
        const key = prefix ? `${prefix}[]` : "";
        if (key) {
          out[key] = out[key] || [];
          out[key].push(v);
        }
      }
    } else {
      if (prefix) out[prefix] = obj;
      else out[String(obj)] = obj;
    }
  }

  walk(null, params || {});
  return out;
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
