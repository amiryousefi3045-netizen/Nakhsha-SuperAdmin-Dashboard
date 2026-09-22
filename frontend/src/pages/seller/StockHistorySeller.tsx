import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, History, TrendingUp, TrendingDown } from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { getSellerStockHistory } from "../../services/sellerService";
import type { StockAdjustmentType } from "../../types/seller";
import { Pagination } from "../../components/admin/Pagination";
import { faNumber, formatDateTime } from "../../lib/adminFormat";

const TYPE_LABEL: Record<StockAdjustmentType, string> = {
  receipt: "رسید کالا",
  adjustment: "اصلاح",
  correction: "تصحیح",
  count: "شمارش",
};

export function StockHistorySeller() {
  const { productId } = useParams<{ productId: string }>();
  const [page, setPage] = useState(1);

  const fetcher = useCallback(
    () =>
      productId
        ? getSellerStockHistory(productId, { page, limit: 15 })
        : Promise.reject(new Error("شناسه محصول نامعتبر است")),
    [productId, page],
  );
  const { data, isLoading, error, reload } = useSellerFetch(fetcher, {
    dependencies: [productId, page],
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  if (error && !data) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-red-700">
        <p>{error}</p>
        <Link
          to="/seller/inventory"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          بازگشت به موجودی
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const product: { id: string; title: string; sku?: string } | undefined = data?.product;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link
          to="/seller/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت به موجودی کالا
        </Link>
        <h2 className="mt-2 flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
          <History className="h-5 w-5 text-[var(--color-primary)]" />
          تاریخچه تنظیم موجودی
        </h2>
        {product?.title ? (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
            <span className="font-medium text-[var(--color-text)]">{product.title}</span>
            SKU: {product.sku || "—"}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button
            type="button"
            className="ms-3 underline"
            onClick={() => void reload()}
          >
            تلاش مجدد
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <LoadingSkeleton />
      ) : (data?.items ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
          <History className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-text)]">هنوز تنظیمی ثبت نشده است</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            اولین تغییر موجودی از بخش «موجودی کالا» در این تاریخچه ثبت می‌شود.
          </p>
          <Link
            to="/seller/inventory"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            <ArrowRight className="h-4 w-4" />
            مدیریت موجودی
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                <th className="px-4 py-3 text-center">تغییر</th>
                <th className="px-4 py-3 text-center">قبل ← بعد</th>
                <th className="px-4 py-3 text-center">نوع</th>
                <th className="px-4 py-3 text-start">دلیل</th>
                <th className="px-4 py-3 text-center">تاریخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(data?.items ?? []).map((h) => {
                const positive = h.delta > 0;
                return (
                  <tr key={h.id} className="transition-colors hover:bg-[var(--color-primary)]/5">
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                          positive
                            ? "bg-green-50 text-green-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {positive ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {positive ? "+" : ""}
                        {faNumber(h.delta)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-[var(--color-text)]">
                      {faNumber(h.before?.onHand ?? 0)}
                      <span className="mx-1 text-[var(--color-muted)]">←</span>
                      <b>{faNumber(h.after?.onHand ?? 0)}</b>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {TYPE_LABEL[h.type] ?? h.type}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-sm text-[var(--color-text)]">
                      <span className="line-clamp-2">{h.reason || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-[var(--color-muted)]">
                      {formatDateTime(h.createdAt)}
                    </td>
                  </tr>
                );
              })}
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
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0">
          <div className="h-6 w-16 animate-pulse rounded-full bg-[var(--color-border)]/50" />
          <div className="h-4 w-24 animate-pulse rounded bg-[var(--color-border)]/50" />
          <div className="flex-1">
            <div className="h-3 w-40 animate-pulse rounded bg-[var(--color-border)]/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default StockHistorySeller;