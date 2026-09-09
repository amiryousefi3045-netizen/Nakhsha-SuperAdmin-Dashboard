import { useCallback, useState } from "react";
import { BadgeCheck, RefreshCw, ShieldCheck, ShieldX } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import {
  getAdminProviders,
  updateProviderStatus,
} from "../../services/adminService";
import type { AdminProvider, ProviderStatus } from "../../types/admin";
import {
  StatusBadge,
  roleTone,
  providerStatusTone,
  ROLE_LABEL,
} from "../../components/admin/StatusBadge";
import { DataTable, type Column } from "../../components/admin/DataTable";
import { Pagination } from "../../components/admin/Pagination";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { formatDate } from "../../lib/adminFormat";

const STATUS_FILTERS: Array<{ value: "" | ProviderStatus; label: string }> = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "active", label: "فعال" },
  { value: "suspended", label: "مسدود" },
  { value: "pending", label: "در انتظار" },
];

const STATUS_LABEL: Record<string, string> = {
  active: "فعال",
  suspended: "مسدود",
  pending: "در انتظار تأیید",
};

export function ProvidersAdmin() {
  const { user: me } = useAuth();
  const [role, setRole] = useState<"admin" | "tour_leader">("tour_leader");
  const [status, setStatus] = useState<"" | ProviderStatus>("");
  const [page, setPage] = useState(1);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ provider: AdminProvider; action: "approve" | "suspend" | "activate" } | null>(null);

  const fetcher = useCallback(
    () => getAdminProviders({ page, limit: 15, role, status: status || undefined }),
    [page, role, status],
  );
  const { data, isLoading, error, reload } = useAdminFetch(fetcher, {
    dependencies: [page, role, status],
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  const handleStatus = async (provider: AdminProvider, next: "active" | "suspended") => {
    setBusyId(provider.id);
    setActionError(null);
    try {
      await updateProviderStatus(provider.id, next);
      await reload();
      setConfirm(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تغییر وضعیت ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<AdminProvider>[] = [
    {
      key: "provider",
      header: "ارائه‌دهنده",
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 font-bold text-[var(--color-primary)]">
            {(p.name || p.phone).charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--color-text)]">{p.name || "—"}</p>
            {p.handle ? <p className="truncate text-xs text-[var(--color-muted)]">@{p.handle}</p> : null}
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "نقش",
      render: (p) => <StatusBadge label={ROLE_LABEL[p.role] ?? p.role} tone={roleTone(p.role)} />,
    },
    {
      key: "status",
      header: "وضعیت",
      render: (p) => (
        <StatusBadge label={STATUS_LABEL[p.status] ?? p.status} tone={providerStatusTone(p.status)} />
      ),
    },
    {
      key: "verified",
      header: "احراز هویت",
      render: (p) => (
        <span className="text-xs text-[var(--color-text)]">{p.isVerified ? "✔ تأییدشده" : "— تأییدنشده"}</span>
      ),
    },
    {
      key: "createdAt",
      header: "عضویت",
      render: (p) => <span className="text-xs text-[var(--color-muted)]">{formatDate(p.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "عملیات",
      className: "text-end",
      render: (p) => {
        const isSelf = p.id === me?.id;
        const busy = busyId === p.id;
        const suspended = p.status === "suspended";
        const pending = p.status === "pending";
        return (
          <div className="flex items-center justify-end gap-1.5">
            {pending ? (
              <button
                type="button"
                disabled={isSelf || busy}
                onClick={() => setConfirm({ provider: p, action: "approve" })}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
                title={isSelf ? "تغییر وضعیت حساب خود مجاز نیست" : "تأیید و فعال‌سازی"}
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                تأیید
              </button>
            ) : null}
            <button
              type="button"
              disabled={isSelf || busy}
              onClick={() => setConfirm({ provider: p, action: suspended ? "activate" : "suspend" })}
              className={
                suspended
                  ? "inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
                  : "inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
              }
              title={isSelf ? "تغییر وضعیت حساب خود مجاز نیست" : (suspended ? "فعال‌سازی" : "مسدودسازی")}
            >
              {suspended ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
              {suspended ? "فعال‌سازی" : "مسدودسازی"}
            </button>
            {busy && <RefreshCw className="h-4 w-4 animate-spin text-[var(--color-primary)]" />}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">ارائه‌دهندگان</h2>
          <p className="text-sm text-[var(--color-muted)]">
            ادمین‌ها و تورلیدرهایی که محتوا تولید می‌کنند
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as "admin" | "tour_leader");
              setPage(1);
            }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
          >
            <option value="tour_leader">تورلیدرها</option>
            <option value="admin">ادمین‌ها</option>
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as "" | ProviderStatus);
              setPage(1);
            }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
          >
            {STATUS_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
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

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        keyGetter={(p) => p.id}
        isLoading={isLoading}
        emptyText="ارائه‌دهنده‌ای یافت نشد"
      />

      <Pagination page={page} totalPages={totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0 }); }} />

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.action === "approve"
            ? "تأیید ارائه‌دهنده"
            : confirm?.action === "activate"
              ? "فعال‌سازی ارائه‌دهنده"
              : "مسدودسازی ارائه‌دهنده"
        }
        message={
          confirm ? (
            <>
              آیا از {confirm.action === "approve" ? "تأیید و فعال‌سازی" : confirm.action === "activate" ? "فعال‌سازی" : "مسدودسازی"} «{confirm.provider.name || confirm.provider.phone}» مطمئن هستید؟{" "}
              {confirm.action === "approve"
                ? "با تأیید، احراز هویت ارائه‌دهنده ثبت و حسابش فعال می‌شود."
                : confirm.action === "activate"
                  ? ""
                  : "با مسدودسازی، همه نشست‌های فعال کاربر بسته می‌شود."}
            </>
          ) : null
        }
        confirmLabel={confirm?.action === "approve" ? "تأیید" : confirm?.action === "activate" ? "فعال‌سازی" : "مسدودسازی"}
        danger={confirm?.action === "suspend"}
        busy={busyId === confirm?.provider.id}
        onConfirm={() => {
          if (confirm) {
            void handleStatus(confirm.provider, confirm.action === "suspend" ? "suspended" : "active");
          }
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

export default ProvidersAdmin;