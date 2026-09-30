import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Plus,
  Filter,
  Loader2,
  AlertTriangle,
  TicketPercent,
  PauseCircle,
  PlayCircle,
  Download,
  Search,
  Pencil,
  Save,
} from "lucide-react";
import {
  getSellerProfile,
  listSellerCoupons,
  createSellerCoupon,
  updateSellerCoupon,
  updateSellerCouponStatus,
  exportSellerCouponUsageCsv,
} from "../../services/sellerService";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import {
  COUPON_MAX_PERCENT,
  COUPON_STATUSES,
  COUPON_STATUS_LABELS,
  COUPON_TYPE_LABELS,
  isCouponSpendable,
} from "../../types/coupon";
import type {
  CouponCounts,
  CouponStatus,
  CouponType,
  CouponUsage,
  SellerCoupon,
} from "../../types/seller";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber } from "../../lib/adminFormat";
import { formatSellerPrice } from "../../lib/sellerFormat";

/**
 * Discount codes and campaigns (Phase 35, P1-07).
 *
 * The page exists because a campaign is not free: every redemption is money the
 * store gave away, so each row carries its own usage block and the header sums
 * the cost of the current filter. That number, not the number of codes, is what
 * a seller actually needs to see.
 *
 * Two things are deliberately NOT here, because the server refuses them:
 *   - a "delete" button. A campaign that has been spent is paused, not deleted,
 *     because historical orders still point at it.
 *   - client-side money. No field on this page computes a discount; the server
 *     prices the cart. The inputs here are limits, not amounts charged.
 */

type CouponRow = SellerCoupon & { usage: CouponUsage };

/** The code the store already uses on its storefront, so it is not guessed. */
const CURRENCY = "IRR";

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

/** How the discount is written, in the seller's words. */
function describeValue(coupon: Pick<SellerCoupon, "type" | "value" | "maxDiscount">): string {
  if (coupon.type === "percent") {
    const capped = coupon.maxDiscount > 0 ? ` (سقف ${formatSellerPrice(coupon.maxDiscount, CURRENCY)})` : "";
    return `${faNumber(coupon.value)}٪${capped}`;
  }
  return formatSellerPrice(coupon.value, CURRENCY);
}

/**
 * An ISO timestamp has to become the plain `YYYY-MM-DD` that
 * `<input type="date">` speaks, otherwise editing a campaign with a date window
 * would show the field empty and silently clear the window on save.
 */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function remainingLabel(coupon: SellerCoupon): string {
  if (coupon.remainingUses === null) return "نامحدود";
  if (coupon.remainingUses <= 0) return "تکمیل";
  return `${faNumber(coupon.remainingUses)} از ${faNumber(coupon.maxUses)}`;
}

