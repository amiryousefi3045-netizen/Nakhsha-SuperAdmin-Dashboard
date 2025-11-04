import axios from "axios";
// Reuse auth interceptor
import "./auth";
// Re-export utilities from recipes service for convenience
import { uploadImage, reverseGeocode } from "./recipes";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
let SERVER_ORIGIN = "";
try {
  if (/^https?:\/\//i.test(API_BASE)) {
    SERVER_ORIGIN = new URL(API_BASE).origin;
  } else if (import.meta.env.VITE_SERVER_ORIGIN) {
    SERVER_ORIGIN = import.meta.env.VITE_SERVER_ORIGIN;
  } else if (typeof window !== "undefined" && window.location) {
    SERVER_ORIGIN = `${window.location.protocol}//${window.location.hostname}:5000`;
  }
} catch (e) {
  // ignore but keep a lightweight warning for debugging
  // (some environments may not have window or URL available)
  console.warn("determine SERVER_ORIGIN failed", e?.message || e);
}

export async function fetchCrafts(opts = {}) {
  // opts: bounds, filters, page, limit, q, sort, lat, lng
  try {
    const { data } = await axios.get(`${API_BASE}/crafts`, { params: opts });
    // If running in dev and backend returned no items, fallback to lightweight mock so map/dev UI is usable
    if (
      import.meta.env.DEV &&
      Array.isArray(data.items) &&
      data.items.length === 0
    ) {
      const mock = [
        {
          id: "dev-1",
          title: "گلیم دست‌باف",
          image: `${SERVER_ORIGIN}/uploads/carpet.jpg`,
          location: "اصفهان، جلفا",
          lat: 32.64,
          lng: 51.67,
        },
        {
          id: "dev-2",
          title: "سفال لعابی",
          image:
            "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=800&q=60",
          location: "تهران، بازار",
          lat: 35.73,
          lng: 51.41,
        },
      ];
      return {
        items: mock,
        total: mock.length,
        page: opts.page || 1,
        limit: opts.limit || mock.length,
      };
    }

    return {
      items: data.items || [],
      total: data.total || 0,
      page: data.page || opts.page || 1,
      limit: data.limit || opts.limit || 50,
    };
  } catch (err) {
    console.warn("/api/crafts failed, using mock data", err?.message);
    // minimal mock for dev
    const mock = [
      {
        id: "dev-1",
        title: "گلیم دست‌باف",
        image: `${SERVER_ORIGIN}/uploads/carpet.jpg`,
        location: "اصفهان، جلفا",
        lat: 32.64,
        lng: 51.67,
      },
      {
        id: "dev-2",
        title: "سفال لعابی",
        image:
          "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=800&q=60",
        location: "تهران، بازار",
        lat: 35.73,
        lng: 51.41,
      },
    ];
    return {
      items: mock,
      total: mock.length,
      page: opts.page || 1,
      limit: opts.limit || mock.length,
    };
  }
}

export async function fetchCraftById(id) {
  try {
    const { data } = await axios.get(`${API_BASE}/crafts/${id}`, {
      params: { _: Date.now() },
    });
    return data;
  } catch {
    return null;
  }
}

export async function createCraft(payload) {
  const { data } = await axios.post(`${API_BASE}/crafts`, payload);
  return data;
}

export async function updateCraft(id, payload) {
  const { data } = await axios.put(`${API_BASE}/crafts/${id}`, payload);
  return data;
}

export async function deleteCraft(id) {
  const { data } = await axios.delete(`${API_BASE}/crafts/${id}`);
  return data;
}

export async function toggleLike(id) {
  const { data } = await axios.post(`${API_BASE}/crafts/${id}/like`);
  return data;
}

export async function toggleDislike(id) {
  const { data } = await axios.post(`${API_BASE}/crafts/${id}/dislike`);
  return data;
}

export async function addComment(craftId, { text, rating } = {}) {
  const payload = { text };
  if (rating !== undefined && rating !== null && rating !== "")
    payload.rating = rating;
  const { data } = await axios.post(
    `${API_BASE}/crafts/${craftId}/comments`,
    payload
  );
  return data;
}

export async function deleteComment(craftId, commentId) {
  const { data } = await axios.delete(
    `${API_BASE}/crafts/${craftId}/comments/${commentId}`
  );
  return data;
}

export async function fetchMyCrafts() {
  const { data } = await axios.get(`${API_BASE}/crafts/mine/list`);
  return Array.isArray(data?.items) ? data.items : [];
}

export async function seedDev() {
  try {
    const { data } = await axios.get(`${API_BASE}/crafts/seed/dev`);
    return data;
  } catch (e) {
    console.warn("/api/crafts/seed/dev failed", e?.message);
    throw e;
  }
}

// Re-export helpers for existing pages that still import from recipes
export { uploadImage, reverseGeocode };
