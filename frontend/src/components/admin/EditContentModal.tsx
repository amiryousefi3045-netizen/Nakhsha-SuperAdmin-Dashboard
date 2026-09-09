import { useEffect, useState } from "react";
import type { AdminListing } from "../../types/admin";

interface EditContentModalProps {
  open: boolean;
  listing: AdminListing | null;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSave: (payload: { title: string; description: string }) => Promise<void> | void;
}

export function EditContentModal({ open, listing, busy, error, onCancel, onSave }: EditContentModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open && listing) {
      setTitle(listing.title);
      setDescription(listing.description || "");
    }
  }, [open, listing]);

  if (!open || !listing) return null;

  const dirty = title.trim() !== listing.title || description.trim() !== (listing.description || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-xl">
        <h3 className="text-base font-bold text-[var(--color-text)]">ویرایش محتوا</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          ویرایش توسط سوپر ادمین در تاریخچه ویرایش ثبت می‌شود.
        </p>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text)]">عنوان</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text)]">توضیحات</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={5000}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => onSave({ title: title.trim(), description: description.trim() })}
            disabled={busy || !dirty}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "در حال ذخیره..." : "ذخیره تغییرات"}
          </button>
        </div>
      </div>
    </div>
  );
}