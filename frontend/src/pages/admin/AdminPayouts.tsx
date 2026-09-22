import { useCallback, useMemo, useState } from "react";
import { Search, RefreshCw, X, CheckCircle2, Ban, Landmark, Loader2 } from "lucide-react";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import {
  getAdminPayouts,
  getAdminPayoutOverview,
  updateAdminPayoutStatus,
} from "../../services/adminService";
import type {
  AdminPayout,
  AdminPayoutMethod,
  AdminPayoutOverviewRow,
  AdminPayoutStatus,
  AdminPayoutTransition,
} from "../../types/admin";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { DataTable, type Column } from "../../components/admin/DataTable";
import { Pagination } from "../../components/admin/Pagination";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { faNumber, formatDateTime } from "../../lib/adminFormat";
import { PAYOUT_METHOD_LABEL, PAYOUT_STATUS_LABEL } from "../../lib/sellerFormat";

const STATUS_TONE: Record<string, "gray" | "amber" | "green" | "blue" | "red"> = {
  requested: "amber",
  processing: "blue",
  paid: "green",
  cancelled: "gray",
  rejected: "red",
};

const STATUS_OPTIONS: Array<{ value: "" | AdminPayoutStatus; label: string }> = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "requested", label: "درخواست‌شده" },
  { value: "processing", label: "در حال پردازش" },
  { value: "paid", label: "پرداخت‌شده" },
  { value: "rejected", label: "ردشده" },
];

const METHOD_OPTIONS: Array<{ value: "" | AdminPayoutMethod; label: string }> = [
  { value: "", label: "همه روش‌ها" },
  { value: "bank_transfer", label: "انتقال بانکی" },
  { value: "card", label: "کارت به کارت" },
  { value: "wallet", label: "کیف پول" },
  { value: "other", label: "سایر" },
];

const OVERVIEW_ROWS: Array<{
  key: AdminPayoutStatus | "all";
  label: string;
  tone: "green" | "red" | "amber" | "blue" | "gray";
}> = [
  { key: "all", label: "جمع درخواست‌ها", tone: "gray" },
  { key: "requested", label: "درخواست‌شده", tone: "amber" },
  { key: "processing", label: "در حال پردازش", tone: "blue" },
  { key: "paid", label: "پرداخت‌شده", tone: "green" },
  { key: "rejected", label: "ردشده", tone: "red" },
];

