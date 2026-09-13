import { useEffect, useState } from "react";
import { X, Laptop, Smartphone, Monitor, ShieldOff, RefreshCw } from "lucide-react";
import { getUserSessions, revokeUserSession } from "../../services/adminService";
import type { UserSessionsResult } from "../../types/admin";
import { faNumber, formatDateTime } from "../../lib/adminFormat";

const DEVICE_ICON = {
  android: Smartphone,
  ios: Smartphone,
  mobile: Smartphone,
  windows: Monitor,
  macintosh: Monitor,
  linux: Monitor,
} as const;

function deviceIcon(userAgent: string | null) {
  if (!userAgent) return Laptop;
  const ua = userAgent.toLowerCase();
  if (ua.includes("android") || ua.includes("iphone") || ua.includes("ipad") || ua.includes("mobile")) {
    return DEVICE_ICON.mobile;
  }
  if (ua.includes("mac")) return DEVICE_ICON.macintosh;
  if (ua.includes("linux")) return DEVICE_ICON.linux;
  return DEVICE_ICON.windows;
}

interface UserSessionsModalProps {
  userId: string | null;
  userName: string;
  onClose: () => void;
}

export function UserSessionsModal({ userId, userName, onClose }: UserSessionsModalProps) {
  const [result, setResult] = useState<UserSessionsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setResult(null);
    setError(null);
    getUserSessions(userId)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "دریافت نشست‌ها ناموفق بود");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleRevoke = async (sessionId: string) => {
    if (!userId) return;
    setBusyId(sessionId);
    setActionError(null);
    try {
      await revokeUserSession(userId, sessionId);
      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: prev.sessions.filter((s) => s.id !== sessionId),
          total: prev.total - 1,
        };
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "قطع نشست ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-5">
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">نشست‌های فعال «{userName}»</h3>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              {result ? faNumber(result.total) : "—"} نشست فعال
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-primary)]/5 hover:text-[var(--color-text)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : actionError ? (
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {actionError}
              <button type="button" className="ms-3 underline" onClick={() => setActionError(null)}>بستن</button>
            </div>
          ) : !result ? (
            <div className="py-10 text-center text-sm text-[var(--color-muted)]">در حال بارگذاری نشست‌ها...</div>
          ) : result.sessions.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--color-muted)]">هیچ نشست فعالی وجود ندارد</div>
          ) : (
            <div className="space-y-3">
              {result.sessions.map((s) => {
                const Icon = deviceIcon(s.device?.userAgent ?? null);
                const busy = busyId === s.id;
                return (
                  <div
                    key={s.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border)] p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p dir="ltr" className="truncate text-sm font-medium text-[var(--color-text)]">
                          {s.device?.userAgent ? String(s.device.userAgent) : "دستگاه ناشناخته"}
                        </p>
                        {s.device?.ipAddress ? (
                          <p dir="ltr" className="text-xs text-[var(--color-muted)]">{s.device.ipAddress}</p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                          آخرین استفاده: {s.lastUsedAt ? faNumber(formatDateTime(s.lastUsedAt)) : "—"}
                          {" · "}انقضا: {faNumber(formatDateTime(s.expiresAt))}
                          {" · "}چرخش: {faNumber(s.rotationCount)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRevoke(s.id)}
                      title="قطع نشست"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                      قطع نشست
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}