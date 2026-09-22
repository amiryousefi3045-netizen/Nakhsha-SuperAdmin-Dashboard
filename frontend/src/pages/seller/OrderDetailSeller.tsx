import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  PackageIcon,
  Truck,
  Box,
  XCircle,
  Undo2,
  Phone,
  FileText,
  CreditCard,
} from "lucide-react";
import { getSellerOrder, updateSellerOrderStatus } from "../../services/sellerService";
import type { OrderStatus, SellerOrder } from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber, formatDateTime, formatDate } from "../../lib/adminFormat";
import {
  formatSellerPrice,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
} from "../../lib/sellerFormat";

const TRANSITION_ACTIONS: Partial<
  Record<OrderStatus, Array<{ to: OrderStatus; label: string; icon: typeof Box; danger?: boolean }>>
> = {
  pending: [{ to: "confirmed", label: "تأیید سفارش", icon: CheckCircle2 }],
  confirmed: [{ to: "processing", label: "شروع آماده‌سازی", icon: Box }],
  processing: [{ to: "shipped", label: "تأیید ارسال", icon: Truck }],
  shipped: [{ to: "delivered", label: "تحویل شد", icon: CheckCircle2 }],
  delivered: [{ to: "returned", label: "ثبت مرجوعی", icon: Undo2, danger: true }],
};

const CANCELABLE = new Set<OrderStatus>(["pending", "confirmed", "processing"]);