export function CouponsSeller() {
  const [data, setData] = useState<{
    items: CouponRow[];
    total: number;
    page: number;
    limit: number;
    counts: CouponCounts;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<CouponStatus | "">("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [exporting, setExporting] = useState(false);
  // Writing a campaign is `requireManagerOrOwner` on the backend. Mirroring that
  // here is a courtesy: the control is hidden instead of letting the seller fill
  // in a whole form and only then hit a 403.
  const { data: profile } = useSellerFetch(getSellerProfile);
  const canManage = profile?.myRole === "owner" || profile?.myRole === "manager";

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listSellerCoupons({
        page,
        limit: 20,
        ...(filter ? { status: filter } : {}),
        ...(query.trim() ? { q: query.trim() } : {}),
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری کمپین‌ها ناموفق بود");
    } finally {
      setIsLoading(false);
    }
  }, [filter, page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = data?.counts;

  const handleToggle = useCallback(
    async (coupon: CouponRow) => {
      const next: CouponStatus = coupon.status === "active" ? "paused" : "active";
      setBusyId(coupon.id);
      setError(null);
      try {
        await updateSellerCouponStatus(coupon.id, next);
        setNotice(
          next === "paused"
            ? `کمپین «${coupon.code}» متوقف شد و دیگر در سبد خریدار پذیرفته نمی‌شود.`
            : `کمپین «${coupon.code}» دوباره فعال شد.`,
        );
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "تغییر وضعیت کمپین ناموفق بود");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await exportSellerCouponUsageCsv({
        ...(filter ? { status: filter } : {}),
        ...(query.trim() ? { q: query.trim() } : {}),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "دریافت خروجی CSV ناموفق بود");
    } finally {
      setExporting(false);
    }
  }, [filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">کدهای تخفیف و کمپین‌ها</h2>
          <p className="text-sm text-[var(--color-muted)]">
            ساخت کمپین، محدودکردن مصرف و دیدن هزینهٔ واقعی هر کمپین
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
            >
              <Plus className="h-4 w-4" />
              کمپین جدید
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              خروجی CSV
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            <RefreshCw className="h-4 w-4" />
            به‌روزرسانی
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button type="button" className="ms-3 underline" onClick={() => setError(null)}>
            بستن
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {notice}
          <button type="button" className="ms-3 underline" onClick={() => setNotice(null)}>
            بستن
          </button>
        </div>
      ) : null}

      {!canManage ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            ساخت یا تغییر کمپین فقط برای مدیر و صاحب حساب فروشگاه ممکن است. شما می‌توانید کمپین‌ها
            و هزینهٔ آن‌ها را ببینید.
          </span>
        </div>
      ) : null}

      {showCreate && canManage ? (
        <CouponForm
          onDone={async (message) => {
            setNotice(message);
            setShowCreate(false);
            await load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}

      {editing && canManage ? (
        <CouponForm
          initial={editing}
          onDone={async (message) => {
            setNotice(message);
            setEditing(null);
            await load();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="کل کمپین‌ها" value={counts?.total ?? 0} tone="gray" />
          <Stat label="فعال" value={counts?.active ?? 0} tone="green" />
          <Stat label="متوقف" value={counts?.paused ?? 0} tone="amber" />
          <Stat label="تکمیل‌شده" value={counts?.exhausted ?? 0} tone="blue" />
        </div>
      )}

      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-sm">
        <Stat label="هزینهٔ کمپین‌ها (تخفیف داده‌شده)" value={counts?.discountGiven ?? 0} tone="red" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-sm">
        <Filter className="h-4 w-4 text-[var(--color-muted)]" />
        <FilterChip label="همه" active={filter === ""} onClick={() => { setFilter(""); setPage(1); }} />
        {COUPON_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={COUPON_STATUS_LABELS[s]}
            active={filter === s}
            onClick={() => { setFilter(s); setPage(1); }}
          />
        ))}
        <div className="relative ms-auto">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="جست‌وجوی کد یا توضیح"
            className="w-full rounded-lg border border-[var(--color-border)] py-1.5 pe-9 ps-3 text-xs sm:w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
        {data && data.items.length > 0 ? (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)]">
                <th className="px-4 py-3 text-start">کد</th>
                <th className="px-4 py-3 text-start">تخفیف</th>
                <th className="px-4 py-3 text-center">مصرف</th>
                <th className="px-4 py-3 text-center">هزینهٔ کمپین</th>
                <th className="px-4 py-3 text-center">بازهٔ زمانی</th>
                <th className="px-4 py-3 text-center">وضعیت</th>
                <th className="px-4 py-3 text-end">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.items.map((coupon) => (
                <CouponRowView
                  key={coupon.id}
                  coupon={coupon}
                  busy={busyId === coupon.id}
                  canManage={canManage}
                  onToggle={() => void handleToggle(coupon)}
                  onEdit={() => {
                    setEditing(coupon);
                    setShowCreate(false);
                  }}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            <TicketPercent className="mx-auto h-8 w-8 text-[var(--color-muted)]" />
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
              کمپینی با این فیلتر پیدا نشد
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              فیلتر وضعیت را بردارید یا یک کمپین جدید بسازید.
            </p>
          </div>
        )}
      </div>

      {data && data.total > 0 ? (
        <Pagination page={data.page} limit={data.limit} total={data.total} onChange={setPage} />
      ) : null}
    </div>
  );
}

function CouponRowView({
  coupon,
  busy,
  canManage,
  onToggle,
  onEdit,
}: {
  coupon: CouponRow;
  busy: boolean;
  canManage: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  // A campaign can read `active` and still be unspendable (expired, not started,
  // or out of quota), so the badge is derived from the same rules the server
  // applies rather than from the stored status alone.
  const spendable = isCouponSpendable(coupon);
  const statusTone = spendable ? "green" : coupon.status === "paused" ? "gray" : "amber";
  const statusLabel = spendable
    ? "قابل استفاده"
    : coupon.status === "paused"
      ? "متوقف"
      : coupon.remainingUses !== null && coupon.remainingUses <= 0
        ? "تکمیل"
        : "خارج از بازه";

  return (
    <tr>
      <td className="px-4 py-3">
        <p dir="ltr" className="text-start font-semibold text-[var(--color-text)]">
          {coupon.code}
        </p>
        {coupon.description ? (
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{coupon.description}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-center">
        <p className="text-[var(--color-text)]">{describeValue(coupon)}</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {COUPON_TYPE_LABELS[coupon.type]}
        </p>
      </td>
      <td className="px-4 py-3 text-center text-[var(--color-text)]">
        {remainingLabel(coupon)}
        {coupon.maxUsesPerBuyer > 0 ? (
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            هر خریدار: {faNumber(coupon.maxUsesPerBuyer)}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-center">
        <p className="font-semibold text-[var(--color-text)]">
          {formatSellerPrice(coupon.usage.discountGiven, CURRENCY)}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {faNumber(coupon.usage.redemptions)} بار استفاده
        </p>
      </td>
      <td className="px-4 py-3 text-center text-xs text-[var(--color-muted)]">
        <p>از {formatDate(coupon.startsAt)}</p>
        <p>تا {formatDate(coupon.expiresAt)}</p>
        {coupon.minPurchase > 0 ? (
          <p className="mt-0.5">حداقل خرید: {formatSellerPrice(coupon.minPurchase, CURRENCY)}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-center">
        <StatusBadge tone={statusTone} label={statusLabel} />
      </td>
      <td className="px-4 py-3 text-end">
        {canManage ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
            >
              <Pencil className="h-3.5 w-3.5" />
              ویرایش
            </button>
            <button
              type="button"
              onClick={onToggle}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-primary)]/5 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : coupon.status === "active" ? (
                <PauseCircle className="h-3.5 w-3.5" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              {coupon.status === "active" ? "توقف" : "فعال‌سازی"}
            </button>
          </div>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">—</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Create / edit form.
 *
 * Numeric fields are optional and a blank means "no limit" (0 on the wire), so a
 * campaign can be as simple as a code and a percentage. The percentage field is
 * capped in the UI as a courtesy only — the server enforces the same ceiling, so
 * a bypassed form still cannot mint a 200% discount.
 *
 * The same form edits an existing campaign, because the alternative is a trap:
 * codes are unique, so a campaign created with the wrong percentage or the wrong
 * date window cannot be fixed by making a new one with the intended value — only
 * the code itself can change, and a seller who already advertised it cannot
 * reuse that code elsewhere. Editing is the only repair.
 */
function CouponForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: CouponRow;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [code, setCode] = useState(initial?.code ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<CouponType>(initial?.type ?? "percent");
  const [value, setValue] = useState(String(initial?.value ?? 10));
  const [maxDiscount, setMaxDiscount] = useState(initial?.maxDiscount ? String(initial.maxDiscount) : "");
  const [minPurchase, setMinPurchase] = useState(
    initial?.minPurchase ? String(initial.minPurchase) : "",
  );
  const [maxUses, setMaxUses] = useState(initial?.maxUses ? String(initial.maxUses) : "");
  const [maxUsesPerBuyer, setMaxUsesPerBuyer] = useState(
    initial?.maxUsesPerBuyer ? String(initial.maxUsesPerBuyer) : "",
  );
  const [startsAt, setStartsAt] = useState(initial?.startsAt ? toDateInput(initial.startsAt) : "");
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ? toDateInput(initial.expiresAt) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericValue = Number(value);
  const valueValid =
    Number.isInteger(numericValue) &&
    numericValue > 0 &&
    (type === "percent" ? numericValue <= COUPON_MAX_PERCENT : true);
  const canSubmit = code.trim().length >= 4 && valueValid && !busy;

  // Lowering the cap below what has already been spent does not error: the
  // campaign simply becomes unspendable. Saying so here is better than letting
  // the seller discover it from a buyer complaint.
  const usedCount = initial?.usedCount ?? 0;
  const numericMaxUses = Number(maxUses) || 0;
  const willExhaust = isEdit && numericMaxUses > 0 && numericMaxUses <= usedCount;

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    const payload = {
      code: code.trim().toUpperCase(),
      description: description.trim(),
      type,
      value: numericValue,
      maxDiscount: Number(maxDiscount) || 0,
      minPurchase: Number(minPurchase) || 0,
      maxUses: Number(maxUses) || 0,
      maxUsesPerBuyer: Number(maxUsesPerBuyer) || 0,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };
    try {
      if (initial) {
        await updateSellerCoupon(initial.id, payload);
        onDone(`کمپین «${payload.code}» به‌روزرسانی شد.`);
      } else {
        const created = await createSellerCoupon(payload);
        onDone(`کمپین «${created.code}» ساخته شد.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : isEdit ? "ویرایش کمپین ناموفق بود" : "ساخت کمپین ناموفق بود");
    } finally {
      setBusy(false);
    }
  }, [
    code,
    description,
    type,
    numericValue,
    maxDiscount,
    minPurchase,
    maxUses,
    maxUsesPerBuyer,
    startsAt,
    expiresAt,
    initial,
    isEdit,
    onDone,
  ]);

  const field = "mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm";
  const label = "block text-sm font-medium text-[var(--color-text)]";

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-[var(--color-text)]">
        {isEdit ? `ویرایش کمپین «${initial.code}»` : "کمپین جدید"}
      </h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        مبلغ تخفیف را سرور از قیمت واقعی محصولات حساب می‌کند؛ اینجا فقط محدودیت‌ها را تعیین می‌کنید.
        فیلدهای خالی یعنی «بدون محدودیت».
      </p>
      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {willExhaust ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          این کمپین تا امروز {faNumber(usedCount)} بار استفاده شده است. با سقف {faNumber(numericMaxUses)} دیگر
          قابل استفاده نخواهد بود؛ اگر می‌خواهید ادامه دهد، سقف را بیشتر از {faNumber(usedCount)} بگذارید.
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="coupon-code">
            کد تخفیف
          </label>
          <input
            id="coupon-code"
            type="text"
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="مثلاً SUMMER1404"
            className={`${field} text-start`}
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            بین ۴ تا ۳۲ کاراکتر، فقط حروف و رقم انگلیسی.
            {isEdit ? " تغییر کد یعنی کدی که خریداران دارند دیگر کار نمی‌کند." : ""}
          </p>
        </div>
        <div>
          <label className={label} htmlFor="coupon-description">
            توضیح (اختیاری)
          </label>
          <input
            id="coupon-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مثلاً کمپین تابستانه"
            className={field}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="coupon-type">
            نوع تخفیف
          </label>
          <select
            id="coupon-type"
            value={type}
            onChange={(e) => setType(e.target.value as CouponType)}
            className={field}
          >
            {(["percent", "fixed"] as CouponType[]).map((t) => (
              <option key={t} value={t}>
                {COUPON_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="coupon-value">
            {type === "percent" ? "درصد تخفیف" : "مبلغ تخفیف"}
          </label>
          <input
            id="coupon-value"
            type="number"
            min={1}
            max={type === "percent" ? COUPON_MAX_PERCENT : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={field}
          />
          {type === "percent" && !valueValid ? (
            <p className="mt-1 text-xs text-red-600">
              درصد باید عدد صحیح بین ۱ تا {faNumber(COUPON_MAX_PERCENT)} باشد.
            </p>
          ) : null}
        </div>
        {type === "percent" ? (
          <div>
            <label className={label} htmlFor="coupon-max-discount">
              سقف تخفیف (اختیاری)
            </label>
            <input
              id="coupon-max-discount"
              type="number"
              min={0}
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              برای جلوگیری از تخفیف بزرگ روی سبدهای گران.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="coupon-min-purchase">
            حداقل مبلغ خرید
          </label>
          <input
            id="coupon-min-purchase"
            type="number"
            min={0}
            value={minPurchase}
            onChange={(e) => setMinPurchase(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="coupon-max-uses">
            حداکثر مصرف کل
          </label>
          <input
            id="coupon-max-uses"
            type="number"
            min={0}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="coupon-max-per-buyer">
            حداکثر مصرف هر خریدار
          </label>
          <input
            id="coupon-max-per-buyer"
            type="number"
            min={0}
            value={maxUsesPerBuyer}
            onChange={(e) => setMaxUsesPerBuyer(e.target.value)}
            className={field}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="coupon-starts-at">
            شروع (اختیاری)
          </label>
          <input
            id="coupon-starts-at"
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="coupon-expires-at">
            پایان (اختیاری)
          </label>
          <input
            id="coupon-expires-at"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={field}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          انصراف
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isEdit ? (
            <Save className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {isEdit ? "ذخیرهٔ تغییرات" : "ساخت کمپین"}
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "green" | "gray" | "red";
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    gray: "bg-gray-50 text-gray-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className={`mt-1 inline-block rounded-lg px-2 py-0.5 text-xl font-bold ${tones[tone]}`}>
        {faNumber(value)}
      </p>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
        active
          ? "bg-[var(--color-primary)] text-white"
          : "border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
      }`}
    >
      {label}
    </button>
  );
}

function Pagination({
  page,
  limit,
  total,
  onChange,
}: {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = useMemo(() => Math.max(1, Math.ceil(total / Math.max(1, limit))), [total, limit]);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-40"
      >
        قبلی
      </button>
      <span className="text-[var(--color-muted)]">
        صفحه {faNumber(page)} از {faNumber(pages)}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-40"
      >
        بعدی
      </button>
    </div>
  );
}

export default CouponsSeller;
