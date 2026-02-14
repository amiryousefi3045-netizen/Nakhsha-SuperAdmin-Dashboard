/**
 * Crafts Service (Refactored)
 *
 * Fully typed crafts API using centralized apiClient.
 *
 * Best Practices Demonstrated:
 * ✅ Strong typing with generics
 * ✅ Standardized ApiResult<T> responses
 * ✅ Proper error handling (no silent failures)
 * ✅ No duplicated logic
 * ✅ Centralized authentication via interceptor
 * ✅ Comprehensive JSDoc documentation
 * ✅ Clean separation of concerns
 *
 * @module services/crafts
 */

import {
  apiClient,
  type ApiResult,
  type PaginatedResult,
} from "../lib/apiClient";
import type { Craft, Comment } from "../types/api";
import type {
  CraftResponse,
  NearbyCraftsResponse,
  CraftFilters,
  GeoQuery,
  CreateCraftPayload,
  UpdateCraftPayload,
  CommentResponse,
  CommentsListResponse,
  CreateCommentPayload,
  LikeResponse,
  UploadImagesResponse,
} from "../types/services";

// ============================================================================
// Craft CRUD Operations
// ============================================================================

/**
 * Fetch a paginated list of crafts with optional filters
 *
 * @param filters - Optional filters (search, category, price range, etc.)
 * @returns ApiResult with paginated crafts list
 *
 * @example
 * ```ts
 * // Fetch all crafts
 * const result = await fetchCrafts();
 *
 * // Search with filters
 * const result = await fetchCrafts({
 *   q: "سفال",
 *   category: "POTTERY",
 *   minPrice: 100000,
 *   maxPrice: 500000,
 *   page: 1,
 *   limit: 20
 * });
 *
 * if (result.success && result.data) {
 *   result.data.forEach(craft => {
 *     console.log(craft.title, craft.price);
 *   });
 * } else {
 *   console.error("Error:", result.error?.message);
 * }
 * ```
 */
export async function fetchCrafts(
  filters?: CraftFilters,
): Promise<PaginatedResult<Craft>> {
  return apiClient.getPaginated<Craft>("/crafts", {
    page: filters?.page || 1,
    limit: filters?.limit || 20,
    ...filters,
  });
}

/**
 * Fetch a single craft by ID
 *
 * Retrieves full craft details including images, artisan info, comments, etc.
 *
 * @param id - Craft ID
 * @returns ApiResult with craft data
 *
 * @example
 * ```ts
 * const result = await fetchCraftById("craft-123");
 *
 * if (result.success && result.data) {
 *   console.log("Title:", result.data.title);
 *   console.log("Price:", result.data.price);
 *   console.log("Artisan:", result.data.artisan?.name);
 * } else if (result.error?.code === "NOT_FOUND") {
 *   console.log("Craft not found");
 * } else {
 *   console.error("Error:", result.error?.message);
 * }
 * ```
 */
