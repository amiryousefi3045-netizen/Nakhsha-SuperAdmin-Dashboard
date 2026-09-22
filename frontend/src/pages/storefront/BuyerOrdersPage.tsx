import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Package, ReceiptText } from "lucide-react";
import { Pagination } from "../../components/admin/Pagination";
import { useAsync } from "../../hooks/useAsync";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";
import { listStorefrontOrders } from "../../services/storefrontService";
import type { BuyerOrderStatus } from "../../types/storefront";
import { ORDER_STATUS_FILTERS, statusColorClass, statusLabel } from "./orderLabels";

const PAGE_SIZE = 10;

export function BuyerOrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<BuyerOrderStatus | "all">("all");

  const { data, loading, error } = useAsync(
    () =>
      listStorefrontOrders({
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
      }),
    [page, status],
  );

  function changeStatus(next: BuyerOrderStatus | "all") {
    setStatus(next);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-text)]">
        <ReceiptText className="h-6 w-6 text-[var(--color-primary)]" />
        سفارش‌های من
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {ORDER_STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => changeStatus(f.value)}
            className={
              status === f.value
                ? "rounded-full bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-[var(--color-border)] bg-white px-4 py-1.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-10 text-center text-sm text-[var(--color-muted)]">
          در حال بارگذاری سفارش‌ها...
        </div>
      ) : null}

      {error && !loading ? (
        <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
          خطا در بارگذاری سفارش‌ها؛ بعداً دوباره تلاش کنید.
        </div>
      ) : null}

      {!loading && !error && data && data.items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-[var(--color-border)] bg-white p-10 text-center">
          <Package className="mx-auto h-12 w-12 text-[var(--color-muted)]" />
          <p className="mt-4 text-sm text-[var(--color-muted)]">
            سفارشی در این وضعیت ندارید. از ویترین فروشگاه‌ها خرید کنید.
          </p>
          <Link
            to="/"
            className="mt-5 inline-block rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            بازگشت به خانه
          </Link>
        </div>
      ) : null}

      {!loading && !error && data && data.items.length > 0 ? (
        <>
          <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-muted)]">
                  <th className="px-4 py-3 text-right font-medium">شماره</th>
                  <th className="px-4 py-3 text-right font-medium">کالا</th>
                  <th className="px-4 py-3 text-right font-medium">وضعیت</th>
                  <th className="px-4 py-3 text-right font-medium">پرداخت</th>
                  <th className="px-4 py-3 text-left font-medium">مبلغ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((order) => (
                  <tr key={order.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/60">
                    <td className="px-4 py-4 font-bold text-[var(--color-text)]">
                      {faNumber(order.orderNumber)}
                    </td>
                    <td className="px-4 py-4 text-[var(--color-text)]">
                      {order.items.map((i) => i.title).join("، ")}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClass(order.status)}`}
                      >
                        {statusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={
                          order.payment.status === "paid"
                            ? "text-sm font-semibold text-green-600"
                            : "text-sm font-semibold text-amber-600"
                        }
                      >
                        {order.payment.status === "paid" ? "پرداخت شده" : "پرداخت نشده"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-left font-semibold text-[var(--color-text)]">
                      {formatSellerPrice(order.total, order.currency)}
                    </td>
                    <td className="px-4 py-4 text-left">
                      <Link
                        to={`/store/orders/${order.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                      >
                        جزئیات
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            className="mt-6"
            page={data.page}
            totalPages={Math.max(1, Math.ceil(data.total / data.limit))}
            onChange={setPage}
          />
        </>
      ) : null}
    </div>
  );
}

export default BuyerOrdersPage;