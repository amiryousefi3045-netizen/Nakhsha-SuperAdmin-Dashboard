import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, RefreshCw, ShoppingCart, Eye, ArrowRight, Package, SlidersHorizontal } from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { useDebounce } from "../../hooks/useDebounce";
import { listSellerOrders } from "../../services/sellerService";
import type { OrderStatus, SellerOrder } from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { Pagination } from "../../components/admin/Pagination";
import { faNumber, formatDateTime } from "../../lib/adminFormat";
import {
  formatSellerPrice,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
} from "../../lib/sellerFormat";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "pending", label: "در انتظار" },
  { value: "confirmed", label: "تأییدشده" },
  { value: "processing", label: "در حال آماده‌سازی" },
  { value: "shipped", label: "ارسال‌شده" },
  { value: "delivered", label: "تحویل‌شده" },
  { value: "cancelled", label: "لغو‌شده" },
  { value: "returned", label: "مرجوع‌شده" },
];

export function OrdersSeller() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 350);
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState<"" | "paid" | "unpaid">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [page, setPage] = useState(1);

  const fetcher = useCallback(
    () =>
      listSellerOrders({
        page,
        limit: 15,
        q: debouncedQ || undefined,
        status: (status as OrderStatus) || undefined,
        payment: payment || undefined,
        from: from || undefined,
        to: to || undefined,
        minTotal: minTotal === "" ? undefined : Number(minTotal),
        maxTotal: maxTotal === "" ? undefined : Number(maxTotal),
      }),
    [page, debouncedQ, status, payment, from, to, minTotal, maxTotal],
  );
  const { data, isLoading, error } = useSellerFetch(fetcher, {
    dependencies: [page, debouncedQ, status, payment, from, to, minTotal, maxTotal],
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, payment, from, to, minTotal, maxTotal]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">سفارش‌ها</h2>
          <p className="text-sm text-[var(--color-muted)]">مدیریت سفارش‌ها و وضعیت ارسال</p>
        </div>
        <Link
          to="/seller/fulfillment"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
        >
          <Package className="h-4 w-4" />
          <span className="hidden sm:inline">مرکز ارسال</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو نام مشتری، تلفن یا شماره سفارش..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2 pe-3 ps-9 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={payment}
          onChange={(e) => {
            setPayment(e.target.value as "" | "paid" | "unpaid");
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          <option value="">همه پرداخت‌ها</option>
          <option value="paid">پرداخت‌شده</option>
          <option value="unpaid">پرداخت‌نشده</option>
        </select>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-muted)]">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          فیلترهای بیشتر
        </span>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[10px] font-medium text-[var(--color-muted)]">از تاریخ</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[10px] font-medium text-[var(--color-muted)]">تا تاریخ</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[10px] font-medium text-[var(--color-muted)]">حداقل مبلغ (تومان)</span>
          <input
            type="number"
            min={0}
            value={minTotal}
            onChange={(e) => setMinTotal(e.target.value)}
            placeholder="مثلاً 500000"
            className="w-36 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[10px] font-medium text-[var(--color-muted)]">حداکثر مبلغ (تومان)</span>
          <input
            type="number"
            min={0}
            value={maxTotal}
            onChange={(e) => setMaxTotal(e.target.value)}
            placeholder="مثلاً 2000000"
            className="w-36 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
          />
        </label>
        {(from || to || minTotal || maxTotal) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setMinTotal("");
              setMaxTotal("");
            }}
            className="ms-auto rounded-lg px-3 py-1.5 text-xs text-[var(--color-primary)] hover:bg-[var(--color-muted)]/10"
          >
            پاک کردن فیلترها
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {isLoading ? (
        <LoadingSkeleton />
      ) : (data?.items ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-text)]">سفارشی یافت نشد</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            با ثبت اولین سفارش از سمت خریدار، اینجا نمایش داده می‌شود.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                <th className="px-4 py-3 text-start">سفارش</th>
                <th className="px-4 py-3 text-center">مشتری</th>
                <th className="px-4 py-3 text-center">اقلام</th>
                <th className="px-4 py-3 text-center">مبلغ</th>
                <th className="px-4 py-3 text-center">وضعیت</th>
                <th className="px-4 py-3 text-center">ثبت</th>
                <th className="px-4 py-3 text-end">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(data?.items ?? []).map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(p) => {
          setPage(p);
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}

function OrderRow({ order: o }: { order: SellerOrder }) {
  return (
    <tr className="transition-colors hover:bg-[var(--color-primary)]/5">
      <td className="px-4 py-3">
        <Link to={`/seller/orders/${o.id}`} className="block">
          <p className="font-semibold text-[var(--color-text)]">#{faNumber(o.orderNumber)}</p>
          <p className="text-xs text-[var(--color-muted)]">
            {o.items.length > 0 && o.items[0].title}
            {o.items.length > 1 ? ` +${faNumber(o.items.length - 1)}` : ""}
          </p>
        </Link>
      </td>
      <td className="px-4 py-3 text-center">
        <p className="text-[var(--color-text)]">{o.customer.name || "—"}</p>
        {o.customer.phone ? (
          <p className="text-xs text-[var(--color-muted)]" dir="ltr">{o.customer.phone}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-center text-[var(--color-text)]">{faNumber(o.itemCount)}</td>
      <td className="px-4 py-3 text-center">
        <span className="font-semibold text-[var(--color-text)]">
          {formatSellerPrice(o.total, o.currency)}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <StatusBadge
          label={ORDER_STATUS_LABEL[o.status] ?? o.status}
          tone={ORDER_STATUS_TONE[o.status]}
        />
      </td>
      <td className="px-4 py-3 text-center text-xs text-[var(--color-muted)]">
        {formatDateTime(o.createdAt)}
      </td>
      <td className="px-4 py-3 text-end">
        <Link
          to={`/seller/orders/${o.id}`}
          title="جزئیات سفارش"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
        >
          <Eye className="h-4 w-4" />
          <span className="hidden xl:inline">جزئیات</span>
        </Link>
      </td>
    </tr>
  );
}

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0">
          <div className="h-10 w-16 animate-pulse rounded-lg bg-[var(--color-border)]/50" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-[var(--color-border)]/50" />
            <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-border)]/40" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded bg-[var(--color-border)]/40" />
          <RefreshCw className="h-4 w-4 animate-spin text-[var(--color-primary)] opacity-0" />
        </div>
      ))}
    </div>
  );
}

export default OrdersSeller;