export function AdminPayouts() {
  const [status, setStatus] = useState<"" | AdminPayoutStatus>("");
  const [method, setMethod] = useState<"" | AdminPayoutMethod>("");
  const [sellerQuery, setSellerQuery] = useState("");
  const [seller, setSeller] = useState("");
  const [page, setPage] = useState(1);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminPayout | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [payTarget, setPayTarget] = useState<AdminPayout | null>(null);
  const [payReference, setPayReference] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const fetcher = useCallback(
    () =>
      getAdminPayouts({
        page,
        limit: 15,
        status: status || undefined,
        method: method || undefined,
        seller: seller || undefined,
      }),
    [page, status, method, seller],
  );
  const { data, isLoading, error, reload } = useAdminFetch(fetcher, {
    dependencies: [page, status, method, seller],
  });

  const overviewFetcher = useCallback(() => getAdminPayoutOverview(), []);
  const overviewState = useAdminFetch(overviewFetcher);

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  const overviewMap = useMemo(() => {
    const map = new Map<AdminPayoutStatus, AdminPayoutOverviewRow>();
    for (const row of overviewState.data?.items ?? []) map.set(row.status, row);
    return map;
  }, [overviewState.data]);

  const statusAmount = (key: AdminPayoutStatus | "all") => {
    const ov = overviewState.data;
    if (!ov) return null;
    if (key === "all") return ov.totalAmount;
    return mapStatusAmount(overviewMap, key);
  };
  const statusCount = (key: AdminPayoutStatus | "all") => {
    const ov = overviewState.data;
    if (!ov) return null;
    if (key === "all") return ov.totalCount;
    return overviewMap.get(key)?.count ?? 0;
  };

  const runTransition = async (payout: AdminPayout, to: AdminPayoutTransition, extra: { note?: string; reference?: string } = {}) => {
    setBusyId(payout.id);
    setActionError(null);
    setMessage(null);
    try {
      await updateAdminPayoutStatus(payout.id, { status: to, ...extra });
      await Promise.all([reload(), overviewState.reload()]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "عملیات ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejectBusy(true);
    try {
      await runTransition(rejectTarget, "rejected", { note: rejectNote || undefined });
      setRejectTarget(null);
      setRejectNote("");
    } catch {
      /* error surfaced in the page banner */
    } finally {
      setRejectBusy(false);
    }
  };

  const handlePay = async () => {
    if (!payTarget) return;
    if (!payReference.trim()) {
      setActionError("شماره پیگیری تسویه الزامی است");
      return;
    }
    setPayBusy(true);
    try {
      await runTransition(payTarget, "paid", {
        reference: payReference.trim(),
        note: payNote.trim() || undefined,
      });
      setPayTarget(null);
      setPayReference("");
      setPayNote("");
    } catch {
      /* error surfaced in the page banner */
    } finally {
      setPayBusy(false);
    }
  };

  const handleToProcessing = async (payout: AdminPayout) => {
    await runTransition(payout, "processing");
  };

  const columns: Column<AdminPayout>[] = [
    {
      key: "seller",
      header: "فروشنده",
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 font-bold text-[var(--color-primary)]">
            {(p.seller?.storeName || "؟").charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--color-text)]">{p.seller?.storeName || "—"}</p>
            {p.seller?.slug ? <p className="truncate text-xs text-[var(--color-muted)]">@{p.seller.slug}</p> : null}
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "مبلغ",
      render: (p) => <span className="font-semibold text-[var(--color-text)]">{faNumber(p.amount)} تومان</span>,
    },
    {
      key: "method",
      header: "روش",
      render: (p) => <span className="text-sm text-[var(--color-text)]">{PAYOUT_METHOD_LABEL[p.method] ?? p.method}</span>,
    },
    {
      key: "status",
      header: "وضعیت",
      render: (p) => <StatusBadge label={PAYOUT_STATUS_LABEL[p.status] ?? p.status} tone={STATUS_TONE[p.status]} />,
    },
    {
      key: "requestedAt",
      header: "درخواست",
      render: (p) => <span className="text-xs text-[var(--color-muted)]">{formatDateTime(p.createdAt)}</span>,
    },
    {
      key: "reference",
      header: "پیگیری",
      render: (p) =>
        p.reference ? (
          <span dir="ltr" className="text-xs font-medium text-[var(--color-text)]">{p.reference}</span>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "decision",
      header: "یادداشت تصمیم",
      render: (p) =>
        p.decisionNote ? (
          <span className="block max-w-[220px] truncate text-xs text-[var(--color-muted)]" title={p.decisionNote}>
            {p.decisionNote}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "actions",
      header: "عملیات",
      className: "text-end",
      render: (p) => {
        const busy = busyId === p.id;
        return (
          <div className="flex items-center justify-end gap-1.5">
            {p.status === "requested" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleToProcessing(p)}
                  className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
                >
                  <Landmark className="me-1 inline h-3.5 w-3.5" /> شروع پردازش
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRejectTarget(p);
                    setRejectNote("");
                  }}
                  className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <Ban className="me-1 inline h-3.5 w-3.5" /> رد
                </button>
              </>
            ) : null}
            {p.status === "processing" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPayTarget(p);
                    setPayReference("");
                    setPayNote("");
                  }}
                  className="rounded-lg bg-[var(--color-primary)] px-2.5 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
                >
                  <CheckCircle2 className="me-1 inline h-3.5 w-3.5" /> ثبت پرداخت
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRejectTarget(p);
                    setRejectNote("");
                  }}
                  className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <Ban className="me-1 inline h-3.5 w-3.5" /> رد
                </button>
              </>
            ) : null}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-text)]">تسویه فروشندگان</h2>
        <p className="text-sm text-[var(--color-muted)]">
          {data ? faNumber(data.meta.total) : "—"} درخواست تسویه
        </p>
      </div>

      {/* Overview KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {OVERVIEW_ROWS.map((row) => {
          const amount = statusAmount(row.key);
          const count = statusCount(row.key);
          const toneClass = {
            green: "border-green-200 bg-green-50 text-green-700",
            red: "border-red-200 bg-red-50 text-red-700",
            amber: "border-amber-200 bg-amber-50 text-amber-700",
            blue: "border-blue-200 bg-blue-50 text-blue-700",
            gray: "border-[var(--color-border)] bg-[var(--color-primary)]/5 text-[var(--color-text)]",
          }[row.tone];
          return (
            <div key={row.key} className={`rounded-xl border p-3 ${toneClass}`}>
              <p className="text-xs">{row.label}</p>
              <p className="mt-1 text-sm font-bold">{amount === null ? "—" : `${faNumber(amount)} تومان`}</p>
              <p className="mt-0.5 text-xs opacity-80">{count === null ? "" : `${faNumber(count)} درخواست`}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="search"
            value={sellerQuery}
            onChange={(e) => setSellerQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSeller(sellerQuery.trim());
                setPage(1);
              }
            }}
            placeholder="جستجوی فروشنده"
            className="w-56 rounded-lg border border-[var(--color-border)] bg-white py-2 pl-3 pr-9 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "" | AdminPayoutStatus);
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value as "" | AdminPayoutMethod);
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          {METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSeller(sellerQuery.trim());
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
        >
          جستجو
        </button>
        <button
          type="button"
          onClick={() => {
            setStatus("");
            setMethod("");
            setSeller("");
            setSellerQuery("");
            setPage(1);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-primary)]/5"
        >
          <RefreshCw className="h-3.5 w-3.5" /> پاک کردن فیلترها
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
          <button type="button" className="ms-3 underline" onClick={() => setActionError(null)}>بستن</button>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {message}
          <button type="button" className="ms-3 underline" onClick={() => setMessage(null)}>بستن</button>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        keyGetter={(p) => p.id}
        isLoading={isLoading}
        emptyText="درخواست تسویه‌ای مطابق فیلترها یافت نشد"
      />

      <Pagination page={page} totalPages={totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0 }); }} />

      {/* Reject dialog */}
      <ConfirmDialog
        open={rejectTarget !== null}
        title="رد درخواست تسویه"
        message={
          rejectTarget ? (
            <div className="space-y-3">
              <p>
                آیا از رد درخواست <b>{faNumber(rejectTarget.amount)} تومان</b> فروشگاه «{rejectTarget.seller?.storeName}» مطمئن هستید؟ مبلغ به موجودی فروشنده برمی‌گردد.
              </p>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                maxLength={500}
                placeholder="دلیل رد (اختیاری)"
                className="w-full rounded-lg border border-[var(--color-border)] bg-white p-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          ) : null
        }
        confirmLabel="رد درخواست"
        danger
        busy={rejectBusy}
        onConfirm={() => void handleReject()}
        onCancel={() => setRejectTarget(null)}
      />

      {/* Pay dialog (reference required; matches the backend rule) */}
      {payTarget && !payBusy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPayTarget(null)} aria-hidden />
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-[var(--color-text)]">ثبت پرداخت تسویه</h3>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  مبلغ <b>{faNumber(payTarget.amount)} تومان</b> به فروشگاه «{payTarget.seller?.storeName}» واریز شد.
                </p>
              </div>
              <button type="button" onClick={() => setPayTarget(null)} aria-label="بستن" className="rounded-lg p-1 text-[var(--color-muted)] hover:bg-[var(--color-primary)]/5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">شماره پیگیری *</label>
                <input
                  dir="ltr"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  placeholder="مثلاً PAY-2026-0001"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">یادداشت (اختیاری)</label>
                <textarea
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  maxLength={500}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white p-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayTarget(null)}
                disabled={payBusy}
                className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => void handlePay()}
                disabled={payBusy}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {payBusy ? "در حال انجام..." : "ثبت پرداخت"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function mapStatusAmount(
  map: Map<AdminPayoutStatus, AdminPayoutOverviewRow>,
  key: AdminPayoutStatus,
): number {
  return map.get(key)?.amount ?? 0;
}

export default AdminPayouts;