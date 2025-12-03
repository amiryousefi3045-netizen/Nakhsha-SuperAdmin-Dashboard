import { http } from "../lib/http";

export async function register(payload) {
  try {
    console.log("Calling register API with:", { ...payload, password: "***" });
    const response = await http.post(`/auth/register`, payload);
    console.log("Register API response:", response.status);
    const { data } = response;
    if (data?.token) localStorage.setItem("token", data.token);
    if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));
    return data;
  } catch (error) {
    const status = error.response?.status;
    const body = error.response?.data;
    console.error("Register API error:", status, body || error.message);
    const e = new Error(body?.message || "Registration failed");
    e.status = status;
    e.details = body?.details;
    throw e;
  }
}

export async function login(payload) {
  try {
    const { data } = await http.post(`/auth/login`, payload);
    if (data?.token) localStorage.setItem("token", data.token);
    if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));
    return data;
  } catch (error) {
    const status = error.response?.status;
    const body = error.response?.data;
    console.error("Login API error:", status, body || error.message);
    const e = new Error(body?.message || "Login failed");
    e.status = status;
    throw e;
  }
}

export async function otpStart(phone) {
  try {
    const { data } = await http.post(`/auth/otp/start`, { phone });
    return {
      success: true,
      message: data?.message,
      devCode: data?.devCode,
      retryAfterSeconds: data?.retryAfterSeconds,
    };
  } catch (error) {
    const status = error.response?.status;
    const body = error.response?.data;
    const e = new Error(body?.message || "OTP start failed");
    e.status = status;
    e.retryAfterSeconds = body?.retryAfterSeconds;
    throw e;
  }
}

export async function otpVerify(phone, code) {
  try {
    const { data } = await http.post(`/auth/otp/verify`, { phone, code });
    if (data?.token) localStorage.setItem("token", data.token);
    if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));
    return data;
  } catch (error) {
    const status = error.response?.status;
    const body = error.response?.data;
    const e = new Error(body?.message || "OTP verify failed");
    e.status = status;
    e.retryAfterSeconds = body?.retryAfterSeconds;
    throw e;
  }
}

export async function me() {
  const { data } = await http.get(`/auth/me`);
  return data?.user;
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
