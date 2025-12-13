import { http } from "../lib/http";
// Re-export some media helpers for convenience
import { uploadImage, reverseGeocode } from "./media";

// Fetch all crafts with optional filters, bounds, search, etc.
export async function fetchCrafts(params = {}) {
  try {
    const response = await http.get("/crafts", { params });
    return response.data;
  } catch (error) {
    console.error("fetchCrafts error:", error.message);
    throw error;
  }
}

// Fetch a single craft by ID
export async function fetchCraftById(id) {
  try {
    if (!id) throw new Error("ID is required");
    const response = await http.get(`/crafts/${id}`);
    return response.data;
  } catch (error) {
    // If the backend returns 404 (not found), return null so callers
    // can render a 'not found' state instead of an unhandled rejection.
    const status = error?.response?.status;
    console.warn(`fetchCraftById(${id}) failed with status: ${status}`);
    if (status === 404) return null;
    console.error(`fetchCraftById(${id}) error:`, error.message);
    throw error;
  }
}

// Create a new craft
export async function createCraft(payload) {
  try {
    const response = await http.post("/crafts", payload);
    return response.data;
  } catch (error) {
    console.error("createCraft error:", error.message);
    throw error;
  }
}

// Update an existing craft
export async function updateCraft(id, payload) {
  try {
    const response = await http.put(`/crafts/${id}`, payload);
    return response.data;
  } catch (error) {
    console.error(`updateCraft(${id}) error:`, error.message);
    throw error;
  }
}

// Delete a craft
export async function deleteCraft(id) {
  try {
    const response = await http.delete(`/crafts/${id}`);
    return response.data;
  } catch (error) {
    console.error(`deleteCraft(${id}) error:`, error.message);
    throw error;
  }
}

// Toggle like on a craft
export async function toggleLike(id) {
  try {
    const response = await http.post(`/crafts/${id}/like`);
    return response.data;
  } catch (error) {
    console.error(`toggleLike(${id}) error:`, error.message);
    throw error;
  }
}

// Toggle dislike on a craft
export async function toggleDislike(id) {
  try {
    const response = await http.post(`/crafts/${id}/dislike`);
    return response.data;
  } catch (error) {
    console.error(`toggleDislike(${id}) error:`, error.message);
    throw error;
  }
}

// Add a comment to a craft
export async function addComment(id, payload) {
  try {
    const response = await http.post(`/crafts/${id}/comments`, payload);
    return response.data;
  } catch (error) {
    console.error(`addComment(${id}) error:`, error.message);
    throw error;
  }
}

// Delete a comment from a craft
export async function deleteComment(id, commentId) {
  try {
    const response = await http.delete(`/crafts/${id}/comments/${commentId}`);
    return response.data;
  } catch (error) {
    console.error(`deleteComment(${id}, ${commentId}) error:`, error.message);
    throw error;
  }
}

// Fetch crafts that belong to the current authenticated user
export async function fetchMyCrafts() {
  try {
    const response = await http.get("/crafts/mine/list");
    // Normalize to an array if backend uses { items: [...] }
    return Array.isArray(response.data?.items) ? response.data.items : [];
  } catch (error) {
    console.error("fetchMyCrafts error:", error?.message || error);
    throw error;
  }
}

// Fetch crafts near a location (geospatial search)
export async function fetchCraftsNear(params = {}) {
  try {
    const response = await http.get("/listings/near", { params });
    return response.data;
  } catch (error) {
    console.error("fetchCraftsNear error:", error.message);
    throw error;
  }
}

// Seed development data
export async function seedDev() {
  try {
    const response = await http.get("/crafts/seed/dev");
    return response.data;
  } catch (error) {
    console.error("seedDev error:", error.message);
    throw error;
  }
}

// Re-export media helpers so consumers can import them from this module
export { uploadImage, reverseGeocode };
