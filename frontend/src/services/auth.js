import axios from "axios";

// For auth endpoints, always go directly to the backend server
// This avoids issues with Vite's proxy in development mode
const API_BASE = "http://localhost:5000/api";

// Shared axios instance
const http = axios.create({ baseURL: API_BASE });

// Attach token to requests
http.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Also attach token to the default axios instance so other services using axios
// (like recipes.js) automatically include Authorization header.
axios.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore storage errors
  }
  return config;
});

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

export async function me() {
  const { data } = await http.get(`/auth/me`);
  return data?.user;
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
