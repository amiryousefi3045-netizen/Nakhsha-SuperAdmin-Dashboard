/**
 * Health Service
 *
 * Lightweight backend availability check.
 * Returns a plain boolean so callers can use it directly without ApiResult unwrapping.
 */

import { apiClient } from "../lib/apiClient";

interface HealthResponse {
  ok?: boolean;
  status?: string;
}

/**
 * Ping the backend health endpoint.
 * Returns `true` when the backend is up and healthy, `false` otherwise.
 * Never throws — failures are silently treated as unhealthy.
 */
export async function checkHealth(): Promise<boolean> {
  const result = await apiClient.get<HealthResponse>("/health", {
    timeout: 2500,
  });
  if (!result.success) return false;
  return !!result.data?.ok;
}
