import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  RefreshCw,
  Package,
  Trash2,
  Eye,
  EyeOff,
  Pause,
  Play,
  Send,
} from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { useDebounce } from "../../hooks/useDebounce";
import {
  listSellerProducts,
  deleteSellerProduct,
  updateSellerProductStatus,
} from "../../services/sellerService";
import type { SellerProduct, ProductStatus } from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { Pagination } from "../../components/admin/Pagination";
import { faNumber, formatDateTime } from "../../lib/adminFormat";
import {
  formatSellerPrice,
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_TONE,
} from "../../lib/sellerFormat";

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "همه دسته‌ها" },
  { value: "carpet", label: "فرش" },
  { value: "pottery", label: "سفالگری" },
  { value: "metalwork", label: "فلزکاری" },
  { value: "woodwork", label: "نجاری" },
  { value: "textile", label: "نساجی" },
  { value: "jewelry", label: "زیورآلات" },
  { value: "leather", label: "چرم" },
  { value: "home_decor", label: "دکوراسیون" },
  { value: "accessories", label: "اکسسوری" },
  { value: "tourism", label: "گردشگری" },
  { value: "other", label: "سایر" },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "draft", label: "پیش‌نویس" },
  { value: "pending_review", label: "در انتظار بررسی" },
  { value: "active", label: "فعال" },
  { value: "paused", label: "متوقف" },
  { value: "archived", label: "بایگانی" },
  { value: "rejected", label: "ردشده" },
];

const TRANSITIONS: Partial<
  Record<ProductStatus, Array<{ to: ProductStatus; label: string; icon: typeof Play }>>
> = {
  draft: [{ to: "active", label: "فعال‌سازی", icon: Play }],
  pending_review: [{ to: "active", label: "تأیید", icon: Play }],
  active: [
    { to: "paused", label: "توقف", icon: Pause },
    { to: "pending_review", label: "ارسال برای بررسی", icon: Send },
  ],
  paused: [{ to: "active", label: "فعال‌سازی", icon: Play }],
  rejected: [{ to: "draft", label: "بازگشت به پیش‌نویس", icon: EyeOff }],
};

