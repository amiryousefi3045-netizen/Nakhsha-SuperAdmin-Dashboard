/**
 * Health Service v2
 *
 * Refactored to use centralized apiClient with standardized responses.
 *
 * Features:
 * - Health check to verify backend availability
 * - Returns ApiResult<boolean> for consistent error handling
 * - Configurable timeout for quick failure detection
 *
 * @example
 * ```ts
 * const result = await checkHealth();
 * if (result.success && result.data) {
 *   console.log("Backend is healthy");
 * }
 * ```
 */

import { apiClient, type ApiResult } from "../lib/apiClient";

// ============================================================================
// Backend Response Types
// ============================================================================

/**
 * Backend health check response
 */
interface HealthResponse {
  ok?: boolean;
  status?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Check backend health status
 *
 * Performs a lightweight health check to verify backend is responding.
 * Uses a short timeout (2.5s) for quick failure detection.
 *
 * @returns ApiResult<boolean> indicating backend health
 *
 * @example
 * ```ts
 * const result = await checkHealth();
 *
 * if (result.success && result.data) {
 *   console.log("✅ Backend is healthy");
 * } else if (result.success && !result.data) {
 *   console.warn("⚠️ Backend responded but not healthy");
 * } else {
 *   console.error("❌ Backend unreachable:", result.error?.message);
 * }
 * ```
 */
export async function checkHealth(): Promise<ApiResult<boolean>> {
  const result = await apiClient.get<HealthResponse>("/health", {
    timeout: 2500, // 2.5 second timeout for quick detection
  });

  if (result.success && result.data) {
    return {
      success: true,
      data: !!result.data.ok,
    };
  }

  // If request failed, backend is unhealthy
  return {
    success: true,
    data: false,
  };
}

// ============================================================================
// Type Exports for Consumers
// ============================================================================

export type { HealthResponse };
