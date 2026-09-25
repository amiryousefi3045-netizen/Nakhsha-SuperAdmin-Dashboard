import { useCallback, useState } from "react";
import { BellRing, Play, RefreshCw } from "lucide-react";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import {
  getAdminNotificationQueue,
  retryAdminNotificationQueue,
} from "../../services/adminService";
import type {
  NotificationQueueRecord,
  NotificationQueueState,
} from "../../types/admin";
import { StatusBadge, type BadgeTone } from "../../components/admin/StatusBadge";
import { DataTable, type Column } from "../../components/admin/DataTable";
import { Pagination } from "../../components/admin/Pagination";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { faNumber, formatDateTime } from "../../lib/adminFormat";

const STATE_FILTERS: Array<{ value: "" | NotificationQueueState; label: string }> = [
  { value: "", label: "همه" },
  { value: "pending", label: "در انتظار" },
  { value: "waiting", label: "جهش زمانی" },
  { value: "failed", label: "ناموفق نهایی" },
  { value: "delivered", label: "تحویل‌شده" },
];

const STATE_TONE: Record<NotificationQueueState, BadgeTone> = {
  pending: "amber",
  waiting: "blue",
  failed: "red",
  delivered: "green",
};

const STATE_LABEL: Record<NotificationQueueState, string> = {
  pending: "در انتظار",
  waiting: "در صف بعدی",
  failed: "ناموفق",
  delivered: "تحویل‌شده",
};

const CHANNEL_LABEL: Record<string, string> = { sms: "پیامک", email: "ایمیل" };

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: BadgeTone;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p
        className={`mt-1 text-2xl font-extrabold ${
          tone === "green"
            ? "text-green-600"
            : tone === "red"
              ? "text-red-600"
              : "text-[var(--color-text)]"
        }`}
      >
        {faNumber(value)}
      </p>
    </div>
  );
}

export function NotificationQueueAdmin() {
  const [state, setState] = useState<"" | NotificationQueueState>("");
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);

  const fetcher = useCallback(
    () => getAdminNotificationQueue({ page, limit: 20, state: state || undefined }),
    [page, state],
  );
  const { data, isLoading, error, reload } = useAdminFetch(fetcher, {
    dependencies: [page, state],
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  const handleRetry = async () => {
    setRetrying(true);
    setRetryResult(null);
    try {
      const summary = await retryAdminNotificationQueue();
      setRetryResult(
        `اجرا شد: ${faNumber(summary.delivered)} تحویل، ${faNumber(summary.failed)} ناموفق از ${faNumber(
          summary.scanned,
        )} سفارش`,
      );
      await reload();
    } catch (e) {
      setRetryResult(e instanceof Error ? e.message : "اجرای صف ناموفق بود");
    } finally {
      setRetrying(false);
      setConfirmOpen(false);
    }
  };

  const columns: Column<NotificationQueueRecord>[] = [
    {
      key: "orderNumber",
      header: "شماره سفارش",
      render: (r) => <span className="font-semibold text-[var(--color-text)]">{faNumber(r.orderNumber)}</span>,
    },
    {
      key: "state",
      header: "وضعیت",
      render: (r) => <StatusBadge label={STATE_LABEL[r.state]} tone={STATE_TONE[r.state]} />,
    },
    {
      key: "channel",
      header: "کانال",
      render: (r) => (
        <span className="text-xs text-[var(--color-muted)]">{CHANNEL_LABEL[r.channel] ?? r.channel}</span>
      ),
    },
    {
      key: "message",
      header: "متن پیام",
      render: (r) => (
        <span className="block max-w-[260px] truncate text-xs leading-5 text-[var(--color-muted)]" title={r.message}>
          {r.message || "—"}
        </span>
      ),
    },
    {
      key: "reason",
      header: "دلیل",
      render: (r) =>
        r.reason === "payment_reminder" ? (
          <StatusBadge label="یادآوری پرداخت" tone="amber" />
        ) : r.reason ? (
          <span className="block max-w-[160px] truncate text-xs text-[var(--color-muted)]" title={r.reason}>
            {r.reason}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "attempts",
      header: "تلاش‌ها",
      render: (r) => <span className="text-xs text-[var(--color-text)]">{faNumber(r.attempts)}</span>,
    },
    {
      key: "to",
      header: "گیرنده",
      render: (r) => (
        <span dir="ltr" className="text-xs text-[var(--color-muted)]">{r.to || "—"}</span>
      ),
    },
    {
      key: "error",
      header: "خطا",
      render: (r) =>
        r.error ? (
          <span className="block max-w-[180px] truncate text-xs text-red-600" title={r.error}>
            {r.error}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "at",
      header: "زمان ثبت",
      render: (r) => <span className="text-xs text-[var(--color-muted)]">{formatDateTime(r.at)}</span>,
    },
  ];

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
            <BellRing className="h-5 w-5 text-[var(--color-primary)]" />
            صف اعلان‌ها
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            {data ? `${faNumber(data.meta.total)} رکورد ثبت شده` : "—"}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
            title="به‌روزرسانی"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            تازه‌سازی
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={retrying}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            title="یک بار صف را اجرا و اعلان‌های در انتظار را ارسال می‌کند"
          >
            <Play className="h-4 w-4" />
            اجرای فوری صف
          </button>
        </div>
      </div>

      {retryResult ? (
        <div
          className={`flex items-center justify-between rounded-xl border p-4 text-sm ${
            retryResult.startsWith("اجرا شد")
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {retryResult}
          <button type="button" className="ms-3 underline" onClick={() => setRetryResult(null)}>
            بستن
          </button>
        </div>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="تحویل‌شده" value={summary.delivered} tone="green" />
          <SummaryCard label="در انتظار" value={summary.pending} tone="amber" />
          <SummaryCard label="در صف بعدی" value={summary.waiting} tone="blue" />
          <SummaryCard label="ناموفق نهایی" value={summary.failed} tone="red" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white p-4">
        {STATE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setState(f.value);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              state === f.value
                ? "bg-[var(--color-primary)] text-white"
                : "border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:bg-[var(--color-primary)]/5"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DataTable<NotificationQueueRecord>
        columns={columns}
        rows={data?.items ?? []}
        isLoading={isLoading}
        keyGetter={(r) => r.orderId}
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {data && data.meta.total > 0 ? (
        <Pagination page={data.meta.page} totalPages={totalPages} onChange={setPage} />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="اجرای فوری صف اعلان‌ها"
        message="همهٔ اعلان‌های در انتظار (مهلت retry گذشته) همین حالا ارسال می‌شوند. ادامه می‌دهید؟"
        confirmLabel="اجرا"
        busy={retrying}
        onConfirm={() => void handleRetry()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default NotificationQueueAdmin;