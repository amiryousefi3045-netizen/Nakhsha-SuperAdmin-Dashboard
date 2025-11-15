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
  CraftResponse,
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
    comments: [
      {
        id: "c1",
        user: { id: "u1", name: "مریم حسینی" },
        text: "کیفیت رنگ‌ها بسیار خوب است.",
        rating: 5,
        createdAt: new Date().toISOString(),
      },
      {
        id: "c2",
        user: { id: "u2", name: "علی رستمی" },
        text: "بافت محکم و ظریف، پیشنهاد می‌کنم.",
        rating: 4,
        createdAt: new Date().toISOString(),
      },
    ],
    posts: [
      {
        id: "p1",
        title: "روند بافت گلیم",
        body: "عکس‌ها و توضیحات مرحله‌ای از بافت گلیم توسط آتِف گلچین.",
        images: [`${SERVER_ORIGIN}/uploads/dev-1-2.svg`],
        createdAt: new Date().toISOString(),
      },
    ],
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
    comments: [
      {
        id: "c3",
        user: { id: "u3", name: "فاطمه آقایی" },
        text: "لعاب بسیار شفاف و رنگ‌ها زیبا هستند.",
        rating: 5,
        createdAt: new Date().toISOString(),
      },
    ],
    posts: [
      {
        id: "p2",
        title: "نمونه ظروف جدید",
        body: "چند طرح جدید مینایی برای پذیرایی؛ آماده ارسال به سراسر کشور.",
        images: [`${SERVER_ORIGIN}/uploads/dev-2-2.svg`],
        createdAt: new Date().toISOString(),
      },
    ],
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
    comments: [
      {
        id: "c4",
        user: { id: "u4", name: "حسین براتی" },
        text: "کار استادانه و ظریف؛ قیمت منطقی است.",
        rating: 5,
        createdAt: new Date().toISOString(),
      },
    ],
    posts: [
      {
        id: "p3",
        title: "قلم‌زنی سنتی",
        body: "نمایش مراحل قلم‌زنی و پرداخت جام مسی؛ سفارش‌های سفارشی پذیرفته می‌شود.",
        images: [],
        createdAt: new Date().toISOString(),
      },
    ],
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
    comments: [
      {
        id: "c5",
        user: { id: "u5", name: "لیلا نوربخش" },
        text: "خط زیبا و مرکب خوش‌نویسانه؛ درخشان و بافت‌دار.",
        rating: 5,
        createdAt: new Date().toISOString(),
      },
    ],
    posts: [
      {
        id: "p4",
        title: "تابلوی سفارشی خوشنویسی",
        body: "نمونه سفارشی با بندگی شعر حافظ؛ مناسب هدیهٔ خاص.",
        images: [],
        createdAt: new Date().toISOString(),
      },
    ],
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
    comments: [
      {
        id: "c6",
        user: { id: "u6", name: "مهدی صفوی" },
        text: "نمونه کار با جزئیات تمیز و پرداخت عالی.",
        rating: 5,
        createdAt: new Date().toISOString(),
      },
    ],
    posts: [
      {
        id: "p5",
        title: "پروژه کابینت سفارشی",
        body: "تحویل پروژه کابینت آشپزخانه با چوب گردوی ایرانی؛ عکس‌ها و جزئیات.",
        images: [],
        createdAt: new Date().toISOString(),
      },
    ],
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
    comments: [
      {
        id: "c7",
        user: { id: "u7", name: "سارا کاظمی" },
        text: "پارچه نرم و نقش دقیق؛ عالی برای هدیه.",
        rating: 5,
        createdAt: new Date().toISOString(),
      },
    ],
    posts: [
      {
        id: "p6",
        title: "مراحل نقاشی روی ابریشم",
        body: "همراه با ویدیو کوتاه از مراحل نقاشی دستی روی روسری ابریشمی.",
        images: [],
        createdAt: new Date().toISOString(),
      },
    ],
  },
];

