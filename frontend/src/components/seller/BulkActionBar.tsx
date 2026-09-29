import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { BulkActionResult, BulkRowOutcome } from "../../types/seller";

interface BulkActionProps {
  count: number;
  title: string;
  busy: boolean;
  onCancel: () => void;
  children: React.ReactNode;
}

/**
 * Selection toolbar + one-shot result summary for the bulk actions
 * (Phase 32, P1-06). Shares the same skeleton across Products, Inventory and
 * Orders so the three pages differ only in which "apply" buttons they render.
 */
export function BulkActionBar({ count, title, busy, onCancel, children }: BulkActionProps) {
  if (count === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-[var(--color-text)]">
          {count} {title} انتخاب شد
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-white disabled:opacity-50"
        >
          لغو انتخاب
        </button>
      </div>
      <div className="ms-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function BulkActionButton({
  label,
  onClick,
  busy,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        tone === "danger"
          ? "rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          : "rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      }
    >
      {busy ? "در حال اجرا..." : label}
    </button>
  );
}

function describeRows(rows: BulkRowOutcome[]): string {
  return rows
    .map((r) =>
      "reason" in r
        ? `#${r.id.slice(-6)} (${r.reason})`
        : r.orderNumber !== undefined
          ? `#${r.orderNumber}`
          : `#${r.id.slice(-6)}`,
    )
    .join("، ");
}

/** One-shot summary shown after a bulk call returns (dismissed on selection change). */
export function BulkResultNotice({
  result,
  onDismiss,
}: {
  result: BulkActionResult | null;
  onDismiss: () => void;
}) {
  if (!result) return null;
  const { succeeded, skipped, failed } = result.summary;
  if (succeeded === 0 && failed === 0 && skipped === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        {failed > 0 ? (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        )}
        <span className="font-semibold text-[var(--color-text)]">
          {succeeded} مورد با موفقیت {failed > 0 ? `، ${failed} مورد ناموفق` : ""}
        </span>
      </div>
      {failed > 0 ? (
        <span className="text-xs text-[var(--color-muted)]">
          ناموفق‌ها: {describeRows(result.failed)}
        </span>
      ) : null}
      {skipped > 0 ? (
        <span className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
          <XCircle className="h-3.5 w-3.5" />
          {skipped} مورد بدون تغییر / یافت نشد
        </span>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        className="ms-auto rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
      >
        بستن
      </button>
    </div>
  );
}