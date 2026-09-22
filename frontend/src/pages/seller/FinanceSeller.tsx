import { useCallback, useEffect, useState } from "react";
import {
  Wallet,
  RefreshCw,
  Clock,
  Banknote,
  TrendingUp,
  XCircle,
  Landmark,
  CreditCard,
  Coins,
  CircleDollarSign,
  Info,
} from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import {
  cancelSellerPayout,
  getSellerFinance,
  getSellerPayouts,
  getSellerSettings,
  requestSellerPayout,
} from "../../services/sellerService";
import type { PayoutMethod, SellerPayout } from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber, formatDateTime } from "../../lib/adminFormat";
import {
  PAYOUT_METHOD_LABEL,
  PAYOUT_STATUS_LABEL,
  PAYOUT_STATUS_TONE,
  formatSellerPrice,
} from "../../lib/sellerFormat";

const METHOD_ICON: Record<PayoutMethod, typeof Landmark> = {
  bank_transfer: Landmark,
  card: CreditCard,
  wallet: Coins,
  other: CircleDollarSign,
};

const PAYOUT_PAGE_SIZE = 10;

export function FinanceSeller() {
  const {
    data: finance,
    isLoading,
    error,
    reload,
  } = useSellerFetch(getSellerFinance);

  const [payouts, setPayouts] = useState<SellerPayout[]>([]);
  const [payoutsTotal, setPayoutsTotal] = useState(0);
  const [payoutsLoading, setPayoutsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayoutMethod>("bank_transfer");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPayouts = useCallback(async (p: number, status: string) => {
    setPayoutsLoading(true);
    setLoadError(null);
    try {
      const res = await getSellerPayouts({
        page: p,
        limit: PAYOUT_PAGE_SIZE,
        ...(status ? { status: status as SellerPayout["status"] } : {}),
      });
      setPayouts(res.items);
      setPayoutsTotal(res.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "بارگذاری تسویه‌ها ناموفق بود");
    } finally {
      setPayoutsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayouts(page, statusFilter);
  }, [loadPayouts, page, statusFilter]);

  // Prefill the payout method with the store's configured default.
  useEffect(() => {
    void getSellerSettings()
      .then((s) => setMethod(s.defaultPayoutMethod))
      .catch(() => {});
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setActionError(null);
      setSuccessMsg(null);
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setActionError("مبلغ تسویه را به درستی وارد کنید.");
        return;
      }
      setSubmitting(true);
      try {
        await requestSellerPayout({
          amount: parsed,
          ...(method ? { method } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        setSuccessMsg("درخواست تسویه ثبت شد. موجودی قابل تسویه شما به‌روزرسانی شد.");
        setAmount("");
        setNote("");
        setPage(1);
        await reload();
        await loadPayouts(1, statusFilter);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "ثبت درخواست تسویه ناموفق بود");
      } finally {
        setSubmitting(false);
      }
    },
    [amount, method, note, reload, loadPayouts, statusFilter],
  );

  const handleCancel = useCallback(
    async (payout: SellerPayout) => {
      if (!window.confirm(`آیا از لغو تسویهٔ ${formatSellerPrice(payout.amount, payout.currency)} مطمئن هستید؟`)) {
        return;
      }
      setBusyId(payout.id);
      setActionError(null);
      setSuccessMsg(null);
      try {
        await cancelSellerPayout(payout.id);
        setSuccessMsg("درخواست تسویه لغو شد و مبلغ به موجودی قابل تسویه بازگشت.");
        await reload();
        await loadPayouts(page, statusFilter);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "لغو تسویه ناموفق بود");
      } finally {
        setBusyId(null);
      }
    },
    [reload, loadPayouts, page, statusFilter],
  );

  const totalPages = Math.max(1, Math.ceil(payoutsTotal / PAYOUT_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">مالی و تسویه</h2>
          <p className="text-sm text-[var(--color-muted)]">گزارش درآمد، موجودی قابل تسویه و تاریخچهٔ پرداخت‌ها</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void reload();
            void loadPayouts(page, statusFilter);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
        >
          <RefreshCw className="h-4 w-4" />
          به‌روزرسانی
        </button>
      </div>

      {error ? (
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
      ) : isLoading ? (
        <Loading />
      ) : finance ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Wallet}
              tone="green"
              label="قابل تسویه"
              value={formatSellerPrice(finance.net.available, finance.currency)}
            />
            <StatCard
              icon={Clock}
              tone="amber"
              label="در انتظار پردازش"
              value={formatSellerPrice(finance.outlaid.requested + finance.outlaid.processing, finance.currency)}
            />
            <StatCard
              icon={Banknote}
              tone="blue"
              label="پرداخت‌شده"
              value={formatSellerPrice(finance.outlaid.paid, finance.currency)}
            />
            <StatCard
              icon={TrendingUp}
              tone="gray"
              label="درآمد ناخالص (تحویل‌شده)"
              value={formatSellerPrice(finance.gross.delivered, finance.currency)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-[var(--color-text)]">جزئیات حساب</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow label="درآمد خالص (پس از کمیسیون)" value={formatSellerPrice(finance.net.earned, finance.currency)} />
                <DetailRow
                  label={`کمیسیون نخشا (${faNumber(finance.commission.percent)}٪)`}
                  value={formatSellerPrice(finance.commission.amount, finance.currency)}
                />
                <DetailRow
                  label={`مبلغ در انتظار آزادسازی (${faNumber(finance.hold.days)} روز)`}
                  value={formatSellerPrice(finance.hold.amount, finance.currency)}
                />
                <DetailRow label="تسویه‌های لغوشده" value={faNumber(finance.cancelledPayouts)} />
              </dl>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                <Wallet className="h-4 w-4 text-[var(--color-primary)]" />
                درخواست تسویه
              </h3>
              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <div>
                  <label htmlFor="payout-amount" className="mb-1 block text-xs text-[var(--color-muted)]">
                    مبلغ (تومان)
                  </label>
                  <input
                    id="payout-amount"
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder={`حداکثر ${faNumber(finance.net.available)}`}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label htmlFor="payout-method" className="mb-1 block text-xs text-[var(--color-muted)]">
                    روش پرداخت
                  </label>
                  <select
                    id="payout-method"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PayoutMethod)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                  >
                    {Object.keys(PAYOUT_METHOD_LABEL).map((m) => (
                      <option key={m} value={m}>
                        {PAYOUT_METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="payout-note" className="mb-1 block text-xs text-[var(--color-muted)]">
                    یادداشت (اختیاری)
                  </label>
                  <input
                    id="payout-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || finance.net.available <= 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Wallet className="h-4 w-4" />
                  {submitting ? "در حال ثبت..." : "ثبت درخواست تسویه"}
                </button>
                {finance.net.available <= 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    <Info className="h-3.5 w-3.5" />
                    موجودی قابل تسویه‌ای برای درخواست ندارید.
                  </p>
                )}
              </form>
            </div>
          </div>

          {actionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>
          )}
          {successMsg && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMsg}
            </div>
          )}

          <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--color-text)]">تاریخچهٔ تسویه‌ها</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-[var(--color-muted)]">
                  {faNumber(payoutsTotal)}
                </span>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">همه وضعیت‌ها</option>
                {Object.keys(PAYOUT_STATUS_LABEL).map((s) => (
                  <option key={s} value={s}>
                    {PAYOUT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            {payoutsLoading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-[var(--color-border)]/40" />
                ))}
              </div>
            ) : loadError ? (
              <p className="p-5 text-sm text-red-600">{loadError}</p>
            ) : payouts.length === 0 ? (
              <p className="p-5 text-sm text-[var(--color-muted)]">هنوز تسویه‌ای ثبت نشده است.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-right text-xs text-[var(--color-muted)]">
                      <th className="px-5 py-3 font-medium">مبلغ</th>
                      <th className="px-5 py-3 font-medium">روش</th>
                      <th className="px-5 py-3 font-medium">وضعیت</th>
                      <th className="px-5 py-3 font-medium">تاریخ درخواست</th>
                      <th className="px-5 py-3 font-medium">یادداشت</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => {
                      const MethodIcon = METHOD_ICON[p.method] ?? CircleDollarSign;
                      return (
                        <tr key={p.id} className="border-b border-[var(--color-border)]/60 last:border-0">
                          <td className="px-5 py-3 font-bold text-[var(--color-text)]">
                            {formatSellerPrice(p.amount, p.currency)}
                          </td>
                          <td className="px-5 py-3 text-[var(--color-muted)]">
                            <span className="inline-flex items-center gap-1.5">
                              <MethodIcon className="h-4 w-4" />
                              {PAYOUT_METHOD_LABEL[p.method] ?? p.method}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge
                              tone={PAYOUT_STATUS_TONE[p.status]}
                              label={PAYOUT_STATUS_LABEL[p.status] ?? p.status}
                            />
                          </td>
                          <td className="px-5 py-3 text-[var(--color-muted)]">{formatDateTime(p.createdAt)}</td>
                          <td className="max-w-40 truncate px-5 py-3 text-[var(--color-muted)]">{p.note ?? "—"}</td>
                          <td className="px-5 py-3 text-left">
                            {p.status === "requested" && (
                              <button
                                type="button"
                                disabled={busyId === p.id}
                                onClick={() => void handleCancel(p)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                {busyId === p.id ? "در حال لغو..." : "لغو"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
                >
                  قبلی
                </button>
                <span className="text-sm text-[var(--color-muted)]">
                  صفحهٔ {faNumber(page)} از {faNumber(totalPages)}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
                >
                  بعدی
                </button>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Wallet;
  tone: "green" | "amber" | "blue" | "gray";
  label: string;
  value: string;
}) {
  const tones = {
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    gray: "bg-slate-100 text-slate-500",
  } as const;
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="font-bold text-[var(--color-text)]">{value}</dd>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-52 animate-pulse rounded bg-[var(--color-border)]/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-border)]/30" />
    </div>
  );
}

export default FinanceSeller;