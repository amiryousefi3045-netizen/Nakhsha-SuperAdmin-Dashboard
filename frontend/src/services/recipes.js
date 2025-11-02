import axios from "axios";
// Ensure auth interceptor is registered
import "./auth";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
// If API_BASE is absolute, derive origin from it. Otherwise, allow override via VITE_SERVER_ORIGIN
// and fall back to http://<current-host>:5000 which matches our default backend port.
let SERVER_ORIGIN = "";
try {
  if (/^https?:\/\//i.test(API_BASE)) {
    SERVER_ORIGIN = new URL(API_BASE).origin;
  } else if (import.meta.env.VITE_SERVER_ORIGIN) {
    SERVER_ORIGIN = import.meta.env.VITE_SERVER_ORIGIN;
  } else if (typeof window !== "undefined" && window.location) {
    SERVER_ORIGIN = `${window.location.protocol}//${window.location.hostname}:5000`;
  }
} catch {
  // ignore
}

let activeController;
export async function fetchRecipes({
  bounds,
  filters,
  page,
  limit,
  q,
  sort,
  lat,
  lng,
} = {}) {
  if (activeController) {
    activeController.abort();
  }
  activeController = new AbortController();
  const params = {};
  if (bounds) {
    params.north = bounds.north;
    params.south = bounds.south;
    params.east = bounds.east;
    params.west = bounds.west;
  }
  if (filters) {
    if (filters.city) params.city = filters.city;
    if (filters.difficulty) params.difficulty = filters.difficulty;
    if (filters.isVegetarian) params.isVegetarian = true;
  }
  if (typeof page === "number") params.page = page;
  if (typeof limit === "number") params.limit = limit;
  if (q) params.q = q;
  if (sort) params.sort = sort;
  if (Number.isFinite(lat)) params.lat = lat;
  if (Number.isFinite(lng)) params.lng = lng;

  try {
    const { data } = await axios.get(`${API_BASE}/recipes`, {
      params,
      signal: activeController.signal,
    });
    return {
      items: data.items || [],
      total: data.total || 0,
      page: data.page || page || 1,
      limit: data.limit || limit || 50,
    };
  } catch (err) {
    if (axios.isCancel?.(err) || err?.name === "CanceledError") {
      // request was aborted; return empty to avoid flicker
      return { items: [], total: 0, page: page || 1, limit: limit || 50 };
    }
    // Fallback to a tiny mock on failure to keep UI working
    console.warn("/api/recipes failed, using mock data", err?.message);
    const mock = [
      {
        id: "dev-1",
        title: "قرمه‌سبزی",
        image:
          "https://images.unsplash.com/photo-1604908176997-431c3a7280e5?w=800&q=60",
        cookingTime: "۱۲۰ دقیقه",
        difficulty: "متوسط",
        location: "تهران، ونک",
        lat: 35.735,
        lng: 51.41,
      },
      {
        id: "dev-2",
        title: "کباب کوبیده",
        image: `${SERVER_ORIGIN}/uploads/kebab.jpg`,
        cookingTime: "۴۵ دقیقه",
        difficulty: "سخت",
        location: "اصفهان، جلفا",
        lat: 32.64,
        lng: 51.67,
      },
    ];
    return {
      items: mock,
      total: mock.length,
      page: page || 1,
      limit: limit || mock.length,
    };
  }
}

