/**
 * Health Service
 *
 * Backend availability check used by the global status banner.
 *
 * The backend exposes three distinct states (see backend/routes/health.js):
 *   - online   — reachable, and the database is connected.
 *   - degraded — the API answers, but MongoDB is disconnected, so reads that
 *                need the database will fail. Telling the user "the server
 *                is unreachable" here would be wrong and actively misleading:
 *                support would chase a network problem that does not exist.
 *   - offline  — the API itself could not be reached.
 *
 * Distinguishing these is the whole point of the stage-34 change that made
 * the backend's `ok` field truthful; the banner simply reflects it.
 */

import { apiClient } from "../lib/apiClient";

export type ServiceStatus = "online" | "degraded" | "offline";

export interface HealthResponse {
  /** Truthful as of stage 34: true only when MongoDB is actually connected. */
  ok?: boolean;
  status?: "ok" | "degraded" | "draining";
  db?: "up" | "down";
  dbState?: string;
  uptimeSeconds?: number;
  environment?: string;
  version?: string;
}

/**
 * Classify a health payload.
 *
 * Exported separately from the request so the decision is unit-testable
 * without any network mocking.
 */
export function classifyHealth(body?: HealthResponse | null): ServiceStatus {
  if (!body) return "offline";
  // `db: "down"` is the authoritative signal; `status` covers the draining case.
  if (body.db === "down" || body.status === "degraded" || body.ok === false) {
    return "degraded";
  }
  if (body.status === "draining") return "degraded";
  return "online";
}

/**
 * Ping the backend health endpoint and classify the result.
 * Never throws — any failure is reported as "offline".
 */
export async function getServiceStatus(): Promise<ServiceStatus> {
  try {
    const result = await apiClient.get<HealthResponse>("/health", {
      timeout: 2500,
    });
    if (!result.success) return "offline";
    return classifyHealth(result.data);
  } catch {
    return "offline";
  }
}

/**
 * Boolean convenience wrapper, kept for existing callers.
 * Returns `true` only for a fully healthy service.
 */
export async function checkHealth(): Promise<boolean> {
  return (await getServiceStatus()) === "online";
}
