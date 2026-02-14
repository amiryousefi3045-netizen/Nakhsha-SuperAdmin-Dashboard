/**
 * Crafts Service v2
 *
 * Refactored to use centralized apiClient with standardized responses.
 *
 * Features:
 * - All functions return ApiResult<T> or PaginatedResult<T>
 * - Automatic token management via interceptor
 * - Standardized error handling with Persian messages
 * - Mock data fallback in development mode
 * - Full TypeScript support with generic types
 * - Geospatial queries for location-based search
 *
 * @example
 * ```ts
 * const result = await fetchCrafts({ city: "تهران", limit: 20 });
 * if (result.success) {
 *   console.log(result.data); // Craft[]
 *   console.log(result.meta?.total); // Total count
 * }
 * ```
 */

import {
  apiClient,
  type ApiResult,
  type PaginatedResult,
} from "../lib/apiClient";
import { uploadImage, reverseGeocode } from "./media";
import type {
  Craft,
  CraftCreateRequest,
  CraftUpdateRequest,
  CraftFilters,
  Comment,
  CommentCreateRequest,
  CraftResponse,
} from "../types/api";

// ============================================================================
// Backend Response Types
// ============================================================================

/**
 * Backend response for craft detail with artisan info
 */
interface CraftDetailResponse extends CraftResponse {
  views?: number;
  averageRating?: number;
  totalLikes?: number;
  totalDislikes?: number;
  comments?: Comment[];
  posts?: any[];
}

/**
 * Backend response for artisan profile
 */
interface ArtisanResponse {
  id: string;
  name: string;
  avatar?: string;
  bio?: string;
  city?: string;
  crafts?: Array<{
    id: string;
    title: string;
    images?: string[];
    price?: number;
  }>;
}

/**
 * Backend response for like/dislike toggle
 */
interface LikeToggleResponse {
  liked?: boolean;
  disliked?: boolean;
  total?: number;
  totalLikes?: number;
  totalDislikes?: number;
}

/**
 * Parameters for geospatial craft search
 */
interface CraftsNearParams {
  lng?: number;
  lat?: number;
  radiusKm?: number;
  q?: string;
  category?: string;
  min?: number;
  max?: number;
}

// ============================================================================
// Mock Data for Development
// ============================================================================

