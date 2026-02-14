/**
 * Authentication Service
 *
 * Fully typed authentication API using centralized apiClient.
 * Demonstrates best practices for:
 * - Strong typing with generics
 * - Proper error handling
 * - Token management
 * - Standardized response handling
 */

import { apiClient, TokenManager, type ApiResult } from "../lib/apiClient";
import type { User } from "../types/api";

/**
 * OTP Start Request
 */
interface OtpStartRequest {
  phone: string;
}

/**
 * OTP Start Response from backend
 */
interface OtpStartResponse {
  success: boolean;
  message: string;
  devCode?: string;
  retryAfterSeconds?: number;
}

/**
 * OTP Verification Request
 */
interface OtpVerifyRequest {
  phone: string;
  code: string;
}

/**
 * OTP Verification Response from backend
 */
interface OtpVerifyResponse {
  token: string;
  user: User;
}

/**
 * Auth Me Response from backend
 */
interface AuthMeResponse {
  user: User;
}

/**
 * Logout Response from backend
 */
interface LogoutResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Token Management (Re-exported from apiClient for convenience)
// ============================================================================

/**
 * Get the current authentication token
 */
export function getToken(): string | null {
  return TokenManager.get();
}

/**
 * Set authentication token
 * @param token - JWT token to store
 */
export function setToken(token: string): void {
  TokenManager.set(token);
}

/**
 * Clear authentication token
 */
export function clearToken(): void {
  TokenManager.clear();
}

/**
 * Check if user is authenticated (has valid token)
 */
export function isAuthenticated(): boolean {
  return !!getToken();
}

// ============================================================================
// Authentication API Methods
// ============================================================================

/**
 * Start OTP authentication flow
 *
 * @param phone - User's phone number (Persian format)
 * @returns Promise<ApiResult<OtpStartResponse>>
 *
 * @example
 * ```ts
 * const result = await otpStart("09123456789");
 * if (result.success) {
 *   console.log(result.data.message);
 *   if (result.data.devCode) {
 *     console.log("Dev code:", result.data.devCode);
 *   }
 * } else {
 *   console.error(result.error?.message);
 * }
 * ```
 */
export async function otpStart(
  phone: string,
): Promise<ApiResult<OtpStartResponse>> {
  return apiClient.post<OtpStartResponse>("/auth/otp/start", { phone });
}

/**
 * Verify OTP code and complete authentication
 *
 * @param phone - User's phone number
 * @param code - OTP code received via SMS
 * @returns Promise<ApiResult<OtpVerifyResponse>>
 *
 * @example
 * ```ts
 * const result = await verifyOtp("09123456789", "123456");
 * if (result.success) {
 *   const { token, user } = result.data;
 *   console.log("Logged in as:", user.name);
 *   // Token is automatically stored by this function
 * } else {
 *   console.error("Login failed:", result.error?.message);
 * }
 * ```
 */
export async function verifyOtp(
  phone: string,
  code: string,
): Promise<ApiResult<OtpVerifyResponse>> {
  const result = await apiClient.post<OtpVerifyResponse>("/auth/otp/verify", {
    phone,
    code,
  });

  // Store token on successful verification
  if (result.success && result.data?.token) {
    setToken(result.data.token);
  }

  return result;
}

/**
 * Get current authenticated user
 *
 * @returns Promise<ApiResult<User>>
 *
 * @example
 * ```ts
 * const result = await me();
 * if (result.success) {
 *   console.log("Current user:", result.data);
 * } else if (result.error?.code === "UNAUTHORIZED") {
 *   // Redirect to login
 * }
 * ```
 */
export async function me(): Promise<ApiResult<User>> {
  const result = await apiClient.get<AuthMeResponse>("/auth/me");

  // Extract user from wrapper response
  if (result.success && result.data?.user) {
    return {
      success: true,
      data: result.data.user,
    };
  }

  return result as unknown as ApiResult<User>;
}

/**
 * Logout the current user
 * Clears token and calls backend logout endpoint
 *
 * @returns Promise<ApiResult<LogoutResponse>>
 *
 * @example
 * ```ts
 * const result = await logout();
 * if (result.success) {
 *   console.log("Logged out successfully");
 *   // Redirect to home page
 * }
 * ```
 */
export async function logout(): Promise<ApiResult<LogoutResponse>> {
  const result = await apiClient.post<LogoutResponse>("/auth/logout");

  // Always clear token, even if backend call fails
  clearToken();

  return result;
}

/**
 * Refresh authentication token
 *
 * @returns Promise<ApiResult<{ token: string }>>
 *
 * @example
 * ```ts
 * const result = await refreshToken();
 * if (result.success) {
 *   console.log("Token refreshed");
 * } else {
 *   // Token expired, redirect to login
 * }
 * ```
 */
export async function refreshToken(): Promise<ApiResult<{ token: string }>> {
  const result = await apiClient.post<{ token: string }>("/auth/refresh");

  // Store new token on success
  if (result.success && result.data?.token) {
    setToken(result.data.token);
  }

  return result;
}

/**
 * Update user profile
 *
 * @param updates - Partial user data to update
 * @returns Promise<ApiResult<User>>
 *
 * @example
 * ```ts
 * const result = await updateProfile({
 *   name: "John Doe",
 *   bio: "Software developer",
 * });
 * if (result.success) {
 *   console.log("Profile updated:", result.data);
 * }
 * ```
 */
export async function updateProfile(
  updates: Partial<Pick<User, "name" | "bio" | "handle" | "location">>,
): Promise<ApiResult<User>> {
  const result = await apiClient.patch<{ user: User }>(
    "/auth/profile",
    updates,
  );

  // Extract user from wrapper response
  if (result.success && result.data?.user) {
    return {
      success: true,
      data: result.data.user,
    };
  }

  return result as unknown as ApiResult<User>;
}

/**
 * Upload user avatar
 *
 * @param file - Image file to upload
 * @returns Promise<ApiResult<User>>
 *
 * @example
 * ```ts
 * const result = await uploadAvatar(imageFile);
 * if (result.success) {
 *   console.log("New avatar URL:", result.data.avatar);
 * }
 * ```
 */
export async function uploadAvatar(file: File): Promise<ApiResult<User>> {
  const formData = new FormData();
  formData.append("avatar", file);

  const result = await apiClient.post<{ user: User }>(
    "/auth/avatar",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  // Extract user from wrapper response
  if (result.success && result.data?.user) {
    return {
      success: true,
      data: result.data.user,
    };
  }

  return result as unknown as ApiResult<User>;
}

// ============================================================================
// Type Exports for Consumers
// ============================================================================

export type {
  OtpStartRequest,
  OtpStartResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
  AuthMeResponse,
  LogoutResponse,
};
