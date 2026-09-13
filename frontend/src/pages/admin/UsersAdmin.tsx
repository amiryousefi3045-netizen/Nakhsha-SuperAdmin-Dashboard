import { useCallback, useState } from "react";
import { Search, Ban, ShieldCheck, Trash2, KeyRound, RefreshCw, UserCheck, UserX, Laptop, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import {
  getAdminUsers,
  updateUserRole,
  updateUserPermissions,
  toggleUserBlock,
  deleteAdminUser,
  batchBlockUsers,
  batchUpdateUserRole,
  batchDeleteUsers,
} from "../../services/adminService";
import type { AdminPermission, AdminRole, AdminUser, AssignableRole, BatchResponse } from "../../types/admin";
import { StatusBadge, roleTone, ROLE_LABEL } from "../../components/admin/StatusBadge";
import { DataTable, type Column } from "../../components/admin/DataTable";
import { Pagination } from "../../components/admin/Pagination";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { PermissionsModal } from "../../components/admin/PermissionsModal";
import { UserSessionsModal } from "../../components/admin/UserSessionsModal";
import { faNumber, formatDate } from "../../lib/adminFormat";

const PERMISSION_LABEL: Record<AdminPermission, string> = {
  DELETE_USERS: "حذف کاربر",
  APPROVE_CONTENT: "تأیید محتوا",
  VIEW_AUDIT_LOGS: "مشاهده گزارش",
};

const ROLE_FILTER_OPTIONS: Array<{ value: "" | AdminRole; label: string }> = [
  { value: "", label: "همه نقش‌ها" },
  { value: "user", label: "کاربر" },
  { value: "tour_leader", label: "تورلیدر" },
  { value: "admin", label: "ادمین" },
  { value: "super_admin", label: "سوپر ادمین" },
];

const ASSIGNABLE_ROLES: Array<{ value: AssignableRole; label: string }> = [
  { value: "user", label: "کاربر" },
  { value: "tour_leader", label: "تورلیدر" },
  { value: "admin", label: "ادمین" },
];

export function UsersAdmin() {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | AdminRole>("");
  const [page, setPage] = useState(1);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<{ type: "block" | "unblock" | "delete" | "role"; role?: AssignableRole } | null>(null);
  const [confirm, setConfirm] = useState<{ type: "block" | "delete"; user: AdminUser } | null>(null);
  const [permUser, setPermUser] = useState<AdminUser | null>(null);
  const [permBusy, setPermBusy] = useState(false);
  const [sessionUser, setSessionUser] = useState<AdminUser | null>(null);

  const fetcher = useCallback(
    () => getAdminUsers({ page, limit: 15, q: search || undefined, role: role || undefined }),
    [page, search, role],
  );
  const { data, isLoading, error, reload } = useAdminFetch(fetcher, {
    dependencies: [page, search, role],
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  const run = async (id: string, promise: Promise<unknown>, onSuccess?: () => void) => {
    setBusyId(id);
    setActionError(null);
    try {
      await promise;
      await reload();
      onSuccess?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "عملیات ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  const handleRoleChange = (user: AdminUser, nextRole: AssignableRole) => {
    if (nextRole === user.role) return;
    void run(user.id, updateUserRole(user.id, nextRole));
  };

  const handleBlock = () => {
    if (!confirm) return;
    const { user } = confirm;
    void run(user.id, toggleUserBlock(user.id, !user.isBlocked), () => setConfirm(null));
  };

  const handleDelete = () => {
    if (!confirm) return;
    const { user } = confirm;
    void run(user.id, deleteAdminUser(user.id), () => setConfirm(null));
  };

  const handleSavePermissions = async (permissions: AdminPermission[]) => {
    if (!permUser) return;
    setPermBusy(true);
    setActionError(null);
    try {
      await updateUserPermissions(permUser.id, permissions);
      await reload();
      setPermUser(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "ذخیره دسترسی‌ها ناموفق بود");
      setPermUser(null);
    } finally {
      setPermBusy(false);
    }
  };

  const canMutate = (user: AdminUser) => user.role !== "super_admin" && user.id !== me?.id;

  const rows = data?.items ?? [];

  const toggleOne = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const togglePage = (on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const u of rows) {
        if (!canMutate(u)) continue;
        if (on) next.add(u.id);
        else next.delete(u.id);
      }
      return next;
    });
  };

  const selectableRows = rows.filter(canMutate);
  const pageAllSelected = selectableRows.length > 0 && selectableRows.every((u) => selected.has(u.id));

  const handleBulkConfirm = async () => {
    if (!bulkConfirm) return;
    const ids = [...selected];
    const action = bulkConfirm.type;
    const role = bulkConfirm.role;
    setBulkBusy(true);
    setActionError(null);
    setBulkMessage(null);
    try {
      let res: BatchResponse;
      if (action === "block" || action === "unblock") {
        res = await batchBlockUsers(ids, action === "block");
      } else if (action === "role" && role) {
        res = await batchUpdateUserRole(ids, role);
      } else {
        res = await batchDeleteUsers(ids);
      }
      const { succeeded, skipped, failed } = res.summary;
      if (succeeded > 0) {
        setBulkMessage(`عملیات گروهی روی ${faNumber(succeeded)} کاربر با موفقیت انجام شد.`);
      }
      if (failed > 0 || skipped > 0) {
        setActionError(`${faNumber(failed)} مورد ناموفق و ${faNumber(skipped)} مورد بدون تغییر بود.`);
      }
      await reload();
      setSelected(new Set());
      setBulkConfirm(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "عملیات گروهی ناموفق بود");
    } finally {
      setBulkBusy(false);
    }
  };

  const columns: Column<AdminUser>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          checked={pageAllSelected}
          disabled={selectableRows.length === 0}
          onChange={(e) => togglePage(e.target.checked)}
          aria-label="انتخاب همه کاربران این صفحه"
          className="h-4 w-4 accent-[var(--color-primary)] disabled:opacity-30"
        />
      ),
      render: (u) => {
        const canSelect = canMutate(u);
        return (
          <input
            type="checkbox"
            checked={selected.has(u.id)}
            disabled={!canSelect}
            onChange={(e) => toggleOne(u.id, e.target.checked)}
            aria-label={`انتخاب ${u.name || u.phone}`}
            className="h-4 w-4 accent-[var(--color-primary)] disabled:opacity-30"
          />
        );
      },
    },
    {
      key: "user",
      header: "کاربر",
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 font-bold text-[var(--color-primary)]">
            {(u.name || u.phone).charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--color-text)]">{u.name || "—"}</p>
            {u.handle ? <p className="truncate text-xs text-[var(--color-muted)]">@{u.handle}</p> : null}
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      header: "شماره",
      render: (u) => <span dir="ltr" className="text-[var(--color-text)]">{faNumber(u.phone)}</span>,
    },
    {
      key: "role",
      header: "نقش",
      render: (u) => <StatusBadge label={ROLE_LABEL[u.role] ?? u.role} tone={roleTone(u.role)} />,
    },
    {
      key: "verification",
      header: "احراز هویت",
      render: (u) =>
        u.isVerified ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-700"><UserCheck className="h-3.5 w-3.5" /> تأییدشده</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]"><UserX className="h-3.5 w-3.5" /> تأییدنشده</span>
        ),
    },
    {
      key: "blocked",
      header: "وضعیت",
      render: (u) =>
        u.isBlocked ? (
          <StatusBadge label="مسدود" tone="red" />
        ) : (
          <StatusBadge label="فعال" tone="green" />
        ),
    },
    {
      key: "permissions",
      header: "دسترسی‌ها",
      render: (u) =>
        u.permissions.length === 0 ? (
          <span className="text-xs text-[var(--color-muted)]">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {u.permissions.slice(0, 2).map((p) => (
              <span key={p} className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">
                {PERMISSION_LABEL[p]}
              </span>
            ))}
            {u.permissions.length > 2 ? <span className="text-xs text-[var(--color-muted)]">+{faNumber(u.permissions.length - 2)}</span> : null}
          </div>
        ),
    },
    {
      key: "createdAt",
      header: "عضویت",
      render: (u) => <span className="text-xs text-[var(--color-muted)]">{formatDate(u.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "عملیات",
      className: "text-end",
      render: (u) => {
        const busy = busyId === u.id;
        const disabled = !canMutate(u) || busy;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <select
              value={u.role}
              disabled={disabled || u.role === "super_admin"}
              onChange={(e) => handleRoleChange(u, e.target.value as AssignableRole)}
              className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs text-[var(--color-text)] disabled:opacity-50"
              title={canMutate(u) ? "تغییر نقش" : "تغییر نقش این کاربر مجاز نیست"}
            >
              {u.role === "super_admin" ? (
                <option value="super_admin">سوپر ادمین</option>
              ) : (
                ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))
              )}
            </select>

            <button
              type="button"
              disabled={u.role !== "admin" || !canMutate(u) || busy}
              onClick={() => setPermUser(u)}
              title="دسترسی‌ها (فقط ادمین)"
              className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
            >
              <KeyRound className="h-4 w-4" />
            </button>

            <button
              type="button"
              disabled={!canMutate(u) || busy}
              onClick={() => setSessionUser(u)}
              title="نشست‌های فعال"
              className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
            >
              <Laptop className="h-4 w-4" />
            </button>

            <button
              type="button"
              disabled={!canMutate(u) || busy}
              onClick={() => setConfirm({ type: "block", user: u })}
              title={u.isBlocked ? "رفع مسدودی" : "مسدودسازی"}
              className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text)] hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40"
            >
              {u.isBlocked ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            </button>

            <button
              type="button"
              disabled={!canMutate(u) || busy}
              onClick={() => setConfirm({ type: "delete", user: u })}
              title="حذف کاربر"
              className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text)] hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
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
          <h2 className="text-lg font-bold text-[var(--color-text)]">کاربران</h2>
          <p className="text-sm text-[var(--color-muted)]">
            {data ? faNumber(data.meta.total) : "—"} کاربر
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearch(q.trim());
                  setPage(1);
                }
              }}
              placeholder="جستجو با نام، شماره یا handle"
              className="w-64 rounded-lg border border-[var(--color-border)] bg-white py-2 pl-3 pr-9 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSearch(q.trim());
              setPage(1);
            }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            جستجو
          </button>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as "" | AdminRole);
              setPage(1);
            }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
          >
            {ROLE_FILTER_OPTIONS.map((o) => (
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

      {bulkMessage ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {bulkMessage}
          <button type="button" className="ms-3 underline" onClick={() => setBulkMessage(null)}>بستن</button>
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-3">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <span className="font-bold">{faNumber(selected.size)}</span>
            <span>کاربر انتخاب‌شده</span>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] underline disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> پاک کردن
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setBulkConfirm({ type: "block" })}
              className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
            >
              <Ban className="me-1 inline h-4 w-4" /> مسدودسازی
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setBulkConfirm({ type: "unblock" })}
              className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-green-50 hover:text-green-700 disabled:opacity-50"
            >
              <ShieldCheck className="me-1 inline h-4 w-4" /> رفع مسدودی
            </button>
            <select
              value=""
              disabled={bulkBusy}
              onChange={(e) => {
                const role = e.target.value as AssignableRole;
                if (role) setBulkConfirm({ type: "role", role });
                e.target.value = "";
              }}
              title="تغییر نقش به"
              className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50"
            >
              <option value="">تغییر نقش به...</option>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setBulkConfirm({ type: "delete" })}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="me-1 inline h-4 w-4" /> حذف
            </button>
            {bulkBusy && <RefreshCw className="h-4 w-4 animate-spin text-[var(--color-primary)]" />}
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        keyGetter={(u) => u.id}
        isLoading={isLoading}
        emptyText="کاربری مطابق فیلترها یافت نشد"
      />

      <Pagination page={page} totalPages={totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0 }); }} />

      <ConfirmDialog
        open={confirm?.type === "block"}
        title={confirm?.user.isBlocked ? "رفع مسدودی کاربر" : "مسدودسازی کاربر"}
        message={
          confirm ? (
            <>آیا از {confirm.user.isBlocked ? "رفع مسدودی" : "مسدودسازی"} «{confirm.user.name || confirm.user.phone}» مطمئن هستید؟ {confirm.user.isBlocked ? "" : "با مسدودسازی، همه نشست‌های فعال کاربر بسته می‌شود."}</>
          ) : null
        }
        confirmLabel={confirm?.user.isBlocked ? "رفع مسدودی" : "مسدودسازی"}
        danger={!confirm?.user.isBlocked}
        busy={busyId === confirm?.user.id}
        onConfirm={handleBlock}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.type === "delete"}
        title="حذف کاربر"
        message={
          confirm ? <>آیا از حذف کامل «{confirm.user.name || confirm.user.phone}» مطمئن هستید؟ این عملیات قابل بازگشت نیست.</> : null
        }
        confirmLabel="حذف"
        danger
        busy={busyId === confirm?.user.id}
        onConfirm={handleDelete}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={bulkConfirm?.type === "block" || bulkConfirm?.type === "unblock"}
        title={bulkConfirm?.type === "block" ? "مسدودسازی گروهی" : "رفع مسدودی گروهی"}
        message={
          bulkConfirm ? (
            <>
              آیا از {bulkConfirm.type === "block" ? "مسدودسازی" : "رفع مسدودی"} <b>{faNumber(selected.size)}</b> کاربر انتخاب‌شده مطمئن هستید؟{" "}
              {bulkConfirm.type === "block" ? "با مسدودسازی، نشست‌های فعال همه این کاربران بسته می‌شود." : ""}
            </>
          ) : null
        }
        confirmLabel={bulkConfirm?.type === "block" ? "مسدودسازی" : "رفع مسدودی"}
        danger={bulkConfirm?.type === "block"}
        busy={bulkBusy}
        onConfirm={handleBulkConfirm}
        onCancel={() => setBulkConfirm(null)}
      />

      <ConfirmDialog
        open={bulkConfirm?.type === "role"}
        title="تغییر نقش گروهی"
        message={
          bulkConfirm ? (
            <>نقش <b>{faNumber(selected.size)}</b> کاربر انتخاب‌شده به «{ROLE_LABEL[bulkConfirm.role ?? "user"]}» تغییر می‌کند و نشست‌های فعال آن‌ها بسته می‌شود.</>
          ) : null
        }
        confirmLabel="تغییر نقش"
        busy={bulkBusy}
        onConfirm={handleBulkConfirm}
        onCancel={() => setBulkConfirm(null)}
      />

      <ConfirmDialog
        open={bulkConfirm?.type === "delete"}
        title="حذف گروهی کاربران"
        message={<>آیا از حذف کامل <b>{faNumber(selected.size)}</b> کاربر انتخاب‌شده مطمئن هستید؟ این عملیات قابل بازگشت نیست.</>}
        confirmLabel="حذف"
        danger
        busy={bulkBusy}
        onConfirm={handleBulkConfirm}
        onCancel={() => setBulkConfirm(null)}
      />

      <PermissionsModal
        open={permUser !== null}
        userName={permUser?.name || ""}
        current={permUser?.permissions ?? []}
        busy={permBusy}
        onCancel={() => setPermUser(null)}
        onSave={handleSavePermissions}
      />

      <UserSessionsModal
        userId={sessionUser?.id ?? null}
        userName={sessionUser?.name || ""}
        onClose={() => setSessionUser(null)}
      />
    </div>
  );
}

export default UsersAdmin;