import { http } from "../lib/http";
import type { User } from "../types/api";

/**
 * Fetch a user profile by handle (username/slug) or ID
 * @param handleOrId - User handle or user ID
 * @returns User profile data
 */
export async function getProfile(handleOrId: string): Promise<User> {
  const response = await http.get<User>(`/profiles/${handleOrId}`);
  return response.data;
}

/**
 * Fetch profile by handle specifically
 * @param handle - User handle/username
 * @returns User profile data
 */
export async function getProfileByHandle(handle: string): Promise<User> {
  const response = await http.get<User>(`/profiles/handle/${handle}`);
  return response.data;
}

/**
 * Fetch public profile by handle (matches backend endpoint)
 * @param handle - User handle/username
 * @returns User profile data
 */
export async function getPublicProfile(handle: string): Promise<User> {
  const response = await http.get<{ user: User }>(`/users/handle/${handle}`);
  return response.data.user;
}

/**
 * Fetch profile by ID specifically
 * @param id - User ID
 * @returns User profile data
 */
export async function getProfileById(id: string): Promise<User> {
  const response = await http.get<User>(`/profiles/id/${id}`);
  return response.data;
}

/**
 * Check if current user has saved/followed this profile
 * @param profileId - Profile user ID
 * @returns Whether the profile is saved/followed
 */
export async function isProfileSaved(profileId: string): Promise<boolean> {
  try {
    const response = await http.get<{ saved: boolean }>(
      `/profiles/${profileId}/saved`
    );
    return response.data.saved;
  } catch (error) {
    return false;
  }
}

/**
 * Save/Follow a user profile
 * @param profileId - Profile user ID
 * @returns Updated save status
 */
export async function saveProfile(
  profileId: string
): Promise<{ saved: boolean }> {
  const response = await http.post<{ saved: boolean }>(
    `/profiles/${profileId}/save`
  );
  return response.data;
}

/**
 * Unsave/Unfollow a user profile
 * @param profileId - Profile user ID
 * @returns Updated save status
 */
export async function unsaveProfile(
  profileId: string
): Promise<{ saved: boolean }> {
  const response = await http.delete<{ saved: boolean }>(
    `/profiles/${profileId}/save`
  );
  return response.data;
}
