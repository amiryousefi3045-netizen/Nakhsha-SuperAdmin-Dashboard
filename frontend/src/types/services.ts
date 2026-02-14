/**
 * Service Layer Type Definitions
 *
 * Comprehensive types for all API service responses.
 * These types define the backend response shapes before transformation.
 */

import type { Craft, User, Post, Comment } from "./api";

// ============================================================================
// Crafts Service Types
// ============================================================================

/**
 * Backend response for single craft operations
 */
export interface CraftResponse {
  item: Craft;
  liked?: boolean;
  disliked?: boolean;
}

/**
 * Backend response for craft list/search operations
 */
export interface CraftsListResponse {
  items: Craft[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Backend response for nearby crafts
 */
export interface NearbyCraftsResponse {
  items: Craft[];
  center: {
    lat: number;
    lng: number;
  };
  radiusKm: number;
  total: number;
}

/**
 * Craft filters for search/list operations
 */
export interface CraftFilters {
  q?: string; // Search query
  category?: string; // Craft category
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  forSale?: boolean;
  artisanId?: string;
  page?: number;
  limit?: number;
  sort?: "latest" | "price_asc" | "price_desc" | "popular";
}

/**
 * Geospatial query parameters
 */
export interface GeoQuery {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}

/**
 * Craft creation payload
 */
export interface CreateCraftPayload {
  title: string;
  description?: string;
  category?: string;
  price?: number;
  forSale?: boolean;
  tags?: string[];
  location?: {
    city?: string;
    neighborhood?: string;
    coordinates?: [number, number];
  };
  materials?: Array<{
    name: string;
    amount?: string | number;
    unit?: string;
  }>;
  craftingSteps?: Array<{
    step?: number;
    title?: string;
    description?: string;
  }>;
}

/**
 * Craft update payload
 */
export interface UpdateCraftPayload extends Partial<CreateCraftPayload> {}

// ============================================================================
// Comments Service Types
// ============================================================================

/**
 * Backend response for comment operations
 */
export interface CommentResponse {
  comment: Comment;
}

/**
 * Backend response for comments list
 */
export interface CommentsListResponse {
  items: Comment[];
  total: number;
  craftId: string;
}

/**
 * Comment creation payload
 */
export interface CreateCommentPayload {
  text: string;
  rating?: number;
}

// ============================================================================
// Likes/Reactions Service Types
// ============================================================================

/**
 * Backend response for like/dislike operations
 */
export interface LikeResponse {
  liked: boolean;
  disliked: boolean;
  totalLikes: number;
  totalDislikes: number;
}

// ============================================================================
// Media/Upload Service Types
// ============================================================================

/**
 * Backend response for image upload
 */
export interface UploadImageResponse {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

/**
 * Backend response for multiple image uploads
 */
export interface UploadImagesResponse {
  urls: string[];
  count: number;
}

/**
 * Reverse geocoding response
 */
export interface ReverseGeocodeResponse {
  city: string;
  neighborhood?: string;
  province?: string;
  country?: string;
}

// ============================================================================
// Profile Service Types
// ============================================================================

/**
 * Backend response for user profile
 */
export interface ProfileResponse {
  user: User;
}

/**
 * Backend response for user content
 */
export interface UserContentResponse {
  items: Array<{
    id: string;
    type: "craft" | "post" | "tour";
    title: string;
    thumbnailUrl?: string;
    city?: string;
    price?: number;
    createdAt: string;
  }>;
  total: number;
}

/**
 * Profile update payload
 */
export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  avatar?: string;
  location?: {
    city?: string;
    neighborhood?: string;
  };
}

// ============================================================================
// Authentication Service Types
// ============================================================================

/**
 * OTP start response
 */
export interface OtpStartResponse {
  success: boolean;
  message: string;
  devCode?: string;
  retryAfterSeconds?: number;
}

/**
 * OTP verification response
 */
export interface OtpVerifyResponse {
  token: string;
  user: User;
}

/**
 * Auth me response
 */
export interface AuthMeResponse {
  user: User;
}

// ============================================================================
// Posts Service Types
// ============================================================================

/**
 * Backend response for single post operations
 */
export interface PostResponse {
  item: Post;
}

/**
 * Backend response for posts list
 */
export interface PostsListResponse {
  items: Post[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  services: {
    database?: "ok" | "error";
    redis?: "ok" | "error";
    storage?: "ok" | "error";
  };
}
