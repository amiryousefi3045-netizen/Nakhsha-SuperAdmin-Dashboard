/**
 * Posts Service
 *
 * Create, fetch and manage post content.
 * Uses the centralized apiClient for consistent normalizeError handling.
 */

import { apiClient } from "../lib/apiClient";
import type { CreatePostRequest, Post } from "../types/api";

interface PostResponse {
  item: Post;
}

// ── API functions ──────────────────────────────────────────────────────────

/**
 * Create a new post.
 */
export async function createPost(data: CreatePostRequest): Promise<Post> {
  const result = await apiClient.post<PostResponse>("/posts", data);
  if (!result.success) throw result.error!;
  return result.data!.item;
}

/**
 * Upload one or more images and attach them to an existing post.
 */
export async function uploadPostImages(
  postId: string,
  files: File[],
): Promise<Post> {
  const formData = new FormData();
  files.forEach((file) => formData.append("images", file));

  const result = await apiClient.post<PostResponse>(
    `/posts/${postId}/images`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  if (!result.success) throw result.error!;
  return result.data!.item;
}

/**
 * Fetch a single post by ID.
 */
export async function getPost(postId: string): Promise<Post> {
  const result = await apiClient.get<{ item: Post }>(`/posts/${postId}`);
  if (!result.success) throw result.error!;
  return result.data!.item;
}
