import type { ReactNode } from "react";
import { RefreshCw, Boxes, BarChart3, Info } from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { getSellerAnalytics } from "../../services/sellerService";
import { faNumber } from "../../lib/adminFormat";
import { PRODUCT_STATUS_LABEL } from "../../lib/sellerFormat";
import type { ProductStatus } from "../../types/seller";

const STATUS_ORDER: ProductStatus[] = [
  "draft",
  "pending_review",
  "active",
  "paused",
  "archived",
  "rejected",
];

const STATUS_BAR: Record<string, string> = {
  draft: "bg-slate-400",
  pending_review: "bg-amber-400",
  active: "bg-green-500",
  paused: "bg-amber-500",
  archived: "bg-slate-300",
  rejected: "bg-red-400",
};

export function AnalyticsSeller() {
  const { data, isLoading, error, reload } = useSellerFetch(getSellerAnalytics);

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-48 animate-pulse rounded bg-[var(--color-border)]/60" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
      </div>
    );
  }

  const { inventory, byStatus, note } = data!;
  const maxCount = Math.max(1, ...Object.values(byStatus));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
            <BarChart3 className="h-5 w-5 text-[var(--color-primary)]" />
            تحلیل عملکرد
          </h2>
          <p className="text-sm text-[var(--color-muted)]">تحلیل موجودی و وضعیت کاتالوگ (منابع داده واقعی)</p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
        >
          <RefreshCw className="h-4 w-4" />
          به‌روزرسانی
        </button>
      </div>

      {/* Inventory aggregation — real data */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="کل موجودی (on hand)" value={faNumber(inventory.totalOnHand)} icon={<Boxes className="h-5 w-5" />} />
        <Metric label="رزروشده" value={faNumber(inventory.totalReserved)} icon={<ReservedIcon />} />
        <Metric label="موجودی قابل فروش" value={faNumber(inventory.available)} icon={<AvailableIcon />} tone="green" />
        <Metric label="تعداد محصولات" value={faNumber(inventory.products)} icon={<ProductsIcon />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="text-sm font-bold text-[var(--color-text)]">توزیع وضعیت محصولات</h3>
          <div className="mt-5 space-y-4">
            {STATUS_ORDER.filter((s) => (byStatus[s] ?? 0) > 0).length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">محصولی ثبت نشده است.</p>
            ) : (
              STATUS_ORDER.map((s) => {
                const count = byStatus[s] ?? 0;
                if (count === 0) return null;
                return (
                  <div key={s}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-[var(--color-text)]">{PRODUCT_STATUS_LABEL[s] ?? s}</span>
                      <span className="font-semibold text-[var(--color-muted)]">{faNumber(count)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-border)]/40">
                      <div
                        className={`h-full rounded-full ${STATUS_BAR[s] ?? "bg-slate-400"}`}
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
            <Info className="h-4 w-4 text-[var(--color-primary)]" />
            محدوده فعلی
          </h3>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">{note}</p>
          <ul className="mt-4 list-inside list-disc space-y-1.5 text-xs leading-5 text-[var(--color-muted)]">
            <li>گزارش فروش و درآمد پس از پیاده‌سازی دامنه سفارش/پرداخت فعال می‌شود.</li>
            <li>هیچ عددی به‌صورت مصنوعی در این صفحه نمایش داده نمی‌شود.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "blue" | "green";
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{value}</p>
        </div>
        <div
          className={
            tone === "green"
              ? "flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600"
              : "flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
          }
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function ReservedIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AvailableIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

export default AnalyticsSeller;