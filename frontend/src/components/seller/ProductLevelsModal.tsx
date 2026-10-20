import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, ClipboardCheck, RefreshCw, Warehouse, X } from "lucide-react";
import {
  getProductLevels,
  reconcileInventoryStock,
  transferInventoryStock,
} from "../../services/sellerService";
import type { ProductLevels, SellerProduct } from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber } from "../../lib/adminFormat";

interface ProductLevelsModalProps {
  product: SellerProduct;
  onClose: () => void;
  onChanged: () => void;
}

export function ProductLevelsModal({ product, onClose, onChanged }: ProductLevelsModalProps) {
  const [data, setData] = useState<ProductLevels | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferOk, setTransferOk] = useState<string | null>(null);

  const [recLocationId, setRecLocationId] = useState("");
  const [counted, setCounted] = useState("");
  const [recReason, setRecReason] = useState("");
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recOk, setRecOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getProductLevels(product.id);
      setData(result);
      setRecLocationId((prev) => prev || result.stock.levels[0]?.locationId || "");
      setFromId((prev) => prev || result.stock.levels[0]?.locationId || "");
      setToId((prev) => prev || result.locations.find((l) => l.isActive)?.id || "");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "دریافت موجودی انبارها ناموفق بود");
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const locations = data?.locations ?? [];
  const levels = data?.stock.levels ?? [];

  const toOptions = useMemo(
    () => locations.filter((l) => l.isActive && l.id !== fromId),
    [locations, fromId],
  );

  useEffect(() => {
    if (toId && toOptions.some((l) => l.id === toId)) return;
    setToId(toOptions[0]?.id ?? "");
  }, [toOptions, toId]);

  const drift =
    data !== null &&
    (data.stock.levelsOnHand !== data.stock.onHand ||
      data.stock.levelsReserved !== data.stock.reserved);

  const handleTransfer = async () => {
    if (transferBusy) return;
    const parsedQty = Number.parseInt(qty, 10);
    if (!fromId || !toId || !Number.isInteger(parsedQty) || parsedQty <= 0) {
      setTransferError("انبار مبدأ، مقصد و تعداد صحیح مثبت را انتخاب کنید");
      return;
    }
    setTransferBusy(true);
    setTransferError(null);
    setTransferOk(null);
    try {
      await transferInventoryStock(product.id, {
        fromLocationId: fromId,
        toLocationId: toId,
        qty: parsedQty,
      });
      setTransferOk(`${faNumber(parsedQty)} واحد جابه‌جا شد.`);
      setQty("");
      await load();
      onChanged();
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : "انتقال موجودی ناموفق بود");
    } finally {
      setTransferBusy(false);
    }
  };

  const handleReconcile = async () => {
    if (recBusy) return;
    const parsedCounted = Number.parseInt(counted, 10);
    if (!recLocationId || !Number.isInteger(parsedCounted) || parsedCounted < 0) {
      setRecError("انبار و موجودی شمارش‌شده (عدد نامنفی) را وارد کنید");
      return;
    }
    setRecBusy(true);
    setRecError(null);
    setRecOk(null);
    try {
      await reconcileInventoryStock(product.id, {
        locationId: recLocationId,
        counted: parsedCounted,
        reason: recReason.trim() || undefined,
      });
      setRecOk("شمارش ثبت و موجودی اصلاح شد.");
      setCounted("");
      setRecReason("");
      await load();
      onChanged();
    } catch (e) {
      setRecError(e instanceof Error ? e.message : "ثبت شمارش ناموفق بود");
    } finally {
      setRecBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              موجودی بر اساس انبار
            </h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{product.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="بستن"
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadError ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {loadError}
            <button type="button" className="ms-3 underline" onClick={() => void load()}>
              تلاش دوباره
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <RefreshCw className="h-4 w-4 animate-spin" />
            در حال بارگذاری...
          </div>
        ) : data ? (
          <>
            <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-[var(--color-bg)] p-4 text-center">
              <div>
                <p className="text-xs text-[var(--color-muted)]">موجودی فیزیکی</p>
                <p className="text-lg font-bold text-[var(--color-text)]">
                  {faNumber(data.stock.onHand)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">رزرو‌شده</p>
                <p className="text-lg font-bold text-[var(--color-text)]">
                  {faNumber(data.stock.reserved)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">در دسترس</p>
                <p className="text-lg font-bold text-[var(--color-primary)]">
                  {faNumber(data.stock.available)}
                </p>
              </div>
            </div>

            {drift ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  مجموع سطوح انبارها با موجودی کل برابر نیست
                  (شمارش سطوح: {faNumber(data.stock.levelsOnHand)}، رزرو:{" "}
                  {faNumber(data.stock.levelsReserved)}). با یک عملیات شمارش (reconcile)
                  می‌توانید هم‌تراز کنید.
                </span>
              </div>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)]">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                    <th className="px-3 py-2 text-start">انبار</th>
                    <th className="px-3 py-2 text-center">موجودی آزاد</th>
                    <th className="px-3 py-2 text-center">رزرو</th>
                    <th className="px-3 py-2 text-center">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {levels.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                        این محصول در هیچ انباری موجودی ثبت‌شده ندارد.
                      </td>
                    </tr>
                  ) : (
                    levels.map((level) => {
                      const meta = locations.find((l) => l.id === level.locationId);
                      return (
                        <tr key={level.locationId}>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 text-[var(--color-text)]">
                              <Warehouse className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                              {level.name}
                              {level.code ? (
                                <span className="font-mono text-xs text-[var(--color-muted)]" dir="ltr">
                                  {level.code}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center font-medium text-[var(--color-text)]">
                            {faNumber(level.onHand)}
                          </td>
                          <td className="px-3 py-2 text-center text-[var(--color-muted)]">
                            {faNumber(level.reserved)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {meta ? (
                              <StatusBadge
                                label={meta.isActive ? "فعال" : "غیرفعال"}
                                tone={meta.isActive ? "green" : "gray"}
                              />
                            ) : (
                              <StatusBadge label="حذف‌شده" tone="red" />
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <section className="rounded-xl border border-[var(--color-border)] p-4">
                <h4 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                  <ArrowLeftRight className="h-4 w-4" />
                  انتقال بین انبارها
                </h4>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  فقط موجودی آزاد جابه‌جا می‌شود؛ واحدهای رزروشده در جای خود می‌مانند.
                </p>

                {transferError ? (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {transferError}
                  </p>
                ) : null}
                {transferOk ? (
                  <p className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">
                    {transferOk}
                  </p>
                ) : null}

                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-[var(--color-muted)]">از انبار</label>
                  <select
                    value={fromId}
                    onChange={(e) => setFromId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  >
                    <option value="">انتخاب کنید</option>
                    {levels.map((level) => (
                      <option key={level.locationId} value={level.locationId}>
                        {level.name} ({faNumber(level.onHand)})
                      </option>
                    ))}
                  </select>

                  <label className="block text-xs text-[var(--color-muted)]">به انبار</label>
                  <select
                    value={toId}
                    onChange={(e) => setToId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  >
                    <option value="">انتخاب کنید</option>
                    {toOptions.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>

                  <label className="block text-xs text-[var(--color-muted)]">تعداد</label>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  />

                  <button
                    type="button"
                    onClick={() => void handleTransfer()}
                    disabled={transferBusy || !fromId || !toId}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {transferBusy ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowLeftRight className="h-4 w-4" />
                    )}
                    ثبت انتقال
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-[var(--color-border)] p-4">
                <h4 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                  <ClipboardCheck className="h-4 w-4" />
                  شمارش و اصلاح
                </h4>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  موجودی شمارش‌شده = تعداد فیزیکی واقعی در انبار (آزاد + رزروشده).
                </p>

                {recError ? (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {recError}
                  </p>
                ) : null}
                {recOk ? (
                  <p className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">
                    {recOk}
                  </p>
                ) : null}

                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-[var(--color-muted)]">انبار</label>
                  <select
                    value={recLocationId}
                    onChange={(e) => setRecLocationId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  >
                    <option value="">انتخاب کنید</option>
                    {levels.map((level) => (
                      <option key={level.locationId} value={level.locationId}>
                        {level.name}
                      </option>
                    ))}
                  </select>

                  <label className="block text-xs text-[var(--color-muted)]">موجودی شمارش‌شده</label>
                  <input
                    type="number"
                    min={0}
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  />

                  <label className="block text-xs text-[var(--color-muted)]">دلیل (اختیاری)</label>
                  <input
                    type="text"
                    value={recReason}
                    onChange={(e) => setRecReason(e.target.value)}
                    placeholder="مثال: شمارش پایان ماه"
                    className="w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  />

                  <button
                    type="button"
                    onClick={() => void handleReconcile()}
                    disabled={recBusy || !recLocationId}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
                  >
                    {recBusy ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardCheck className="h-4 w-4" />
                    )}
                    ثبت شمارش
                  </button>
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default ProductLevelsModal;
