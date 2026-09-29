import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  Undo2,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Ban,
  Wallet,
  Eye,
  Plus,
  Filter,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  getSellerProfile,
  listSellerReturns,
  updateSellerReturnStatus,
  refundSellerReturn,
  createSellerReturn,
} from "../../services/sellerService";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { RETURN_STATUS_LABELS, RETURN_STATUS_ACTIONS, isOpenReturn } from "../../types/returns";
import type { ReturnStatus, SellerReturn } from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";

/**
 * Returns / RMA queue (Phase 33, P1-04).
 *
 * This is where a delivered order actually becomes `returned`. The seller never
 * flips that status by hand: the order only leaves `delivered` through an
 * issued refund, which is also what records the reason, the amount and the
 * audit trail. Everything on this page is therefore a decision about a
 * dispute, not a workflow button.
 */

const STATUS_TONE: Record<ReturnStatus, "gray" | "amber" | "green" | "blue" | "red"> = {
  requested: "amber",
  approved: "blue",
  received: "blue",
  refunded: "green",
  rejected: "red",
  cancelled: "gray",
};

/** The action set per state, in the order the seller should consider them. */
const ACTIONS: {
  status: Exclude<ReturnStatus, "refunded">;
  label: string;
  icon: typeof CheckCircle2;
  tone: string;
  needsNote?: boolean;
}[] = [
  { status: "approved", label: "تأیید", icon: CheckCircle2, tone: "text-green-700 border-green-300 hover:bg-green-50" },
  { status: "rejected", label: "رد", icon: XCircle, tone: "text-red-700 border-red-300 hover:bg-red-50", needsNote: true },
  { status: "received", label: "دریافت کالا", icon: PackageCheck, tone: "text-blue-700 border-blue-300 hover:bg-blue-50" },
  { status: "cancelled", label: "لغو", icon: Ban, tone: "text-gray-700 border-gray-300 hover:bg-gray-50" },
];

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

