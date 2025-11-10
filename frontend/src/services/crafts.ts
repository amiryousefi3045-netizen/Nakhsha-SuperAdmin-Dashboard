import { http, buildQuery } from "../lib/http";
import { uploadImage, reverseGeocode } from "./media";
import type {
  ApiResponse,
  Craft,
  CraftCreateRequest,
  CraftUpdateRequest,
  CraftFilters,
  Comment,
  CommentCreateRequest,
} from "../types/api";

// Determine server origin for image URLs in dev mode
const SERVER_ORIGIN =
  import.meta.env.VITE_SERVER_ORIGIN ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "");

const mockCrafts: Craft[] = [
  {
    id: "dev-1",
    title: "گلیم دست‌باف",
    artisanId: "mock-artisan-1",
    images: [`${SERVER_ORIGIN}/uploads/carpet.jpg`],
    price: 1500000,
    forSale: true,
    location: {
      city: "اصفهان، جلفا",
      coordinates: [51.67, 32.64],
    },
    tags: ["گلیم", "فرش"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dev-2",
    title: "سفال لعابی",
    artisanId: "mock-artisan-2",
    images: [
      "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=800&q=60",
    ],
    price: 850000,
    forSale: true,
    location: {
      city: "تهران، بازار",
      coordinates: [51.41, 35.73],
    },
    tags: ["سفال", "لعاب"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function fetchCrafts(opts: CraftFilters = {}): Promise<{
  items: Craft[];
  total: number;
  page: number;
  limit: number;
}> {
  try {
    const { data } = await http.get<ApiResponse<Craft>>("/crafts", {
      params: buildQuery(opts),
    });

    // If running in dev and backend returned no items, fallback to lightweight mock
    if (
      import.meta.env.DEV &&
      Array.isArray(data.items) &&
      data.items.length === 0
    ) {
      return {
        items: mockCrafts,
        total: mockCrafts.length,
        page: opts.page || 1,
        limit: opts.limit || mockCrafts.length,
      };
    }

    return {
      items: data.items || [],
      total: data.total || 0,
      page: data.page || opts.page || 1,
      limit: data.limit || opts.limit || 50,
    };
  } catch (err) {
    console.warn(
      "/api/crafts failed, using mock data",
      err instanceof Error ? err.message : err
    );
    return {
      items: mockCrafts,
      total: mockCrafts.length,
      page: opts.page || 1,
      limit: opts.limit || mockCrafts.length,
    };
  }
}

export async function fetchCraftById(id: string): Promise<Craft | null> {
  try {
    const { data } = await http.get<ApiResponse<Craft>>(`/crafts/${id}`, {
      params: buildQuery({ _: Date.now() }),
    });
    return data.data || null;
  } catch {
    return null;
  }
}

export async function createCraft(payload: CraftCreateRequest): Promise<Craft> {
  const { data } = await http.post<ApiResponse<Craft>>("/crafts", payload);
  return data.data!;
}

export async function updateCraft(
  id: string,
  payload: CraftUpdateRequest
): Promise<Craft> {
  const { data } = await http.put<ApiResponse<Craft>>(`/crafts/${id}`, payload);
  return data.data!;
}

export async function deleteCraft(id: string): Promise<void> {
  await http.delete(`/crafts/${id}`);
}

export async function toggleLike(
  id: string
): Promise<{ liked: boolean; total: number }> {
  const { data } = await http.post<
    ApiResponse<{ liked: boolean; total: number }>
  >(`/crafts/${id}/like`);
  return data.data!;
}

export async function toggleDislike(
  id: string
): Promise<{ disliked: boolean; total: number }> {
  const { data } = await http.post<
    ApiResponse<{ disliked: boolean; total: number }>
  >(`/crafts/${id}/dislike`);
  return data.data!;
}

export async function addComment(
  craftId: string,
  { text, rating }: CommentCreateRequest
): Promise<Comment> {
  const payload = buildQuery({ text, rating });
  const { data } = await http.post<ApiResponse<Comment>>(
    `/crafts/${craftId}/comments`,
    payload
  );
  return data.data!;
}

export async function deleteComment(
  craftId: string,
  commentId: string
): Promise<void> {
  await http.delete(`/crafts/${craftId}/comments/${commentId}`);
}

export async function fetchMyCrafts(): Promise<Craft[]> {
  const { data } = await http.get<ApiResponse<Craft>>("/crafts/mine/list");
  return Array.isArray(data?.items) ? data.items : [];
}

export async function seedDev(): Promise<void> {
  try {
    await http.get("/crafts/seed/dev");
  } catch (e) {
    console.warn(
      "/api/crafts/seed/dev failed",
      e instanceof Error ? e.message : e
    );
    throw e;
  }
}

// Re-export helpers for existing pages that still import from recipes
export { uploadImage, reverseGeocode };
