import { useEffect, useState, type ReactNode } from "react";
import { X, FileClock } from "lucide-react";
import { getAdminAuditLogDetail } from "../../services/adminService";
import type { AuditLogDetail } from "../../types/admin";
import { StatusBadge, riskTone } from "./StatusBadge";
import { faNumber, formatDateTime, RISK_LABEL } from "../../lib/adminFormat";

const RESULT_LABEL: Record<string, string> = {
  SUCCESS: "موفق",
  FAILURE: "ناموفق",
  PARTIAL: "جزئی",
};

interface AuditLogDetailModalProps {
  logId: string | null;
  onClose: () => void;
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const text = value === undefined || value === null ? "—" : JSON.stringify(value, null, 2);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-[var(--color-muted)]">{title}</p>
      <pre
        dir="ltr"
        className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-slate-50 p-3 text-xs leading-relaxed text-[var(--color-text)]"
      >
        {text}
      </pre>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] py-2 text-sm last:border-0">
      <span className="shrink-0 text-xs text-[var(--color-muted)]">{label}</span>
      <span dir="ltr" className="text-end text-[var(--color-text)]">{value ?? "—"}</span>
    </div>
  );
}

export function AuditLogDetailModal({ logId, onClose }: AuditLogDetailModalProps) {
  const [detail, setDetail] = useState<AuditLogDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!logId) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    getAdminAuditLogDetail(logId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "دریافت جزئیات ناموفق بود");
      });
    return () => {
      cancelled = true;
    };
  }, [logId]);

  if (!logId) return null;

  const ctx = detail?.requestContext;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <FileClock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text)]">جزئیات گزارش عملیات</h3>
              {detail ? (
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="inline-flex max-w-[200px] truncate rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                    {detail.action}
                  </span>
                  <StatusBadge label={RISK_LABEL[detail.riskLevel] ?? detail.riskLevel} tone={riskTone(detail.riskLevel)} />
                  <StatusBadge label={RESULT_LABEL[detail.result] ?? detail.result} tone={detail.result === "SUCCESS" ? "green" : detail.result === "FAILURE" ? "red" : "amber"} />
                </div>
              ) : null}
            </div>
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
          ) : !detail ? (
            <div className="py-10 text-center text-sm text-[var(--color-muted)]">در حال بارگذاری جزئیات...</div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="mb-1 text-xs font-semibold text-[var(--color-muted)]">عملیات</p>
                <div className="rounded-xl border border-[var(--color-border)] px-3">
                  <Row label="شناسه" value={detail.id} />
                  <Row label="عامل" value={detail.actorName} />
                  <Row label="شناسه عامل" value={detail.actorId} />
                  <Row label="زمان" value={faNumber(formatDateTime(detail.createdAt))} />
                  <Row label="آی‌پی" value={detail.ip} />
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-[var(--color-muted)]">منبع</p>
                <div className="rounded-xl border border-[var(--color-border)] px-3">
                  <Row label="نوع" value={detail.resource?.type ?? "—"} />
                  <Row label="شناسه" value={detail.resource?.id ?? "—"} />
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-[var(--color-muted)]">درخواست</p>
                <div className="rounded-xl border border-[var(--color-border)] px-3">
                  <Row label="مسیر" value={ctx?.endpoint ?? "—"} />
                  <Row label="متد" value={ctx?.method ?? "—"} />
                  <Row label="کد پاسخ" value={ctx?.statusCode != null ? faNumber(ctx.statusCode) : "—"} />
                  <Row label="آی‌پی" value={ctx?.ip ?? "—"} />
                  <Row label="مرورگر" value={ctx?.userAgent ? String(ctx.userAgent) : "—"} />
                  <Row label="منبع ارجاع" value={ctx?.referer ?? "—"} />
                </div>
              </div>

              {detail.compliance ? (
                <div>
                  <p className="mb-1 text-xs font-semibold text-[var(--color-muted)]">انطباق</p>
                  <div className="rounded-xl border border-[var(--color-border)] px-3">
                    <Row label="مرتبط با GDPR" value={detail.compliance.gdprRelevant == null ? "—" : detail.compliance.gdprRelevant ? "بله" : "خیر"} />
                    <Row label="دسته‌های داده" value={detail.compliance.dataCategories?.join("، ") || "—"} />
                    <Row label="نیاز به نگهداری" value={detail.compliance.retentionRequired == null ? "—" : detail.compliance.retentionRequired ? "بله" : "خیر"} />
                    <Row label="تا نگهداری" value={detail.compliance.retentionUntil ? faNumber(formatDateTime(detail.compliance.retentionUntil)) : "—"} />
                  </div>
                </div>
              ) : null}

              <JsonBlock title="تغییرات" value={detail.changes} />
              <JsonBlock title="متادیتا" value={detail.metadata} />

              {detail.error ? (
                <div>
                  <p className="mb-1 text-xs font-semibold text-[var(--color-muted)]">خطا</p>
                  <div className="rounded-xl border border-[var(--color-border)] px-3">
                    <Row label="کد" value={detail.error.code ?? "—"} />
                    <Row label="پیام" value={detail.error.message ?? "—"} />
                  </div>
                  {detail.error.stack ? (
                    <pre dir="ltr" className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-slate-50 p-3 text-xs text-[var(--color-text)]">
                      {detail.error.stack}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}