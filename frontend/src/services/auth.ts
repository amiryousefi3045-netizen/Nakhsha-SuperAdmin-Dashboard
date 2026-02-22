/**
 * Authentication Service
 *
 * Handles OTP login flow, token management, and current-user operations.
 * Uses the centralized apiClient for consistent normalizeError handling.
 */

import { apiClient, TokenManager } from "../lib/apiClient";
import type { User } from "../types/api";

// ── Token helpers (thin delegates to TokenManager) ────────────────────────

export function getToken(): string | null {
  return TokenManager.get();
}

export function setToken(token: string): void {
  TokenManager.set(token);
}

export function clearToken(): void {
  TokenManager.clear();
}

export function isAuthenticated(): boolean {
  return !!TokenManager.get();
}

// ── Response shapes ────────────────────────────────────────────────────────

export interface OtpStartResponse {
  success: boolean;
  message: string;
  devCode?: string;
  retryAfterSeconds?: number;
}

// ── API functions ──────────────────────────────────────────────────────────

/**
 * Step 1 of OTP flow: request an OTP code to be sent to `phone`.
 * Throws ApiError (with `.status` for 429 rate-limit, `.details.retryAfterSeconds`).
 */
export async function otpStart(phone: string): Promise<OtpStartResponse> {
  const result = await apiClient.post<OtpStartResponse>("/auth/otp/start", {
    phone,
  });
  if (!result.success) throw result.error!;
  return result.data!;
}

/**
 * Step 2 of OTP flow: verify the code and receive a JWT token + user.
 * Automatically persists the token on success.
 */
export async function verifyOtp(
  phone: string,
  code: string,
): Promise<{ token: string; user: User }> {
  const result = await apiClient.post<{ token: string; user: User }>(
    "/auth/otp/verify",
    { phone, code },
  );
  if (!result.success) throw result.error!;
  const payload = result.data!;
  if (payload.token) TokenManager.set(payload.token);
  return payload;
}

/**
 * Fetch the currently authenticated user.
 * Throws ApiError with code "UNAUTHORIZED" when no valid session exists.
 */
export async function me(): Promise<User> {
  const result = await apiClient.get<{ user: User }>("/auth/me");
  if (!result.success) throw result.error!;
  return result.data!.user;
}

/**
 * Update the current user's own profile fields.
 */
export async function updateMe(payload: {
  name?: string;
  bio?: string;
  avatar?: string;
  location?: { city?: string; neighborhood?: string };
}): Promise<User> {
  const result = await apiClient.patch<{ user: User }>("/users/me", payload);
  if (!result.success) throw result.error!;
  return result.data!.user;
}

/**
 * Upload a new avatar image for the current user.
 */
export async function uploadAvatar(file: File): Promise<User> {
  const formData = new FormData();
  formData.append("avatar", file);
  const result = await apiClient.post<{ user: User }>(
    "/auth/avatar",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  if (!result.success) throw result.error!;
  return result.data!.user;
}

/**
 * Clear the local token (client-side logout).
 * Call this instead of hitting a logout endpoint.
 */
export function logout(): void {
  TokenManager.clear();
}
