/**
 * Seller rate-card editor (Phase 36, P1-08).
 *
 * What this screen is for: a seller needs to know, before a buyer asks, what
 * their own rules will charge for a given town and basket. So it is a rate-card
 * editor AND a live preview against the same engine the buyer hits.
 *
 * Two invariants the UI must not break:
 *  - The browser never computes a price. `pricing` here is stored, not applied;
 *    the preview calls the server to find out what it would actually charge.
 *  - `key` is the handle checkout sends, so it is generated once and then made
 *    read-only. Letting it be edited would silently orphan every order that
 *    still carries the old key.
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  AlertTriangle,
  Eye,
  Info,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Store,
  Trash2,
  Truck,
} from "lucide-react";
import {
  getSellerProfile,
  getSellerShipping,
  previewSellerShipping,
  saveSellerShipping,
} from "../../services/sellerService";
import { getShippingProvinces } from "../../services/storefrontService";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";
import {
  etaText,
  SHIPPING_LIMITS,
  SHIPPING_PRICING_LABELS,
  SHIPPING_PRICING_MODES,
  SHIPPING_ZONE_LABELS,
  SHIPPING_ZONE_TYPES,
  type ShippingAddressInput,
  type ShippingMethod,
  type ShippingPricingMode,
  type ShippingQuote,
  type ShippingZone,
  type ShippingZoneType,
} from "../../types/shipping";
import { Switch } from "../../components/admin/Switch";

/** The fields a rate card is edited with. Deliberately the same shape the PUT takes. */
interface DraftProfile {
  isEnabled: boolean;
  freeShippingThreshold: number;
  methods: ShippingMethod[];
}

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none";
const labelClass = "mb-1 block text-xs text-[var(--color-muted)]";
const cardClass = "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm";

