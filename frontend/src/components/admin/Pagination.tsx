import cn from "classnames";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { faNumber } from "../../lib/adminFormat";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (nextPage: number) => void;
  className?: string;
}

function pageRange(page: number, totalPages: number): number[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 3) return [1, 2, 3, 4, 5];
  if (page >= totalPages - 2) {
    return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [page - 2, page - 1, page, page + 1, page + 2];
}

export function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = pageRange(page, totalPages);

  return (
    <nav
      aria-label="صفحه‌بندی"
      className={cn("flex items-center justify-center gap-1.5", className)}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="صفحه قبل"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors",
            p === page
              ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
              : "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-primary)]/5",
          )}
          aria-current={p === page ? "page" : undefined}
        >
          {faNumber(p)}
        </button>
      ))}

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="صفحه بعد"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    </nav>
  );
}