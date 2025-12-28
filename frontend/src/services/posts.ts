import { AxiosError } from "axios";
import { http } from "../lib/http";
import type { CreatePostRequest, CreatePostResponse, Post } from "../types/api";

interface NormalizedError {
  code: string;
  message: string;
  details?: any;
}

// Helper function to normalize errors
function normalizeError(error: any): NormalizedError {
  if (error instanceof AxiosError && error.response?.data?.error) {
    const errorData = error.response.data.error;
    return {
      code: errorData.code || "UNKNOWN_ERROR",
      message: errorData.message || "An unknown error occurred",
      details: errorData.details,
    };
  }

  return {
    code: "NETWORK_ERROR",
    message: "خطا در ارتباط با سرور",
    details: null,
  };
}

/**
 * Create a new post
 * @param data Post creation data
 * @returns Promise resolving to created post
 * @throws NormalizedError on failure
 */
export async function createPost(data: CreatePostRequest): Promise<Post> {
  try {
    const response = await http.post<CreatePostResponse>("/posts", data);
    return response.data.item;
  } catch (error) {
    throw normalizeError(error);
  }
}

/**
 * Upload images to an existing post
 * @param postId ID of the post to upload images to
 * @param files Array of image files to upload
 * @returns Promise resolving to updated post
 * @throws NormalizedError on failure
 */
export async function uploadPostImages(
  postId: string,
  files: File[]
): Promise<Post> {
  try {
    const formData = new FormData();

    // Add each file to form data
    files.forEach((file) => {
      formData.append("images", file);
    });

    const response = await http.post<CreatePostResponse>(
      `/posts/${postId}/images`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    return response.data.item;
  } catch (error) {
    throw normalizeError(error);
  }
}

/**
 * Get a single post by ID
 * @param postId ID of the post to retrieve
 * @returns Promise resolving to post data
 * @throws NormalizedError on failure
 */
export async function getPost(postId: string): Promise<Post> {
  try {
    const response = await http.get<{ item: Post }>(`/posts/${postId}`);
    return response.data.item;
  } catch (error) {
    throw normalizeError(error);
  }
}
