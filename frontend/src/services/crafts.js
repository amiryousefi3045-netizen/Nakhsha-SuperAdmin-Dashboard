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

// Re-export helpers for existing pages that still import from recipes
export { uploadImage, reverseGeocode };