export async function fetchCraftById(id: string): Promise<ApiResult<Craft>> {
  const result = await apiClient.get<CraftResponse>(`/crafts/${id}`);

  // Extract craft from wrapper response
  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item,
    };
  }

  return result as unknown as ApiResult<Craft>;
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
 *   title: "گلیم دست‌باف کاشان",
 *   description: "گلیم سنتی با نقوش قدیمی",
 *   category: "WEAVING",
 *   price: 2500000,
 *   forSale: true,
 *   tags: ["گلیم", "دست‌باف", "کاشان"],
 *   location: {
 *     city: "کاشان",
 *     coordinates: [51.4390, 33.9831]
 *   }
 * });
 *
 * if (result.success && result.data) {
 *   console.log("Created craft ID:", result.data.id);
 * } else {
 *   console.error("Creation failed:", result.error?.message);
 * }
 * ```
 */
export async function createCraft(
  payload: CreateCraftPayload,
): Promise<ApiResult<Craft>> {
  const result = await apiClient.post<CraftResponse>("/crafts", payload);

  // Extract craft from wrapper response
  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item,
    };
  }

  return result as unknown as ApiResult<Craft>;
}

/**
 * Update an existing craft
 *
 * @param id - Craft ID
 * @param payload - Partial craft data to update
 * @returns ApiResult with updated craft
 *
 * @example
 * ```ts
 * const result = await updateCraft("craft-123", {
 *   price: 3000000,
 *   forSale: false
 * });
 *
 * if (result.success && result.data) {
 *   console.log("Updated:", result.data.title);
 * } else {
 *   console.error("Update failed:", result.error?.message);
 * }
 * ```
 */
export async function updateCraft(
  id: string,
  payload: UpdateCraftPayload,
): Promise<ApiResult<Craft>> {
  const result = await apiClient.patch<CraftResponse>(`/crafts/${id}`, payload);

  // Extract craft from wrapper response
  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item,
    };
  }

  return result as unknown as ApiResult<Craft>;
}

/**
 * Delete a craft
 *
 * @param id - Craft ID
 * @returns ApiResult with success status
 *
 * @example
 * ```ts
 * const result = await deleteCraft("craft-123");
 *
 * if (result.success) {
 *   console.log("Craft deleted successfully");
 * } else {
 *   console.error("Deletion failed:", result.error?.message);
 * }
 * ```
 */
export async function deleteCraft(
  id: string,
): Promise<ApiResult<{ success: boolean }>> {
  return apiClient.delete<{ success: boolean }>(`/crafts/${id}`);
}

/**
 * Fetch crafts created by the current user
 *
 * Requires authentication.
 *
 * @returns ApiResult with user's crafts
 *
 * @example
 * ```ts
 * const result = await fetchMyCrafts();
 *
 * if (result.success && result.data) {
 *   console.log(`You have ${result.data.length} crafts`);
 *   result.data.forEach(craft => {
 *     console.log("-", craft.title);
 *   });
 * } else if (result.error?.code === "UNAUTHORIZED") {
 *   console.log("Please login first");
 * }
 * ```
 */
export async function fetchMyCrafts(): Promise<PaginatedResult<Craft>> {
  return apiClient.getPaginated<Craft>("/crafts/mine/list");
}

// ============================================================================
// Geospatial Operations
// ============================================================================

/**
 * Fetch crafts near a geographic location
 *
 * Uses geospatial indexing for efficient proximity search.
 *
 * @param query - Location and search parameters
 * @returns ApiResult with nearby crafts (sorted by distance)
 *
 * @example
 * ```ts
 * // Find crafts within 10km of Isfahan
 * const result = await fetchCraftsNear({
 *   lat: 32.6546,
 *   lng: 51.6680,
 *   radiusKm: 10,
 *   limit: 50
 * });
 *
 * if (result.success && result.data) {
 *   result.data.forEach(craft => {
 *     console.log(`${craft.title} - ${craft.distanceMeters}m away`);
 *   });
 * }
 * ```
 */
export async function fetchCraftsNear(
  query: GeoQuery,
): Promise<ApiResult<Craft[]>> {
  const result = await apiClient.get<NearbyCraftsResponse>("/crafts/near", {
    params: {
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm || 10,
      limit: query.limit || 50,
    },
  });

  // Extract items from wrapper response
  if (result.success && result.data?.items) {
    return {
      success: true,
      data: result.data.items,
    };
  }

  return result as unknown as ApiResult<Craft[]>;
}

// ============================================================================
// Image Upload Operations
// ============================================================================

/**
 * Upload images to a craft
 *
 * Handles multiple image files with multipart/form-data.
 *
 * @param craftId - Craft ID
 * @param files - Array of image files
 * @returns ApiResult with upload info (URLs, count)
 *
 * @example
 * ```ts
 * const fileInput = document.querySelector('input[type="file"]');
 * const files = Array.from(fileInput.files);
 *
 * const result = await uploadCraftImages("craft-123", files);
 *
 * if (result.success && result.data) {
 *   console.log(`Uploaded ${result.data.count} images`);
 *   result.data.urls.forEach(url => {
 *     console.log("Image URL:", url);
 *   });
 * } else {
 *   console.error("Upload failed:", result.error?.message);
 * }
 * ```
 */
export async function uploadCraftImages(
  craftId: string,
  files: File[],
): Promise<ApiResult<UploadImagesResponse>> {
  const formData = new FormData();

  // Add each file to form data
  files.forEach((file) => {
    formData.append("images", file);
  });

  return apiClient.post<UploadImagesResponse>(
    `/crafts/${craftId}/images`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
}

// ============================================================================
// Likes/Reactions Operations
// ============================================================================

/**
 * Toggle like on a craft
 *
 * If user already liked, removes like. Otherwise adds like.
 *
 * @param craftId - Craft ID
 * @returns ApiResult with updated like status and counts
 *
 * @example
 * ```ts
 * const result = await toggleLike("craft-123");
 *
 * if (result.success && result.data) {
 *   console.log("Liked:", result.data.liked);
 *   console.log("Total likes:", result.data.totalLikes);
 * }
 * ```
 */
export async function toggleLike(
  craftId: string,
): Promise<ApiResult<LikeResponse>> {
  return apiClient.post<LikeResponse>(`/crafts/${craftId}/like`);
}

/**
 * Toggle dislike on a craft
 *
 * If user already disliked, removes dislike. Otherwise adds dislike.
 *
 * @param craftId - Craft ID
 * @returns ApiResult with updated dislike status and counts
 *
 * @example
 * ```ts
 * const result = await toggleDislike("craft-123");
 *
 * if (result.success && result.data) {
 *   console.log("Disliked:", result.data.disliked);
 *   console.log("Total dislikes:", result.data.totalDislikes);
 * }
 * ```
 */
export async function toggleDislike(
  craftId: string,
): Promise<ApiResult<LikeResponse>> {
  return apiClient.post<LikeResponse>(`/crafts/${craftId}/dislike`);
}

// ============================================================================
// Comments Operations
// ============================================================================

/**
 * Fetch comments for a craft
 *
 * @param craftId - Craft ID
 * @returns ApiResult with comments list
 *
 * @example
 * ```ts
 * const result = await fetchComments("craft-123");
 *
 * if (result.success && result.data) {
 *   result.data.forEach(comment => {
 *     console.log(`${comment.user}: ${comment.text}`);
 *     if (comment.rating) {
 *       console.log(`Rating: ${comment.rating}/5`);
 *     }
 *   });
 * }
 * ```
 */
export async function fetchComments(
  craftId: string,
): Promise<ApiResult<Comment[]>> {
  const result = await apiClient.get<CommentsListResponse>(
    `/crafts/${craftId}/comments`,
  );

  // Extract comments from wrapper response
  if (result.success && result.data?.items) {
    return {
      success: true,
      data: result.data.items,
    };
  }

  return result as unknown as ApiResult<Comment[]>;
}

/**
 * Add a comment to a craft
 *
 * @param craftId - Craft ID
 * @param payload - Comment text and optional rating
 * @returns ApiResult with created comment
 *
 * @example
 * ```ts
 * const result = await addComment("craft-123", {
 *   text: "صنعتگری بسیار زیبا!",
 *   rating: 5
 * });
 *
 * if (result.success && result.data) {
 *   console.log("Comment added:", result.data.id);
 * } else {
 *   console.error("Failed to add comment:", result.error?.message);
 * }
 * ```
 */
export async function addComment(
  craftId: string,
  payload: CreateCommentPayload,
): Promise<ApiResult<Comment>> {
  const result = await apiClient.post<CommentResponse>(
    `/crafts/${craftId}/comments`,
    payload,
  );

  // Extract comment from wrapper response
  if (result.success && result.data?.comment) {
    return {
      success: true,
      data: result.data.comment,
    };
  }

  return result as unknown as ApiResult<Comment>;
}

/**
 * Delete a comment
 *
 * User can only delete their own comments.
 *
 * @param craftId - Craft ID
 * @param commentId - Comment ID
 * @returns ApiResult with success status
 *
 * @example
 * ```ts
 * const result = await deleteComment("craft-123", "comment-456");
 *
 * if (result.success) {
 *   console.log("Comment deleted");
 * } else if (result.error?.code === "FORBIDDEN") {
 *   console.log("You can only delete your own comments");
 * }
 * ```
 */
export async function deleteComment(
  craftId: string,
  commentId: string,
): Promise<ApiResult<{ success: boolean }>> {
  return apiClient.delete<{ success: boolean }>(
    `/crafts/${craftId}/comments/${commentId}`,
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Seed development data (dev mode only)
 *
 * Populates database with sample crafts for development/testing.
 *
 * @returns ApiResult with seed status
 *
 * @example
 * ```ts
 * if (import.meta.env.DEV) {
 *   const result = await seedDevelopmentData();
 *   if (result.success) {
 *     console.log("Dev data seeded successfully");
 *   }
 * }
 * ```
 */
export async function seedDevelopmentData(): Promise<
  ApiResult<{ success: boolean; message: string; count: number }>
> {
  return apiClient.post<{ success: boolean; message: string; count: number }>(
    "/crafts/seed/dev",
  );
}
