import { AxiosError } from "axios";
import { http } from "../lib/http";
import type { User } from "../types/api";

const TOKEN_KEY = "nakhsha_token";

interface NormalizedError {
  code: string;
  message: string;
  details?: any;
}

// Token helpers
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage errors
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

// Helper function to normalize errors
function normalizeError(error: any): NormalizedError {
  if (error instanceof AxiosError && error.response?.data?.error) {
    const errorData = error.response.data.error;
    return {
      code: errorData.code || "UNKNOWN_ERROR",
      message: errorData.message || "An unknown error occurred",
      details: errorData.details,
    };
  }

  return {
    code: "NETWORK_ERROR",
    message: error.message || "Network error occurred",
    details: null,
  };
}

export async function otpStart(phone: string): Promise<{
  success: boolean;
  message?: string;
  devCode?: string;
  retryAfterSeconds?: number;
}> {
  try {
    const { data } = await http.post<{
      success: boolean;
      message: string;
      devCode?: string;
      retryAfterSeconds?: number;
    }>("/auth/otp/start", { phone });

    return {
      success: data.success,
      message: data.message,
      devCode: data.devCode,
      retryAfterSeconds: data.retryAfterSeconds,
    };
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function verifyOtp(
  phone: string,
  code: string
): Promise<{ token: string; user: User }> {
  try {
    const { data } = await http.post<{
      token: string;
      user: User;
    }>("/auth/otp/verify", { phone, code });

    if (data.token) setToken(data.token);
    return { token: data.token, user: data.user };
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function me(): Promise<User> {
  try {
    const { data } = await http.get<{ user: User }>("/auth/me");
    return data.user;
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function updateMe(payload: {
  name?: string;
  bio?: string;
  avatar?: string;
  location?: {
    city?: string;
    neighborhood?: string;
  };
}): Promise<User> {
  try {
    // Filter payload to only include allowed fields
    const allowedPayload: any = {};

    if (payload.name !== undefined) allowedPayload.name = payload.name;
    if (payload.bio !== undefined) allowedPayload.bio = payload.bio;
    if (payload.avatar !== undefined) allowedPayload.avatar = payload.avatar;

    if (payload.location) {
      if (
        payload.location.city !== undefined ||
        payload.location.neighborhood !== undefined
      ) {
        allowedPayload.location = {};
        if (payload.location.city !== undefined) {
          allowedPayload.location.city = payload.location.city;
        }
        if (payload.location.neighborhood !== undefined) {
          allowedPayload.location.neighborhood = payload.location.neighborhood;
        }
      }
    }

    const { data } = await http.patch<{ user: User }>(
      "/users/me",
      allowedPayload
    );
    return data.user;
  } catch (error) {
    throw normalizeError(error);
  }
}

export function logout(): void {
  clearToken();
}
