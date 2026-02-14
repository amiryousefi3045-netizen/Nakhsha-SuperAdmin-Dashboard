/**
 * Posts Service v2
 *
 * Refactored to use centralized apiClient with standardized responses.
 *
 * Features:
 * - All functions return ApiResult<T>
 * - Automatic token management via interceptor
 * - Standardized error handling with Persian messages
 * - Full TypeScript support with generic types
 * - File upload support with FormData
 *
 * @example
 * ```ts
 * const result = await createPost({ title: "عنوان", body: "متن" });
 * if (result.success) {
 *   console.log("Post created:", result.data?.id);
 * }
 * ```
 */

import { apiClient, type ApiResult } from "../lib/apiClient";
import type { CreatePostRequest, Post } from "../types/api";

// ============================================================================
// Backend Response Types
// ============================================================================

/**
 * Backend response wrapper for post operations
 */
interface PostResponse {
  item: Post;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a new post
 *
 * @param data - Post creation data (title, body, images, etc.)
 * @returns ApiResult with created post
 *
 * @example
 * ```ts
 * const result = await createPost({
 *   title: "عنوان پست جدید",
 *   body: "متن پست با جزئیات کامل",
 *   tags: ["صنایع دستی", "هنر"]
 * });
 *
 * if (result.success) {
 *   console.log("Post ID:", result.data?.id);
 *   console.log("Posted at:", result.data?.createdAt);
 * } else {
 *   console.error("Error:", result.error?.message);
 * }
 * ```
 */
export async function createPost(
  data: CreatePostRequest,
): Promise<ApiResult<Post>> {
  const result = await apiClient.post<PostResponse>("/posts", data);

  // Extract post from wrapper response
  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item,
    };
  }

  return result as unknown as ApiResult<Post>;
}

/**
 * Upload images to an existing post
 *
 * Uploads multiple image files and attaches them to the specified post.
 *
 * @param postId - ID of the post to upload images to
 * @param files - Array of image files to upload
 * @returns ApiResult with updated post including new images
 *
 * @example
 * ```ts
 * const fileInput = document.querySelector('input[type="file"]');
 * const files = Array.from(fileInput.files);
 *
 * const result = await uploadPostImages("post-123", files);
 *
 * if (result.success) {
 *   console.log("Images uploaded:", result.data?.images?.length);
 * } else {
 *   console.error("Upload failed:", result.error?.message);
 * }
 * ```
 */
export async function uploadPostImages(
  postId: string,
  files: File[],
): Promise<ApiResult<Post>> {
  const formData = new FormData();

  // Add each file to form data
  files.forEach((file) => {
    formData.append("images", file);
  });

  const result = await apiClient.post<PostResponse>(
    `/posts/${postId}/images`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  // Extract post from wrapper response
  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item,
    };
  }

  return result as unknown as ApiResult<Post>;
}

/**
 * Get a single post by ID
 *
 * Retrieves full post details including author info, images, comments, etc.
 *
 * @param postId - ID of the post to retrieve
 * @returns ApiResult with post data
 *
 * @example
 * ```ts
 * const result = await getPost("post-123");
 *
 * if (result.success && result.data) {
 *   console.log("Title:", result.data.title);
 *   console.log("Author:", result.data.author?.name);
 *   console.log("Images:", result.data.images?.length);
 * } else if (result.error?.code === "NOT_FOUND") {
 *   console.log("Post not found");
 * } else {
 *   console.error("Error:", result.error?.message);
 * }
 * ```
 */
export async function getPost(postId: string): Promise<ApiResult<Post>> {
  const result = await apiClient.get<PostResponse>(`/posts/${postId}`);

  // Extract post from wrapper response
  if (result.success && result.data?.item) {
    return {
      success: true,
      data: result.data.item,
    };
  }

  return result as unknown as ApiResult<Post>;
}

// ============================================================================
// Type Exports for Consumers
// ============================================================================

export type { PostResponse };
