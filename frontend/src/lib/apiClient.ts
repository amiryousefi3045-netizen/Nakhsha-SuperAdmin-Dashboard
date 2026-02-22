/**
 * Centralized API Client
 *
 * Provides a typed, interceptor-based HTTP client with:
 * - Automatic authentication token injection
 * - Standardized response wrapping
 * - Comprehensive error handling
 * - Request/response logging in development
 * - Generic methods with full TypeScript support
 */

import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";
import type {
  ApiResult,
  ApiError,
  RequestConfig,
  PaginatedResult,
  PaginationMeta,
} from "../types/apiClient";

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE || "/api";
const DEFAULT_TIMEOUT = 10000;
const TOKEN_KEY = "nakhsha_token";

// Development logging flag
const isDev = import.meta.env.DEV;

/**
 * Token management utilities.
 *
 * Security model:
 *  - The token lives in a module-level variable (_memoryToken) — never in the DOM or
 *    accessible to arbitrary JS via window/document.
 *  - On startup the module checks localStorage once: if a persisted token is found
 *    (placed there by a previous "remember me" login) it is loaded into memory and the
 *    localStorage copy is left intact so the session survives page reloads.
 *  - TokenManager.set(token, true)  → write to memory AND localStorage ("remember me").
 *  - TokenManager.set(token, false) → write to memory ONLY (token is lost on tab close).
 *  - TokenManager.clear()          → wipe both memory and localStorage unconditionally.
 */
let _memoryToken: string | null = null;

// Hydrate from localStorage once at module load (restores "remember me" sessions)
try {
  const persisted = localStorage.getItem(TOKEN_KEY);
  if (persisted) _memoryToken = persisted;
} catch {
  // localStorage not available (e.g. private browsing with restrictions)
}

class TokenManager {
  static get(): string | null {
    return _memoryToken;
  }

  /**
   * @param token     JWT to store.
   * @param persist   When true the token is also written to localStorage so it
   *                  survives full page reloads ("remember me" behaviour).
   *                  Defaults to false (session-only / in-memory).
   */
  static set(token: string, persist = false): void {
    _memoryToken = token;
    if (persist) {
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch (error) {
        console.warn("Failed to persist token:", error);
      }
    }
  }

  /** Remove token from both memory and localStorage. */
  static clear(): void {
    _memoryToken = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      console.warn("Failed to clear persisted token:", error);
    }
  }
}

/**
 * Error normalization utility
 * Converts any error into a standardized ApiError
 */
function normalizeError(error: unknown): ApiError {
  // Axios error with response
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<any>;

    if (axiosError.response) {
      const { status, data } = axiosError.response;

      // Backend returned error object
      if (data?.error) {
        return {
          code: data.error.code || getErrorCodeFromStatus(status),
          message: data.error.message || getDefaultErrorMessage(status),
          details: data.error.details,
          status,
        };
      }

      // Backend returned simple message
      if (data?.message) {
        return {
          code: getErrorCodeFromStatus(status),
          message: data.message,
          status,
        };
      }

      // No specific error message from backend
      return {
        code: getErrorCodeFromStatus(status),
        message: getDefaultErrorMessage(status),
        status,
      };
    }

    // Network error (no response)
    if (axiosError.request) {
      return {
        code: "NETWORK_ERROR",
        message:
          "خطا در ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.",
        details: axiosError.message,
      };
    }

    // Request setup error
    return {
      code: "UNKNOWN_ERROR",
      message: axiosError.message || "خطای نامشخص رخ داد",
    };
  }

  // Generic error
  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message,
    };
  }

  // Unknown error type
  return {
    code: "UNKNOWN_ERROR",
    message: "خطای نامشخص رخ داد",
    details: error,
  };
}

/**
 * Map HTTP status codes to error codes
 */
function getErrorCodeFromStatus(status: number): string {
  const statusMap: Record<number, string> = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    408: "TIMEOUT_ERROR",
    500: "SERVER_ERROR",
    502: "SERVER_ERROR",
    503: "SERVER_ERROR",
    504: "TIMEOUT_ERROR",
  };

  return statusMap[status] || "UNKNOWN_ERROR";
}

/**
 * Get user-friendly error messages for status codes
 */
function getDefaultErrorMessage(status: number): string {
  const messages: Record<number, string> = {
    400: "درخواست نامعتبر است",
    401: "لطفاً وارد حساب کاربری خود شوید",
    403: "شما دسترسی لازم را ندارید",
    404: "موردی یافت نشد",
    408: "زمان درخواست به پایان رسید",
    500: "خطای سرور رخ داد",
    502: "سرور در دسترس نیست",
    503: "سرویس موقتاً در دسترس نیست",
    504: "زمان اتصال به سرور تمام شد",
  };

  return messages[status] || "خطایی رخ داد";
}

