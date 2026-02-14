/**
 * Centralized API Client Type Definitions
 * Provides standardized types for all API interactions
 */

/**
 * Standardized API Result wrapper
 * All API calls return this shape for consistency
 */
export interface ApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

/**
 * Standardized API Error shape
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  status?: number;
}

/**
 * Paginated response metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Paginated API response
 */
export interface PaginatedResult<T> extends ApiResult<T[]> {
  meta?: PaginationMeta;
}

/**
 * Request configuration options
 */
export interface RequestConfig {
  timeout?: number;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  skipAuth?: boolean;
  skipErrorHandler?: boolean;
}

/**
 * Error codes enum for consistent error handling
 */
export enum ApiErrorCode {
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  SERVER_ERROR = "SERVER_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}