export function OrderDetailSeller() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<SellerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSellerOrder(id)
      .then(setOrder)
      .catch(() => setError("بارگذاری اطلاعات سفارش ناموفق بود."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleTransition = async (nextStatus: OrderStatus) => {
    if (!order || !id) return;
    setBusyAction(nextStatus);
    setError(null);
    try {
      const updated = await updateSellerOrderStatus(id, nextStatus);
      setOrder(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تغییر وضعیت ناموفق بود.");
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-[var(--color-border)]/50" />
        <div className="h-80 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-red-700">
        <p>{error}</p>
        <Link
          to="/seller/orders"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          بازگشت به سفارش‌ها
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const o = order!;
  const actions = TRANSITION_ACTIONS[o.status] ?? [];
  const canCancel = CANCELABLE.has(o.status);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/seller/orders"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <ArrowRight className="h-4 w-4" />
            فهرست سفارش‌ها
          </Link>
          <h2 className="mt-2 flex items-center gap-3 text-lg font-bold text-[var(--color-text)]">
            سفارش #{faNumber(o.orderNumber)}
            <StatusBadge
              label={ORDER_STATUS_LABEL[o.status] ?? o.status}
              tone={ORDER_STATUS_TONE[o.status]}
            />
          </h2>
        </div>
        <div className="text-end text-xs text-[var(--color-muted)]">
          <p>ثبت: {formatDateTime(o.createdAt)}</p>
          <p>به‌روزرسانی: {formatDateTime(o.updatedAt)}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button type="button" className="ms-3 underline" onClick={() => setError(null)}>بستن</button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 xl:col-span-2">
          {/* Items */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                <PackageIcon className="h-4 w-4 text-[var(--color-primary)]" />
                اقلام سفارش
              </h3>
              <span className="text-xs text-[var(--color-muted)]">
                {faNumber(o.itemCount)} قلم کالا
              </span>
            </div>
            <ul className="divide-y divide-[var(--color-border)]">
              {o.items.map((item) => (
                <li key={item.productId} className="flex items-center gap-4 px-5 py-4">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                      <PackageIcon className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">{item.title}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      SKU: {item.sku || "—"} · {faNumber(item.qty)} عدد
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {formatSellerPrice(item.price, item.currency)}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">جمع: {formatSellerPrice(item.price * item.qty, item.currency)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)]/50 px-5 py-4">
              <dl className="space-y-1.5 text-sm">
                <PriceRow label="جمع اقلام" value={formatSellerPrice(o.subtotal, o.currency)} />
                <PriceRow label="حمل و نقل" value={formatSellerPrice(o.shippingFee || 0, o.currency)} />
                {o.discount ? (
                  <PriceRow
                    label="تخفیف"
                    value={`- ${formatSellerPrice(o.discount, o.currency)}`}
                    emphasize="text-green-600"
                  />
                ) : null}
                <div className="flex items-center justify-between border-t border-dashed border-[var(--color-border)] pt-2">
                  <dt className="font-bold text-[var(--color-text)]">مبلغ کل</dt>
                  <dd className="text-lg font-bold text-[var(--color-primary)]">
                    {formatSellerPrice(o.total, o.currency)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-[var(--color-text)]">تاریخچه وضعیت</h3>
            <ol className="relative border-s border-[var(--color-border)] ps-5">
              {o.timeline.map((entry) => (
                <li key={`${entry.status}-${entry.at}`} className="pb-5 last:pb-0">
                  <span
                    className={`absolute start-[-5px] top-1 h-2.5 w-2.5 rounded-full ${
                      entry.status === o.status ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
                    }`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      {ORDER_STATUS_LABEL[entry.status] ?? entry.status}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]" dir="ltr">{formatDate(entry.at)}</p>
                  </div>
                  {entry.reason ? (
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">دلیل: {entry.reason}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Actions */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-[var(--color-text)]">عملیات</h3>
            {(actions.length > 0 || canCancel) ? (
              <div className="space-y-2">
                {actions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.to}
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => {
                        if (a.danger && !window.confirm(`آیا از ثبت وضعیت «${ORDER_STATUS_LABEL[a.to]}» مطمئن هستید؟`)) return;
                        void handleTransition(a.to);
                      }}
                      className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-40 ${
                        a.danger
                          ? "border-red-200 bg-white text-red-600 hover:bg-red-50"
                          : "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
                      }`}
                    >
                      {busyAction === a.to ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                      {busyAction === a.to ? "در حال اجرا..." : a.label}
                    </button>
                  );
                })}
                {canCancel ? (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => {
                      if (!window.confirm("آیا از لغو این سفارش مطمئن هستید؟ موجودی آزاد می‌شود.")) return;
                      void handleTransition("cancelled");
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    {busyAction === "cancelled" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    {busyAction === "cancelled" ? "در حال اجرا..." : "لغو سفارش"}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">این سفارش در وضعیت نهایی است و عملیاتی ندارد.</p>
            )}
          </div>

          {/* Customer */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-[var(--color-text)]">اطلاعات مشتری</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-muted)]">نام</dt>
                <dd className="font-medium text-[var(--color-text)]">{o.customer.name || "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-muted)]">تلفن</dt>
                <dd className="flex items-center gap-1 font-medium text-[var(--color-text)]" dir="ltr">
                  <Phone className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                  {o.customer.phone || "—"}
                </dd>
              </div>
              {o.customerNote ? (
                <div className="rounded-lg bg-[var(--color-bg)] px-3 py-2 text-xs leading-5 text-[var(--color-muted)]">
                  {o.customerNote}
                </div>
              ) : null}
            </dl>
          </div>

          {/* Payment + notes */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <CreditCard className="h-4 w-4 text-[var(--color-primary)]" />
              پرداخت و یادداشت‌ها
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-muted)]">وضعیت پرداخت</dt>
                <dd className="font-medium text-[var(--color-text)]">{o.payment?.status ?? "unpaid"}</dd>
              </div>
              {o.carrierInfo && Object.keys(o.carrierInfo).length > 0 ? (
                <div className="space-y-1 pt-1">
                  {Object.entries(o.carrierInfo).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <dt className="text-[var(--color-muted)]">{k}</dt>
                      <dd className="text-[var(--color-text)]">{String(v)}</dd>
                    </div>
                  ))}
                </div>
              ) : null}
              {o.sellerNote ? (
                <div className="flex items-start gap-2 rounded-lg bg-[var(--color-bg)] px-3 py-2 text-xs leading-5 text-[var(--color-muted)]">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {o.sellerNote}
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceRow({ label, value, emphasize }: { label: string; value: string; emphasize?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className={`font-medium text-[var(--color-text)] ${emphasize ?? ""}`}>{value}</dd>
    </div>
  );
}

export default OrderDetailSeller;