export function ReturnsSeller() {
  const [data, setData] = useState<{
    items: SellerReturn[];
    total: number;
    page: number;
    limit: number;
    counts: {
      requested: number;
      approved: number;
      rejected: number;
      received: number;
      refunded: number;
      cancelled: number;
      awaitingDecision: number;
      open: number;
    };
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReturnStatus | "">("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refundFor, setRefundFor] = useState<SellerReturn | null>(null);
  const [noteFor, setNoteFor] = useState<{ ret: SellerReturn; status: ReturnStatus } | null>(null);
  const [note, setNote] = useState("");
  const [showFileForm, setShowFileForm] = useState(false);
  // Moving money is owner-only on the backend (`requireOwnerOnly`). Mirroring
  // that here is a courtesy: the button is hidden rather than left to fail
  // with a 403 after the seller has already typed an amount.
  const { data: profile } = useSellerFetch(getSellerProfile);
  const canRefund = profile?.myRole === "owner";

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listSellerReturns({
        page,
        limit: 20,
        ...(filter ? { status: filter } : {}),
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری مرجوعی‌ها ناموفق بود");
    } finally {
      setIsLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatus = useCallback(
    async (ret: SellerReturn, status: ReturnStatus, text = "") => {
      setBusyId(ret.id);
      setError(null);
      setNotice(null);
      try {
        const updated = await updateSellerReturnStatus(ret.id, status, text || undefined);
        setNotice(
          `درخواست #${faNumber(updated.rmaNumber)} به وضعیت «${RETURN_STATUS_LABELS[status]}» تغییر کرد.`,
        );
        setNoteFor(null);
        setNote("");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "تغییر وضعیت ناموفق بود");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const handleRefund = useCallback(
    async (ret: SellerReturn, amount: number, text = "") => {
      setBusyId(ret.id);
      setError(null);
      setNotice(null);
      try {
        const res = await refundSellerReturn(ret.id, {
          refundAmount: amount,
          ...(text ? { note: text } : {}),
        });
        setNotice(
          `مبلغ ${formatSellerPrice(res.return.refundAmount, res.return.refundCurrency)} برای درخواست #${faNumber(res.return.rmaNumber)} استرداد شد.`,
        );
        setRefundFor(null);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "ثبت استرداد ناموفق بود");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const counts = data?.counts;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">مرجوعی و استرداد وجه</h2>
          <p className="text-sm text-[var(--color-muted)]">
            درخواست‌های خریدار، تصمیم فروشنده و مبالغ استردادشده
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFileForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            <Plus className="h-4 w-4" />
            ثبت مرجوعی حضوری
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            <RefreshCw className="h-4 w-4" />
            به‌روزرسانی
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button type="button" className="ms-3 underline" onClick={() => setError(null)}>
            بستن
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {notice}
          <button type="button" className="ms-3 underline" onClick={() => setNotice(null)}>
            بستن
          </button>
        </div>
      ) : null}

      {!canRefund ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            ثبت استرداد وجه فقط برای صاحب حساب فروشگاه ممکن است. شما می‌توانید درخواست‌ها را
            بررسی و تأیید یا رد کنید، اما پرداخت را مالک فروشگاه انجام می‌دهد.
          </span>
        </div>
      ) : null}

      {showFileForm ? (
        <FileReturnForm
          onDone={async (message) => {
            setNotice(message);
            setShowFileForm(false);
            await load();
          }}
          onCancel={() => setShowFileForm(false)}
        />
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="در انتظار تصمیم" value={counts?.awaitingDecision ?? 0} tone="amber" />
          <Stat label="کالا دریافت‌شده" value={counts?.received ?? 0} tone="blue" />
          <Stat label="استردادشده" value={counts?.refunded ?? 0} tone="green" />
          <Stat label="باز (در جریان)" value={counts?.open ?? 0} tone="gray" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-sm">
        <Filter className="h-4 w-4 text-[var(--color-muted)]" />
        <FilterChip label="همه" active={filter === ""} onClick={() => { setFilter(""); setPage(1); }} />
        {(["requested", "approved", "received", "refunded", "rejected", "cancelled"] as ReturnStatus[]).map(
          (s) => (
            <FilterChip
              key={s}
              label={RETURN_STATUS_LABELS[s]}
              active={filter === s}
              onClick={() => { setFilter(s); setPage(1); }}
            />
          ),
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
        {data && data.items.length > 0 ? (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                <th className="px-4 py-3 text-start">درخواست</th>
                <th className="px-4 py-3 text-start">مشتری</th>
                <th className="px-4 py-3 text-start">علت</th>
                <th className="px-4 py-3 text-center">وضعیت</th>
                <th className="px-4 py-3 text-center">مبلغ</th>
                <th className="px-4 py-3 text-end">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.items.map((ret) => (
                <ReturnRow
                  key={ret.id}
                  ret={ret}
                  busy={busyId === ret.id}
                  canRefund={canRefund}
                  onStatus={(status) => {
                    if (status === "rejected") {
                      setNoteFor({ ret, status });
                      setNote("");
                    } else {
                      void handleStatus(ret, status);
                    }
                  }}
                  onRefund={() => setRefundFor(ret)}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            <Undo2 className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <p className="mt-3 text-sm font-medium text-[var(--color-text)]">درخواست مرجوعی وجود ندارد</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              وقتی خریداری درخواست مرجوعی ثبت کند، اینجا نمایش داده می‌شود.
            </p>
          </div>
        )}
      </div>

      {data && data.total > 0 ? (
        <Pagination page={data.page} limit={data.limit} total={data.total} onChange={setPage} />
      ) : null}

      {noteFor ? (
        <NoteDialog
          title={`رد درخواست #${faNumber(noteFor.ret.rmaNumber)}`}
          hint="دلیل رد را بنویسید؛ خریدار این متن را می‌بیند."
          value={note}
          confirmLabel="رد درخواست"
          danger
          onChange={setNote}
          onCancel={() => { setNoteFor(null); setNote(""); }}
          onConfirm={() => void handleStatus(noteFor.ret, noteFor.status, note)}
        />
      ) : null}

      {refundFor ? (
        <RefundDialog
          ret={refundFor}
          busy={busyId === refundFor.id}
          onCancel={() => setRefundFor(null)}
          onConfirm={(amount, text) => void handleRefund(refundFor, amount, text)}
        />
      ) : null}
    </div>
  );
}

function ReturnRow({
  ret,
  busy,
  canRefund,
  onStatus,
  onRefund,
}: {
  ret: SellerReturn;
  busy: boolean;
  canRefund: boolean;
  onStatus: (status: ReturnStatus) => void;
  onRefund: () => void;
}) {
  const allowed = RETURN_STATUS_ACTIONS[ret.status] ?? [];
  const refundable = allowed.includes("refunded");

  return (
    <tr className="align-top transition-colors hover:bg-[var(--color-primary)]/5">
      <td className="px-4 py-3">
        <p className="font-semibold text-[var(--color-text)]">RMA #{faNumber(ret.rmaNumber)}</p>
        <Link
          to={`/seller/orders/${ret.orderId}`}
          className="text-xs text-[var(--color-primary)] hover:underline"
        >
          سفارش #{faNumber(ret.orderNumber)}
        </Link>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">{formatDate(ret.createdAt)}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-[var(--color-text)]">{ret.customerName || "—"}</p>
        <p className="text-xs text-[var(--color-muted)]">{ret.customerPhone || "—"}</p>
        {!ret.buyerUserId ? (
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">ثبت‌شده توسط فروشنده</p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <p className="max-w-xs text-[var(--color-text)]">{ret.reason}</p>
        {ret.items.length > 0 ? (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {ret.items.map((i) => `${i.title} ×${faNumber(i.qty)}`).join("، ")}
          </p>
        ) : null}
        {ret.resolutionNote ? (
          <p className="mt-1 text-xs text-[var(--color-muted)]">پاسخ فروشنده: {ret.resolutionNote}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-center">
        <StatusBadge label={RETURN_STATUS_LABELS[ret.status]} tone={STATUS_TONE[ret.status]} />
        {isOpenReturn(ret.status) ? (
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">باز</p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-center">
        {ret.status === "refunded" ? (
          <>
            <p className="font-semibold text-green-700">
              {formatSellerPrice(ret.refundAmount, ret.refundCurrency)}
            </p>
            <p className="text-[11px] text-[var(--color-muted)]">
              از {formatSellerPrice(ret.orderTotal ?? 0, ret.orderCurrency)}
            </p>
          </>
        ) : (
          <p className="text-[var(--color-muted)]">—</p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {ACTIONS.filter((a) => allowed.includes(a.status)).map((a) => (
            <button
              key={a.status}
              type="button"
              disabled={busy}
              onClick={() => onStatus(a.status)}
              className={`inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${a.tone}`}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <a.icon className="h-3.5 w-3.5" />
              )}
              {a.label}
            </button>
          ))}

          {refundable ? (
            canRefund ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRefund}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
              >
                <Wallet className="h-3.5 w-3.5" />
                استرداد وجه
              </button>
            ) : (
              <span
                title="ثبت استرداد وجه فقط برای صاحب حساب ممکن است"
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] opacity-60"
              >
                <Wallet className="h-3.5 w-3.5" />
                فقط مالک
              </span>
            )
          ) : null}

          <Link
            to={`/seller/orders/${ret.orderId}`}
            title="جزئیات سفارش"
            className="rounded-lg border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            <Eye className="h-4 w-4" />
          </Link>
        </div>
      </td>
    </tr>
  );
}

/**
 * The money dialog. The bound is the order total from the server, not the sum
 * of the item lines: those disagree whenever a discount was applied, and a
 * refund larger than what was charged is the one mistake here that cannot be
 * walked back.
 */
function RefundDialog({
  ret,
  busy,
  onCancel,
  onConfirm,
}: {
  ret: SellerReturn;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (amount: number, note: string) => void;
}) {
  const max = ret.orderTotal ?? 0;
  const [amount, setAmount] = useState(String(max || ""));
  const [note, setNote] = useState("");
  const parsed = Number(amount);
  const invalid =
    !Number.isInteger(parsed) || parsed < 1 || (max > 0 && parsed > max);

  return (
    <Modal title={`استرداد وجه برای RMA #${faNumber(ret.rmaNumber)}`} onCancel={onCancel}>
      <p className="text-xs text-[var(--color-muted)]">
        مبلغ قابل استرداد حداکثر {formatSellerPrice(max, ret.orderCurrency)} است. مبلغ کمتر از
        کل، به‌عنوان استرداد جزئی ثبت می‌شود.
      </p>
      <label className="mt-3 block text-sm font-medium text-[var(--color-text)]" htmlFor="refund-amount">
        مبلغ استرداد (ریال)
      </label>
      <input
        id="refund-amount"
        type="number"
        inputMode="numeric"
        min={1}
        max={max || undefined}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
      />
      {invalid && amount !== "" ? (
        <p className="mt-1 text-xs text-red-600">
          مبلغ باید عدد صحیح و بین ۱ و {faNumber(max)} باشد.
        </p>
      ) : null}
      <label className="mt-3 block text-sm font-medium text-[var(--color-text)]" htmlFor="refund-note">
        توضیح (اختیاری)
      </label>
      <input
        id="refund-note"
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
      />
      <p className="mt-3 rounded-lg bg-[var(--color-bg)] p-2 text-xs text-[var(--color-muted)]">
        با ثبت استرداد، سفارش به وضعیت «مرجوعی» می‌رود، موجودی کالا بازمی‌گردد و این اقدام در
        سوابق فروشگاه ثبت می‌شود.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          انصراف
        </button>
        <button
          type="button"
          disabled={invalid || busy}
          onClick={() => onConfirm(parsed, note)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          ثبت استرداد
        </button>
      </div>
    </Modal>
  );
}

function NoteDialog({
  title,
  hint,
  value,
  confirmLabel,
  danger,
  onChange,
  onCancel,
  onConfirm,
}: {
  title: string;
  hint: string;
  value: string;
  confirmLabel: string;
  danger?: boolean;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onCancel={onCancel}>
      <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="mt-2 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          انصراف
        </button>
        <button
          type="button"
          disabled={!value.trim()}
          onClick={onConfirm}
          className={`rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-40 ${
            danger ? "bg-red-600" : "bg-[var(--color-primary)]"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Walk-in / phone return the seller files on the buyer's behalf. */
function FileReturnForm({
  onDone,
  onCancel,
}: {
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await createSellerReturn({ orderId: orderId.trim(), reason: reason.trim() });
      onDone(`درخواست #${faNumber(created.rmaNumber)} برای سفارش ثبت شد.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ثبت مرجوعی ناموفق بود");
    } finally {
      setBusy(false);
    }
  }, [onDone, orderId, reason]);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-[var(--color-text)]">ثبت مرجوعی حضوری</h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        برای مرجوعی حضوری یا تماسی که خریدار آنلاین ثبت نکرده است. این درخواست مستقیماً «تأییدشده»
        ثبت می‌شود.
      </p>
      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)]" htmlFor="file-order-id">
            شناسه سفارش
          </label>
          <input
            id="file-order-id"
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="مثلاً 6650f1…"
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)]" htmlFor="file-reason">
            علت مرجوعی
          </label>
          <input
            id="file-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          انصراف
        </button>
        <button
          type="button"
          disabled={busy || !orderId.trim() || reason.trim().length < 5}
          onClick={() => void submit()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          ثبت درخواست
        </button>
      </div>
    </div>
  );
}

function Modal({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--color-text)]">{title}</h3>
          <button type="button" onClick={onCancel} className="text-[var(--color-muted)]">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "green" | "gray";
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    gray: "bg-gray-50 text-gray-700",
  };
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className={`mt-1 inline-block rounded-lg px-2 py-0.5 text-xl font-bold ${tones[tone]}`}>
        {faNumber(value)}
      </p>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
        active
          ? "bg-[var(--color-primary)] text-white"
          : "border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
      }`}
    >
      {label}
    </button>
  );
}

function Pagination({
  page,
  limit,
  total,
  onChange,
}: {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-40"
      >
        قبلی
      </button>
      <span className="text-[var(--color-muted)]">
        صفحه {faNumber(page)} از {faNumber(pages)}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-40"
      >
        بعدی
      </button>
    </div>
  );
}

export default ReturnsSeller;