export function ProductsSeller() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 350);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<SellerProduct | null>(null);

  const fetcher = useCallback(
    () =>
      listSellerProducts({
        page,
        limit: 15,
        q: debouncedQ || undefined,
        status: (status as ProductStatus) || undefined,
        category: category || undefined,
      }),
    [page, debouncedQ, status, category],
  );
  const { data, isLoading, error, reload } = useSellerFetch(fetcher, {
    dependencies: [page, debouncedQ, status, category],
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const clearMessages = () => {
    setActionError(null);
    setSuccessMsg(null);
  };

  const handleStatusChange = async (product: SellerProduct, nextStatus: ProductStatus) => {
    if (nextStatus === product.status) return;
    setBusyId(product.id);
    clearMessages();
    try {
      await updateSellerProductStatus(product.id, nextStatus);
      setSuccessMsg(`وضعیت «${product.title}» به «${PRODUCT_STATUS_LABEL[nextStatus]}» تغییر کرد.`);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تغییر وضعیت ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async () => {
    if (!confirmArchive) return;
    setBusyId(confirmArchive.id);
    clearMessages();
    try {
      await deleteSellerProduct(confirmArchive.id);
      setSuccessMsg(`محصول «${confirmArchive.title}» بایگانی شد.`);
      await reload();
      setConfirmArchive(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "بایگانی ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">محصولات</h2>
          <p className="text-sm text-[var(--color-muted)]">مدیریت کاتالوگ محصولات فروشگاه</p>
        </div>
        <Link
          to="/seller/products/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          محصول جدید
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو عنوان یا SKU..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2 pe-3 ps-9 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
          <button type="button" className="ms-3 underline" onClick={() => setActionError(null)}>بستن</button>
        </div>
      ) : null}
      {successMsg ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {successMsg}
          <button type="button" className="ms-3 underline" onClick={() => setSuccessMsg(null)}>بستن</button>
        </div>
      ) : null}

      {/* Table */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : (data?.items ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-text)]">محصولی یافت نشد</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">اولین محصول خود را ایجاد کنید.</p>
          <Link
            to="/seller/products/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            محصول جدید
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                <th className="px-4 py-3 text-start">محصول</th>
                <th className="px-4 py-3 text-center">قیمت</th>
                <th className="px-4 py-3 text-center">موجودی</th>
                <th className="px-4 py-3 text-center">وضعیت</th>
                <th className="px-4 py-3 text-center">به‌روزرسانی</th>
                <th className="px-4 py-3 text-end">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(data?.items ?? []).map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  busy={busyId === p.id}
                  onStatusChange={handleStatusChange}
                  onArchiveRequest={setConfirmArchive}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(p) => {
          setPage(p);
          window.scrollTo({ top: 0 });
        }}
      />

      {/* Archive confirm dialog */}
      {confirmArchive ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[var(--color-text)]">بایگانی محصول</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
              آیا از بایگانی محصول «{confirmArchive.title}» مطمئن هستید؟ این محصول از فروشگاه حذف نرم می‌شود.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmArchive(null)}
                disabled={busyId === confirmArchive.id}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={busyId === confirmArchive.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busyId === confirmArchive.id ? "در حال بایگانی..." : "بایگانی"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Table row ────────────────────────────────────────────────────────────────

function ProductRow({
  product: p,
  busy,
  onStatusChange,
  onArchiveRequest,
}: {
  product: SellerProduct;
  busy: boolean;
  onStatusChange: (product: SellerProduct, status: ProductStatus) => void;
  onArchiveRequest: (product: SellerProduct) => void;
}) {
  const transitions = TRANSITIONS[p.status] ?? [];

  return (
    <tr className="transition-colors hover:bg-[var(--color-primary)]/5">
      <td className="px-4 py-3">
        <Link to={`/seller/products/${p.id}`} className="flex items-center gap-3">
          {p.images?.[0] ? (
            <img src={p.images[0]} alt={p.title} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Package className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--color-text)]">{p.title}</p>
            <p className="text-xs text-[var(--color-muted)]">
              SKU: {p.sku || "—"}
              {p.isLowStock ? (
                <span className="ms-2 text-amber-600">موجودی کم</span>
              ) : p.isOutOfStock ? (
                <span className="ms-2 text-red-600">ناموجود</span>
              ) : null}
            </p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 text-center text-sm text-[var(--color-text)]">
        {formatSellerPrice(p.price, p.currency)}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm text-[var(--color-text)]">{faNumber(p.stock.available)}</span>
        {p.stockPolicy === "tracked" ? (
          <span className="block text-[10px] text-[var(--color-muted)]">
            (رزرو: {faNumber(p.stock.reserved)})
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-center">
        <StatusBadge
          label={PRODUCT_STATUS_LABEL[p.status] ?? p.status}
          tone={PRODUCT_STATUS_TONE[p.status]}
        />
      </td>
      <td className="px-4 py-3 text-center text-xs text-[var(--color-muted)]">
        {formatDateTime(p.updatedAt)}
      </td>
      <td className="px-4 py-3 text-end">
        <div className="flex items-center justify-end gap-1.5">
          {transitions.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.to}
                type="button"
                disabled={busy}
                onClick={() => onStatusChange(p, t.to)}
                title={t.label}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{t.label}</span>
              </button>
            );
          })}
          <Link
            to={`/seller/products/${p.id}`}
            title="مشاهده جزئیات"
            className="rounded-lg border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            <Eye className="h-4 w-4" />
          </Link>
          {p.status !== "archived" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onArchiveRequest(p)}
              title="بایگانی"
              className="rounded-lg border border-red-200 bg-white p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
          {busy ? <RefreshCw className="h-4 w-4 animate-spin text-[var(--color-primary)]" /> : null}
        </div>
      </td>
    </tr>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-[var(--color-border)]/50" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-[var(--color-border)]/50" />
            <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-border)]/40" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded bg-[var(--color-border)]/40" />
        </div>
      ))}
    </div>
  );
}

export default ProductsSeller;
