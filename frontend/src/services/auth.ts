import { AxiosError } from "axios";
import { http } from "../lib/http";
import type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ApiResponse,
} from "../types/api";

interface ApiError extends Error {
  status?: number;
  details?: string[];
}

interface OtpError extends Error {
  status?: number;
  retryAfterSeconds?: number;
}

export async function register(
  payload: RegisterRequest
): Promise<AuthResponse> {
  try {
    console.log("Calling register API with:", { ...payload, password: "***" });
    const response = await http.post<ApiResponse<AuthResponse>>(
      "/auth/register",
      payload
    );
    console.log("Register API response:", response.status);
    const { data } = response;
    if (data?.data?.token) localStorage.setItem("token", data.data.token);
    if (data?.data?.user)
      localStorage.setItem("user", JSON.stringify(data.data.user));
    return data.data!;
  } catch (error) {
    const axiosError = error as AxiosError<{
      message: string;
      details?: string[];
    }>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    console.error("Register API error:", status, body || axiosError.message);
    const e = new Error(body?.message || "Registration failed") as ApiError;
    e.status = status;
    e.details = body?.details;
    throw e;
  }
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  try {
    const { data } = await http.post<ApiResponse<AuthResponse>>(
      "/auth/login",
      payload
    );
    if (data?.data?.token) localStorage.setItem("token", data.data.token);
    if (data?.data?.user)
      localStorage.setItem("user", JSON.stringify(data.data.user));
    return data.data!;
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    console.error("Login API error:", status, body || axiosError.message);
    const e = new Error(body?.message || "Login failed") as ApiError;
    e.status = status;
    throw e;
  }
}

export async function otpStart(
  phone: string
): Promise<{
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
): Promise<{ token: string; user: any }> {
  try {
    const { data } = await http.post<ApiResponse<{ token: string; user: any }>>(
      "/auth/otp/verify",
      { phone, code }
    );
    const result = data?.data!;
    if (result.token) localStorage.setItem("token", result.token);
    if (result.user) localStorage.setItem("user", JSON.stringify(result.user));
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
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
