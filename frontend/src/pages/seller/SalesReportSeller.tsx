import { useMemo, useState } from "react";
import {
  RefreshCw,
  ShoppingCart,
  Package,
  TrendingUp,
  BadgePercent,
  FileBarChart2,
} from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { getSellerSalesReport } from "../../services/sellerService";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice, ORDER_STATUS_LABEL } from "../../lib/sellerFormat";
import type { OrderStatus } from "../../types/seller";

const toInputDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  return { from: toInputDate(from), to: toInputDate(to) };
}

const STATUS_ORDER: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
];

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-sky-100 text-sky-800 border-sky-200",
  processing: "bg-indigo-100 text-indigo-800 border-indigo-200",
  shipped: "bg-blue-100 text-blue-800 border-blue-200",
  delivered: "bg-green-100 text-green-800 border-green-200",
  returned: "bg-rose-100 text-rose-800 border-rose-200",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

export function SalesReportSeller() {
  const [range, setRange] = useState(defaultRange);
  const { data, isLoading, error, reload } = useSellerFetch(
    () => getSellerSalesReport({ from: range.from, to: range.to }),
    { dependencies: [range.from, range.to] },
  );

  const maxDailyTotal = useMemo(
    () => Math.max(1, ...(data?.daily.map((d) => d.total) ?? [0])),
    [data],
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
            <FileBarChart2 className="h-5 w-5 text-[var(--color-primary)]" />
            گزارش فروش
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            خلاصه سفارش‌ها در بازه‌ی انتخابی (منبع: سفارش‌های شما)
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

      {/* Period filter */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--color-muted)]">از تاریخ</span>
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--color-muted)]">تا تاریخ</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
          />
        </label>
        <button
          type="button"
          onClick={() => setRange(defaultRange())}
          className="rounded-lg px-3 py-2 text-sm text-[var(--color-primary)] hover:bg-[var(--color-muted)]/10"
        >
          بازگشت به ۳۰ روز اخیر
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
        </div>
      ) : (
        data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="تعداد سفارش‌ها"
                value={faNumber(data.summary.orders)}
                sub={faNumber(data.summary.units) + " واحد کالا"}
                icon={<ShoppingCart className="h-5 w-5" />}
              />
              <KpiCard
                label="جمع فروش"
                value={formatSellerPrice(data.summary.total, data.currency)}
                sub={`سفارش‌های هر وضعیت`}
                icon={<TrendingUp className="h-5 w-5" />}
                tone="green"
              />
              <KpiCard
                label="جمع تخفیف"
                value={formatSellerPrice(data.summary.discount, data.currency)}
                sub={`هزینه ارسال ${formatSellerPrice(data.summary.shippingFee, data.currency)}`}
                icon={<BadgePercent className="h-5 w-5" />}
                tone="amber"
              />
              <KpiCard
                label="واحد فروخته‌شده"
                value={faNumber(data.summary.units)}
                sub="بدون احتساب سفارش‌های لغو/برگشتی"
                icon={<Package className="h-5 w-5" />}
              />
            </div>

            {/* Status breakdown */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
                شکست بر اساس وضعیت سفارش
              </h3>
              <div className="flex flex-wrap gap-2">
                {STATUS_ORDER.map((status) => {
                  const row = data.byStatus.find((s) => s.status === status);
                  if (!row || row.count === 0) return null;
                  return (
                    <span
                      key={status}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${STATUS_TONE[status] || "bg-slate-100 text-slate-700 border-slate-200"}`}
                    >
                      {ORDER_STATUS_LABEL[status] || status}
                      <b>{faNumber(row.count)}</b>
                      <span dir="ltr" className="font-semibold">
                        {faNumber(row.total)}
                      </span>
                    </span>
                  );
                })}
                {data.byStatus.every((r) => r.count === 0) && (
                  <p className="text-sm text-[var(--color-muted)]">سفارشی در این بازه ثبت نشده است.</p>
                )}
              </div>
            </div>

            {/* Daily bar chart — pure divs, no chart dependency */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">
                  جریان فروش روزانه ({data.daily.length} روز)
                </h3>
                <span className="text-xs text-[var(--color-muted)]">
                  اوج: {formatSellerPrice(maxDailyTotal, data.currency)}
                </span>
              </div>
              <div className="flex h-48 items-end gap-[2px]" dir="ltr">
                {data.daily.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day} — ${faNumber(d.orders)} سفارش · ${formatSellerPrice(d.total, data.currency)}`}
                    className="group relative flex-1 rounded-t bg-[var(--color-primary)]/70 transition-colors hover:bg-[var(--color-primary)]"
                    style={{ height: `${Math.max(2, (d.total / maxDailyTotal) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[var(--color-muted)]" dir="ltr">
                <span>{data.daily[0]?.day}</span>
                <span>{data.daily[data.daily.length - 1]?.day}</span>
              </div>
            </div>

            {/* Top products */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">پرفروش‌ترین محصولات</h3>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">محصولی در این بازه فروش نداشته است.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-xs text-[var(--color-muted)]">
                        <th className="pb-2 pr-1 font-medium">رتبه</th>
                        <th className="pb-2 pr-1 font-medium">محصول</th>
                        <th className="pb-2 pr-1 text-center font-medium">سفارش‌ها</th>
                        <th className="pb-2 pr-1 text-center font-medium">تعداد</th>
                        <th className="pb-2 pr-1 text-left font-medium">درآمد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {data.topProducts.map((p, i) => (
                        <tr key={p.productId}>
                          <td className="py-2.5 pr-1 text-[var(--color-muted)]">{faNumber(i + 1)}</td>
                          <td className="py-2.5 pr-1 font-medium text-[var(--color-text)]">{p.title}</td>
                          <td className="py-2.5 pr-1 text-center text-[var(--color-muted)]">{faNumber(p.orders)}</td>
                          <td className="py-2.5 pr-1 text-center text-[var(--color-text)]">{faNumber(p.units)}</td>
                          <td className="py-2.5 pr-1 text-left font-semibold text-[var(--color-text)]" dir="ltr">
                            {formatSellerPrice(p.revenue, data.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: import("react").ReactNode;
  tone?: "default" | "green" | "amber";
}) {
  const toneCls =
    tone === "green"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : "bg-[var(--color-muted)]/10 text-[var(--color-primary)]";
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneCls}`}>{icon}</span>
      </div>
      <p className="mt-2 text-lg font-bold text-[var(--color-text)]" dir="auto">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

export default SalesReportSeller;