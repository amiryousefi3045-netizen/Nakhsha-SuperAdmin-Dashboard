/**
 * Users / Public Profiles Service
 *
 * Covers public-profile look-up and follow/save operations.
 * Uses the centralized apiClient for consistent normalizeError handling.
 */

import { apiClient } from "../lib/apiClient";
import type { User, ContentItem } from "../types/api";

// ── Public profile look-up ─────────────────────────────────────────────────

/**
 * Fetch a public profile by handle or ID (generic resolver).
 */
export async function getProfile(handleOrId: string): Promise<User> {
  const result = await apiClient.get<User>(`/profiles/${handleOrId}`);
  if (!result.success) throw result.error!;
  return result.data!;
}

/**
 * Fetch a public profile by handle via the `/profiles/handle/` endpoint.
 */
export async function getProfileByHandle(handle: string): Promise<User> {
  const result = await apiClient.get<User>(`/profiles/handle/${handle}`);
  if (!result.success) throw result.error!;
  return result.data!;
}

/**
 * Fetch a public profile by handle via the `/users/handle/` endpoint.
 * Used by PublicProfile.tsx.
 */
export async function getPublicProfile(handle: string): Promise<User> {
  const result = await apiClient.get<{ user: User }>(`/users/handle/${handle}`);
  if (!result.success) throw result.error!;
  return result.data!.user;
}

/**
 * Fetch a public user by handle — same as getPublicProfile, named to match
 * existing callers in PublicProfilePage.tsx.
 */
export async function getPublicUserByHandle(handle: string): Promise<User> {
  const result = await apiClient.get<{ user: User }>(`/users/handle/${handle}`);
  if (!result.success) throw result.error!;
  return result.data!.user;
}

/**
 * Fetch a public profile by ID.
 */
export async function getProfileById(id: string): Promise<User> {
  const result = await apiClient.get<User>(`/profiles/id/${id}`);
  if (!result.success) throw result.error!;
  return result.data!;
}

// ── Public user content ────────────────────────────────────────────────────

/**
 * Fetch a user's public content items (posts / tours / tutorials).
 */
export async function getPublicUserContent(
  handle: string,
  type: "posts" | "tours" | "tutorials",
): Promise<ContentItem[]> {
  const result = await apiClient.get<{ items: ContentItem[] }>(
    `/users/handle/${handle}/content?type=${type}`,
  );
  if (!result.success) throw result.error!;
  return result.data!.items;
}

// ── Follow / Save ──────────────────────────────────────────────────────────

/**
 * Check whether the current user has saved/followed a profile.
 * Returns false on error instead of throwing (used in optional UI states).
 */
export async function isProfileSaved(profileId: string): Promise<boolean> {
  const result = await apiClient.get<{ saved: boolean }>(
    `/profiles/${profileId}/saved`,
  );
  if (!result.success) return false;
  return !!result.data?.saved;
}

/**
 * Save / follow a user profile.
 */
export async function saveProfile(
  profileId: string,
): Promise<{ saved: boolean }> {
  const result = await apiClient.post<{ saved: boolean }>(
    `/profiles/${profileId}/save`,
  );
  if (!result.success) throw result.error!;
  return result.data!;
}

/**
 * Unsave / unfollow a user profile.
 */
export async function unsaveProfile(
  profileId: string,
): Promise<{ saved: boolean }> {
  const result = await apiClient.delete<{ saved: boolean }>(
    `/profiles/${profileId}/save`,
  );
  if (!result.success) throw result.error!;
  return result.data!;
}
