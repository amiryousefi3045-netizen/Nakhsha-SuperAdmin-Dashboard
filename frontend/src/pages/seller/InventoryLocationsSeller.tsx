import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Warehouse,
} from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import {
  createInventoryLocation,
  deleteInventoryLocation,
  listInventoryLocations,
  updateInventoryLocation,
} from "../../services/sellerService";
import type {
  InventoryLocation,
  InventoryLocationKind,
  InventoryLocationPayload,
} from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber } from "../../lib/adminFormat";

const KIND_LABEL: Record<InventoryLocationKind, string> = {
  warehouse: "انبار",
  storefront: "فروشگاه",
  marketplace: "بازارگاه",
  transit: "در مسیر",
};

const KIND_OPTIONS = Object.keys(KIND_LABEL) as InventoryLocationKind[];

interface LocationForm {
  name: string;
  code: string;
  kind: InventoryLocationKind;
  province: string;
  city: string;
  line: string;
  sortOrder: string;
  isDefault: boolean;
  isActive: boolean;
}

const EMPTY_FORM: LocationForm = {
  name: "",
  code: "",
  kind: "warehouse",
  province: "",
  city: "",
  line: "",
  sortOrder: "0",
  isDefault: false,
  isActive: true,
};

function formFromLocation(loc: InventoryLocation): LocationForm {
  return {
    name: loc.name,
    code: loc.code,
    kind: loc.kind,
    province: loc.address?.province ?? "",
    city: loc.address?.city ?? "",
    line: loc.address?.line ?? "",
    sortOrder: String(loc.sortOrder ?? 0),
    isDefault: loc.isDefault,
    isActive: loc.isActive,
  };
}

