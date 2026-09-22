import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  RefreshCw,
  Package,
  SlidersHorizontal,
  History,
  Plus,
  Minus,
} from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { useDebounce } from "../../hooks/useDebounce";
import {
  listSellerInventory,
  adjustSellerStock,
} from "../../services/sellerService";
import type { SellerProduct, StockAdjustmentType } from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { Pagination } from "../../components/admin/Pagination";
import { faNumber } from "../../lib/adminFormat";
import {
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_TONE,
} from "../../lib/sellerFormat";

type InventoryStatus = "low" | "out";

const FILTER_OPTIONS: Array<{ value: "" | InventoryStatus; label: string }> = [
  { value: "", label: "همه اقلام" },
  { value: "low", label: "موجودی کم" },
  { value: "out", label: "ناموجود" },
];

interface AdjustTarget {
  product: SellerProduct;
  delta: number;
  reason: string;
  type: StockAdjustmentType;
}

export function InventorySeller() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [status, setStatus] = useState<"" | InventoryStatus>(
    initialStatus === "low" || initialStatus === "out" ? initialStatus : "",
  );
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 350);
  const [page, setPage] = useState(1);

  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const fetcher = useCallback(
    () =>
      listSellerInventory({
        page,
        limit: 15,
        q: debouncedQ || undefined,
        status: status || undefined,
      }),
    [page, debouncedQ, status],
  );
  const { data, isLoading, error, reload } = useSellerFetch(fetcher, {
    dependencies: [page, debouncedQ, status],
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const handleStatusFilter = (next: "" | InventoryStatus) => {
    setStatus(next);
    setPage(1);
    setSearchParams(next ? { status: next } : {}, { replace: true });
  };

  const closeAdjust = () => {
    setAdjustTarget(null);
    setAdjustError(null);
  };

  const handleAdjust = async () => {
    if (!adjustTarget) return;
    const { product, delta, reason, type } = adjustTarget;
    setAdjustBusy(true);
    setAdjustError(null);
    try {
      await adjustSellerStock(product.id, { delta, reason: reason.trim(), type });
      setSuccessMsg(
        `موجودی «${product.title}» با تغییر ${faNumber(Math.abs(delta))} به‌روزرسانی شد.`,
      );
      setAdjustTarget(null);
      await reload();
    } catch (e) {
      setAdjustError(e instanceof Error ? e.message : "بروزرسانی موجودی ناموفق بود");
    } finally {
      setAdjustBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">موجودی کالا</h2>
          <p className="text-sm text-[var(--color-muted)]">
            مدیریت موجودی فیزیکی و تاریخچه تنظیمات
          </p>
        </div>
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
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[var(--color-muted)]" />
          <select
            value={status}
            onChange={(e) => handleStatusFilter(e.target.value as "" | InventoryStatus)}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
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
          <p className="mt-3 text-sm font-medium text-[var(--color-text)]">
            {status ? "اقلامی مطابق فیلتر یافت نشد" : "هیچ محصول پیگیری‌شده‌ای ندارید"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            موجودی فقط برای محصولاتی که «پیگیری موجودی» فعال دارند نمایش داده می‌شود.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                <th className="px-4 py-3 text-start">محصول</th>
                <th className="px-4 py-3 text-center">موجودی فیزیکی</th>
                <th className="px-4 py-3 text-center">رزرو</th>
                <th className="px-4 py-3 text-center">در دسترس</th>
                <th className="px-4 py-3 text-center">آستانه</th>
                <th className="px-4 py-3 text-center">وضعیت</th>
                <th className="px-4 py-3 text-end">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(data?.items ?? []).map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-[var(--color-primary)]/5">
                  <td className="px-4 py-3">
                    <Link to={`/seller/products/${p.id}`} className="flex min-w-0 items-center gap-3">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.title} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                          <Package className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--color-text)]">{p.title}</p>
                        <p className="text-xs text-[var(--color-muted)]">SKU: {p.sku || "—"}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-[var(--color-text)]">
                    {faNumber(p.stock.onHand)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-[var(--color-muted)]">
                    {faNumber(p.stock.reserved)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-[var(--color-text)]">
                    {faNumber(p.stock.available)}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-[var(--color-muted)]">
                    {faNumber(p.lowStockThreshold)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge
                      label={PRODUCT_STATUS_LABEL[p.status] ?? p.status}
                      tone={PRODUCT_STATUS_TONE[p.status]}
                    />
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={adjustBusy}
                        onClick={() =>
                          setAdjustTarget({ product: p, delta: 0, reason: "", type: "adjustment" })
                        }
                        title="تنظیم موجودی"
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        تنظیم
                      </button>
                      <Link
                        to={`/seller/inventory/${p.id}/history`}
                        title="تاریخچه تنظیمات"
                        className="rounded-lg border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
                      >
                        <History className="h-4 w-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
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

      {/* Adjust stock modal */}
      {adjustTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[var(--color-text)]">تنظیم موجودی</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {adjustTarget.product.title} — موجودی فعلی: <b>{faNumber(adjustTarget.product.stock.onHand)}</b>
            </p>

            {adjustError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {adjustError}
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">
                  مقدار تغییر (عدد صحیح، صفر ممنوع)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={adjustTarget.delta === 0 ? "" : adjustTarget.delta}
                    onChange={(e) =>
                      setAdjustTarget((t) =>
                        t ? { ...t, delta: Number.parseInt(e.target.value, 10) || 0 } : t,
                      )
                    }
                    placeholder="مثلاً ۵+ یا ۳-"
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAdjustTarget((t) => (t ? { ...t, delta: (t.delta || 0) + 1 } : t))
                    }
                    title="افزایش یکی"
                    className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAdjustTarget((t) => (t ? { ...t, delta: (t.delta || 0) - 1 } : t))
                    }
                    title="کاهش یکی"
                    className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  موجودی به زیر صفر کاهش نمی‌یابد؛ اگر مقدار درخواستی موجود نباشد سرور خطای صادقانه می‌دهد.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">نوع عملیات</label>
                <select
                  value={adjustTarget.type}
                  onChange={(e) =>
                    setAdjustTarget((t) =>
                      t ? { ...t, type: e.target.value as StockAdjustmentType } : t,
                    )
                  }
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)]"
                >
                  <option value="receipt">رسید کالا</option>
                  <option value="adjustment">اصلاح</option>
                  <option value="correction">تصحیح</option>
                  <option value="count">شمارش موجودی</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">دلیل (اختیاری)</label>
                <input
                  type="text"
                  value={adjustTarget.reason}
                  onChange={(e) =>
                    setAdjustTarget((t) => (t ? { ...t, reason: e.target.value } : t))
                  }
                  placeholder="مثال: دریافت محموله جدید"
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeAdjust}
                disabled={adjustBusy}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => void handleAdjust()}
                disabled={adjustBusy || adjustTarget.delta === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {adjustBusy ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <SlidersHorizontal className="h-4 w-4" />
                )}
                {adjustBusy ? "در حال ذخیره..." : "ثبت تغییر"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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

export default InventorySeller;