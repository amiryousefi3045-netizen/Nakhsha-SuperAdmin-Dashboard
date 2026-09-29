import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { ArrowRight, BellRing, Package, ReceiptText, Undo2, Loader2 } from "lucide-react";
import { useAsync } from "../../hooks/useAsync";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";
import {
  getStorefrontOrderDetail,
  createBuyerReturn,
} from "../../services/storefrontService";
import type {
  BuyerOrder,
  BuyerReturn,
  OrderNotification,
} from "../../types/storefront";
import { RETURN_STATUS_LABELS } from "../../types/returns";
import {
  PAYMENT_LABELS,
  statusColorClass,
  statusLabel,
} from "./orderLabels";

/**
 * The buyer's side of the RMA (Phase 33, P1-04).
 *
 * Eligibility and the deadline come from the server with the receipt, so this
 * component never decides on its own whether a window is still open — a stale
 * client clock cannot offer a return the store would have to refuse. The list
 * of claims is kept locally and updated from the POST response, which is the
 * same document the store will see.
 */
function ReturnSection({
  orderId,
  initial,
  eligible,
  deadline,
}: {
  orderId: string;
  initial: BuyerReturn[];
  eligible: boolean;
  deadline: string | null;
}) {
  const [claims, setClaims] = useState<BuyerReturn[]>(initial);
  const [isFormOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const openClaim = claims.find((c) => c.isOpen);
  const closedClaims = claims.filter((c) => !c.isOpen);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await createBuyerReturn(orderId, { reason: reason.trim() });
      setClaims((prev) => [created, ...prev]);
      setReason("");
      setFormOpen(false);
      setDone(
        `درخواست مرجوعی شما با شماره ${faNumber(created.rmaNumber)} ثبت شد و پس از بررسی فروشنده نتیجه اعلام می‌شود.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "ثبت درخواست مرجوعی ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  // Nothing to offer and nothing to show: stay out of the buyer's way.
  if (claims.length === 0 && !eligible) return null;

  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-white p-6">
      <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
        <Undo2 className="h-4 w-4 text-[var(--color-primary)]" />
        مرجوعی و استرداد وجه
      </h2>

      {done ? (
        <p className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {done}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {openClaim ? (
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              درخواست #{faNumber(openClaim.rmaNumber)}
            </p>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--color-text)]">
              {RETURN_STATUS_LABELS[openClaim.status]}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
            علت ثبت‌شده: {openClaim.reason}
          </p>
          {openClaim.status === "approved" ? (
            <p className="mt-2 text-xs leading-5 text-[var(--color-text)]">
              درخواست شما تأیید شد. لطفاً کالا را مطابق راهنمای فروشنده ارسال کنید تا پس از
              دریافت، مبلغ استرداد داده شود.
            </p>
          ) : null}
          {openClaim.status === "received" ? (
            <p className="mt-2 text-xs leading-5 text-[var(--color-text)]">
              کالا دریافت شد و مبلغ در حال استرداد است.
            </p>
          ) : null}
          {openClaim.resolutionNote ? (
            <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
              پاسخ فروشنده: {openClaim.resolutionNote}
            </p>
          ) : null}
          <ul className="mt-3 space-y-1 border-t border-[var(--color-border)] pt-3">
            {openClaim.timeline.map((t, i) => (
              <li key={`${t.status}-${i}`} className="text-[11px] text-[var(--color-muted)]">
                {RETURN_STATUS_LABELS[t.status]} — {new Date(t.at).toLocaleString("fa-IR")}
                {t.note ? ` — ${t.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {closedClaims.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {closedClaims.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] p-3 text-xs"
            >
              <span className="text-[var(--color-text)]">درخواست #{faNumber(c.rmaNumber)}</span>
              <span className="text-[var(--color-muted)]">
                {RETURN_STATUS_LABELS[c.status]}
                {c.status === "refunded"
                  ? ` — ${formatSellerPrice(c.refundAmount, c.refundCurrency)}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {!openClaim && eligible && !done ? (
        isFormOpen ? (
          <div className="mt-4">
            <label
              className="block text-sm font-medium text-[var(--color-text)]"
              htmlFor="return-reason"
            >
              علت درخواست مرجوعی
            </label>
            <textarea
              id="return-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مشکل کالا را توضیح دهید تا فروشنده بتواند درخواست را بررسی کند."
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
            {deadline ? (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                مهلت ثبت درخواست: {new Date(deadline).toLocaleDateString("fa-IR")}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={busy || reason.trim().length < 5}
                onClick={() => void submit()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                ثبت درخواست
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-xs leading-5 text-[var(--color-muted)]">
              اگر کالا با سفارش شما مطابقت ندارد یا ایرادی دارد، می‌توانید درخواست مرجوعی ثبت
              کنید. نتیجه بررسی فروشنده از همین صفحه اعلام می‌شود.
            </p>
            {deadline ? (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                مهلت ثبت درخواست: {new Date(deadline).toLocaleDateString("fa-IR")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
            >
              <Undo2 className="h-4 w-4" />
              درخواست مرجوعی
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

function Receipt({
  order,
  returns = [],
  returnEligible = false,
  returnDeadline = null,
}: {
  order: BuyerOrder;
  returns?: BuyerReturn[];
  returnEligible?: boolean;
  returnDeadline?: string | null;
}) {
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

      <ReturnSection
        orderId={order.id}
        initial={returns}
        eligible={returnEligible}
        deadline={returnDeadline}
      />

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

  const { data, loading, error } = useAsync(
    () => getStorefrontOrderDetail(orderId),
    [orderId],
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-sm text-[var(--color-muted)]">در حال بارگذاری رسید سفارش...</div>
      </div>
    );
  }

  if (error || !data) {
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

  return (
    <Receipt
      order={data.order}
      returns={data.returns}
      returnEligible={data.returnEligible}
      returnDeadline={data.returnDeadline}
    />
  );
}

export default BuyerOrderPage;