export function InventoryLocationsSeller() {
  const fetcher = useCallback(() => listInventoryLocations(), []);
  const { data, isLoading, error, reload } = useSellerFetch<InventoryLocation[]>(fetcher);

  const [editing, setEditing] = useState<InventoryLocation | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<InventoryLocation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const locations = data ?? [];

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, isDefault: locations.length === 0 });
    setCreating(true);
    setEditing(null);
    setFormError(null);
  };

  const openEdit = (loc: InventoryLocation) => {
    setForm(formFromLocation(loc));
    setEditing(loc);
    setCreating(false);
    setFormError(null);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  };

  const buildPayload = (): InventoryLocationPayload => {
    const payload: InventoryLocationPayload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      kind: form.kind,
      sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
      isDefault: form.isDefault,
      isActive: form.isActive,
    };
    const address: Record<string, string> = {};
    if (form.province.trim()) address.province = form.province.trim();
    if (form.city.trim()) address.city = form.city.trim();
    if (form.line.trim()) address.line = form.line.trim();
    payload.address = address;
    return payload;
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = buildPayload();
      if (editing) {
        await updateInventoryLocation(editing.id, payload);
        setSuccessMsg(`انبار «${payload.name}» به‌روزرسانی شد.`);
      } else {
        await createInventoryLocation({ ...payload, isDefault: form.isDefault });
        setSuccessMsg(`انبار «${payload.name}» ایجاد شد.`);
      }
      closeForm();
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "ذخیره انبار ناموفق بود");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (loc: InventoryLocation) => {
    setRowBusy(loc.id);
    try {
      await updateInventoryLocation(loc.id, { isActive: !loc.isActive });
      setSuccessMsg(
        `انبار «${loc.name}» ${loc.isActive ? "غیرفعال" : "فعال"} شد.`,
      );
      await reload();
    } catch (e) {
      setSuccessMsg(null);
      setDeleteError(e instanceof Error ? e.message : "تغییر وضعیت انبار ناموفق بود");
    } finally {
      setRowBusy(null);
    }
  };

  const handleMakeDefault = async (loc: InventoryLocation) => {
    if (loc.isDefault) return;
    setRowBusy(loc.id);
    try {
      await updateInventoryLocation(loc.id, { isDefault: true });
      setSuccessMsg(`انبار «${loc.name}» به‌عنوان انبار پیش‌فرض انتخاب شد.`);
      await reload();
    } catch (e) {
      setSuccessMsg(null);
      setDeleteError(e instanceof Error ? e.message : "تغییر انبار پیش‌فرض ناموفق بود");
    } finally {
      setRowBusy(null);
    }
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteInventoryLocation(deleteTarget.id);
      setSuccessMsg(`انبار «${deleteTarget.name}» حذف شد؛ موجودی آن به انبار دیگر منتقل شد.`);
      setDeleteTarget(null);
      await reload();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "حذف انبار ناموفق بود");
    } finally {
      setDeleting(false);
    }
  };

  const atLimit = locations.length >= 10;

  return (
    <div className="space-y-4">
      <Link
        to="/seller/inventory"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
      >
        <ArrowRight className="h-4 w-4" />
        بازگشت به موجودی
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">انبارها</h2>
          <p className="text-sm text-[var(--color-muted)]">
            مدیریت مکان‌های نگهداری موجودی
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={atLimit || isLoading}
          title={atLimit ? "حداکثر ۱۰ انبار برای هر فروشنده مجاز است" : undefined}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          انبار جدید
        </button>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-800">
        برداشت سفارش‌ها به ترتیب از انبار پیش‌فرض و سپس بر اساس ترتیب نمایش انجام می‌شود.
        غیرفعال‌کردن یک انبار موجودی آن را از بین نمی‌برد؛ فقط امکان انتقال موجودی <b>به</b> آن
        را می‌بندد. حذف انبار، موجودی آن را به انبار باقی‌مانده منتقل می‌کند.
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {successMsg ? (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          {successMsg}
        </div>
      ) : null}
      {deleteError && !deleteTarget ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {deleteError}
          <button type="button" className="ms-3 underline" onClick={() => setDeleteError(null)}>
            بستن
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-white p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--color-border)]/40" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
          <Warehouse className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-text)]">
            هنوز انباری تعریف نکرده‌اید
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            تا زمانی که انباری نسازید، موجودی محصولات به شکل تجمیعی مدیریت می‌شود.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            <Plus className="h-4 w-4" />
            ساخت اولین انبار
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                <th className="px-4 py-3 text-start">انبار</th>
                <th className="px-4 py-3 text-start">کد</th>
                <th className="px-4 py-3 text-center">نوع</th>
                <th className="px-4 py-3 text-start">آدرس</th>
                <th className="px-4 py-3 text-center">ترتیب</th>
                <th className="px-4 py-3 text-center">وضعیت</th>
                <th className="px-4 py-3 text-end">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {locations.map((loc) => {
                const busy = rowBusy === loc.id;
                const address = [loc.address?.province, loc.address?.city, loc.address?.line]
                  .filter(Boolean)
                  .join("، ");
                return (
                  <tr key={loc.id} className="transition-colors hover:bg-[var(--color-primary)]/5">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                          <Warehouse className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--color-text)]">{loc.name}</p>
                          {loc.isDefault ? (
                            <span className="text-xs font-medium text-[var(--color-primary)]">
                              انبار پیش‌فرض
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-text)]" dir="ltr">
                      {loc.code}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-[var(--color-muted)]">
                      {KIND_LABEL[loc.kind] ?? loc.kind}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted)]">
                      {address ? (
                        <span className="inline-flex items-start gap-1">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {address}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-[var(--color-muted)]">
                      {faNumber(loc.sortOrder)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge
                        label={loc.isActive ? "فعال" : "غیرفعال"}
                        tone={loc.isActive ? "green" : "gray"}
                      />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {!loc.isDefault ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleMakeDefault(loc)}
                            title="انتخاب به‌عنوان پیش‌فرض"
                            className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
                          >
                            پیش‌فرض
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleToggleActive(loc)}
                          title={loc.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
                          className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
                        >
                          {loc.isActive ? "غیرفعال" : "فعال"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openEdit(loc)}
                          title="ویرایش"
                          className="rounded-lg border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busy || locations.length <= 1}
                          onClick={() => {
                            setDeleteTarget(loc);
                            setDeleteError(null);
                          }}
                          title={
                            locations.length <= 1
                              ? "تنها انبار موجود قابل حذف نیست"
                              : "حذف انبار"
                          }
                          className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating || editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[var(--color-text)]">
              {editing ? `ویرایش انبار «${editing.name}»` : "انبار جدید"}
            </h3>

            {formError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">نام انبار</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="مثال: انبار مرکزی"
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">کد انبار</label>
                <input
                  type="text"
                  dir="ltr"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="WH-01"
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  ۳ تا ۲۰ نویسه: حروف انگلیسی، رقم و خط تیره
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">نوع</label>
                <select
                  value={form.kind}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, kind: e.target.value as InventoryLocationKind }))
                  }
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)]"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">استان</label>
                <input
                  type="text"
                  value={form.province}
                  onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">شهر</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">نشانی</label>
                <input
                  type="text"
                  value={form.line}
                  onChange={(e) => setForm((f) => ({ ...f, line: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">ترتیب نمایش</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  عدد کوچک‌تر زودتر برای برداشت موجودی بررسی می‌شود
                </p>
              </div>

              <div className="flex flex-col justify-center gap-2">
                <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  />
                  انبار پیش‌فرض
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  فعال
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || form.name.trim().length < 2 || form.code.trim().length < 3}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {saving ? "در حال ذخیره..." : "ذخیره"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[var(--color-text)]">حذف انبار</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
              انبار «{deleteTarget.name}» حذف می‌شود. موجودی این انبار روی انبار باقی‌مانده
              ادغام می‌شود و از بین نمی‌رود.
            </p>

            {deleteError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {deleteError}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDelete}
                disabled={deleting}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {deleting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleting ? "در حال حذف..." : "حذف"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default InventoryLocationsSeller;
