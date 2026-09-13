import { useCallback, useState } from "react";
import { Search, Trash2, RefreshCw, Star } from "lucide-react";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import { getAdminComments, deleteAdminComment } from "../../services/adminService";
import type { AdminComment } from "../../types/admin";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { DataTable, type Column } from "../../components/admin/DataTable";
import { Pagination } from "../../components/admin/Pagination";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { faNumber, formatDateTime } from "../../lib/adminFormat";

const RATING_FILTER_OPTIONS: Array<{ value: "" | string; label: string }> = [
  { value: "", label: "همه امتیازها" },
  { value: "5", label: "۵" },
  { value: "4", label: "۴" },
  { value: "3", label: "۳" },
  { value: "2", label: "۲" },
  { value: "1", label: "۱" },
];

export function CommentsAdmin() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState<"" | string>("");
  const [page, setPage] = useState(1);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminComment | null>(null);

  const fetcher = useCallback(
    () =>
      getAdminComments({
        page,
        limit: 15,
        q: search || undefined,
        rating: rating ? Number(rating) : undefined,
      }),
    [page, search, rating],
  );
  const { data, isLoading, error, reload } = useAdminFetch(fetcher, {
    dependencies: [page, search, rating],
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  const handleDelete = () => {
    if (!confirm) return;
    const target = confirm;
    setBusyId(target.id);
    setActionError(null);
    void (async () => {
      try {
        await deleteAdminComment(target.craft.id, target.id);
        await reload();
        setConfirm(null);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "حذف دیدگاه ناموفق بود");
        setConfirm(null);
      } finally {
        setBusyId(null);
      }
    })();
  };

  const columns: Column<AdminComment>[] = [
    {
      key: "craft",
      header: "محتوا",
      render: (c) => (
        <div>
          <p className="max-w-[220px] truncate font-medium text-[var(--color-text)]">{c.craft.title || "—"}</p>
          <p className="text-[10px] text-[var(--color-muted)]">#{c.craft.id.slice(-6)}</p>
        </div>
      ),
    },
    {
      key: "author",
      header: "کاربر",
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 font-bold text-[var(--color-primary)]">
            {(c.author.name || "؟").charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--color-text)]">{c.author.name}</p>
            {c.author.handle ? <p className="truncate text-xs text-[var(--color-muted)]">@{c.author.handle}</p> : null}
          </div>
        </div>
      ),
    },
    {
      key: "text",
      header: "متن دیدگاه",
      render: (c) => <p className="max-w-[320px] truncate text-xs text-[var(--color-text)]">{c.text}</p>,
    },
    {
      key: "rating",
      header: "امتیاز",
      render: (c) =>
        c.rating ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text)]">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {faNumber(c.rating)}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "publish",
      header: "وضعیت",
      render: (c) =>
        c.craft.isPublished ? (
          <StatusBadge label="منتشرشده" tone="green" />
        ) : (
          <StatusBadge label="پیش‌نویس" tone="gray" />
        ),
    },
    {
      key: "createdAt",
      header: "زمان",
      render: (c) => <span className="text-xs text-[var(--color-muted)]">{formatDateTime(c.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "عملیات",
      className: "text-end",
      render: (c) => {
        const busy = busyId === c.id;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(c)}
              title="حذف دیدگاه"
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
          <h2 className="text-lg font-bold text-[var(--color-text)]">مدیریت دیدگاه‌ها</h2>
          <p className="text-sm text-[var(--color-muted)]">
            {data ? faNumber(data.meta.total) : "—"} دیدگاه
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
              placeholder="جستجو در متن دیدگاه"
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
            value={rating}
            onChange={(e) => {
              setRating(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
          >
            {RATING_FILTER_OPTIONS.map((o) => (
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
        keyGetter={(c) => c.id}
        isLoading={isLoading}
        emptyText="دیدگاهی مطابق فیلترها یافت نشد"
      />

      <Pagination page={page} totalPages={totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0 }); }} />

      <ConfirmDialog
        open={confirm !== null}
        title="حذف دیدگاه"
        message={
          confirm ? (
            <>آیا از حذف دیدگاه کاربر «{confirm.author.name}» از محتوای «{confirm.craft.title}» مطمئن هستید؟ این عملیات قابل بازگشت نیست.</>
          ) : null
        }
        confirmLabel="حذف"
        danger
        busy={busyId === confirm?.id}
        onConfirm={handleDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

export default CommentsAdmin;