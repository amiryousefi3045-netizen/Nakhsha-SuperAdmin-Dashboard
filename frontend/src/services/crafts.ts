/**
 * Crafts Service
 *
 * Handles all craft/product API operations.
 * - Uses the centralized apiClient for consistent normalizeError handling.
 * - Dev mock fallback when backend returns no data (useful for local dev).
 * - Re-exports uploadImage / reverseGeocode so existing page imports keep working.
 */

import { apiClient } from "../lib/apiClient";
import { uploadImage, reverseGeocode } from "./media";
import type {
  ApiResponse,
  Craft,
  CraftCreateRequest,
  CraftUpdateRequest,
  CraftFilters,
  Comment,
  CommentCreateRequest,
  CraftResponse,
} from "../types/api";

// ── Dev helpers ────────────────────────────────────────────────────────────

const SERVER_ORIGIN =
  import.meta.env.VITE_SERVER_ORIGIN ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "");

// ---------------------------------------------------------------------------
// Mock data — only used in DEV when the backend returns nothing
// ---------------------------------------------------------------------------
const mockCrafts: any[] = [
  {
    id: "dev-1",
    title: "گلیم دست‌باف سنتی اصفهان",
    description:
      "گلیمی دست‌باف با نقش‌های سنتی و رنگ‌های طبیعی، بافته‌شده توسط یک خانواده صنعتگر در محله جلفای اصفهان.",
    artisanId: "artisan-atif-1",
    images: [
      `${SERVER_ORIGIN}/uploads/dev-1.svg`,
      `${SERVER_ORIGIN}/uploads/dev-1-2.svg`,
    ],
    price: 1850000,
    forSale: true,
    location: { city: "اصفهان", coordinates: [51.67, 32.64] },
    tags: ["گلیم", "قالی", "دست‌باف"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [
      {
        id: "c1",
        user: { id: "u1", name: "مریم حسینی" },
        text: "کیفیت رنگ‌ها بسیار خوب است.",
        rating: 5,
        createdAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: "dev-2",
    title: "سفال لعابی مینایی",
    description:
      "ظروف سفالی لعاب‌کاری شده با نقوش مینایی، مناسب برای سرو دکور و کادو.",
    artisanId: "artisan-sofali-2",
    images: [
      `${SERVER_ORIGIN}/uploads/dev-2.svg`,
      `${SERVER_ORIGIN}/uploads/dev-2-2.svg`,
    ],
    price: 750000,
    forSale: true,
    location: { city: "تهران، بازار", coordinates: [51.41, 35.73] },
    tags: ["سفال", "سرامیک", "هنر دستی"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [],
  },
  {
    id: "dev-3",
    title: "جام مسی قلم‌زنی اصفهان",
    description:
      "جام مسی با نقوش قلم‌زنی شده دستی؛ مناسب کلکسیون و تزئینات داخلی.",
    artisanId: "artisan-mesi-3",
    images: [`${SERVER_ORIGIN}/uploads/dev-3.svg`],
    price: 2200000,
    forSale: true,
    location: {
      city: "اصفهان، میدان نقش‌جهان",
      coordinates: [51.6776, 32.6572],
    },
    tags: ["مس", "قلم‌زنی", "فلزکاری"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [],
  },
  {
    id: "dev-4",
    title: "تابلو خط نستعلیق با مرکب طبیعی",
    description:
      "تابلوی نستعلیق با مرکب طبیعی و کاغذ دست‌ساز؛ مناسب هدیه و دکور هنری.",
    artisanId: "artisan-khat-4",
    images: [`${SERVER_ORIGIN}/uploads/dev-4.svg`],
    price: 450000,
    forSale: true,
    location: { city: "یزد", coordinates: [54.3675, 31.8974] },
    tags: ["خوشنویسی", "هنر سنتی"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [],
  },
  {
    id: "dev-5",
    title: "کابینت‌سازی دست‌ساز چوب گردو",
    description:
      "کابینت سفارشی از چوب گردوی ایرانی، طراحی مدرن با جزئیات سنتی.",
    artisanId: "artisan-wood-5",
    images: [`${SERVER_ORIGIN}/uploads/dev-5.svg`],
    price: 4200000,
    forSale: false,
    location: { city: "شیراز", coordinates: [52.5837, 29.5918] },
    tags: ["نجاری", "چوب", "دکور"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [],
  },
  {
    id: "dev-6",
    title: "روسری ابریشمی نقاشی دستی",
    description:
      "روسری ابریشمی با طرح نقاشی دستی، مناسب استفاده روزمره و مجالس.",
    artisanId: "artisan-textile-6",
    images: [`${SERVER_ORIGIN}/uploads/dev-6.svg`],
    price: 650000,
    forSale: true,
    location: { city: "تبریز", coordinates: [46.2919, 38.0962] },
    tags: ["نساجی", "ابریشم", "نقاشی"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [],
  },
];

const mockArtisans = [
  {
    id: "artisan-atif-1",
    name: "آتِف گلچین",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-1.svg`,
    city: "اصفهان",
    bio: "خانواده‌ای با نسل‌ها تجربه در بافت گلیم و قالی.",
  },
  {
    id: "artisan-sofali-2",
    name: "نسرین صوفالی",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-2.svg`,
    city: "تهران",
    bio: "سفال‌گر مستقل، تمرکز روی لعاب‌های مینایی.",
  },
  {
    id: "artisan-mesi-3",
    name: "سلمان مسگری",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-3.svg`,
    city: "اصفهان",
    bio: "فلزکار و قلم‌زن با بیش از ۲۰ سال تجربه.",
  },
  {
    id: "artisan-khat-4",
    name: "مریم شکیبا",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-4.svg`,
    city: "یزد",
    bio: "خوشنویس حرفه‌ای و آموزگار خط نستعلیق.",
  },
  {
    id: "artisan-wood-5",
    name: "کیان نجفی",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-5.svg`,
    city: "شیراز",
    bio: "نجار سفارشی‌ساز، ساخت مبلمان با چوب گردوی ایرانی.",
  },
  {
    id: "artisan-textile-6",
    name: "رها تبریزی",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-6.svg`,
    city: "تبریز",
    bio: "طراح پارچه و روسری ابریشمی با تکنیک‌های سنتی.",
  },
];

function mockCraftsWithArtisan(page = 1, limit = 50) {
  const items = mockCrafts.map((c) => {
    const artisan = mockArtisans.find((a) => a.id === c.artisanId);
    return {
      ...c,
      artisan: artisan
        ? { id: artisan.id, name: artisan.name, avatar: artisan.avatar }
        : undefined,
    } as any;
  });
  return { items, total: items.length, page, limit };
}

// ── List & search ──────────────────────────────────────────────────────────

/**
 * Fetch a paginated/filtered list of crafts.
 * Falls back to local mock data in DEV when the backend returns nothing.
 */
export async function fetchCrafts(opts: CraftFilters = {}): Promise<{
  items: Craft[];
  total: number;
  page: number;
  limit: number;
}> {
  const result = await apiClient.get<ApiResponse<Craft[]>>("/crafts", {
    params: opts,
  });

  if (!result.success) {
    console.warn("/api/crafts failed, using mock data:", result.error?.message);
    return mockCraftsWithArtisan(opts.page ?? 1, opts.limit ?? 50);
  }

  const data = result.data!;

  // DEV mock fallback when backend returned empty list
  if (
    import.meta.env.DEV &&
    Array.isArray(data.items) &&
    data.items.length === 0
  ) {
    return mockCraftsWithArtisan(opts.page ?? 1, opts.limit ?? 50);
  }

  return {
    items: (data.items as Craft[]) ?? [],
    total: data.total ?? 0,
    page: data.page ?? opts.page ?? 1,
    limit: data.limit ?? opts.limit ?? 50,
  };
}

/**
 * Fetch crafts near a geographic point with optional keyword/category filters.
 */
export async function fetchCraftsNear({
  lng,
  lat,
  radiusKm = 10,
  q,
  category,
  min,
  max,
}: {
  lng?: number;
  lat?: number;
  radiusKm?: number;
  q?: string;
  category?: string;
  min?: number;
  max?: number;
} = {}): Promise<Craft[]> {
  const result = await apiClient.get<ApiResponse<Craft[]>>("/crafts/near", {
    params: { lng, lat, radiusKm, q, category, min, max },
  });

  if (!result.success) {
    console.error("Error fetching nearby crafts:", result.error?.message);
    throw result.error!;
  }

  const items = (result.data?.items as Craft[]) ?? [];

  if (import.meta.env.DEV && items.length === 0) {
    console.info("No near results, using dev mock data");
    return [
      {
        id: "dev-near-1",
        title: "گلیم نفیس اصفهان",
        description: "گلیم دست‌باف با نقوش سنتی",
        category: "WEAVING",
        images: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        distanceMeters: 800,
      },
    ];
  }

  return items;
}

// ── Single craft ───────────────────────────────────────────────────────────

/**
 * Fetch a single craft by ID.
 * Returns null (instead of throwing) when not found, to preserve page behaviour.
 */
export async function fetchCraftById(
  id: string,
): Promise<CraftResponse | null> {
  const result = await apiClient.get<any>(`/crafts/${id}`);

  if (result.success && result.data) {
    const raw = result.data;
    // Handle both `{data: craft}` and plain craft object from backend
    if (raw.data) return raw.data as CraftResponse;
    return raw as CraftResponse;
  }

  // DEV fallback for mock IDs
  if (import.meta.env.DEV) {
    const found = mockCrafts.find((c) => c.id === id);
    if (found) {
      const artisan = mockArtisans.find((a) => a.id === found.artisanId);
      return {
        id: found.id,
        title: found.title,
        description: found.description ?? "",
        images: found.images ?? [],
        artisan: artisan
          ? { id: artisan.id, name: artisan.name, avatar: artisan.avatar }
          : undefined,
        craftType: found.craftType ?? "",
        price: found.price,
        forSale: !!found.forSale,
        tags: found.tags ?? [],
        location:
          found.location && typeof found.location === "object"
            ? { ...found.location }
            : { city: String(found.location ?? "") },
        views: 0,
        averageRating: 0,
        totalLikes: 0,
        totalDislikes: 0,
        liked: false,
        disliked: false,
        createdAt: found.createdAt,
        sale: {},
        barter: {},
        comments: found.comments ?? [],
        commentsCount: (found.comments ?? []).length,
      } as any;
    }
  }

  return null;
}

// ── Artisan ────────────────────────────────────────────────────────────────

export async function fetchArtisanById(artisanId: string): Promise<any> {
  if (!import.meta.env.DEV) {
    const result = await apiClient.get<ApiResponse<any>>(
      `/artisans/${artisanId}`,
    );
    if (!result.success) throw result.error!;
    return result.data?.data ?? result.data;
  }
  const a = mockArtisans.find((x) => x.id === artisanId);
  if (!a) return null;
  const crafts = mockCrafts
    .filter((c) => c.artisanId === artisanId)
    .map((c) => ({
      id: c.id,
      title: c.title,
      images: c.images?.slice(0, 1) ?? [],
      price: c.price,
    }));
  return {
    id: a.id,
    name: a.name,
    avatar: a.avatar,
    bio: a.bio,
    city: a.city,
    crafts,
  };
}

// ── CRUD ───────────────────────────────────────────────────────────────────

export async function createCraft(payload: CraftCreateRequest): Promise<Craft> {
  const result = await apiClient.post<ApiResponse<Craft>>("/crafts", payload);
  if (!result.success) throw result.error!;
  return result.data!.data!;
}

export async function updateCraft(
  id: string,
  payload: CraftUpdateRequest,
): Promise<Craft> {
  const result = await apiClient.put<ApiResponse<Craft>>(
    `/crafts/${id}`,
    payload,
  );
  if (!result.success) throw result.error!;
  return result.data!.data!;
}

export async function deleteCraft(id: string): Promise<void> {
  const result = await apiClient.delete(`/crafts/${id}`);
  if (!result.success) throw result.error!;
}

// ── Reactions ──────────────────────────────────────────────────────────────

interface ToggleReactionPayload {
  liked?: boolean;
  disliked?: boolean;
  total?: number;
  totalLikes?: number;
  totalDislikes?: number;
}

export async function toggleLike(
  id: string,
): Promise<{ liked: boolean; totalLikes: number; totalDislikes?: number }> {
  const result = await apiClient.post<ApiResponse<ToggleReactionPayload>>(
    `/crafts/${id}/like`,
  );
  if (!result.success) throw result.error!;
  const p = result.data?.data ?? {};
  return {
    liked: !!p.liked,
    totalLikes: p.totalLikes ?? p.total ?? 0,
    totalDislikes: p.totalDislikes ?? 0,
  };
}

export async function toggleDislike(id: string): Promise<{
  disliked: boolean;
  totalLikes?: number;
  totalDislikes: number;
}> {
  const result = await apiClient.post<ApiResponse<ToggleReactionPayload>>(
    `/crafts/${id}/dislike`,
  );
  if (!result.success) throw result.error!;
  const p = result.data?.data ?? {};
  return {
    disliked: !!p.disliked,
    totalLikes: p.totalLikes ?? 0,
    totalDislikes: p.totalDislikes ?? p.total ?? 0,
  };
}

// ── Comments ───────────────────────────────────────────────────────────────

export async function addComment(
  craftId: string,
  { text, rating }: CommentCreateRequest,
): Promise<Comment> {
  const result = await apiClient.post<ApiResponse<Comment>>(
    `/crafts/${craftId}/comments`,
    { text, rating },
  );
  if (!result.success) throw result.error!;
  return result.data!.data!;
}

export async function deleteComment(
  craftId: string,
  commentId: string,
): Promise<void> {
  const result = await apiClient.delete(
    `/crafts/${craftId}/comments/${commentId}`,
  );
  if (!result.success) throw result.error!;
}

// ── My crafts ──────────────────────────────────────────────────────────────

export async function fetchMyCrafts(): Promise<Craft[]> {
  const result = await apiClient.get<ApiResponse<Craft[]>>("/crafts/mine/list");
  if (!result.success) throw result.error!;
  return (result.data?.items as Craft[]) ?? [];
}

// ── Dev seeding ────────────────────────────────────────────────────────────

export async function seedDev(): Promise<void> {
  const result = await apiClient.get("/crafts/seed/dev");
  if (!result.success) throw result.error!;
}

// ── Re-exports for backward compat ─────────────────────────────────────────

export { uploadImage, reverseGeocode };
export type { CraftResponse, CommentResponse } from "../types/api";
