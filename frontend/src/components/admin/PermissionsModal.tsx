import { useEffect, useState } from "react";
import type { AdminPermission } from "../../types/admin";

const PERMISSION_OPTIONS: { value: AdminPermission; label: string; hint: string }[] = [
  { value: "DELETE_USERS", label: "حذف کاربران", hint: "امکان حذف حساب کاربران" },
  { value: "APPROVE_CONTENT", label: "تأیید محتوا", hint: "امکان تأیید و انتشار محتوا" },
  { value: "VIEW_AUDIT_LOGS", label: "مشاهده گزارش‌ها", hint: "دسترسی به گزارش عملیات" },
];

interface PermissionsModalProps {
  open: boolean;
  userName: string;
  current: AdminPermission[];
  busy?: boolean;
  onCancel: () => void;
  onSave: (permissions: AdminPermission[]) => Promise<void> | void;
}

export function PermissionsModal({
  open,
  userName,
  current,
  busy,
  onCancel,
  onSave,
}: PermissionsModalProps) {
  const [selected, setSelected] = useState<AdminPermission[]>(current);

  useEffect(() => {
    if (open) setSelected(current);
  }, [open, current]);

  if (!open) return null;

  const toggle = (value: AdminPermission) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-xl">
        <h3 className="text-base font-bold text-[var(--color-text)]">دسترسی‌های ادمین</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          تنظیم دسترسی‌های خرد برای {userName} (فقط کاربران با نقش ادمین)
        </p>

        <div className="mt-4 space-y-3">
          {PERMISSION_OPTIONS.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 hover:bg-[var(--color-primary)]/5"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt.value)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                />
                <span>
                  <span className="block text-sm font-medium text-[var(--color-text)]">{opt.label}</span>
                  <span className="block text-xs text-[var(--color-muted)]">{opt.hint}</span>
                </span>
              </label>
            );
          })}
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
            onClick={() => onSave(selected)}
            disabled={busy}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "در حال ذخیره..." : "ذخیره"}
          </button>
        </div>
      </div>
    </div>
  );
}