/**
 * Main API Client Class
 */
class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: DEFAULT_TIMEOUT,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  /**
   * Configure request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor: Add auth token
    this.instance.interceptors.request.use(
      (config) => {
        // Add authorization token if available
        const token = TokenManager.get();
        if (token && !config.headers?.skipAuth) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Remove custom flags from headers
        delete config.headers?.skipAuth;

        // Log request in development
        if (isDev) {
          console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
            params: config.params,
            data: config.data,
          });
        }

        return config;
      },
      (error) => {
        if (isDev) {
          console.error("[API] Request setup error:", error);
        }
        return Promise.reject(error);
      },
    );

    // Response interceptor: Normalize responses and errors
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        // Log response in development
        if (isDev) {
          console.log(
            `[API] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`,
            response.data,
          );
        }
        return response;
      },
      (error: AxiosError) => {
        // Log error in development
        if (isDev) {
          console.error("[API] Response error:", {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response?.status,
            data: error.response?.data,
          });
        }

        // Handle 401 Unauthorized - clear token and optionally redirect
        if (error.response?.status === 401) {
          TokenManager.clear();
          // Optionally dispatch an event for auth state management
          window.dispatchEvent(new CustomEvent("auth:unauthorized"));
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Wrap response data in standardized ApiResult
   */
  private wrapSuccess<T>(data: T): ApiResult<T> {
    return {
      success: true,
      data,
    };
  }

  /**
   * Wrap error in standardized ApiResult
   */
  private wrapError<T>(error: unknown): ApiResult<T> {
    const normalizedError = normalizeError(error);

    if (!isDev) {
      // Log errors in production for monitoring
      console.error("[API Error]", normalizedError);
    }

    return {
      success: false,
      error: normalizedError,
    };
  }

  /**
   * Generic GET request
   */
  async get<T>(url: string, config?: RequestConfig): Promise<ApiResult<T>> {
    try {
      const response = await this.instance.get<T>(
        url,
        config as AxiosRequestConfig,
      );
      return this.wrapSuccess(response.data);
    } catch (error) {
      return this.wrapError<T>(error);
    }
  }

  /**
   * Generic POST request
   */
  async post<T>(
    url: string,
    data?: unknown,
    config?: RequestConfig,
  ): Promise<ApiResult<T>> {
    try {
      const response = await this.instance.post<T>(
        url,
        data,
        config as AxiosRequestConfig,
      );
      return this.wrapSuccess(response.data);
    } catch (error) {
      return this.wrapError<T>(error);
    }
  }

  /**
   * Generic PUT request
   */
  async put<T>(
    url: string,
    data?: unknown,
    config?: RequestConfig,
  ): Promise<ApiResult<T>> {
    try {
      const response = await this.instance.put<T>(
        url,
        data,
        config as AxiosRequestConfig,
      );
      return this.wrapSuccess(response.data);
    } catch (error) {
      return this.wrapError<T>(error);
    }
  }

  /**
   * Generic PATCH request
   */
  async patch<T>(
    url: string,
    data?: unknown,
    config?: RequestConfig,
  ): Promise<ApiResult<T>> {
    try {
      const response = await this.instance.patch<T>(
        url,
        data,
        config as AxiosRequestConfig,
      );
      return this.wrapSuccess(response.data);
    } catch (error) {
      return this.wrapError<T>(error);
    }
  }

  /**
   * Generic DELETE request
   */
  async delete<T>(url: string, config?: RequestConfig): Promise<ApiResult<T>> {
    try {
      const response = await this.instance.delete<T>(
        url,
        config as AxiosRequestConfig,
      );
      return this.wrapSuccess(response.data);
    } catch (error) {
      return this.wrapError<T>(error);
    }
  }

  /**
   * Helper for paginated GET requests
   */
  async getPaginated<T>(
    url: string,
    params?: { page?: number; limit?: number; [key: string]: any },
  ): Promise<PaginatedResult<T>> {
    try {
      const response = await this.instance.get<{
        items: T[];
        total: number;
        page: number;
        limit: number;
      }>(url, { params });

      const { items, total, page, limit } = response.data;

      return {
        success: true,
        data: items,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      return this.wrapError<T[]>(error);
    }
  }

  /**
   * Direct access to axios instance for advanced use cases
   */
  get axios(): AxiosInstance {
    return this.instance;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export token manager for services that need it
export { TokenManager };

// Re-export types for convenience
export type {
  ApiResult,
  ApiError,
  RequestConfig,
  PaginatedResult,
  PaginationMeta,
};
export { ApiErrorCode } from "../types/apiClient";
