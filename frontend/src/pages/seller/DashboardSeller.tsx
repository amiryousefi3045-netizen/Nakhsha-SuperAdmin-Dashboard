import type { ReactNode } from "react";
import {
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PackageX,
  RefreshCw,
  Boxes,
  ShoppingCart,
  Wallet,
  Store,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { getSellerDashboard } from "../../services/sellerService";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber, formatDateTime } from "../../lib/adminFormat";
import { PRODUCT_STATUS_LABEL, PRODUCT_STATUS_TONE, formatSellerPrice } from "../../lib/sellerFormat";
import type { ProductStatus } from "../../types/seller";

export function DashboardSeller() {
  const { data, isLoading, error, reload } = useSellerFetch(getSellerDashboard);

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
    return <Loading />;
  }

  const { overview, orders, revenue, recentProducts, profile } = data!;
  const openInTransit = orders.open;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">
            {profile.storeName ? `خوش آمدید، ${profile.storeName}` : "نمای کلی فروشگاه"}
          </h2>
          <p className="text-sm text-[var(--color-muted)]">وضعیت لحظه‌ای فروشگاه شما</p>
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

      {/* KPI cards — real data from GET /seller/dashboard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="کل محصولات" value={faNumber(overview.totalProducts)} icon={<Package className="h-5 w-5" />} />
        <KpiCard label="محصولات فعال" value={faNumber(overview.activeProducts)} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <KpiCard label="در انتظار بررسی" value={faNumber(overview.pendingProducts)} icon={<Clock className="h-5 w-5" />} tone="amber" />
        <KpiCard label="موجودی کم" value={faNumber(overview.lowStock)} icon={<AlertTriangle className="h-5 w-5" />} tone="amber" />
        <KpiCard label="ناموجود" value={faNumber(overview.outOfStock)} icon={<PackageX className="h-5 w-5" />} tone="red" />
      </div>

      {/* Order KPIs — real data from GET /seller/dashboard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="سفارش نیازمند اقدام"
          value={faNumber(orders.needAction)}
          icon={<ShoppingCart className="h-5 w-5" />}
          tone="amber"
        />
        <KpiCard
          label="کل سفارش‌ها"
          value={faNumber(orders.total)}
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <KpiCard
          label="درآمد مرسوله‌شده"
          value={formatSellerPrice(revenue.total, "IRR")}
          icon={<Wallet className="h-5 w-5" />}
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Needs attention (real inventory signals) */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            نیاز به توجه
          </h3>
          <ul className="mt-4 space-y-3 text-sm">
            <NeedsAttentionRow
              label="محصولات با موجودی کم"
              value={overview.lowStock}
              tone={overview.lowStock > 0 ? "amber" : "green"}
              to="/seller/inventory?status=low"
            />
            <NeedsAttentionRow
              label="محصولات ناموجود"
              value={overview.outOfStock}
              tone={overview.outOfStock > 0 ? "red" : "green"}
              to="/seller/inventory?status=out"
            />
            <NeedsAttentionRow
              label="محصولات در انتظار بررسی"
              value={overview.pendingProducts}
              tone={overview.pendingProducts > 0 ? "amber" : "green"}
              to="/seller/products?status=pending_review"
            />
          </ul>
        </div>

        {/* Recent products — real data */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <Boxes className="h-4 w-4 text-[var(--color-primary)]" />
              آخرین محصولات
            </h3>
            <Link
              to="/seller/products"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              همه محصولات
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentProducts.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-8 text-center">
              <Store className="mx-auto h-8 w-8 text-[var(--color-muted)]" />
              <p className="mt-3 text-sm font-medium text-[var(--color-text)]">هنوز محصولی ثبت نکرده‌اید</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                اولین محصول خود را در بخش محصولات ایجاد کنید.
              </p>
              <Link
                to="/seller/products/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                <Package className="h-4 w-4" />
                ثبت محصول جدید
              </Link>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--color-border)]">
              {recentProducts.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/seller/products/${p.id}`}
                    className="flex items-center gap-3 py-3 transition-colors hover:bg-[var(--color-primary)]/5"
                  >
                    {p.images?.[0] ? (
                      <img
                        src={p.images[0]}
                        alt={p.title}
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--color-text)]">{p.title}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        SKU: {p.sku || "—"} · به‌روزرسانی: {formatDateTime(p.updatedAt)}
                      </p>
                    </div>
                    <div className="hidden text-end sm:block">
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {formatSellerPrice(p.price, p.currency)}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">موجودی: {faNumber(p.stock.available)}</p>
                    </div>
                    <StatusBadge
                      label={PRODUCT_STATUS_LABEL[p.status] ?? p.status}
                      tone={PRODUCT_STATUS_TONE[p.status as ProductStatus]}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick links — live domains */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <RealCard
          to="/seller/orders"
          icon={<ShoppingCart className="h-5 w-5" />}
          title="سفارش‌ها"
          desc={`${faNumber(orders.needAction)} سفارش نیازمند اقدام · ${faNumber(openInTransit)} در حال جریان`}
        />
        <RealCard
          to="/seller/finance"
          icon={<Wallet className="h-5 w-5" />}
          title="مالی و تسویه"
          desc="گزارش درآمد، کمیسیون، موجودی قابل تسویه و درخواست تسویه."
        />
        <RealCard
          to="/seller/analytics"
          icon={<BarChart3Icon />}
          title="تحلیل عملکرد"
          desc="تحلیل موجودی هم‌اکنون در دسترس است؛ تحلیل فروش به‌زودی اضافه می‌شود."
        />
      </div>
    </div>
  );
}

// ── Small presentational pieces ─────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const tones = {
    blue: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

function NeedsAttentionRow({
  label,
  value,
  tone,
  to,
}: {
  label: string;
  value: number;
  tone: "amber" | "red" | "green";
  to: string;
}) {
  const dot = {
    amber: "bg-amber-500",
    red: "bg-red-500",
    green: "bg-green-500",
  }[tone];
  return (
    <li>
      <Link to={to} className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-[var(--color-primary)]/5">
        <span className="flex items-center gap-2 text-[var(--color-text)]">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </span>
        <span className="font-bold text-[var(--color-text)]">{faNumber(value)}</span>
      </Link>
    </li>
  );
}

function RealCard({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition-colors hover:bg-[var(--color-primary)]/5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--color-text)]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{desc}</p>
        </div>
      </div>
    </Link>
  );
}

function BarChart3Icon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-56 animate-pulse rounded bg-[var(--color-border)]/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
    </div>
  );
}

export default DashboardSeller;