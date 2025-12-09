import { AxiosError } from "axios";
import { http } from "../lib/http";
import type { User, ApiResponse } from "../types/api";

const TOKEN_KEY = "token";

interface OtpError extends Error {
  status?: number;
  retryAfterSeconds?: number;
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

export async function otpStart(phone: string): Promise<{
  success: boolean;
  message?: string;
  devCode?: string;
  retryAfterSeconds?: number;
}> {
  try {
    const { data } = await http.post<
      ApiResponse<{
        success: boolean;
        message: string;
        devCode?: string;
        retryAfterSeconds?: number;
      }>
    >("/auth/otp/start", { phone });
    return {
      success: true,
      message: data?.data?.message,
      devCode: (data?.data as any)?.devCode,
      retryAfterSeconds: (data?.data as any)?.retryAfterSeconds,
    };
  } catch (error) {
    const axiosError = error as AxiosError<{
      message?: string;
      retryAfterSeconds?: number;
    }>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    const e = new Error(body?.message || "OTP start failed") as OtpError;
    e.status = status;
    e.retryAfterSeconds = body?.retryAfterSeconds;
    throw e;
  }
}

export async function otpVerify(
  phone: string,
  code: string
): Promise<{ token: string; user: User }> {
  try {
    const { data } = await http.post<
      ApiResponse<{ token: string; user: User }>
    >("/auth/otp/verify", { phone, code });
    const result = data?.data!;
    if (result.token) setToken(result.token);
    return result;
  } catch (error) {
    const axiosError = error as AxiosError<{
      message?: string;
      retryAfterSeconds?: number;
    }>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    const e = new Error(body?.message || "OTP verify failed") as OtpError;
    e.status = status;
    e.retryAfterSeconds = body?.retryAfterSeconds;
    throw e;
  }
}

export async function me(): Promise<User | null> {
  try {
    const { data } = await http.get<ApiResponse<{ user: User }>>("/auth/me");
    return data?.data?.user || null;
  } catch {
    return null;
  }
}

export function logout(): void {
  clearToken();
}
