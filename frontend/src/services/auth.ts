import { AxiosError } from "axios";
import { http } from "../lib/http";
import type { User, ErrorResponse } from "../types/api";

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
    const { data } = await http.post<{
      success: boolean;
      message: string;
      devCode?: string;
      retryAfterSeconds?: number;
    }>("/auth/otp/start", { phone });
    // Backend returns data at root level, not nested in data.data
    return {
      success: data.success,
      message: data.message,
      devCode: data.devCode,
      retryAfterSeconds: data.retryAfterSeconds,
    };
  } catch (error) {
    const axiosError = error as AxiosError<ErrorResponse>;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data?.error;
    const e = new Error(errorData?.message || "OTP start failed") as OtpError;
    e.status = status;
    e.retryAfterSeconds = errorData?.details?.retryAfterSeconds;
    throw e;
  }
}

export async function otpVerify(
  phone: string,
  code: string
): Promise<{ token: string; user: User }> {
  try {
    const { data } = await http.post<{
      token: string;
      user: User;
    }>("/auth/otp/verify", { phone, code });
    // Backend returns data at root level, not nested in data.data
    if (data.token) setToken(data.token);
    return { token: data.token, user: data.user };
  } catch (error) {
    const axiosError = error as AxiosError<ErrorResponse>;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data?.error;
    const e = new Error(errorData?.message || "OTP verify failed") as OtpError;
    e.status = status;
    e.retryAfterSeconds = errorData?.details?.retryAfterSeconds;
    throw e;
  }
}

export async function me(): Promise<User | null> {
  try {
    const { data } = await http.get<{ user: User }>("/auth/me");
    return data?.user || null;
  } catch {
    return null;
  }
}

export function logout(): void {
  clearToken();
}
