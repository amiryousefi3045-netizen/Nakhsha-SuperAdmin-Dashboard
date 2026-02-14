/**
 * Profile Service (Refactored Example)
 *
 * Demonstrates migration from old http client to new apiClient.
 * Shows best practices for:
 * - Type-safe API calls
 * - Paginated endpoints
 * - Error handling
 * - Response transformations
 */

import {
  apiClient,
  type ApiResult,
  type PaginatedResult,
} from "../lib/apiClient";
import type { User, ContentItem } from "../types/api";

/**
 * Profile response from backend
 */
interface ProfileResponse {
  user: User;
  stats?: {
    postsCount: number;
    toursCount: number;
    tutorialsCount: number;
  };
}

/**
 * Content query parameters
 */
interface ContentQueryParams {
  tab?: "posts" | "tours" | "tutorials";
  page?: number;
  limit?: number;
}

// ============================================================================
// Public Profile Methods
// ============================================================================

/**
 * Fetch public profile by handle
 *
 * @param handle - User's unique handle (e.g., "username")
 * @returns Promise<ApiResult<ProfileResponse>>
 *
 * @example
 * ```ts
 * const result = await fetchPublicProfile("artisan-hassan");
 * if (result.success) {
 *   const { user, stats } = result.data;
 *   console.log(`${user.name} has ${stats?.postsCount} posts`);
 * } else {
 *   console.error("Profile not found:", result.error?.message);
 * }
 * ```
 */
export async function fetchPublicProfile(
  handle: string,
): Promise<ApiResult<ProfileResponse>> {
  return apiClient.get<ProfileResponse>(`/profiles/${handle}`);
}

/**
 * Fetch user's content (posts, tours, tutorials)
 *
 * @param handle - User's handle
 * @param params - Query parameters (tab, pagination)
 * @returns Promise<PaginatedResult<ContentItem>>
 *
 * @example
 * ```ts
 * const result = await fetchUserContent("artisan-hassan", {
 *   tab: "posts",
 *   page: 1,
 *   limit: 20,
 * });
 *
 * if (result.success) {
 *   console.log(`Found ${result.data?.length} items`);
 *   console.log(`Total: ${result.meta?.total}`);
 * }
 * ```
 */
export async function fetchUserContent(
  handle: string,
  params: ContentQueryParams = {},
): Promise<PaginatedResult<ContentItem>> {
  return apiClient.getPaginated<ContentItem>(
    `/profiles/${handle}/content`,
    params,
  );
}

/**
 * Follow a user
 *
 * @param userId - ID of user to follow
 * @returns Promise<ApiResult<{ success: boolean }>>
 *
 * @example
 * ```ts
 * const result = await followUser("user-123");
 * if (result.success) {
 *   console.log("Now following user");
 * }
 * ```
 */
export async function followUser(
  userId: string,
): Promise<ApiResult<{ success: boolean }>> {
  return apiClient.post<{ success: boolean }>(`/profiles/${userId}/follow`);
}

/**
 * Unfollow a user
 *
 * @param userId - ID of user to unfollow
 * @returns Promise<ApiResult<{ success: boolean }>>
 */
export async function unfollowUser(
  userId: string,
): Promise<ApiResult<{ success: boolean }>> {
  return apiClient.delete<{ success: boolean }>(`/profiles/${userId}/follow`);
}

/**
 * Get user's followers
 *
 * @param userId - User ID
 * @param params - Pagination params
 * @returns Promise<PaginatedResult<User>>
 */
export async function getFollowers(
  userId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResult<User>> {
  return apiClient.getPaginated<User>(`/profiles/${userId}/followers`, params);
}

/**
 * Get users that a user is following
 *
 * @param userId - User ID
 * @param params - Pagination params
 * @returns Promise<PaginatedResult<User>>
 */
export async function getFollowing(
  userId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResult<User>> {
  return apiClient.getPaginated<User>(`/profiles/${userId}/following`, params);
}

// ============================================================================
// Type Exports
// ============================================================================

export type { ProfileResponse, ContentQueryParams };
