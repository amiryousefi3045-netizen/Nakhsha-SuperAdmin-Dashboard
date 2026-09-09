import { useCallback, useState } from "react";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import { getAdminCrafts, setCraftPublish } from "../../services/adminService";
import type { AdminCraft, CraftKind } from "../../types/admin";
import { StatusBadge, CRAFT_KIND_LABEL } from "../../components/admin/StatusBadge";
import { Switch } from "../../components/admin/Switch";
import { DataTable, type Column } from "../../components/admin/DataTable";
import { Pagination } from "../../components/admin/Pagination";
import { faNumber, formatDate } from "../../lib/adminFormat";

const KIND_FILTERS: Array<{ value: "" | CraftKind; label: string }> = [
  { value: "", label: "همه انواع" },
  { value: "artwork", label: "اثر هنری" },
  { value: "class", label: "کلاس" },
  { value: "service", label: "خدمات" },
];

export function CraftsAdmin() {
  const [kind, setKind] = useState<"" | CraftKind>("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const fetcher = useCallback(
    () => getAdminCrafts({ page, limit: 15, kind: kind || undefined }),
    [page, kind],
  );
  const { data, isLoading, error, reload } = useAdminFetch(fetcher, {
    dependencies: [page, kind],
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.limit)) : 1;

  const handleToggle = async (craft: AdminCraft, isPublished: boolean) => {
    setBusyId(craft.id);
    setToggleError(null);
    try {
      await setCraftPublish(craft.id, isPublished);
      await reload();
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : "خطا در تغییر وضعیت");
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<AdminCraft>[] = [
    {
      key: "title",
      header: "عنوان",
      render: (c) => (
        <div className="min-w-0 max-w-[240px]">
          <p className="truncate font-medium text-[var(--color-text)]">{c.title}</p>
          <p className="truncate text-xs text-[var(--color-muted)]">{c.craftType || "—"}</p>
        </div>
      ),
    },
    {
      key: "kind",
      header: "نوع",
      render: (c) => <StatusBadge label={CRAFT_KIND_LABEL[c.kind] ?? c.kind} tone="blue" />,
    },
    {
      key: "author",
      header: "سازنده",
      render: (c) => <span className="text-sm text-[var(--color-text)]">{c.author?.name || "-"}</span>,
    },
    {
      key: "price",
      header: "قیمت",
      render: (c) => (
        <span className="text-sm text-[var(--color-text)]">
          {c.price != null ? `${faNumber(c.price)} تومان` : "—"}
        </span>
      ),
    },
    {
      key: "city",
      header: "شهر",
      render: (c) => <span className="text-xs text-[var(--color-muted)]">{c.location.city || "-"}</span>,
    },
    {
      key: "status",
      header: "انتشار",
      render: (c) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={c.isPublished}
            onChange={(next) => void handleToggle(c, next)}
            disabled={busyId === c.id}
            label={c.isPublished ? "عدم انتشار" : "انتشار"}
          />
          <span className="text-xs text-[var(--color-muted)]">
            {c.isPublished ? "منتشرشده" : "پیش‌نویس"}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "تاریخ",
      render: (c) => <span className="text-xs text-[var(--color-muted)]">{formatDate(c.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">صنایع دستی</h2>
          <p className="text-sm text-[var(--color-muted)]">مدیریت انتشار آثار، کلاس‌ها و خدمات</p>
        </div>
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as "" | CraftKind);
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          {KIND_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {toggleError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{toggleError}</div>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        keyGetter={(c) => c.id}
        isLoading={isLoading}
        emptyText="صنایع دستی مطابق فیلتر یافت نشد"
      />

      <Pagination page={page} totalPages={totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0 }); }} />
    </div>
  );
}

export default CraftsAdmin;