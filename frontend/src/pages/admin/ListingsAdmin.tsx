import { useCallback, useState } from "react";
import { Pencil, RefreshCw, X } from "lucide-react";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import {
  getAdminListings,
  updateListingContent,
  updateListingStatus,
  batchUpdateListingStatus,
} from "../../services/adminService";
import type { AdminListing, ListingStatus, ListingType, BatchResponse } from "../../types/admin";
import {
  StatusBadge,
  listingStatusTone,
  LISTING_STATUS_LABEL,
  LISTING_TYPE_LABEL,
} from "../../components/admin/StatusBadge";
import { DataTable, type Column } from "../../components/admin/DataTable";
import { Pagination } from "../../components/admin/Pagination";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { EditContentModal } from "../../components/admin/EditContentModal";
import { faNumber, formatDate } from "../../lib/adminFormat";

const ALLOWED_STATUSES_ORDER: ListingStatus[] = ["pending", "draft", "published", "rejected", "archived"];

const TYPE_FILTERS: Array<{ value: "" | ListingType; label: string }> = [
  { value: "", label: "همه انواع" },
  { value: "post", label: "پست" },
  { value: "tour", label: "تور" },
  { value: "training", label: "آموزش" },
  { value: "academy", label: "آکادمی" },
];

const STATUS_FILTERS: Array<{ value: "" | ListingStatus; label: string }> = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "pending", label: "در انتظار" },
  { value: "draft", label: "پیش‌نویس" },
  { value: "published", label: "منتشرشده" },
  { value: "rejected", label: "ردشده" },
  { value: "archived", label: "بایگانی" },
];