// Determine server origin for image URLs in dev mode
const SERVER_ORIGIN =
  import.meta.env.VITE_SERVER_ORIGIN ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : "");

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
    location: {
      city: "اصفهان",
      coordinates: [51.67, 32.64],
    },
    tags: ["گلیم", "قالی", "دست‌باف"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dev-2",
    title: "سفال لعابی مینایی",
    description:
      "ظروف سفالی لعاب‌کاری شده با نقوش مینایی، مناسب برای سرو دکور و کادو. ساخته شده در کارگاه کوچک در بازار تهران.",
    artisanId: "artisan-sofali-2",
    images: [
      `${SERVER_ORIGIN}/uploads/dev-2.svg`,
      `${SERVER_ORIGIN}/uploads/dev-2-2.svg`,
    ],
    price: 750000,
    forSale: true,
    location: {
      city: "تهران، بازار",
      coordinates: [51.41, 35.73],
    },
    tags: ["سفال", "سرامیک", "هنر دستی"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dev-3",
    title: "جام مسی قلم‌زنی اصفهان",
    description:
      "جام مسی با نقوش قلم‌زنی شده دستی؛ مناسب کلکسیون و تزئینات داخلی. ساخته شده از مس مرغوب و پرداخت سنتی.",
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
  },
  {
    id: "dev-4",
    title: "تابلو خط نستعلیق با مرکب طبیعی",
    description:
      "تابلوی نستعلیق با مرکب طبیعی و کاغذ دست‌ساز؛ مناسب هدیه و دکور هنری. نوشته شاعرانه‌ای با طراحی ظریف.",
    artisanId: "artisan-khat-4",
    images: [`${SERVER_ORIGIN}/uploads/dev-4.svg`],
    price: 450000,
    forSale: true,
    location: {
      city: "یزد",
      coordinates: [54.3675, 31.8974],
    },
    tags: ["خوشنویسی", "هنر سنتی"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dev-5",
    title: "کابینت‌سازی دست‌ساز چوب گردو",
    description:
      "کابینت سفارشی از چوب گردوی ایرانی، طراحی مدرن با جزئیات سنتی؛ ساخته شده به سفارش با ضمانت کیفیت.",
    artisanId: "artisan-wood-5",
    images: [`${SERVER_ORIGIN}/uploads/dev-5.svg`],
    price: 4200000,
    forSale: false,
    location: {
      city: "شیراز",
      coordinates: [52.5837, 29.5918],
    },
    tags: ["نجاری", "چوب", "دکور"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dev-6",
    title: "روسری ابریشمی نقاشی دستی",
    description:
      "روسری ابریشمی با طرح نقاشی دستی، مناسب استفاده روزمره و مجالس؛ رنگ‌های ثابت و دوخت تمیز.",
    artisanId: "artisan-textile-6",
    images: [`${SERVER_ORIGIN}/uploads/dev-6.svg`],
    price: 650000,
    forSale: true,
    location: {
      city: "تبریز",
      coordinates: [46.2919, 38.0962],
    },
    tags: ["نساجی", "ابریشم", "نقاشی"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockArtisans = [
  {
    id: "artisan-atif-1",
    name: "آتِف گلچین",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-atif.svg`,
    bio: "هنرمند و بافنده سنتی گلیم با بیش از ۲۰ سال تجربه در محله جلفا.",
    city: "اصفهان",
  },
  {
    id: "artisan-sofali-2",
    name: "احمد سفالگری",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-sofali.svg`,
    bio: "سفالگر متخصص در سفال مینایی و لعاب‌گذاری سنتی.",
    city: "تهران",
  },
  {
    id: "artisan-mesi-3",
    name: "حسین مسگر",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-mesi.svg`,
    bio: "قلم‌زن و استاد کار مس و فلزکاری هنری.",
    city: "اصفهان",
  },
  {
    id: "artisan-khat-4",
    name: "مریم خطاط",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-khat.svg`,
    bio: "خوشنویس نستعلیق و طراح تابلوهای سفارشی.",
    city: "یزد",
  },
  {
    id: "artisan-wood-5",
    name: "علی نجار",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-wood.svg`,
    bio: "نجار صنعتگر تخصصی در چوب، دکوراسیون و کابینت سفارشی.",
    city: "شیراز",
  },
  {
    id: "artisan-textile-6",
    name: "فاطمه نساج",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-textile.svg`,
    bio: "هنرمند نقاش پارچه و نساجی دستی.",
    city: "تبریز",
  },
];

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch crafts with optional filters and pagination
 *
 * In development mode, falls back to mock data if backend returns empty results.
 *
 * @param filters - Filter and pagination options
 * @returns PaginatedResult with craft list and metadata
 *
 * @example
 * ```ts
 * const result = await fetchCrafts({ city: "تهران", limit: 20, page: 1 });
 * if (result.success) {
 *   console.log(result.data); // Craft[]
 *   console.log(result.meta?.total); // Total count
 * }
 * ```
 */
export async function fetchCrafts(
  filters: CraftFilters = {},
): Promise<PaginatedResult<Craft>> {
  const result = await apiClient.getPaginated<Craft>("/crafts", filters);

  // In dev mode, if backend returned no items, use mock data
  if (
    import.meta.env.DEV &&
    result.success &&
    (!result.data || result.data.length === 0)
  ) {
    const itemsWithArtisan = mockCrafts.map((c) => {
      const artisan = mockArtisans.find((a) => a.id === c.artisanId);
      return {
        ...c,
        artisan: artisan
          ? { id: artisan.id, name: artisan.name, avatar: artisan.avatar }
          : undefined,
      } as Craft;
    });

    return {
      success: true,
      data: itemsWithArtisan,
      meta: {
        total: itemsWithArtisan.length,
        page: filters.page || 1,
        limit: filters.limit || itemsWithArtisan.length,
        totalPages: 1,
      },
    };
  }

  return result;
}

/**
 * Fetch a single craft by ID with full details
 *
 * In development mode, falls back to mock data for non-ObjectId IDs.
 *
 * @param id - Craft ID
 * @returns ApiResult with craft details or null if not found
 *
 * @example
 * ```ts
 * const result = await fetchCraftById("craft-123");
 * if (result.success && result.data) {
 *   console.log(result.data.title);
 *   console.log(result.data.artisan?.name);
 * }
 * ```
 */
export async function fetchCraftById(
  id: string,
): Promise<ApiResult<CraftDetailResponse | null>> {
  const result = await apiClient.get<CraftDetailResponse>(`/crafts/${id}`, {
    params: { _: Date.now() }, // Cache bust
  });

  // If successful, return as-is
  if (result.success && result.data) {
    return result;
  }

  // In dev mode, fallback to mock data
  if (import.meta.env.DEV) {
    const found = mockCrafts.find((c) => c.id === id);
    if (found) {
      const artisan = mockArtisans.find((a) => a.id === found.artisanId);
      return {
        success: true,
        data: {
          id: found.id,
          title: found.title,
          description: found.description || "",
          images: found.images || [],
          artisan: found.artisanId
            ? {
                id: found.artisanId,
                name: artisan?.name || "",
                avatar: artisan?.avatar,
              }
            : undefined,
          craftType: found.craftType || "",
          price: found.price,
          forSale: !!found.forSale,
          tags: found.tags || [],
          location:
            found.location && typeof found.location === "object"
              ? { ...found.location }
              : { city: String(found.location || "") },
          views: 0,
          averageRating: 0,
          totalLikes: 0,
          totalDislikes: 0,
          comments: [],
          posts: [],
          createdAt: found.createdAt,
          updatedAt: found.updatedAt,
        } as CraftDetailResponse,
      };
    }
  }

  // Not found - return null
  return { success: true, data: null };
}

/**
 * Fetch artisan profile by ID
 *
 * In development mode, uses mock artisan data.
 *
 * @param artisanId - Artisan ID
 * @returns ApiResult with artisan profile or null if not found
 *
 * @example
 * ```ts
 * const result = await fetchArtisanById("artisan-123");
 * if (result.success && result.data) {
 *   console.log(result.data.name);
 *   console.log(result.data.crafts?.length);
 * }
 * ```
 */
export async function fetchArtisanById(
  artisanId: string,
): Promise<ApiResult<ArtisanResponse | null>> {
  // In dev mode, use mock data
  if (import.meta.env.DEV) {
    const artisan = mockArtisans.find((x) => x.id === artisanId);
    if (!artisan) {
      return { success: true, data: null };
    }

    const crafts = mockCrafts
      .filter((c) => c.artisanId === artisanId)
      .map((c) => ({
        id: c.id,
        title: c.title,
        images: c.images?.slice(0, 1) || [],
        price: c.price,
      }));

    return {
      success: true,
      data: {
        id: artisan.id,
        name: artisan.name,
        avatar: artisan.avatar,
        bio: artisan.bio,
        city: artisan.city,
        crafts,
      },
    };
  }

  // Production mode - call backend
  return apiClient.get<ArtisanResponse>(`/artisans/${artisanId}`);
}

/**
 * Create a new craft
 *
 * @param payload - Craft creation data
 * @returns ApiResult with created craft
 *
 * @example
 * ```ts
 * const result = await createCraft({
 *   title: "گلیم دست‌باف",
 *   description: "توضیحات",
 *   price: 1500000,
 *   // ... other fields
 * });
 * if (result.success) {
 *   console.log("Created craft:", result.data?.id);
 * }
 * ```
 */
export async function createCraft(
  payload: CraftCreateRequest,
): Promise<ApiResult<Craft>> {
  return apiClient.post<Craft>("/crafts", payload);
}

/**
 * Update an existing craft
 *
 * @param id - Craft ID
 * @param payload - Updated craft data
 * @returns ApiResult with updated craft
 *
 * @example
 * ```ts
 * const result = await updateCraft("craft-123", { price: 2000000 });
 * if (result.success) {
 *   console.log("Updated price:", result.data?.price);
 * }
 * ```
 */
export async function updateCraft(
  id: string,
  payload: CraftUpdateRequest,
): Promise<ApiResult<Craft>> {
  return apiClient.put<Craft>(`/crafts/${id}`, payload);
}

/**
 * Delete a craft
 *
 * @param id - Craft ID
 * @returns ApiResult indicating success
 *
 * @example
 * ```ts
 * const result = await deleteCraft("craft-123");
 * if (result.success) {
 *   console.log("Craft deleted successfully");
 * }
 * ```
 */
export async function deleteCraft(id: string): Promise<ApiResult<void>> {
  return apiClient.delete<void>(`/crafts/${id}`);
}

/**
 * Toggle like on a craft
 *
 * @param id - Craft ID
 * @returns ApiResult with like status and counts
 *
 * @example
 * ```ts
 * const result = await toggleLike("craft-123");
 * if (result.success && result.data) {
 *   console.log("Liked:", result.data.liked);
 *   console.log("Total likes:", result.data.totalLikes);
 * }
 * ```
 */
export async function toggleLike(id: string): Promise<
  ApiResult<{
    liked: boolean;
    totalLikes: number;
    totalDislikes: number;
  }>
> {
  const result = await apiClient.post<LikeToggleResponse>(`/crafts/${id}/like`);

  if (result.success && result.data) {
    return {
      success: true,
      data: {
        liked: !!result.data.liked,
        totalLikes: result.data.totalLikes ?? result.data.total ?? 0,
        totalDislikes: result.data.totalDislikes ?? 0,
      },
    };
  }

  return result as unknown as ApiResult<{
    liked: boolean;
    totalLikes: number;
    totalDislikes: number;
  }>;
}

/**
 * Toggle dislike on a craft
 *
 * @param id - Craft ID
 * @returns ApiResult with dislike status and counts
 *
 * @example
 * ```ts
 * const result = await toggleDislike("craft-123");
 * if (result.success && result.data) {
 *   console.log("Disliked:", result.data.disliked);
 *   console.log("Total dislikes:", result.data.totalDislikes);
 * }
 * ```
 */
export async function toggleDislike(id: string): Promise<
  ApiResult<{
    disliked: boolean;
    totalLikes: number;
    totalDislikes: number;
  }>
> {
  const result = await apiClient.post<LikeToggleResponse>(
    `/crafts/${id}/dislike`,
  );

  if (result.success && result.data) {
    return {
      success: true,
      data: {
        disliked: !!result.data.disliked,
        totalLikes: result.data.totalLikes ?? 0,
        totalDislikes: result.data.totalDislikes ?? result.data.total ?? 0,
      },
    };
  }

  return result as unknown as ApiResult<{
    disliked: boolean;
    totalLikes: number;
    totalDislikes: number;
  }>;
}

/**
 * Add a comment to a craft
 *
 * @param craftId - Craft ID
 * @param comment - Comment data (text and optional rating)
 * @returns ApiResult with created comment
 *
 * @example
 * ```ts
 * const result = await addComment("craft-123", {
 *   text: "کیفیت عالی!",
 *   rating: 5
 * });
 * if (result.success) {
 *   console.log("Comment added:", result.data?.id);
 * }
 * ```
 */
export async function addComment(
  craftId: string,
  comment: CommentCreateRequest,
): Promise<ApiResult<Comment>> {
  return apiClient.post<Comment>(`/crafts/${craftId}/comments`, comment);
}

/**
 * Delete a comment from a craft
 *
 * @param craftId - Craft ID
 * @param commentId - Comment ID
 * @returns ApiResult indicating success
 *
 * @example
 * ```ts
 * const result = await deleteComment("craft-123", "comment-456");
 * if (result.success) {
 *   console.log("Comment deleted");
 * }
 * ```
 */
export async function deleteComment(
  craftId: string,
  commentId: string,
): Promise<ApiResult<void>> {
  return apiClient.delete<void>(`/crafts/${craftId}/comments/${commentId}`);
}

/**
 * Fetch crafts created by the current user
 *
 * @returns ApiResult with user's craft list
 *
 * @example
 * ```ts
 * const result = await fetchMyCrafts();
 * if (result.success) {
 *   console.log("My crafts:", result.data?.length);
 * }
 * ```
 */
export async function fetchMyCrafts(): Promise<ApiResult<Craft[]>> {
  const result = await apiClient.get<{ items?: Craft[] }>("/crafts/mine/list");

  // Extract items from wrapper if present
  if (result.success && result.data?.items) {
    return {
      success: true,
      data: result.data.items,
    };
  }

  // If data is already an array, return as-is
  if (result.success && Array.isArray(result.data)) {
    return {
      success: true,
      data: result.data,
    };
  }

  return { success: true, data: [] };
}

/**
 * Seed development data (development only)
 *
 * Triggers backend to seed mock data for testing.
 *
 * @returns ApiResult indicating success
 *
 * @example
 * ```ts
 * const result = await seedDev();
 * if (result.success) {
 *   console.log("Dev data seeded");
 * }
 * ```
 */
export async function seedDev(): Promise<ApiResult<void>> {
  return apiClient.get<void>("/crafts/seed/dev");
}

/**
 * Fetch crafts near a location with optional filters
 *
 * Uses geospatial queries to find crafts within a radius.
 * In development mode, returns mock data if no results found.
 *
 * @param params - Search parameters including location and filters
 * @returns ApiResult with craft list (includes distance if coordinates provided)
 *
 * @example
 * ```ts
 * const result = await fetchCraftsNear({
 *   lng: 51.41,
 *   lat: 35.73,
 *   radiusKm: 10,
 *   category: "WEAVING"
 * });
 * if (result.success) {
 *   console.log(result.data?.map(c => c.distanceMeters));
 * }
 * ```
 */
export async function fetchCraftsNear(
  params: CraftsNearParams = {},
): Promise<ApiResult<Craft[]>> {
  const result = await apiClient.get<{ items?: Craft[] }>("/crafts/near", {
    params,
  });

  // Extract items from wrapper if present
  let crafts: Craft[] = [];
  if (result.success && result.data?.items) {
    crafts = result.data.items;
  } else if (result.success && Array.isArray(result.data)) {
    crafts = result.data;
  }

  // In dev mode, if no results, provide mock data
  if (import.meta.env.DEV && crafts.length === 0) {
    console.info("No near results, using dev mock data");
    return {
      success: true,
      data: [
        {
          id: "dev-near-1",
          title: "گلیم نفیس اصفهان",
          description: "گلیم دست‌باف با نقوش سنتی",
          category: "WEAVING",
          images: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          distanceMeters: 800,
        } as Craft,
      ],
    };
  }

  return { success: true, data: crafts };
}

// ============================================================================
// Re-exports for Compatibility
// ============================================================================

/**
 * Re-export helpers for components that import from crafts service
 */
export { uploadImage, reverseGeocode };

/**
 * Re-export types for backward compatibility
 */
export type {
  CraftResponse,
  CraftDetailResponse,
  ArtisanResponse,
  LikeToggleResponse,
  CraftsNearParams,
};
