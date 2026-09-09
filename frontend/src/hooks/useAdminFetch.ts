/**
 * useAdminFetch — small async-data hook used across the super admin pages.
 *
 * Re-runs the fetcher whenever `enabled` flips to true or any of
 * `dependencies` changes. Guards against out-of-order responses via a
 * monotonically increasing request id.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface UseAdminFetchOptions {
  enabled?: boolean;
  dependencies?: readonly unknown[];
}

interface UseAdminFetchResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const getMessage = (e: unknown): string =>
  e instanceof Error ? e.message : "خطا در دریافت اطلاعات";

export function useAdminFetch<T>(
  fetcher: () => Promise<T>,
  options: UseAdminFetchOptions = {},
): UseAdminFetchResult<T> {
  const { enabled = true, dependencies = [] } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (id === requestId.current) {
        setData(result);
      }
    } catch (e) {
      if (id === requestId.current) {
        setError(getMessage(e));
      }
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...dependencies]);

  return { data, isLoading, error, reload: run };
}