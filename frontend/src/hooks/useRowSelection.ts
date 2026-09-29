import { useCallback, useMemo, useState } from "react";

/**
 * Multi-select state for a table of ids (Phase 32, P1-06).
 *
 * Selection is scoped to the current page: "select all" marks the ids that
 * are visible *right now* — the client has no authority to assume a
 * server-side page it has not fetched. The caller must clear() when the
 * page/filters change so a bulk action never hits a stale selection.
 */
export function useRowSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(
    (pageIds: string[], allChecked: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (allChecked) {
          pageIds.forEach((id) => next.delete(id));
        } else {
          pageIds.forEach((id) => next.add(id));
        }
        return next;
      });
    },
    [],
  );
  const clear = useCallback(() => setSelected(new Set()), []);

  const count = useMemo(() => selected.size, [selected]);
  return { selected, count, isSelected, toggle, toggleAll, clear };
}