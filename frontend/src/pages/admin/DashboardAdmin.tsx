import {
  Users,
  CheckCircle2,
  Clock,
  Ban,
  Activity,
  RefreshCw,
  MapPin,
} from "lucide-react";
import { getAdminStats } from "../../services/adminService";
import type { RecentActivity } from "../../types/admin";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import { StatCard } from "../../components/admin/StatCard";
import { StatusBadge, riskTone } from "../../components/admin/StatusBadge";
import { MiniLineChart, DonutChart } from "../../components/admin/AdminCharts";
import { faNumber, formatDateTime, RISK_LABEL } from "../../lib/adminFormat";

const DISTRIBUTION_LABEL: Record<string, string> = {
  post: "پست",
  tour: "تور",
  training: "آموزش",
  academy: "آکادمی",
  craft: "صنایع دستی",
};

export function DashboardAdmin() {
  const { data, isLoading, error, reload } = useAdminFetch(getAdminStats);

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

  const stats = data!;
  const { overview, growth, distribution, topCities, recentActivity } = stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">نمای کلی</h2>
          <p className="text-sm text-[var(--color-muted)]">آمار لحظه‌ای پلتفرم</p>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="کل کاربران"
          value={faNumber(overview.totalUsers)}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="محتواهای فعال"
          value={faNumber(overview.activeContent)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          hint="منتشرشده (محتوا + صنایع دستی)"
        />
        <StatCard
          label="در انتظار بررسی"
          value={faNumber(overview.pendingContent)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="کاربران مسدود"
          value={faNumber(overview.blockedUsers)}
          icon={<Ban className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="text-sm font-bold text-[var(--color-text)]">رشد ۳۰ روز اخیر</h3>
          <div className="mt-4">
            <MiniLineChart data={growth.map((g) => ({ label: g.date.slice(5), value: g.content + g.users }))} />
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-[var(--color-text)]">توزیع محتوا</h3>
          <div className="mt-4">
            <DonutChart
              data={distribution.map((d) => ({
                label: DISTRIBUTION_LABEL[d.type] ?? d.type,
                value: d.count,
              }))}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
            <MapPin className="h-4 w-4 text-[var(--color-primary)]" />
            شهرهای برتر
          </h3>
          <ul className="mt-4 space-y-2.5">
            {topCities.length === 0 ? (
              <li className="text-sm text-[var(--color-muted)]">داده‌ای نیست</li>
            ) : (
              topCities.map((c) => (
                <li key={c.city} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-text)]">{c.city}</span>
                  <span className="font-semibold text-[var(--color-muted)]">{faNumber(c.count)}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
            <Activity className="h-4 w-4 text-[var(--color-primary)]" />
            آخرین فعالیت‌ها
          </h3>
          <ActivityTable items={recentActivity} />
        </div>
      </div>
    </div>
  );
}

function ActivityTable({ items }: { items: RecentActivity[] }) {
  return (
    <ul className="mt-4 divide-y divide-[var(--color-border)]">
      {items.length === 0 ? (
        <li className="py-6 text-center text-sm text-[var(--color-muted)]">فعالیتی ثبت نشده است</li>
      ) : (
        items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-xs font-bold text-[var(--color-primary)]">
                {item.actorName.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--color-text)]">
                  {item.actorName}
                  <span className="text-[var(--color-muted)]"> — {item.action}</span>
                </p>
                <p className="text-xs text-[var(--color-muted)]">{formatDateTime(item.createdAt)}</p>
              </div>
            </div>
            <StatusBadge label={RISK_LABEL[item.riskLevel] ?? item.riskLevel} tone={riskTone(item.riskLevel)} />
          </li>
        ))
      )}
    </ul>
  );
}

function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-40 animate-pulse rounded bg-[var(--color-border)]/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
    </div>
  );
}

export default DashboardAdmin;