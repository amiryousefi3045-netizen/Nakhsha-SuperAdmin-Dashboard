export type GeoPoint = { type: "Point"; coordinates: [number, number] };

export type Craft = {
  id: string;
  title: string;
  description?: string;
  category?:
    | "WEAVING"
    | "POTTERY"
    | "WOODWORK"
    | "EMBROIDERY"
    | "JEWELRY"
    | "PAINTING"
    | "OTHER";
  price?: number;
  images?: string[];
  city?: string;
  // support both GeoJSON Point and legacy location object (city + coordinates)
  location?:
    | GeoPoint
    | { city?: string; neighborhood?: string; coordinates?: [number, number] };
  createdAt?: string;
  updatedAt?: string;
  distanceMeters?: number;
  // additional optional fields used by the UI
  artisanId?: string;
  tags?: string[];
  forSale?: boolean;
  materials?: Array<{ name: string; amount?: string | number; unit?: string }>;
  craftingSteps?: Array<{
    step?: number;
    title?: string;
    description?: string;
    image?: string;
  }>;
  craftingTime?: { total?: number };
  type?: string;
  dimensions?: string;
};

export type CraftCreateRequest = Omit<
  Craft,
  "id" | "createdAt" | "updatedAt" | "distanceMeters"
>;

export type CraftUpdateRequest = Partial<CraftCreateRequest>;

export type NearQuery = {
  lng: number;
  lat: number;
  radiusKm?: number;
  q?: string;
  category?: string;
  min?: number;
  max?: number;
};

// Generic API response: includes common list metadata and a data payload
export interface ApiResponse<T = any> {
  data?: T;
  items?: T extends Array<infer U> ? U[] : unknown[];
  total?: number;
  page?: number;
  limit?: number;
  message?: string;
}

// Backwards-compatible alias used in some places
export type ApiListResponse<T> = ApiResponse<T>;

// Standardized error response format
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface User {
  id: string;
  name: string;
  phone: string;
  handle?: string | null;
  avatar: string; // Always absolute URL
  bio: string;
  location: {
    city: string;
    neighborhood: string;
    coordinates: {
      lat: number | null;
      lng: number | null;
    };
  };
  role: "user" | "tour_leader" | "admin";
  creatorType: "artisan" | "tour_leader";
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

// Removed LoginRequest, RegisterRequest, and AuthResponse types
// since the app now uses OTP-only authentication

export type CraftResponse = Craft & {
  liked?: boolean;
  disliked?: boolean;
  _liked?: boolean;
  _disliked?: boolean;
  comments?: Comment[];
  artisan?: { id?: string; name?: string };
  totalLikes?: number;
  totalDislikes?: number;
};

export type CommentResponse = Comment;

export type CraftFilters = Partial<{
  bounds: { north: number; south: number; east: number; west: number };
  page: number;
  limit: number;
  q: string;
  sort: "latest" | "price_asc" | "price_desc" | "rating";
  lat: number;
  lng: number;
  radius: number;
  tags: string[];
  priceRange: [number, number];
  forSale: boolean;
}>;

export interface Comment {
  id: string;
  craftId?: string;
  // some parts of the UI reference `c.user` instead of userId; keep both
  userId?: string | number;
  user?: string | number;
  text: string;
  rating?: number;
  createdAt: string;
  updatedAt?: string;
}

export type CommentCreateRequest = {
  text: string;
  rating?: number;
};
