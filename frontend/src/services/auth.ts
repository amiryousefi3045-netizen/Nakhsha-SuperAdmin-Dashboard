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

/** Successful OTP login → full session. */
export interface SessionPayload {
  token: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
  user: User;
}

/** OTP verified but the account has 2FA → challenge for the TOTP step. */
export interface TotpChallengePayload {
  requiresTotp: true;
  challenge: string;
  phone: string;
}

export type OtpVerifyResponse = SessionPayload | TotpChallengePayload;

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
 *
 * If the account has 2FA enabled the backend instead answers 202 with
 * `{ requiresTotp, challenge, phone }` — the caller must then complete the
 * TOTP step via `verifyTotp` before any session tokens are issued.
 *
 * @param rememberMe  When true the token is persisted to localStorage so the
 *                    session survives full page reloads. Defaults to false
 *                    (in-memory / session-only — safer against XSS).
 */
export async function verifyOtp(
  phone: string,
  code: string,
  rememberMe = false,
): Promise<OtpVerifyResponse> {
  const result = await apiClient.post<OtpVerifyResponse>("/auth/otp/verify", {
    phone,
    code,
  });
  if (!result.success) throw result.error!;
  const payload = result.data!;

  if ("requiresTotp" in payload && payload.requiresTotp) {
    // 2FA challenge — no token yet; do not store anything.
    return payload;
  }

  if ("token" in payload && payload.token) {
    TokenManager.set(payload.token, rememberMe);
  }
  return payload;
}

/**
 * Step 3 of a 2FA-protected OTP login: exchange the short-lived challenge
 * (returned by `verifyOtp`) plus a valid TOTP code for a full session.
 */
export async function verifyTotp(
  challenge: string,
  totpCode: string,
  rememberMe = false,
): Promise<SessionPayload> {
  const result = await apiClient.post<SessionPayload>("/auth/otp/totp", {
    challenge,
    totpCode,
  });
  if (!result.success) throw result.error!;
  const payload = result.data!;
  if (payload.token) TokenManager.set(payload.token, rememberMe);
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
