import { useState } from "react";
import { RefreshCw, History, ShieldAlert, ShieldCheck, CalendarClock } from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { getSellerActivity } from "../../services/sellerService";
import { faNumber, formatDateTime } from "../../lib/adminFormat";
import type { ActivityRiskLevel, SellerActivityItem } from "../../types/seller";
import cn from "classnames";

const PAGE_SIZE = 20;

const ACTION_LABEL: Record<string, string> = {
  PRODUCT_CREATED: "ایجاد محصول",
  PRODUCT_UPDATED: "به‌روزرسانی محصول",
  PRODUCT_STATUS_CHANGED: "تغییر وضعیت محصول",
  PRODUCT_ARCHIVED: "بایگانی محصول",
  STOCK_ADJUSTED: "اصلاح موجودی",
  ORDER_CREATED: "سفارش جدید",
  ORDER_STATUS_CHANGED: "تغییر وضعیت سفارش",
  PAYOUT_REQUESTED: "درخواست تسویه",
  PAYOUT_CANCELLED: "لغو تسویه",
  PAYOUT_STATUS_CHANGED: "تغییر وضعیت تسویه",
  SELLER_SETTINGS_UPDATED: "به‌روزرسانی تنظیمات",
  TEAM_MEMBER_INVITED: "دعوت همکار",
  TEAM_MEMBER_ROLE_CHANGED: "تغییر نقش همکار",
  TEAM_MEMBER_REMOVED: "حذف همکار",
  REVIEW_VISIBILITY_CHANGED: "تغییر نمایش دیدگاه",
  SELLER_REVIEW_REPLIED: "پاسخ به دیدگاه",
  SELLER_REVIEW_REPLY_REMOVED: "حذف پاسخ دیدگاه",
  SELLER_PROFILE_UPDATE: "به‌روزرسانی پروفایل",
};

const RESOURCE_LABEL: Record<string, string> = {
  SELLER_PROFILE: "فروشگاه",
  TRANSACTION: "تراکنش",
  TEAM_MEMBER: "همکار",
  USER: "کاربر",
  LISTING: "محتوای فروش",
  CRAFT: "صنعت دستی",
};

const RISK_TONE: Record<ActivityRiskLevel, string> = {
  LOW: "bg-slate-100 text-slate-700 border-slate-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  HIGH: "bg-red-100 text-red-800 border-red-200",
  CRITICAL: "bg-red-600 text-white border-red-700",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] || action;
}

function resourceLabel(item: SellerActivityItem): string {
  if (!item.resource) return "";
  const label = RESOURCE_LABEL[item.resource.type] || item.resource.type;
  return item.resource.id ? `${label} #${item.resource.id.slice(-6)}` : label;
}

export function ActivitySeller() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, reload } = useSellerFetch(
    () => getSellerActivity({ page, limit: PAGE_SIZE }),
    { dependencies: [page] },
  );

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
        <p>{error}</p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          <RefreshCw className="h-4 w-4" />
          تلاش مجدد
        </button>
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
            <History className="h-5 w-5 text-[var(--color-primary)]" />
            رویدادهای فروشگاه
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            فعالیت مالک و همکاران فروشگاه — از جدیدترین به قدیمی‌ترین
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-muted)]/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          به‌روزرسانی
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
          ))}
        </div>
      ) : (
        data && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-2">
            {data.items.length === 0 ? (
              <p className="p-8 text-center text-sm text-[var(--color-muted)]">
                هنوز رویدادی ثبت نشده است.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {data.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-3 py-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        item.riskLevel === "LOW"
                          ? "bg-slate-100 text-slate-500"
                          : "bg-amber-50 text-amber-600",
                      )}
                    >
                      {item.riskLevel === "LOW" ? (
                        <ShieldCheck className="h-4 w-4" />
                      ) : (
                        <ShieldAlert className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--color-text)]">
                          {actionLabel(item.action)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            RISK_TONE[item.riskLevel] || RISK_TONE.LOW,
                          )}
                        >
                          {item.riskLevel}
                        </span>
                        {item.result !== "SUCCESS" && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                            {item.result}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                        {resourceLabel(item)} · {item.endpoint || "—"}
                      </p>
                      {item.after && Object.keys(item.after).length > 0 && (
                        <p className="mt-1 text-xs text-[var(--color-text)]/70" dir="ltr">
                          {JSON.stringify(item.after)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-xs text-[var(--color-muted)]">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {formatDateTime(item.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {data.total > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-3 py-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-muted)]/10 disabled:opacity-40"
                >
                  قبلی
                </button>
                <span className="text-sm text-[var(--color-muted)]">
                  صفحهٔ {faNumber(page)} از {faNumber(totalPages)}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-muted)]/10 disabled:opacity-40"
                >
                  بعدی
                </button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default ActivitySeller;