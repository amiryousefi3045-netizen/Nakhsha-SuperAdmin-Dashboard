/**
 * useSellerFetch — domain wrapper over the shared async-data hook.
 *
 * The seller pages never reach into the admin hook directly; they use this
 * alias so Seller and Admin stay separate domains with shared plumbing.
 */
import { useAdminFetch } from "./useAdminFetch";

interface UseSellerFetchOptions {
  enabled?: boolean;
  dependencies?: readonly unknown[];
}

interface UseSellerFetchResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useSellerFetch<T>(
  fetcher: () => Promise<T>,
  options: UseSellerFetchOptions = {},
): UseSellerFetchResult<T> {
  return useAdminFetch<T>(fetcher, options);
}