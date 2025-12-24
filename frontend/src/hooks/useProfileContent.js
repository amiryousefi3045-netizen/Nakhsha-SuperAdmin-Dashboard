import { useState, useEffect } from "react";
import {
  generateMockPosts,
  generateMockTours,
  generateMockTutorials,
} from "../utils/mockContentData";

/**
 * Custom hook for fetching profile content
 * @param {string} handle - User handle/username
 * @param {string} tab - Active tab ('posts' | 'tours' | 'tutorials')
 * @returns {Object} - { items, isLoading, error }
 */
const useProfileContent = (handle, tab) => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContent = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Simulate API call with setTimeout
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Get mock data based on tab
        let mockData = [];
        switch (tab) {
          case "posts":
            mockData = generateMockPosts();
            break;
          case "tours":
            mockData = generateMockTours();
            break;
          case "tutorials":
            mockData = generateMockTutorials();
            break;
          default:
            mockData = generateMockPosts();
        }

        // Simulate occasional errors (5% chance)
        if (Math.random() < 0.05) {
          throw new Error("خطا در بارگذاری محتوا. لطفاً دوباره تلاش کنید.");
        }

        setItems(mockData);
      } catch (err) {
        console.error("Failed to fetch profile content:", err);
        setError(err.message || "خطا در بارگذاری محتوا");
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch if we have a handle and tab
    if (handle && tab) {
      fetchContent();
    }
  }, [handle, tab]);

  // TODO: Replace with real API call when backend is ready
  // const fetchContentFromAPI = async (userHandle, contentTab) => {
  //   const response = await fetch(`/api/profiles/${userHandle}/content?tab=${contentTab}`);
  //   if (!response.ok) {
  //     throw new Error('Failed to fetch content');
  //   }
  //   return response.json();
  // };

  return { items, isLoading, error };
};

export default useProfileContent;
