import { http, buildQuery } from "../lib/http";
import { uploadImage, reverseGeocode } from "./media";

// Determine server origin for image URLs in dev mode
const SERVER_ORIGIN =
  import.meta.env.VITE_SERVER_ORIGIN ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "");

export async function fetchCrafts(opts = {}) {
  // opts: bounds, filters, page, limit, q, sort, lat, lng
  try {
    const { data } = await http.get("/crafts", { params: buildQuery(opts) });
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
    const { data } = await http.get(`/crafts/${id}`, {
      params: buildQuery({ _: Date.now() }),
    });
    return data;
  } catch {
    return null;
  }
}

export async function createCraft(payload) {
  const { data } = await http.post("/crafts", payload);
  return data;
}

export async function updateCraft(id, payload) {
  const { data } = await http.put(`/crafts/${id}`, payload);
  return data;
}

export async function deleteCraft(id) {
  const { data } = await http.delete(`/crafts/${id}`);
  return data;
}

export async function toggleLike(id) {
  const { data } = await http.post(`/crafts/${id}/like`);
  return data;
}

export async function toggleDislike(id) {
  const { data } = await http.post(`/crafts/${id}/dislike`);
  return data;
}

export async function addComment(craftId, { text, rating } = {}) {
  const payload = buildQuery({ text, rating });
  const { data } = await http.post(`/crafts/${craftId}/comments`, payload);
  return data;
}

export async function deleteComment(craftId, commentId) {
  const { data } = await http.delete(
    `/crafts/${craftId}/comments/${commentId}`
  );
  return data;
}

export async function fetchMyCrafts() {
  const { data } = await http.get("/crafts/mine/list");
  return Array.isArray(data?.items) ? data.items : [];
}

export async function seedDev() {
  try {
    const { data } = await http.get("/crafts/seed/dev");
    return data;
  } catch (e) {
    console.warn("/api/crafts/seed/dev failed", e?.message);
    throw e;
  }
}

/**
 * Fetch crafts near a location with optional filters
 * @param {Object} params
 * @param {number} [params.lng] - Longitude
 * @param {number} [params.lat] - Latitude
 * @param {number} [params.radiusKm=10] - Search radius in kilometers
 * @param {string} [params.q] - Search query
 * @param {string} [params.category] - Category filter
 * @param {number} [params.min] - Minimum price
 * @param {number} [params.max] - Maximum price
 * @returns {Promise<Array>} Array of crafts with distance info when coordinates provided
 */
export async function fetchCraftsNear({
  lng,
  lat,
  radiusKm = 10,
  q,
  category,
  min,
  max,
} = {}) {
  try {
    const { data } = await http.get("/crafts/near", {
      params: buildQuery({
        lng,
        lat,
        radiusKm,
        q,
        category,
        min,
        max,
      }),
    });

    // If in dev mode and no results, provide mock data with distance
    if (import.meta.env.DEV && (!data?.items || !data.items.length)) {
      console.info("No near results, using dev mock data");
      return [
        {
          id: "dev-near-1",
          title: "گلیم نفیس اصفهان",
          description: "گلیم دست‌باف با نقوش سنتی",
          craftType: "carpet",
          location: "اصفهان، میدان نقش جهان",
          distanceMeters: 800,
          distanceKm: "0.8",
          lat: 32.6577,
          lng: 51.6776,
        },
      ];
    }

    return data.items || [];
  } catch (err) {
    console.error("Error fetching nearby crafts:", err);
    throw err;
  }
}

// Re-export helpers for existing pages that still import from recipes
export { uploadImage, reverseGeocode };
