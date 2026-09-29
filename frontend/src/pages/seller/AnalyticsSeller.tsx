import { type ReactNode, useMemo, useState } from "react";
import {
  RefreshCw,
  Boxes,
  BarChart3,
  ShoppingCart,
  TrendingUp,
  Package,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { getSellerAnalytics } from "../../services/sellerService";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice, ORDER_STATUS_LABEL, PRODUCT_STATUS_LABEL } from "../../lib/sellerFormat";
import type { OrderStatus, ProductStatus } from "../../types/seller";

const toInputDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const defaultRange = () => {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  return { from: toInputDate(from), to: toInputDate(to) };
};

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

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
];

const ORDER_STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-sky-100 text-sky-800",
  processing: "bg-indigo-100 text-indigo-800",
  shipped: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  returned: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-100 text-slate-700",
};

/**
 * Percent delta of `cur` vs `prev`. Returns null when there is nothing to
 * compare (both zero). Handles "new in this period" as +100%.
 */
function pctDelta(cur: number, prev: number): number | null {
  if (cur === 0 && prev === 0) return null;
  if (prev === 0) return 100;
  return ((cur - prev) / prev) * 100;
}

interface AnalyticsKpi {
  label: string;
  value: string;
  delta: number | null;
  sub: string;
  icon: ReactNode;
  tone: "default" | "green" | "amber" | "blue";
}