// Small mock artisans list for dev mode to show names, bios & avatars
const mockArtisans = [
  {
    id: "artisan-atif-1",
    name: "آتِف گلچین",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-1.svg`,
    city: "اصفهان",
    bio: "خانواده‌ای با نسل‌ها تجربه در بافت گلیم و قالی. کارگاه کوچک در جلفای اصفهان.",
  },
  {
    id: "artisan-sofali-2",
    name: "نسرین صوفالی",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-2.svg`,
    city: "تهران",
    bio: "سفال‌گر مستقل، تمرکز روی لعاب‌های مینایی و طرح‌های سنتی با ماندگاری بالا.",
  },
  {
    id: "artisan-mesi-3",
    name: "سلمان مسگری",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-3.svg`,
    city: "اصفهان",
    bio: "فلزکار و قلم‌زن با بیش از ۲۰ سال تجربه در اثرسازی و نگهداری آثار سنتی.",
  },
  {
    id: "artisan-khat-4",
    name: "مریم شکیبا",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-4.svg`,
    city: "یزد",
    bio: "خوشنویس حرفه‌ای، سازنده تابلوهای سفارشی و آموزگار خط نستعلیق.",
  },
  {
    id: "artisan-wood-5",
    name: "کیان نجفی",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-5.svg`,
    city: "شیراز",
    bio: "نجار سفارشی‌ساز؛ ساخت کابینت و مبلمان با چوب گردوی ایرانی و اتصال سنتی.",
  },
  {
    id: "artisan-textile-6",
    name: "رها تبریزی",
    avatar: `${SERVER_ORIGIN}/uploads/artisan-6.svg`,
    city: "تبریز",
    bio: "طراح پارچه و روسری ابریشمی؛ نقاشی دستی و تثبیت رنگ با تکنیک‌های سنتی.",
  },
];

export async function fetchCrafts(opts: CraftFilters = {}): Promise<{
  items: Craft[];
  total: number;
  page: number;
  limit: number;
}> {
  try {
    const { data } = await http.get<ApiResponse<Craft[]>>("/crafts", {
      params: buildQuery(opts),
    });

    // If running in dev and backend returned no items, fallback to lightweight mock
    if (
      import.meta.env.DEV &&
      Array.isArray(data.items) &&
      data.items.length === 0
    ) {
      const itemsWithArtisan = mockCrafts.map((c) => {
        const artisan = mockArtisans.find((a) => a.id === c.artisanId);
        return {
          ...c,
          artisan: artisan
            ? { id: artisan.id, name: artisan.name, avatar: artisan.avatar }
            : undefined,
        } as any;
      });
      return {
        items: itemsWithArtisan,
        total: itemsWithArtisan.length,
        page: opts.page || 1,
        limit: opts.limit || itemsWithArtisan.length,
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
    const itemsWithArtisan = mockCrafts.map((c) => {
      const artisan = mockArtisans.find((a) => a.id === c.artisanId);
      return {
        ...c,
        artisan: artisan
          ? { id: artisan.id, name: artisan.name, avatar: artisan.avatar }
          : undefined,
      } as any;
    });
    return {
      items: itemsWithArtisan,
      total: itemsWithArtisan.length,
      page: opts.page || 1,
      limit: opts.limit || itemsWithArtisan.length,
    };
  }
}

export async function fetchCraftById(
  id: string
): Promise<CraftResponse | null> {
  try {
    const { data } = await http.get<ApiResponse<CraftResponse>>(
      `/crafts/${id}`,
      {
        params: buildQuery({ _: Date.now() }),
      }
    );
    // Backend sometimes returns the craft object directly, and some
    // older clients expect a `{ data: craft }` envelope. Support both.
    if (data && (data as any).data) return (data as any).data;
    // If backend returned a plain object, return it; otherwise null
    const plain = (data as any) || null;
    if (plain) return plain;
    // If running in dev, fallback to local mock crafts for non-ObjectId ids
    if (import.meta.env.DEV) {
      const found = mockCrafts.find((c) => c.id === id);
      if (found) {
        // adapt mock to CraftResponse shape expected by consumers
        const artisan = mockArtisans.find((a) => a.id === found.artisanId);
        return {
          id: found.id,
          title: found.title,
          description: (found as any).description || "",
          images: found.images || [],
          artisan: found.artisanId
            ? {
                id: found.artisanId,
                name: artisan?.name || "",
                avatar: artisan?.avatar,
              }
            : undefined,
          craftType: (found as any).craftType || "",
          price: (found as any).price,
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
          liked: false,
          disliked: false,
          createdAt: found.createdAt,
          sale: {},
          barter: {},
          comments: (found as any).comments || [],
          commentsCount: Array.isArray((found as any).comments)
            ? (found as any).comments.length
            : 0,
        } as any;
      }
    }
    return null;
  } catch {
    // On error, if in DEV and id matches a mock, return it.
    if (import.meta.env.DEV) {
      const found = mockCrafts.find((c) => c.id === id);
      if (found) {
        return {
          id: found.id,
          title: found.title,
          description: (found as any).description || "",
          images: found.images || [],
          artisan: found.artisanId
            ? { id: found.artisanId, name: "" }
            : undefined,
          craftType: (found as any).craftType || "",
          price: (found as any).price,
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
          liked: false,
          disliked: false,
          createdAt: found.createdAt,
          sale: {},
          barter: {},
          comments: [],
          commentsCount: 0,
        } as any;
      }
    }
    return null;
  }
}

export async function fetchArtisanById(artisanId: string): Promise<any> {
  if (!import.meta.env.DEV) {
    const { data } = await http.get<ApiResponse<any>>(`/artisans/${artisanId}`);
    return data?.data || data;
  }
  const a = mockArtisans.find((x) => x.id === artisanId);
  if (!a) return null;
  const crafts = mockCrafts
    .filter((c) => c.artisanId === artisanId)
    .map((c) => ({
      id: c.id,
      title: c.title,
      images: c.images?.slice(0, 1) || [],
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
): Promise<{ liked: boolean; totalLikes: number; totalDislikes?: number }> {
  const { data } = await http.post<
    ApiResponse<{
      liked?: boolean;
      total?: number;
      totalLikes?: number;
      totalDislikes?: number;
    }>
  >(`/crafts/${id}/like`);
  const payload = data.data || {};
  return {
    liked: !!payload.liked,
    totalLikes: payload.totalLikes ?? payload.total ?? 0,
    totalDislikes: payload.totalDislikes ?? 0,
  };
}

export async function toggleDislike(
  id: string
): Promise<{ disliked: boolean; totalLikes?: number; totalDislikes: number }> {
  const { data } = await http.post<
    ApiResponse<{
      disliked?: boolean;
      total?: number;
      totalLikes?: number;
      totalDislikes?: number;
    }>
  >(`/crafts/${id}/dislike`);
  const payload = data.data || {};
  return {
    disliked: !!payload.disliked,
    totalLikes: payload.totalLikes ?? 0,
    totalDislikes: payload.totalDislikes ?? payload.total ?? 0,
  };
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
  const { data } = await http.get<ApiResponse<Craft[]>>("/crafts/mine/list");
  return Array.isArray(data?.items) ? (data.items as Craft[]) : [];
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

/**
 * Fetch crafts near a location with optional filters
 * @param params - Search parameters
 * @param params.lng - Longitude
 * @param params.lat - Latitude
 * @param params.radiusKm - Search radius in kilometers (default: 10)
 * @param params.q - Search query
 * @param params.category - Category filter
 * @param params.min - Minimum price
 * @param params.max - Maximum price
 * @returns Array of crafts with distance info when coordinates provided
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
  try {
    const { data } = await http.get<ApiResponse<Craft[]>>("/crafts/near", {
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
          category: "WEAVING",
          images: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          distanceMeters: 800,
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

// Re-export a couple of types so older imports that used to grab them from
// the service file continue to work during the incremental migration.
export type { CraftResponse, CommentResponse } from "../types/api";