export function ListingsAdmin() {
  const [type, setType] = useState<"" | ListingType>("");
  const [status, setStatus] = useState<"" | ListingStatus>("");
  const [page, setPage] = useState(1);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<{ type: "status"; status: ListingStatus } | null>(null);
  const [editTarget, setEditTarget] = useState<AdminListing | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const fetcher = useCallback(
    () => getAdminListings({ page, limit: 15, type: type || undefined, status: status || undefined }),
    [page, type, status],
  );
  const { data, isLoading, error, reload } = useAdminFetch(fetcher, {
    dependencies: [page, type, status],
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  const handleStatus = async (listing: AdminListing, nextStatus: ListingStatus) => {
    if (nextStatus === listing.status) return;
    setBusyId(listing.id);
    setActionError(null);
    try {
      await updateListingStatus(listing.id, nextStatus);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تغییر وضعیت ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveContent = async (payload: { title: string; description: string }) => {
    if (!editTarget) return;
    setEditBusy(true);
    setActionError(null);
    try {
      await updateListingContent(editTarget.id, payload);
      await reload();
      setEditTarget(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "ذخیره محتوا ناموفق بود");
    } finally {
      setEditBusy(false);
    }
  };

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
      for (const l of rows) {
        if (on) next.add(l.id);
        else next.delete(l.id);
      }
      return next;
    });
  };

  const pageAllSelected = rows.length > 0 && rows.every((l) => selected.has(l.id));

  const handleBulkStatus = async () => {
    if (!bulkConfirm) return;
    const ids = [...selected];
    const targetStatus = bulkConfirm.status;
    setBulkBusy(true);
    setActionError(null);
    setBulkMessage(null);
    try {
      const res: BatchResponse = await batchUpdateListingStatus(ids, targetStatus);
      const { succeeded, skipped, failed } = res.summary;
      if (succeeded > 0) {
        setBulkMessage(`وضعیت ${faNumber(succeeded)} محتوا تغییر کرد.`);
      }
      if (failed > 0 || skipped > 0) {
        setActionError(`${faNumber(failed)} مورد ناموفق و ${faNumber(skipped)} مورد بدون تغییر بود.`);
      }
      await reload();
      setSelected(new Set());
      setBulkConfirm(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تغییر وضعیت گروهی ناموفق بود");
    } finally {
      setBulkBusy(false);
    }
  };

  const columns: Column<AdminListing>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          checked={pageAllSelected}
          disabled={rows.length === 0}
          onChange={(e) => togglePage(e.target.checked)}
          aria-label="انتخاب همه محتواهای این صفحه"
          className="h-4 w-4 accent-[var(--color-primary)] disabled:opacity-30"
        />
      ),
      render: (l) => (
        <input
          type="checkbox"
          checked={selected.has(l.id)}
          onChange={(e) => toggleOne(l.id, e.target.checked)}
          aria-label={`انتخاب ${l.title}`}
          className="h-4 w-4 accent-[var(--color-primary)]"
        />
      ),
    },
    {
      key: "title",
      header: "عنوان",
      render: (l) => (
        <div className="min-w-0 max-w-[260px]">
          <p className="truncate font-medium text-[var(--color-text)]">{l.title}</p>
          <p className="truncate text-xs text-[var(--color-muted)]">{l.description || "بدون توضیحات"}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "نوع",
      render: (l) => (
        <StatusBadge label={LISTING_TYPE_LABEL[l.type] ?? l.type} tone="blue" />
      ),
    },
    {
      key: "status",
      header: "وضعیت",
      render: (l) => (
        <StatusBadge label={LISTING_STATUS_LABEL[l.status] ?? l.status} tone={listingStatusTone(l.status)} />
      ),
    },
    {
      key: "owner",
      header: "مالک",
      render: (l) => (
        <span className="text-sm text-[var(--color-text)]">{l.owner?.name || "-"}</span>
      ),
    },
    {
      key: "city",
      header: "شهر",
      render: (l) => <span className="text-xs text-[var(--color-muted)]">{l.location.city || "-"}</span>,
    },
    {
      key: "revisions",
      header: "ویرایش‌ها",
      render: (l) => <span className="text-xs text-[var(--color-muted)]">{faNumber(l.revision)}</span>,
    },
    {
      key: "createdAt",
      header: "تاریخ",
      render: (l) => <span className="text-xs text-[var(--color-muted)]">{formatDate(l.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "عملیات",
      className: "text-end",
      render: (l) => {
        const busy = busyId === l.id;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <select
              value={l.status}
              onChange={(e) => void handleStatus(l, e.target.value as ListingStatus)}
              disabled={busy}
              className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs text-[var(--color-text)] disabled:opacity-50"
            >
              {ALLOWED_STATUSES_ORDER.map((s) => (
                <option key={s} value={s}>{LISTING_STATUS_LABEL[s]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setEditTarget(l)}
              disabled={busy}
              title="ویرایش عنوان و توضیحات"
              className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
            >
              <Pencil className="h-4 w-4" />
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
          <h2 className="text-lg font-bold text-[var(--color-text)]">محتواها</h2>
          <p className="text-sm text-[var(--color-muted)]">مدیریت پست‌ها، تورها و آموزش‌ها</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as "" | ListingType);
              setPage(1);
            }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
          >
            {TYPE_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as "" | ListingStatus);
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
            <span>محتوا انتخاب‌شده</span>
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
            <select
              value=""
              disabled={bulkBusy}
              onChange={(e) => {
                const targetStatus = e.target.value as ListingStatus;
                if (targetStatus) setBulkConfirm({ type: "status", status: targetStatus });
                e.target.value = "";
              }}
              title="تغییر وضعیت به"
              className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50"
            >
              <option value="">تغییر وضعیت به...</option>
              {ALLOWED_STATUSES_ORDER.map((s) => (
                <option key={s} value={s}>{LISTING_STATUS_LABEL[s]}</option>
              ))}
            </select>
            {bulkBusy && <RefreshCw className="h-4 w-4 animate-spin text-[var(--color-primary)]" />}
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        keyGetter={(l) => l.id}
        isLoading={isLoading}
        emptyText="محتوایی مطابق فیلترها یافت نشد"
      />

      <Pagination page={page} totalPages={totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0 }); }} />

      <ConfirmDialog
        open={bulkConfirm !== null}
        title="تغییر وضعیت گروهی"
        message={
          bulkConfirm ? (
            <>وضعیت <b>{faNumber(selected.size)}</b> محتوای انتخاب‌شده به «{LISTING_STATUS_LABEL[bulkConfirm.status]}» تغییر می‌کند. مطمئن هستید؟</>
          ) : null
        }
        confirmLabel="تغییر وضعیت"
        busy={bulkBusy}
        onConfirm={handleBulkStatus}
        onCancel={() => setBulkConfirm(null)}
      />

      <EditContentModal
        open={editTarget !== null}
        listing={editTarget}
        busy={editBusy}
        error={actionError}
        onCancel={() => {
          setActionError(null);
          setEditTarget(null);
        }}
        onSave={handleSaveContent}
      />
    </div>
  );
}

export default ListingsAdmin;