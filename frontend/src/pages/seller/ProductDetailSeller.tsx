import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Pencil,
  Package,
  RefreshCw,
  Pause,
  Play,
  Send,
  Trash2,
  Tag,
  Boxes,
  Clock,
} from "lucide-react";
import { getSellerProduct, updateSellerProductStatus, deleteSellerProduct } from "../../services/sellerService";
import type { SellerProduct, ProductStatus } from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber, formatDateTime, formatDate } from "../../lib/adminFormat";
import {
  formatSellerPrice,
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_TONE,
} from "../../lib/sellerFormat";



export function ProductDetailSeller() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<SellerProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSellerProduct(id)
      .then(setProduct)
      .catch(() => setError("بارگذاری اطلاعات محصول ناموفق بود."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleStatusChange = async (nextStatus: ProductStatus) => {
    if (!product || nextStatus === product.status || !id) return;
    setBusyAction(`status-${nextStatus}`);
    setError(null);
    try {
      const updated = await updateSellerProductStatus(id, nextStatus);
      setProduct(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تغییر وضعیت ناموفق بود.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleArchive = async () => {
    if (!product || !id) return;
    setBusyAction("archive");
    setError(null);
    try {
      await deleteSellerProduct(id);
      navigate("/seller/products");
    } catch (e) {
      setError(e instanceof Error ? e.message : "بایگانی ناموفق بود.");
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-[var(--color-border)]/50" />
        <div className="h-80 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-red-700">
        <p>{error}</p>
        <Link
          to="/seller/products"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          بازگشت به فهرست
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const p = product!;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/seller/products"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <ArrowRight className="h-4 w-4" />
            فهرست محصولات
          </Link>
          <h2 className="mt-2 text-lg font-bold text-[var(--color-text)]">{p.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/seller/products/${p.id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            <Pencil className="h-4 w-4" />
            ویرایش
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button type="button" className="ms-3 underline" onClick={() => setError(null)}>بستن</button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Main info */}
        <div className="space-y-6 xl:col-span-2">
          {/* Images */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-[var(--color-text)]">تصاویر</h3>
            {p.images.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {p.images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt={`${p.title} ${i + 1}`}
                    className="h-28 w-28 rounded-xl object-cover"
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-muted)]">
                <Package className="h-8 w-8" />
              </div>
            )}
          </div>

          {/* Description */}
          {p.description ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-[var(--color-text)]">توضیحات</h3>
              <p className="text-sm leading-7 text-[var(--color-muted)] whitespace-pre-wrap">{p.description}</p>
            </div>
          ) : null}

          {/* Tags */}
          {p.tags.length > 0 ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                <Tag className="h-4 w-4" />
                برچسب‌ها
              </h3>
              <div className="flex flex-wrap gap-2">
                {p.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Rejection reason */}
          {p.status === "rejected" && p.rejectionReason ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h3 className="mb-2 text-sm font-bold text-red-700">دلیل رد</h3>
              <p className="text-sm text-red-600">{p.rejectionReason}</p>
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Status + actions */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-[var(--color-text)]">وضعیت و عملیات</h3>
            <div className="mb-4">
              <StatusBadge
                label={PRODUCT_STATUS_LABEL[p.status] ?? p.status}
                tone={PRODUCT_STATUS_TONE[p.status]}
              />
            </div>

            <div className="space-y-2">
              {p.status === "draft" || p.status === "paused" ? (
                <ActionButton
                  icon={Play}
                  label="فعال‌سازی"
                  busy={busyAction === "active"}
                  onClick={() => void handleStatusChange("active")}
                />
              ) : null}
              {p.status === "active" ? (
                <ActionButton
                  icon={Pause}
                  label="توقف فروش"
                  busy={busyAction === "paused"}
                  onClick={() => void handleStatusChange("paused")}
                />
              ) : null}
              {(p.status === "active" || p.status === "paused" || p.status === "draft") ? (
                <ActionButton
                  icon={Send}
                  label="ارسال برای بررسی"
                  busy={busyAction === "pending_review"}
                  onClick={() => void handleStatusChange("pending_review")}
                />
              ) : null}
              {p.status === "rejected" ? (
                <ActionButton
                  icon={Send}
                  label="بازگشت به پیش‌نویس"
                  busy={busyAction === "draft"}
                  onClick={() => void handleStatusChange("draft")}
                />
              ) : null}
              {p.status !== "archived" ? (
                <button
                  type="button"
                  disabled={!!busyAction}
                  onClick={() => setConfirmArchive(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                  بایگانی محصول
                </button>
              ) : null}
            </div>
          </div>

          {/* Price */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-[var(--color-text)]">قیمت</h3>
            <p className="text-xl font-bold text-[var(--color-text)]">
              {formatSellerPrice(p.price, p.currency)}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">SKU: {p.sku || "—"}</p>
          </div>

          {/* Stock */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <Boxes className="h-4 w-4" />
              موجودی
            </h3>
            <dl className="space-y-2 text-sm">
              <Row label="موجودی در دسترس" value={faNumber(p.stock.available)} highlight={p.isLowStock} />
              <Row label="موجودی فیزیکی" value={faNumber(p.stock.onHand)} />
              <Row label="رزروشده" value={faNumber(p.stock.reserved)} />
              <Row label="در راه" value={faNumber(p.stock.incoming)} />
              <Row label="خط مشی" value={p.stockPolicy === "tracked" ? "پیگیری‌شده" : "بدون پیگیری"} />
              {p.isLowStock ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  ⚠ موجودی کم — آستانه: {faNumber(p.lowStockThreshold)}
                </div>
              ) : null}
              {p.isOutOfStock ? (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  ✕ ناموجود
                </div>
              ) : null}
            </dl>
          </div>

          {/* Timestamps */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
              <Clock className="h-4 w-4" />
              تاریخچه
            </h3>
            <dl className="space-y-2 text-sm">
              <Row label="ایجاد" value={formatDate(p.createdAt)} />
              <Row label="آخرین به‌روزرسانی" value={formatDateTime(p.updatedAt)} />
            </dl>
          </div>
        </div>
      </div>

      {/* Archive confirm modal */}
      {confirmArchive ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[var(--color-text)]">بایگانی محصول</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
              آیا از بایگانی محصول «{p.title}» مطمئن هستید؟ این محصول از فروشگاه حذف نرم می‌شود.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                disabled={!!busyAction}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={!!busyAction}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busyAction === "archive" ? "در حال بایگانی..." : "بایگانی"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  busy,
  onClick,
}: {
  icon: typeof Play;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
    >
      {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {busy ? "در حال اجرا..." : label}
    </button>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className={`font-medium ${highlight ? "text-amber-600" : "text-[var(--color-text)]"}`}>{value}</dd>
    </div>
  );
}

export default ProductDetailSeller;
