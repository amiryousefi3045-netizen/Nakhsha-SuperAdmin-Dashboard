import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "تأیید",
  cancelLabel = "انصراف",
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div
            className={
              danger
                ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"
                : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
            }
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[var(--color-text)]">{title}</h3>
            <div className="mt-1 text-sm text-[var(--color-muted)]">{message}</div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              danger
                ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                : "rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            }
          >
            {busy ? "در حال انجام..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}