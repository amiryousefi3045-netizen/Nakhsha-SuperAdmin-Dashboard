import { useCallback, useState } from "react";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import { getAdminAuditLogs } from "../../services/adminService";
import type { AuditLogEntry } from "../../types/admin";
import { StatusBadge, riskTone } from "../../components/admin/StatusBadge";
import { DataTable, type Column } from "../../components/admin/DataTable";
import { Pagination } from "../../components/admin/Pagination";
import { faNumber, formatDateTime, RISK_LABEL } from "../../lib/adminFormat";

const TARGET_TYPE_FILTERS: Array<{ value: "" | string; label: string }> = [
  { value: "", label: "همه منابع" },
  { value: "USER", label: "کاربر" },
  { value: "LISTING", label: "محتوا" },
  { value: "CRAFT", label: "صنعت دستی" },
  { value: "POST", label: "پست" },
  { value: "ARTISAN", label: "هنرمند" },
  { value: "TRANSACTION", label: "تراکنش" },
];

const RESULT_CELL: Record<string, string> = {
  SUCCESS: "موفق",
  FAILURE: "ناموفق",
  PARTIAL: "جزئی",
};

export function AuditLogsAdmin() {
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState<"" | string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const fetcher = useCallback(
    () =>
      getAdminAuditLogs({
        page,
        limit: 20,
        action: action.trim() || undefined,
        targetType: targetType || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      }),
    [page, action, targetType, from, to],
  );
  const { data, isLoading, error } = useAdminFetch(fetcher, {
    dependencies: [page, action, targetType, from, to],
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  const resetPage = () => setPage(1);

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "actor",
      header: "عامل",
      render: (l) => (
        <div>
          <p className="font-medium text-[var(--color-text)]">{l.actorName}</p>
          {l.actorId ? <p className="text-[10px] text-[var(--color-muted)]">{l.actorId.slice(-6)}</p> : null}
        </div>
      ),
    },
    {
      key: "action",
      header: "عملیات",
      render: (l) => (
        <span className="inline-flex max-w-[200px] truncate rounded-full bg-[var(--color-primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--color-primary)]">
          {l.action}
        </span>
      ),
    },
    {
      key: "resource",
      header: "منبع",
      render: (l) => (
        <span className="text-xs text-[var(--color-text)]">
          {l.resource ? `${l.resource.type}${l.resource.id ? ` · ${l.resource.id.slice(-6)}` : ""}` : "—"}
        </span>
      ),
    },
    {
      key: "risk",
      header: "سطح خطر",
      render: (l) => <StatusBadge label={RISK_LABEL[l.riskLevel] ?? l.riskLevel} tone={riskTone(l.riskLevel)} />,
    },
    {
      key: "result",
      header: "نتیجه",
      render: (l) => (
        <span className="text-xs text-[var(--color-text)]">{RESULT_CELL[l.result] ?? l.result}</span>
      ),
    },
    {
      key: "ip",
      header: "آی‌پی",
      render: (l) => (
        <span dir="ltr" className="text-xs text-[var(--color-muted)]">{l.ip || "—"}</span>
      ),
    },
    {
      key: "time",
      header: "زمان",
      render: (l) => <span className="text-xs text-[var(--color-muted)]">{formatDateTime(l.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-text)]">گزارش عملیات</h2>
        <p className="text-sm text-[var(--color-muted)]">
          {data ? faNumber(data.meta.total) : "—"} رکورد
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">عملیات (action)</span>
          <input
            type="text"
            value={action}
            onChange={(e) => { setAction(e.target.value); resetPage(); }}
            placeholder="مثلاً USER_BLOCK"
            className="w-52 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">نوع منبع</span>
          <select
            value={targetType}
            onChange={(e) => { setTargetType(e.target.value); resetPage(); }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
          >
            {TARGET_TYPE_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">از تاریخ</span>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); resetPage(); }}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">تا تاریخ</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); resetPage(); }}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        keyGetter={(l) => l.id}
        isLoading={isLoading}
        emptyText="رکوردی یافت نشد"
      />

      <Pagination page={page} totalPages={totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0 }); }} />
    </div>
  );
}

export default AuditLogsAdmin;