export function AnalyticsSeller() {
  const [range, setRange] = useState(defaultRange);
  const { data, isLoading, error, reload } = useSellerFetch(
    () => getSellerAnalytics({ from: range.from, to: range.to }),
    { dependencies: [range.from, range.to] },
  );

  const sales = data?.sales;

  const kpis: AnalyticsKpi[] = useMemo(() => {
    if (!sales) return [];
    return [
      {
        label: "تعداد سفارش‌ها",
        value: faNumber(sales.current.orders),
        delta: pctDelta(sales.current.orders, sales.previous.orders),
        sub: `دورهٔ قبل: ${faNumber(sales.previous.orders)}`,
        icon: <ShoppingCart className="h-5 w-5" />,
        tone: "default",
      },
      {
        label: "جمع فروش",
        value: formatSellerPrice(sales.current.total, sales.currency),
        delta: pctDelta(sales.current.total, sales.previous.total),
        sub: `دورهٔ قبل: ${formatSellerPrice(sales.previous.total, sales.currency)}`,
        icon: <TrendingUp className="h-5 w-5" />,
        tone: "green",
      },
      {
        label: "واحد فروخته‌شده",
        value: faNumber(sales.current.units),
        delta: pctDelta(sales.current.units, sales.previous.units),
        sub: `دورهٔ قبل: ${faNumber(sales.previous.units)}`,
        icon: <Package className="h-5 w-5" />,
        tone: "amber",
      },
      {
        label: "میانگین ارزش سفارش",
        value: formatSellerPrice(sales.current.avgOrderValue, sales.currency),
        delta: pctDelta(
          sales.current.avgOrderValue,
          sales.previous.orders > 0 ? Math.round(sales.previous.total / sales.previous.orders) : 0,
        ),
        sub: `تخفیف: ${formatSellerPrice(sales.current.discount, sales.currency)}`,
        icon: <Wallet className="h-5 w-5" />,
        tone: "blue",
      },
    ];
  }, [sales]);

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
        <div className="px-2 py-3">
          <div className="h-9 w-80 animate-pulse rounded-xl bg-[var(--color-border)]/40" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
      </div>
    );
  }

  const { inventory, byStatus, sales: salesData } = data!;
  const maxCount = Math.max(1, ...Object.values(byStatus));
  const statusRows = salesData.current.byStatus.filter((r) => r.count > 0);
  const maxDaily = Math.max(1, ...salesData.daily.map((d) => d.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
            <BarChart3 className="h-5 w-5 text-[var(--color-primary)]" />
            تحلیل عملکرد
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            فروش واقعی، مقایسهٔ دوره‌با‌دوره و وضعیت کاتالوگ — همه از داده‌های زنده
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reload}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            به‌روزرسانی
          </button>
        </div>
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

      {/* Real sales KPIs with period-over-period deltas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Daily revenue area chart — dependency-free SVG */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--color-text)]">
              جریان فروش روزانه ({salesData.daily.length} روز)
            </h3>
            <span className="text-xs text-[var(--color-muted)]">
              اوج: {formatSellerPrice(maxDaily === 1 ? 0 : maxDaily, salesData.currency)}
            </span>
          </div>
          {salesData.daily.every((d) => d.total === 0) ? (
            <p className="py-8 text-sm text-[var(--color-muted)]">
              سفارشی در این بازه ثبت نشده است.
            </p>
          ) : (
            <RevenueAreaChart data={salesData.daily} />
          )}
          <div className="mt-2 flex justify-between text-[10px] text-[var(--color-muted)]" dir="ltr">
            <span>{salesData.daily[0]?.day}</span>
            <span>{salesData.daily[salesData.daily.length - 1]?.day}</span>
          </div>
        </div>

        {/* Order status breakdown */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-[var(--color-text)]">توزیع وضعیت سفارش‌ها</h3>
          {statusRows.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-muted)]">سفارشی در این بازه ثبت نشده است.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {statusRows.map((r) => (
                <span
                  key={r.status}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${ORDER_STATUS_TONE[r.status] || "bg-slate-100 text-slate-700"}`}
                >
                  {ORDER_STATUS_LABEL[r.status] || r.status}
                  <b>{faNumber(r.count)}</b>
                  <span dir="ltr" className="font-semibold">
                    {faNumber(r.total)}
                  </span>
                </span>
              ))}
            </div>
          )}

          <h3 className="mt-6 text-sm font-bold text-[var(--color-text)]">موجودی (on hand)</h3>
          <div className="mt-4 space-y-3">
            <MetricRow label="کل موجودی" value={faNumber(inventory.totalOnHand)} />
            <MetricRow label="رزروشده" value={faNumber(inventory.totalReserved)} />
            <MetricRow label="قابل فروش" value={faNumber(inventory.available)} accent />
            <MetricRow label="تعداد محصولات" value={faNumber(inventory.products)} />
          </div>
        </div>
      </div>

      {/* Product catalog status distribution */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-text)]">توزیع وضعیت محصولات</h3>
        {STATUS_ORDER.filter((s) => (byStatus[s] ?? 0) > 0).length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted)]">محصولی ثبت نشده است.</p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {STATUS_ORDER.map((s) => {
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
            })}
          </div>
        )}
      </div>

      {/* Status enum legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-muted)]">
        <span className="flex items-center gap-1.5">
          <Boxes className="h-4 w-4" />
          مقایسهٔ دوره‌با‌دوره: همان بازهٔ طول مساوی درست پیش از بازهٔ انتخابی
        </span>
        {ORDER_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <i className={`h-2.5 w-2.5 rounded-full ${ORDER_STATUS_TONE[s]?.split(" ")[0] || "bg-slate-300"}`} />
            {ORDER_STATUS_LABEL[s] ?? s}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Dependency-free SVG area chart (no chart library required). */
function RevenueAreaChart({
  data,
}: {
  data: { day: string; total: number }[];
}) {
  const W = 100;
  const H = 36;
  const PAD = 2;

  const max = Math.max(1, ...data.map((d) => d.total));
  const step = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: PAD + i * step,
    y: H - PAD - (d.total / max) * (H - PAD * 2),
    d,
  }));

  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const fill = points.length > 1
    ? `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`
    : points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const mid = points[Math.floor((points.length - 1) / 2)]?.x ?? PAD;
  const maxRow = points.reduce((a, b) => (b.d.total > a.d.total ? b : a), points[0]);

  return (
    <div dir="ltr" className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fill} fill="url(#revenueFill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={0.4}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="pointer-events-none absolute -top-1 rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]"
        style={{ left: `${mid}%`, transform: "translateX(50%)" }}
        dir="rtl"
      >
        اوج {faNumber(maxRow.d.total)}
      </span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  delta: number | null;
  sub: string;
  icon: ReactNode;
  tone: "default" | "green" | "amber" | "blue";
}) {
  const toneCls = {
    default: "bg-[var(--color-muted)]/10 text-[var(--color-primary)]",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-sky-50 text-sky-600",
  }[tone];

  const DeltaBadge = () => {
    if (delta === null) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
          <Minus className="h-3.5 w-3.5" />
          — 
        </span>
      );
    }
    const up = delta >= 0;
    const cls = up ? "text-green-600" : "text-red-500";
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${cls}`}>
        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {faNumber(Math.round(Math.abs(delta)))}
        <span className="font-normal text-[var(--color-muted)]">vs دورهٔ قبل</span>
      </span>
    );
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)]" dir="auto">
            {value}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-muted)]">{sub}</span>
          </div>
          <div className="mt-2">
            <DeltaBadge />
          </div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneCls}`}>{icon}</div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className={`font-bold ${accent ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>
        {value}
      </span>
    </div>
  );
}

export default AnalyticsSeller;