function moneyInput(
  value: number,
  onChange: (next: number) => void,
  placeholder = "۰",
): ReactElement {
  return (
    <input
      type="number"
      min={0}
      step={1000}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

/** A key that is unique among the current drafts, since the server rejects duplicates. */
function uniqueKey(existing: ShippingMethod[]): string {
  for (let n = existing.length + 1; n < existing.length + 50; n += 1) {
    const candidate = `method-${n}`;
    if (!existing.some((m) => m.key === candidate)) return candidate;
  }
  return `method-${Date.now()}`;
}

function blankMethod(index: number, existing: ShippingMethod[]): ShippingMethod {
  return {
    key: uniqueKey(existing),
    title: `روش ارسال ${index + 1}`,
    kind: "delivery",
    enabled: true,
    carrier: "",
    pricing: { mode: "flat", flatFee: 0, perKgFee: 0, perItemFee: 0, freeThreshold: 0 },
    eta: { minDays: 1, maxDays: 3 },
    zones: [],
    pickup: { address: "", city: "", province: "", hours: "", instructions: "" },
  };
}

function blankZone(): ShippingZone {
  return {
    label: "",
    type: "all",
    provinces: [],
    postalPrefixes: [],
    center: { lat: null, lng: null },
    radiusKm: 0,
    feeOverride: null,
    etaOverride: null,
    enabled: true,
  };
}

export function ShippingSeller() {
  const [draft, setDraft] = useState<DraftProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [provinces, setProvinces] = useState<string[]>([]);

  const [preview, setPreview] = useState<ShippingQuote | null>(null);
  const [previewAddress, setPreviewAddress] = useState<ShippingAddressInput>({});
  const [previewBasket, setPreviewBasket] = useState({ subtotal: 0, weightKg: 0, qty: 1 });
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getSellerShipping();
      setDraft({
        isEnabled: res.isEnabled,
        freeShippingThreshold: res.freeShippingThreshold,
        methods: res.methods,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "خواندن تعرفهٔ ارسال ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Same source the buyer form uses, so a province the seller types into a zone
  // is one the shipping engine will actually match. The slug is only used to
  // reach the endpoint — the payload is the same for every store.
  useEffect(() => {
    let cancelled = false;
    getSellerProfile()
      .then((profile) => (cancelled ? null : getShippingProvinces(profile.slug)))
      .then((list) => {
        if (!cancelled && list) setProvinces(list);
      })
      .catch(() => {
        // A missing dropdown is a degraded editor, not a broken page: the seller
        // can still type a province, and the server will reject a bad one on save.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = useCallback((next: Partial<DraftProfile>) => {
    setDraft((d) => (d ? { ...d, ...next } : d));
    setSaved(false);
  }, []);

  const patchMethod = useCallback(
    (index: number, next: Partial<ShippingMethod>) => {
      setDraft((d) => {
        if (!d) return d;
        const methods = d.methods.slice();
        methods[index] = { ...methods[index], ...next };
        return { ...d, methods };
      });
      setSaved(false);
    },
    [],
  );

  const patchZone = useCallback(
    (methodIndex: number, zoneIndex: number, next: Partial<ShippingZone>) => {
      setDraft((d) => {
        if (!d) return d;
        const method = d.methods[methodIndex];
        const zones = method.zones.slice();
        zones[zoneIndex] = { ...zones[zoneIndex], ...next };
        const methods = d.methods.slice();
        methods[methodIndex] = { ...method, zones };
        return { ...d, methods };
      });
      setSaved(false);
    },
    [],
  );

  /**
   * Client-side refusals, so a seller finds out about a broken rate card while
   * typing rather than after a round-trip. The server enforces all of these
   * again — this is convenience, never the check of record.
   */
  const problems = useMemo(() => {
    if (!draft) return [] as string[];
    const issues: string[] = [];
    if (draft.methods.length > SHIPPING_LIMITS.maxMethods) {
      issues.push(`حداکثر ${faNumber(SHIPPING_LIMITS.maxMethods)} روش ارسال مجاز است.`);
    }
    const keys = draft.methods.map((m) => m.key);
    if (new Set(keys).size !== keys.length) issues.push("کلید روش‌های ارسال باید یکتا باشد.");
    draft.methods.forEach((m) => {
      if (!m.key.trim()) issues.push(`روش «${m.title || "بدون عنوان"}» کلید ندارد.`);
      if (m.zones.length > SHIPPING_LIMITS.maxZonesPerMethod) {
        issues.push(`روش «${m.title}» بیش از ${faNumber(SHIPPING_LIMITS.maxZonesPerMethod)} ناحیه دارد.`);
      }
      m.zones.forEach((z) => {
        if (!z.enabled) return;
        if (z.type === "province" && z.provinces.length === 0) {
          issues.push(`ناحیهٔ «${z.label || z.type}» در روش «${m.title}» استان ندارد.`);
        }
        if (z.type === "postal_code" && z.postalPrefixes.length === 0) {
          issues.push(`ناحیهٔ کدپستی در روش «${m.title}» پیشوند ندارد.`);
        }
        if (z.type === "radius" && (z.center.lat === null || z.center.lng === null)) {
          issues.push(`ناحیهٔ شعاعی در روش «${m.title}» مرکز ندارد.`);
        }
      });
      if (m.kind === "pickup" && !m.pickup.address.trim()) {
        issues.push(`روش «${m.title}» حضوری است و نشانی تحویل ندارد.`);
      }
    });
    return issues;
  }, [draft]);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await saveSellerShipping({
        isEnabled: draft.isEnabled,
        freeShippingThreshold: draft.freeShippingThreshold,
        methods: draft.methods,
      });
      setDraft({
        isEnabled: res.isEnabled,
        freeShippingThreshold: res.freeShippingThreshold,
        methods: res.methods,
      });
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "ذخیرهٔ تعرفهٔ ارسال ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Run the seller's own rules against a hypothetical parcel.
   *
   * The result is the server's number for the server's engine, so what the
   * seller sees here is exactly what a buyer at that address would be quoted —
   * including the cases where their zone list covers nothing.
   */
  async function handlePreview() {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      setPreview(
        await previewSellerShipping({
          subtotal: previewBasket.subtotal,
          totalWeightKg: previewBasket.weightKg,
          totalQty: previewBasket.qty,
          shippingAddress: previewAddress,
        }),
      );
    } catch (e) {
      setPreview(null);
      setPreviewError(e instanceof Error ? e.message : "محاسبهٔ پیش‌نمایش ناموفق بود.");
    } finally {
      setPreviewBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (loadError || !draft) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
        >
          <RefreshCw className="h-4 w-4" /> تلاش دوباره
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">تعرفهٔ ارسال</h2>
          <p className="text-sm text-[var(--color-muted)]">
            آنچه خریدار می‌پردازد اینجاست. هزینهٔ واقعی حامل را بعداً در هر سفارش ثبت
            می‌کنید؛ حاشیهٔ ارسال از تفاضل این دو به دست می‌آید.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || problems.length > 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          ذخیرهٔ تعرفه
        </button>
      </div>

      {saved ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          تعرفهٔ ارسال ذخیره شد و از همین حالا برای خریداران اعمال می‌شود.
        </p>
      ) : null}
      {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}

      {problems.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> پیش از ذخیره این موارد را اصلاح کنید
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">ارسال فعال باشد</p>
            <p className="text-xs text-[var(--color-muted)]">
              خاموش‌کردن یعنی فروشگاه باز می‌ماند و همهٔ سفارش‌ها رایگان ارسال می‌شوند.
            </p>
          </div>
          <Switch
            checked={draft.isEnabled}
            onChange={(v) => patch({ isEnabled: v })}
            label="فعال‌بودن ارسال"
          />
        </div>
        <div className="mt-4 max-w-xs">
          <label className={labelClass}>
            ارسال رایگان برای سفارش بالاتر از (۰ = غیرفعال)
          </label>
          {moneyInput(draft.freeShippingThreshold, (v) => patch({ freeShippingThreshold: v }))}
        </div>
      </div>

      {draft.methods.map((method, mi) => (
        <div key={method.key} className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {method.kind === "pickup" ? (
                <Store className="h-5 w-5 text-[var(--color-primary)]" />
              ) : (
                <Truck className="h-5 w-5 text-[var(--color-primary)]" />
              )}
              <input
                value={method.title}
                onChange={(e) => patchMethod(mi, { title: e.target.value })}
                className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm font-medium text-[var(--color-text)]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={method.enabled}
                onChange={(v) => patchMethod(mi, { enabled: v })}
                label={`فعال‌بودن ${method.title}`}
              />
              <button
                type="button"
                onClick={() =>
                  patch({ methods: draft.methods.filter((_, i) => i !== mi) })
                }
                className="rounded-lg border border-[var(--color-border)] p-2 text-red-600 hover:bg-red-50"
                aria-label={`حذف ${method.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* The key is the handle checkout sends, so it is shown but not editable. */}
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            کلید: <code dir="ltr">{method.key}</code> — با تغییر عنوان تغییر نمی‌کند.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={labelClass}>نوع</span>
              <select
                value={method.kind}
                onChange={(e) =>
                  patchMethod(mi, { kind: e.target.value as ShippingMethod["kind"] })
                }
                className={inputClass}
              >
                <option value="delivery">ارسال به آدرس</option>
                <option value="pickup">دریافت حضوری</option>
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>شرکت حمل (اختیاری)</span>
              <input
                value={method.carrier}
                onChange={(e) => patchMethod(mi, { carrier: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>شیوهٔ قیمت‌گذاری</span>
              <select
                value={method.pricing.mode}
                onChange={(e) =>
                  patchMethod(mi, {
                    pricing: { ...method.pricing, mode: e.target.value as ShippingPricingMode },
                  })
                }
                className={inputClass}
              >
                {SHIPPING_PRICING_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {SHIPPING_PRICING_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {method.pricing.mode === "flat" ? (
              <label className="block">
                <span className={labelClass}>هزینهٔ ثابت ارسال</span>
                {moneyInput(method.pricing.flatFee, (v) =>
                  patchMethod(mi, { pricing: { ...method.pricing, flatFee: v } }),
                )}
              </label>
            ) : null}
            {method.pricing.mode === "weight" ? (
              <label className="block">
                <span className={labelClass}>هزینه به‌ازای هر کیلوگرم</span>
                {moneyInput(method.pricing.perKgFee, (v) =>
                  patchMethod(mi, { pricing: { ...method.pricing, perKgFee: v } }),
                )}
              </label>
            ) : null}
            {method.pricing.mode === "per_item" ? (
              <label className="block">
                <span className={labelClass}>هزینه به‌ازای هر قلم</span>
                {moneyInput(method.pricing.perItemFee, (v) =>
                  patchMethod(mi, { pricing: { ...method.pricing, perItemFee: v } }),
                )}
              </label>
            ) : null}
            {method.pricing.mode === "free" ? (
              <p className="self-end text-xs text-[var(--color-muted)]">
                این روش همیشه رایگان است.
              </p>
            ) : null}
            <label className="block">
              <span className={labelClass}>حداقل روز تحویل</span>
              <input
                type="number"
                min={0}
                value={method.eta.minDays}
                onChange={(e) =>
                  patchMethod(mi, {
                    eta: { ...method.eta, minDays: Math.max(0, Number(e.target.value) || 0) },
                  })
                }
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>حداکثر روز تحویل</span>
              <input
                type="number"
                min={0}
                value={method.eta.maxDays}
                onChange={(e) =>
                  patchMethod(mi, {
                    eta: {
                      ...method.eta,
                      maxDays: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className={inputClass}
              />
            </label>
            {method.pricing.mode !== "free" ? (
              <label className="block">
                <span className={labelClass}>ارسال رایگان بالای مبلغ (۰ = هیچ‌وقت)</span>
                {moneyInput(method.pricing.freeThreshold, (v) =>
                  patchMethod(mi, { pricing: { ...method.pricing, freeThreshold: v } }),
                )}
              </label>
            ) : null}
          </div>

          {method.kind === "pickup" ? (
            <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={labelClass}>نشانی محل تحویل (الزامی)</span>
                <input
                  value={method.pickup.address}
                  onChange={(e) =>
                    patchMethod(mi, { pickup: { ...method.pickup, address: e.target.value } })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>شهر</span>
                <input
                  value={method.pickup.city}
                  onChange={(e) =>
                    patchMethod(mi, { pickup: { ...method.pickup, city: e.target.value } })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>ساعات کاری</span>
                <input
                  value={method.pickup.hours}
                  onChange={(e) =>
                    patchMethod(mi, { pickup: { ...method.pickup, hours: e.target.value } })
                  }
                  className={inputClass}
                />
              </label>
            </div>
          ) : null}

          <div className="mt-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
              <MapPin className="h-4 w-4 text-[var(--color-primary)]" />
              نواحی تحت پوشش
            </p>
            <p className="mb-2 text-xs text-[var(--color-muted)]">
              ناحیهٔ دقیق‌تر برنده است: شعاع، سپس پیشوند کدپستی، سپس استان و در آخر
              «همهٔ ایران».
            </p>
            {method.zones.map((zone, zi) => (
              <div
                key={`${method.key}-zone-${zi}`}
                className="mb-2 rounded-xl border border-[var(--color-border)] p-3"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className={labelClass}>برچسب</span>
                    <input
                      value={zone.label}
                      onChange={(e) => patchZone(mi, zi, { label: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>نوع ناحیه</span>
                    <select
                      value={zone.type}
                      onChange={(e) =>
                        patchZone(mi, zi, { type: e.target.value as ShippingZoneType })
                      }
                      className={inputClass}
                    >
                      {SHIPPING_ZONE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {SHIPPING_ZONE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>مبلغ این ناحیه (خالی = مبنای روش)</span>
                    <input
                      type="number"
                      min={0}
                      value={zone.feeOverride ?? ""}
                      onChange={(e) =>
                        patchZone(mi, zi, {
                          feeOverride:
                            e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                </div>

                {zone.type === "province" ? (
                  <label className="mt-3 block">
                    <span className={labelClass}>استان‌ها (با کاما جدا کنید)</span>
                    <input
                      list={`provinces-${mi}-${zi}`}
                      value={zone.provinces.join("، ")}
                      onChange={(e) =>
                        patchZone(mi, zi, {
                          provinces: e.target.value
                            .split(/[،,]/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className={inputClass}
                    />
                    <datalist id={`provinces-${mi}-${zi}`}>
                      {provinces.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </label>
                ) : null}

                {zone.type === "postal_code" ? (
                  <label className="mt-3 block">
                    <span className={labelClass}>پیشوند کدپستی (با کاما جدا کنید)</span>
                    <input
                      dir="ltr"
                      value={zone.postalPrefixes.join(", ")}
                      onChange={(e) =>
                        patchZone(mi, zi, {
                          postalPrefixes: e.target.value
                            .split(/[،,]/)
                            .map((s) => s.replace(/\D/g, ""))
                            .filter(Boolean),
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                ) : null}

                {zone.type === "radius" ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className={labelClass}>عرض مرکز</span>
                      <input
                        type="number"
                        step="any"
                        value={zone.center.lat ?? ""}
                        onChange={(e) =>
                          patchZone(mi, zi, {
                            center: {
                              ...zone.center,
                              lat: e.target.value === "" ? null : Number(e.target.value),
                            },
                          })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>طول مرکز</span>
                      <input
                        type="number"
                        step="any"
                        value={zone.center.lng ?? ""}
                        onChange={(e) =>
                          patchZone(mi, zi, {
                            center: {
                              ...zone.center,
                              lng: e.target.value === "" ? null : Number(e.target.value),
                            },
                          })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>شعاع (کیلومتر)</span>
                      <input
                        type="number"
                        min={0}
                        value={zone.radiusKm}
                        onChange={(e) =>
                          patchZone(mi, zi, { radiusKm: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className={inputClass}
                      />
                    </label>
                  </div>
                ) : null}

                <div className="mt-3 flex items-center justify-between">
                  <Switch
                    checked={zone.enabled}
                    onChange={(v) => patchZone(mi, zi, { enabled: v })}
                    label={`فعال‌بودن ناحیهٔ ${zone.label || zone.type}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patchMethod(mi, {
                        zones: method.zones.filter((_, i) => i !== zi),
                      })
                    }
                    className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    حذف ناحیه
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => patchMethod(mi, { zones: [...method.zones, blankZone()] })}
              disabled={method.zones.length >= SHIPPING_LIMITS.maxZonesPerMethod}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> افزودن ناحیه
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          patch({ methods: [...draft.methods, blankMethod(draft.methods.length, draft.methods)] })
        }
        disabled={draft.methods.length >= SHIPPING_LIMITS.maxMethods}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> افزودن روش ارسال
      </button>

      {/* ── Preview ───────────────────────────────────────────────────────── */}
      <div className={cardClass}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
          <Eye className="h-4 w-4 text-[var(--color-primary)]" />
          آزمایش روی یک مقصد
        </h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          همین محاسبه‌ای که خریدار می‌بیند، با تعرفهٔ فعلی شما. اگر ناحیه‌ای مقصد را
          پوشش ندهد، همین‌جا مشخص می‌شود.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={labelClass}>استان مقصد</span>
            <select
              value={previewAddress.province ?? ""}
              onChange={(e) =>
                setPreviewAddress((a) => ({ ...a, province: e.target.value }))
              }
              className={inputClass}
            >
              <option value="">— انتخاب کنید —</option>
              {provinces.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>شهر</span>
            <input
              value={previewAddress.city ?? ""}
              onChange={(e) => setPreviewAddress((a) => ({ ...a, city: e.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>کدپستی</span>
            <input
              dir="ltr"
              value={previewAddress.postalCode ?? ""}
              onChange={(e) =>
                setPreviewAddress((a) => ({ ...a, postalCode: e.target.value }))
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>مبلغ سفارش</span>
            {moneyInput(previewBasket.subtotal, (v) =>
              setPreviewBasket((b) => ({ ...b, subtotal: v })),
            )}
          </label>
          <label className="block">
            <span className={labelClass}>وزن (کیلوگرم)</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={previewBasket.weightKg}
              onChange={(e) =>
                setPreviewBasket((b) => ({ ...b, weightKg: Math.max(0, Number(e.target.value) || 0) }))
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>تعداد اقلام</span>
            <input
              type="number"
              min={0}
              value={previewBasket.qty}
              onChange={(e) =>
                setPreviewBasket((b) => ({ ...b, qty: Math.max(0, Number(e.target.value) || 0) }))
              }
              className={inputClass}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={previewBusy}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
        >
          {previewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          محاسبه
        </button>

        {previewError ? <p className="mt-2 text-sm text-red-600">{previewError}</p> : null}

        {preview ? (
          <div className="mt-3 space-y-2">
            {preview.warning ? (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Info className="h-3.5 w-3.5 shrink-0" /> {preview.warning}
              </p>
            ) : null}
            {preview.methods.length === 0 ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                برای این مقصد هیچ روشی قابل ارائه نیست. تا وقتی ناحیه‌ای مقصد را
                پوشش ندهد، خریدار نمی‌تواند سفارش ثبت کند.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
                {preview.methods.map((m) => (
                  <li key={m.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-[var(--color-text)]">
                      {m.title}
                      {m.zoneLabel ? (
                        <span className="text-xs text-[var(--color-muted)]"> · {m.zoneLabel}</span>
                      ) : null}
                      <span className="block text-xs text-[var(--color-muted)]">
                        {etaText(m.eta)}
                      </span>
                    </span>
                    <span className="font-medium text-[var(--color-text)]">
                      {m.fee === 0
                        ? "رایگان"
                        : formatSellerPrice(m.fee, preview.currency ?? "IRR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {preview.unavailable.length > 0 ? (
              <ul className="space-y-1 text-xs text-[var(--color-muted)]">
                {preview.unavailable.map((u) => (
                  <li key={u.key}>
                    {u.title}: {u.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ShippingSeller;
