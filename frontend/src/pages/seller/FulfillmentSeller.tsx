import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Truck,
  RefreshCw,
  PackageCheck,
  Clock,
  CheckCircle2,
  PackageIcon,
  Box,
  Eye,
} from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { getSellerFulfillment, updateSellerOrderStatus } from "../../services/sellerService";
import type { OrderStatus, SellerOrder } from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "../../lib/sellerFormat";

/** The next workflow step for the fulfillment queue (same as backend matrix). */
const NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: typeof Box }>> = {
  pending: { to: "confirmed", label: "تأیید", icon: CheckCircle2 },
  confirmed: { to: "processing", label: "آماده‌سازی", icon: Box },
  processing: { to: "shipped", label: "ارسال شد", icon: Truck },
  shipped: { to: "delivered", label: "تحویل شد", icon: PackageCheck },
};

function nextStepFor(status: OrderStatus) {
  return NEXT_STEP[status] ?? null;
}

export function FulfillmentSeller() {
  const { data, isLoading, error, reload } = useSellerFetch(getSellerFulfillment);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleQuickStep = useCallback(
    async (order: SellerOrder) => {
      const step = nextStepFor(order.status);
      if (!step) return;
      setBusyId(order.id);
      setActionError(null);
      setSuccessMsg(null);
      try {
        await updateSellerOrderStatus(order.id, step.to);
        setSuccessMsg(`سفارش #${faNumber(order.orderNumber)} به وضعیت «${ORDER_STATUS_LABEL[step.to]}» تغییر کرد.`);
        await reload();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "تغییر وضعیت ناموفق بود");
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  const counts = data?.counts;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">مرکز ارسال و تحویل</h2>
          <p className="text-sm text-[var(--color-muted)]">اقدامات فوری و وضعیت ارسال سفارش‌ها</p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
        >
          <RefreshCw className="h-4 w-4" />
          به‌روزرسانی
        </button>
      </div>

      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
          <button type="button" className="ms-3 underline" onClick={() => setActionError(null)}>بستن</button>
        </div>
      ) : null}
      {successMsg ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {successMsg}
          <button type="button" className="ms-3 underline" onClick={() => setSuccessMsg(null)}>بستن</button>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {isLoading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="نیاز به اقدام"
              value={faNumber(data?.needAction ?? 0)}
              icon={<Clock className="h-5 w-5" />}
              tone="amber"
            />
            <KpiCard
              label="منتظر ارسال"
              value={faNumber(data?.needingShipment ?? 0)}
              icon={<Box className="h-5 w-5" />}
              tone="blue"
            />
            <KpiCard
              label="در حال ارسال"
              value={faNumber(counts?.shipped ?? 0)}
              icon={<Truck className="h-5 w-5" />}
              tone="blue"
            />
            <KpiCard
              label="تحویل‌شده"
              value={faNumber(counts?.delivered ?? 0)}
              icon={<PackageCheck className="h-5 w-5" />}
              tone="green"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
            <CountChip label="در انتظار" value={counts?.pending ?? 0} />
            <CountChip label="تأییدشده" value={counts?.confirmed ?? 0} />
            <CountChip label="آماده‌سازی" value={counts?.processing ?? 0} />
            <CountChip label="لغو‌شده" value={counts?.cancelled ?? 0} />
            <CountChip label="مرجوعی" value={counts?.returned ?? 0} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                <Truck className="h-4 w-4 text-[var(--color-primary)]" />
                سفارش‌های در جریان
              </h3>
            </div>
            {data?.recent && data.recent.length > 0 ? (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                    <th className="px-4 py-3 text-start">سفارش</th>
                    <th className="px-4 py-3 text-center">مشتری</th>
                    <th className="px-4 py-3 text-center">مبلغ</th>
                    <th className="px-4 py-3 text-center">وضعیت</th>
                    <th className="px-4 py-3 text-end">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.recent.map((o) => {
                    const step = nextStepFor(o.status);
                    return (
                      <tr key={o.id} className="transition-colors hover:bg-[var(--color-primary)]/5">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[var(--color-text)]">#{faNumber(o.orderNumber)}</p>
                          <p className="truncate text-xs text-[var(--color-muted)]">
                            {o.items[0]?.title ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-center text-[var(--color-text)]">
                          {o.customer.name || "—"}
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-[var(--color-text)]">
                          {formatSellerPrice(o.total, o.currency)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge
                            label={ORDER_STATUS_LABEL[o.status] ?? o.status}
                            tone={ORDER_STATUS_TONE[o.status]}
                          />
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="flex items-center justify-end gap-1.5">
                            {step ? (
                              <button
                                key={step.to}
                                type="button"
                                disabled={busyId === o.id}
                                onClick={() => void handleQuickStep(o)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
                              >
                                {busyId === o.id ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <step.icon className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden xl:inline">{step.label}</span>
                              </button>
                            ) : null}
                            <Link
                              to={`/seller/orders/${o.id}`}
                              title="جزئیات سفارش"
                              className="rounded-lg border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-10 text-center">
                <PackageIcon className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
                <p className="mt-3 text-sm font-medium text-[var(--color-text)]">سفارش در جریانی وجود ندارد</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">همه سفارش‌ها به وضعیت نهایی رسیده‌اند.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
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

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-[var(--color-text)]">{faNumber(value)}</p>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
    </div>
  );
}

export default FulfillmentSeller;