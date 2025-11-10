// Common API response wrapper
export interface ApiResponse<T> {
  items?: T[];
  total?: number;
  page?: number;
  limit?: number;
  data?: T;
  message?: string;
}

// Auth types
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "user" | "admin" | "artisan";
  avatar?: string;
  location?: {
    city?: string;
    neighborhood?: string;
    coordinates?: [number, number]; // [longitude, latitude]
  };
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  email?: string;
  phone?: string;
  password: string;
}

export interface RegisterRequest
  extends Omit<User, "id" | "isVerified" | "createdAt" | "updatedAt"> {
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Craft types
export interface Craft {
  id: string;
  title: string;
  description?: string;
  images: string[];
  price: number;
  forSale: boolean;
  artisanId: string;
  location?: {
    city: string;
    coordinates: [number, number];
  };
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CraftCreateRequest
  extends Omit<Craft, "id" | "artisanId" | "createdAt" | "updatedAt"> {}

export interface CraftUpdateRequest extends Partial<CraftCreateRequest> {}

export interface CraftFilters {
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  page?: number;
  limit?: number;
  q?: string;
  sort?: "latest" | "price_asc" | "price_desc" | "rating";
  lat?: number;
  lng?: number;
  radius?: number; // km
  tags?: string[];
  priceRange?: [number, number];
  forSale?: boolean;
}

// Artisan types
export interface Artisan {
  id: string;
  userId: string;
  name: string;
  bio?: string;
  craftType: string;
  otherCraftTypes?: string[];
  images: string[];
  location: {
    city: string;
    neighborhood?: string;
    address?: string;
    coordinates: [number, number];
  };
  contactInfo?: {
    email?: string;
    phone?: string;
    telegram?: string;
    instagram?: string;
  };
  certifications?: Array<{
    title: string;
    issuer: string;
    year: number;
    image?: string;
  }>;
  verified: boolean;
  rating: {
    average: number;
    total: number;
    count: number;
  };
  reviews: Array<{
    userId: string;
    rating: number;
    text?: string;
    createdAt: string;
  }>;
  preferences?: {
    shipping?: {
      available: boolean;
      nationwide: boolean;
      cities?: string[];
      methods?: string[];
    };
    payment?: {
      acceptsCash: boolean;
      acceptsOnline: boolean;
      acceptsBarter: boolean;
    };
    workshop?: {
      hasPhysicalShop: boolean;
      acceptsVisitors: boolean;
      visitorNote?: string;
    };
  };
}

// Comment types
export interface Comment {
  id: string;
  craftId: string;
  userId: string;
  text: string;
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommentCreateRequest {
  text: string;
  rating?: number;
}