export async function fetchRecipeById(id) {
  // Dev/mock catalog available client-side to avoid 404 noise in console
  const mockDetails = {
    "dev-1": {
      id: "dev-1",
      title: "قرمه‌سبزی",
      description: "قرمه‌سبزی اصیل با سبزی تازه و لوبیا قرمز.",
      images: [
        "https://images.unsplash.com/photo-1604908176997-431c3a7280e5?w=1200&q=60",
      ],
      ingredients: [
        { name: "گوشت گوسفندی", amount: "۳۰۰", unit: "گرم" },
        { name: "لوبیا قرمز", amount: "۱", unit: "پیمانه" },
        { name: "سبزی قرمه", amount: "۳", unit: "پیمانه" },
      ],
      instructions: [
        { step: 1, description: "لوبیا را از شب قبل خیس کنید." },
        { step: 2, description: "گوشت را تفت دهید و سبزی را اضافه کنید." },
      ],
      cookingTime: { prep: 20, cook: 100, total: 120 },
      difficulty: "متوسط",
      servings: 4,
      category: "خورش",
      tags: ["سنتی", "ایرانی"],
      isVegetarian: false,
      location: {
        city: "تهران",
        neighborhood: "ونک",
        coordinates: [51.41, 35.735],
      },
      averageRating: 4.6,
      totalLikes: 128,
      createdAt: new Date().toISOString(),
    },
    "dev-2": {
      id: "dev-2",
      title: "کباب کوبیده",
      description: "کباب کوبیده زعفرانی با برنج ایرانی.",
      images: [
        "https://images.unsplash.com/photo-1604908554200-4d8f8d9ba4b3?w=1200&q=60",
      ],
      ingredients: [
        { name: "گوشت چرخ‌کرده", amount: "۵۰۰", unit: "گرم" },
        { name: "پیاز", amount: "۲", unit: "عدد" },
      ],
      instructions: [
        { step: 1, description: "پیاز را رنده و آب آن را بگیرید." },
        { step: 2, description: "گوشت و ادویه را ورز دهید و سیخ کنید." },
      ],
      cookingTime: { prep: 20, cook: 25, total: 45 },
      difficulty: "سخت",
      servings: 3,
      category: "کباب",
      tags: ["زغالی"],
      isVegetarian: false,
      location: {
        city: "اصفهان",
        neighborhood: "جلفا",
        coordinates: [51.67, 32.64],
      },
      averageRating: 4.7,
      totalLikes: 96,
      createdAt: new Date().toISOString(),
    },
  };
  if (mockDetails[id]) return mockDetails[id];
  // If numeric IDs leak from older mocks, map them for convenience
  if (id === "1") return mockDetails["dev-1"];
  if (id === "2") return mockDetails["dev-2"];

  try {
    const { data } = await axios.get(`${API_BASE}/recipes/${id}`, {
      // prevent any intermediary caching
      params: { _: Date.now() },
    });
    return data;
  } catch {
    // If backend is running in mock/no-DB mode or id is not a Mongo ObjectId, provide the mock (if exist) or null
    return mockDetails[id] || null;
  }
}

export async function createRecipe(payload) {
  const { data } = await axios.post(`${API_BASE}/recipes`, payload);
  return data; // { id }
}

export async function updateRecipe(id, payload) {
  const { data } = await axios.put(`${API_BASE}/recipes/${id}`, payload);
  return data; // { id, ok }
}

export async function deleteRecipe(id) {
  const { data } = await axios.delete(`${API_BASE}/recipes/${id}`);
  return data; // { ok }
}

// Toggle like
export async function toggleLike(id) {
  const { data } = await axios.post(`${API_BASE}/recipes/${id}/like`);
  return data; // { liked, totalLikes, totalDislikes }
}

// Toggle dislike
export async function toggleDislike(id) {
  const { data } = await axios.post(`${API_BASE}/recipes/${id}/dislike`);
  return data; // { disliked, totalLikes, totalDislikes }
}

// Add comment
export async function addComment(recipeId, { text, rating } = {}) {
  const payload = { text };
  if (rating !== undefined && rating !== null && rating !== "") {
    payload.rating = rating;
  }
  const { data } = await axios.post(
    `${API_BASE}/recipes/${recipeId}/comments`,
    payload
  );
  return data; // { id, user, text, rating, createdAt }
}

// Delete comment
export async function deleteComment(recipeId, commentId) {
  const { data } = await axios.delete(
    `${API_BASE}/recipes/${recipeId}/comments/${commentId}`
  );
  return data; // { ok }
}

// List current user's recipes (requires auth)
export async function fetchMyRecipes() {
  const { data } = await axios.get(`${API_BASE}/recipes/mine/list`);
  // data: { items: [Recipe] }
  return Array.isArray(data?.items) ? data.items : [];
}

// DEV convenience: seed database with sample recipes
export async function seedDev() {
  try {
    const { data } = await axios.get(`${API_BASE}/recipes/seed/dev`);
    return data;
  } catch (e) {
    console.warn("/api/recipes/seed/dev failed", e?.message);
    throw e;
  }
}

// Upload a single image file to backend and return absolute URL
export async function uploadImage(file) {
  const form = new FormData();
  form.append("file", file, file.name);
  const { data } = await axios.post(`${API_BASE}/uploads`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  const url = data?.url || "";
  if (!url) throw new Error("Upload failed: No url in response");
  return url.startsWith("http")
    ? url
    : `${SERVER_ORIGIN}${url.startsWith("/") ? url : "/" + url}`;
}

// Lightweight reverse geocoding using OpenStreetMap Nominatim (no key required)
// Returns a best-effort Farsi address pieces
export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&zoom=14&accept-language=fa`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Friendly UA per Nominatim policy
        "User-Agent": "Nakhsha/1.0 (+https://example.com)",
      },
    });
    if (!res.ok) throw new Error("reverse geocode failed");
    const data = await res.json();
    const a = data?.address || {};
    const city = a.city || a.town || a.village || a.state || "";
    const neighborhood = a.neighbourhood || a.suburb || a.city_district || "";
    return {
      city,
      neighborhood,
      displayName:
        data.display_name || [city, neighborhood].filter(Boolean).join("، "),
    };
  } catch {
    return { city: "", neighborhood: "", displayName: "" };
  }
}
