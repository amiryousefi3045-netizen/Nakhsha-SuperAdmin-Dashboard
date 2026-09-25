import { useParams, Link } from "react-router-dom";
import { ArrowRight, BellRing, Package, ReceiptText } from "lucide-react";
import { useAsync } from "../../hooks/useAsync";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";
import { getStorefrontOrder } from "../../services/storefrontService";
import type { BuyerOrder, OrderNotification } from "../../types/storefront";
import {
  PAYMENT_LABELS,
  statusColorClass,
  statusLabel,
} from "./orderLabels";

function Receipt({ order }: { order: BuyerOrder }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-text)]">
          <ReceiptText className="h-6 w-6 text-[var(--color-primary)]" />
          رسید سفارش
        </h1>
        <span
          className={`rounded-full px-4 py-1.5 text-xs font-medium ${statusColorClass(order.status)}`}
        >
          {statusLabel(order.status)}
        </span>
        <Link
          to="/store/orders"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
        >
          <ArrowRight className="h-4 w-4" />
          سفارش‌های من
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4 text-sm">
          <div>
            <p className="text-[var(--color-muted)]">شماره سفارش</p>
            <p className="mt-1 text-lg font-bold text-[var(--color-text)]">
              {faNumber(order.orderNumber)}
            </p>
          </div>
          <div>
            <p className="text-[var(--color-muted)]">وضعیت پرداخت</p>
            <p
              className={`mt-1 font-bold ${
                order.payment.status === "paid" ? "text-green-600" : "text-amber-600"
              }`}
            >
              {PAYMENT_LABELS[order.payment.status] ?? order.payment.status}
            </p>
          </div>
          <div>
            <p className="text-[var(--color-muted)]">درگاه</p>
            <p className="mt-1 font-semibold text-[var(--color-text)]">
              {order.payment.provider === "mock" ? "آزمایشی" : order.payment.provider || "—"}
            </p>
          </div>
          {order.payment.paidAt ? (
            <div>
              <p className="text-[var(--color-muted)]">زمان پرداخت</p>
              <p className="mt-1 font-semibold text-[var(--color-text)]" dir="ltr">
                {new Date(order.payment.paidAt).toLocaleString("fa-IR")}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[var(--color-muted)]">خریدار</p>
            <p className="mt-1 font-semibold text-[var(--color-text)]">
              {order.customer?.name || "—"}
            </p>
            <p className="mt-1 text-[var(--color-muted)]" dir="ltr">
              {order.customer?.phone || "—"}
            </p>
            {order.customer?.address ? (
              <p className="mt-1 leading-6 text-[var(--color-muted)]">{order.customer.address}</p>
            ) : null}
          </div>
          <div>
            <p className="text-[var(--color-muted)]">یادداشت خریدار</p>
            <p className="mt-1 leading-6 text-[var(--color-text)]">
              {order.customerNote || "—"}
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-muted)]">
                <th className="px-4 py-3 text-right font-medium">کالا</th>
                <th className="px-4 py-3 text-center font-medium">تعداد</th>
                <th className="px-4 py-3 text-left font-medium">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.productId} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{item.title}</td>
                  <td className="px-4 py-3 text-center text-[var(--color-text)]">
                    {faNumber(item.qty)}
                  </td>
                  <td className="px-4 py-3 text-left text-[var(--color-text)]">
                    {formatSellerPrice(item.price * item.qty, item.currency || order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          {order.discount > 0 ? (
            <p className="text-[var(--color-muted)]">
              تخفیف: {formatSellerPrice(order.discount, order.currency)}
            </p>
          ) : null}
          <p className="text-lg font-extrabold text-[var(--color-primary)]">
            جمع‌کل: {formatSellerPrice(order.total, order.currency)}
          </p>
        </div>

        {order.timeline && order.timeline.length > 0 ? (
          <div className="mt-6 border-t border-[var(--color-border)] pt-4">
            <p className="text-sm font-bold text-[var(--color-text)]">تاریخچه سفارش</p>
            <ul className="mt-3 space-y-2">
              {order.timeline.map((entry, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      entry.status === "cancelled" ? "bg-red-500" : "bg-[var(--color-primary)]"
                    }`}
                  />
                  <div>
                    <p className="text-[var(--color-text)]">
                      {statusLabel(entry.status)}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]" dir="ltr">
                      {new Date(entry.at).toLocaleString("fa-IR")}
                      {entry.reason ? ` — ${entry.reason}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {order.notifications && order.notifications.length > 0 ? (
          <div className="mt-6 border-t border-[var(--color-border)] pt-4">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <BellRing className="h-4 w-4 text-[var(--color-primary)]" />
              اعلام‌های ارسالی
            </p>
            <ul className="mt-3 space-y-3">
              {order.notifications.map((n: OrderNotification, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[var(--color-text)]">
                      {n.reason === "invoice"
                        ? "فاکتور سفارش"
                        : n.reason === "payment_reminder"
                          ? "یادآوری پرداخت"
                          : statusLabel(n.status)}
                    </span>
                    <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                      {n.channel === "email"
                        ? "ایمیل"
                        : n.channel === "telegram"
                          ? "تلگرام"
                          : "پیامک"}
                    </span>
                    {n.delivered ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        ارسال شد
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        {n.error ? "ارسال ناموفق" : "در انتظار ارسال"}
                      </span>
                    )}
                  </div>
                  {n.message ? (
                    <p className="mt-2 leading-6 text-[var(--color-muted)]">{n.message}</p>
                  ) : null}
                  {n.error ? (
                    <p className="mt-1 text-xs text-red-600">{n.error}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--color-muted)]" dir="ltr">
                    {new Date(n.at).toLocaleString("fa-IR")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
      >
        <ArrowRight className="h-4 w-4" />
        بازگشت به خانه
      </Link>
    </div>
  );
}

export function BuyerOrderPage() {
  const { orderId = "" } = useParams<{ orderId: string }>();

  const { data: order, loading, error } = useAsync(
    () => getStorefrontOrder(orderId),
    [orderId],
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-sm text-[var(--color-muted)]">در حال بارگذاری رسید سفارش...</div>
      </div>
    );
  }

  if (error || !order) {
    const notFound = (error as { code?: string } | null)?.code === "NOT_FOUND";
    return (
      <div className="mx-auto min-h-[60vh] max-w-2xl px-4 py-16 text-center">
        <Package className="mx-auto h-12 w-12 text-[var(--color-muted)]" />
        <h2 className="mt-4 text-lg font-bold text-[var(--color-text)]">
          {notFound ? "سفارش پیدا نشد" : "خطا در بارگذاری سفارش"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
          {notFound
            ? "این سفارش برای حساب شما ثبت نشده است یا وجود ندارد."
            : "بعداً دوباره تلاش کنید."}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت به خانه
        </Link>
      </div>
    );
  }

  return <Receipt order={order} />;
}

export default BuyerOrderPage;