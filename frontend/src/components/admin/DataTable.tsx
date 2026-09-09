import type { ReactNode } from "react";
import cn from "classnames";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyGetter: (row: T) => string;
  emptyText?: string;
  isLoading?: boolean;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  keyGetter,
  emptyText = "موردی یافت نشد",
  isLoading,
  className,
}: DataTableProps<T>) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white",
        className,
      )}
    >
      <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
        <thead className="bg-[var(--color-primary)]/5">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-start font-semibold text-[var(--color-text)] whitespace-nowrap",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-[var(--color-muted)]">
                در حال بارگذاری...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-[var(--color-muted)]">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={keyGetter(row)} className="hover:bg-[var(--color-primary)]/[0.03]">
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3 align-middle", col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}