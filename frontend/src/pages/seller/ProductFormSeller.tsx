import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Save, ArrowRight, RefreshCw } from "lucide-react";
import {
  getSellerProduct,
  createSellerProduct,
  updateSellerProduct,
} from "../../services/sellerService";
import type { SellerProduct, ProductStatus } from "../../types/seller";
import { formatDateTime } from "../../lib/adminFormat";
import { PRODUCT_STATUS_LABEL } from "../../lib/sellerFormat";

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
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

interface ProductForm {
  title: string;
  description: string;
  price: string;
  sku: string;
  category: string;
  status: ProductStatus;
  stockOnHand: string;
  stockPolicy: "tracked" | "untracked";
  lowStockThreshold: string;
  tags: string;
}

const EMPTY: ProductForm = {
  title: "",
  description: "",
  price: "",
  sku: "",
  category: "other",
  status: "draft",
  stockOnHand: "",
  stockPolicy: "tracked",
  lowStockThreshold: "3",
  tags: "",
};

export function ProductFormSeller() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    setLoadingExisting(true);
    getSellerProduct(id)
      .then((p) => {
        setForm({
          title: p.title,
          description: p.description || "",
          price: String(p.price),
          sku: p.sku || "",
          category: p.category || "other",
          status: p.status,
          stockOnHand: String(p.stock.onHand),
          stockPolicy: p.stockPolicy,
          lowStockThreshold: String(p.lowStockThreshold),
          tags: (p.tags || []).join(", "),
        });
      })
      .catch(() => setError("بارگذاری اطلاعات محصول ناموفق بود."))
      .finally(() => setLoadingExisting(false));
  }, [id]);

  const set = <K extends keyof ProductForm>(key: K, val: ProductForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "عنوان محصول الزامی است.";
    const price = Number(form.price);
    if (!form.price || Number.isNaN(price) || price < 0) errs.price = "قیمت معتبر وارد کنید.";
    if (isEdit) {
      const th = Number(form.lowStockThreshold);
      if (form.lowStockThreshold !== "" && (Number.isNaN(th) || th < 0)) {
        errs.lowStockThreshold = "آستانه موجودی نامعتبر است.";
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setError(null);

    const tags = form.tags
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      sku: form.sku.trim() || undefined,
      category: form.category,
      tags,
      stockPolicy: form.stockPolicy,
      lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : 3,
    };

    if (!isEdit) {
      payload.status = form.status;
      if (form.stockOnHand) {
        const oh = Number(form.stockOnHand);
        if (!Number.isNaN(oh) && oh >= 0 && Number.isInteger(oh)) {
          payload.stock = { onHand: oh };
        }
      }
    }

    try {
      if (isEdit && id) {
        await updateSellerProduct(id, payload);
        navigate(`/seller/products/${id}`);
      } else {
        const created = await createSellerProduct(payload);
        navigate(`/seller/products/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره محصول ناموفق بود.");
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-[var(--color-border)]/50" />
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          to="/seller/products"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت به فهرست محصولات
        </Link>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          {isEdit ? "ویرایش محصول" : "ایجاد محصول جدید"}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {isEdit ? (
            <>آخرین به‌روزرسانی: {formatDateTime(form as unknown as SellerProduct["updatedAt"])}</>
          ) : (
            "اطلاعات محصول را وارد کنید. فیلدها با * الزامی هستند."
          )}
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {isEdit && form.status ? (
          <div className="mt-4 rounded-lg bg-[var(--color-primary)]/5 px-4 py-2.5 text-sm text-[var(--color-text)]">
            وضعیت فعلی: <strong>{PRODUCT_STATUS_LABEL[form.status]}</strong>
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-5">
          {/* Title */}
          <Field label="عنوان محصول *" error={fieldErrors.title}>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={200}
              placeholder="مثال: فرش دستباف ابریشمی"
              className="form-input"
            />
          </Field>

          {/* Description */}
          <Field label="توضیحات">
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={5000}
              placeholder="توضیحات محصول (اختیاری)"
              className="form-input resize-y"
            />
          </Field>

          {/* Price + SKU */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="قیمت (تومان) *" error={fieldErrors.price}>
              <input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="۰"
                className="form-input"
              />
            </Field>
            <Field label="کد SKU">
              <input
                type="text"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="اختیاری"
                className="form-input"
              />
            </Field>
          </div>

          {/* Category */}
          <Field label="دسته‌بندی">
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="form-input"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {/* Initial stock (create only) */}
          {!isEdit ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="موجودی اولیه">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.stockOnHand}
                  onChange={(e) => set("stockOnHand", e.target.value)}
                  placeholder="0"
                  className="form-input"
                />
              </Field>
              <Field label="وضعیت اولیه">
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as ProductStatus)}
                  className="form-input"
                >
                  <option value="draft">پیش‌نویس</option>
                  <option value="active">فعال</option>
                </select>
              </Field>
            </div>
          ) : null}

          {/* Stock policy & threshold (both) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="خط مشی موجودی">
              <select
                value={form.stockPolicy}
                onChange={(e) => set("stockPolicy", e.target.value as "tracked" | "untracked")}
                className="form-input"
              >
                <option value="tracked">پیگیری موجودی</option>
                <option value="untracked">بدون پیگیری</option>
              </select>
            </Field>
            <Field label="آستانه موجودی کم" error={fieldErrors.lowStockThreshold}>
              <input
                type="number"
                min={0}
                value={form.lowStockThreshold}
                onChange={(e) => set("lowStockThreshold", e.target.value)}
                className="form-input"
              />
            </Field>
          </div>

          {/* Tags */}
          <Field label="برچسب‌ها">
            <input
              type="text"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="دستباف، ابریشم، سنتی (با کاما جدا کنید)"
              className="form-input"
            />
          </Field>

          {/* Actions */}
          <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-5">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "در حال ذخیره..." : isEdit ? "ذخیره تغییرات" : "ایجاد محصول"}
            </button>
            <Link
              to="/seller/products"
              className="rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)]"
            >
              انصراف
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export default ProductFormSeller;
