import { useEffect, useState } from "react";

/**
 * useDebounce — returns `value` after it has stayed unchanged for `delayMs`.
 *
 * Used on search inputs so keystrokes don't fire a network request each
 * time; the real fetch runs only once the user pauses typing. A change in
 * `delayMs` restarts the timer.
 */
export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}