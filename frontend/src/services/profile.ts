import { http } from "../lib/http";
import type { User, ContentItem } from "../types/api";

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
 * Fetch public user by handle - YouTube-like API function
 * @param handle - User handle/username
 * @returns API response with user object and normalized errors
 */
export async function getPublicUserByHandle(handle: string): Promise<User> {
  try {
    const response = await http.get<{ user: User }>(`/users/handle/${handle}`);
    return response.data.user;
  } catch (error: any) {
    // Normalize errors for consistent handling
    if (error.response?.status === 404) {
      throw {
        code: "USER_NOT_FOUND",
        message: "کاربر پیدا نشد",
        details: { handle },
      };
    }

    if (error.response?.status === 400) {
      throw {
        code: "INVALID_HANDLE",
        message: "شناسه کاربری نامعتبر است",
        details: { handle },
      };
    }

    // For other errors, preserve original or provide fallback
    throw {
      code: "API_ERROR",
      message: error.response?.data?.message || "خطا در دریافت اطلاعات کاربر",
      details: { handle, originalError: error.message },
    };
  }
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

/**
 * Fetch user content by handle and type
 * @param handle - User handle/username
 * @param type - Content type: posts, tours, or tutorials
 * @returns Array of content items
 */
export async function getPublicUserContent(
  handle: string,
  type: "posts" | "tours" | "tutorials"
): Promise<ContentItem[]> {
  try {
    const response = await http.get<{ items: ContentItem[] }>(
      `/users/handle/${handle}/content?type=${type}`
    );
    return response.data.items;
  } catch (error: any) {
    // Normalize errors for consistent handling
    if (error.response?.status === 404) {
      throw {
        code: "USER_NOT_FOUND",
        message: "کاربر پیدا نشد",
        details: { handle },
      };
    }

    if (error.response?.status === 400) {
      throw {
        code: "VALIDATION_ERROR",
        message: "نوع محتوا نامعتبر است",
        details: { handle, type },
      };
    }

    // For other errors, preserve original or provide fallback
    throw {
      code: "API_ERROR",
      message:
        error.response?.data?.error?.message || "خطا در دریافت محتوای کاربر",
      details: { handle, type, originalError: error.message },
    };
  }
}
