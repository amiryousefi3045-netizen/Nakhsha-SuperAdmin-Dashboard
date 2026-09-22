import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { RefreshCw, Store, ShieldCheck, Save } from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { getSellerProfile, updateSellerProfile } from "../../services/sellerService";
import type { SellerProfile } from "../../types/seller";
import { faNumber, formatDateTime } from "../../lib/adminFormat";

const VERIFICATION_LABEL: Record<string, string> = {
  unverified: "تأییدنشده",
  pending: "در انتظار تأیید",
  verified: "تأییدشده",
  rejected: "ردشده",
};

interface Editable {
  storeName: string;
  description: string;
  logo: string;
  cover: string;
  contactPhone: string;
  contactEmail: string;
  contactWebsite: string;
  contactInstagram: string;
  contactTelegram: string;
  locationProvince: string;
  locationCity: string;
  locationAddress: string;
  policyShipping: string;
  policyReturns: string;
}

function toEditable(p: SellerProfile): Editable {
  return {
    storeName: p.storeName ?? "",
    description: p.description ?? "",
    logo: p.logo ?? "",
    cover: p.cover ?? "",
    contactPhone: p.contact?.phone ?? "",
    contactEmail: p.contact?.email ?? "",
    contactWebsite: p.contact?.website ?? "",
    contactInstagram: typeof p.contact?.instagram === "string" ? p.contact.instagram : "",
    contactTelegram: typeof p.contact?.telegram === "string" ? p.contact.telegram : "",
    locationProvince: typeof p.location?.province === "string" ? p.location.province : "",
    locationCity: typeof p.location?.city === "string" ? p.location.city : "",
    locationAddress: typeof p.location?.address === "string" ? p.location.address : "",
    policyShipping: p.policies?.shipping ?? "",
    policyReturns: p.policies?.returns ?? "",
  };
}

export function ProfileSeller() {
  const { data, isLoading, error, reload } = useSellerFetch(getSellerProfile);
  const [form, setForm] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the form once when the profile arrives.
  useEffect(() => {
    if (data && form === null) {
      setForm(toEditable(data));
    }
  }, [data, form]);

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const payload = {
        storeName: form.storeName,
        description: form.description,
        logo: form.logo,
        cover: form.cover,
        contact: {
          phone: form.contactPhone,
          email: form.contactEmail,
          website: form.contactWebsite,
          instagram: form.contactInstagram,
          telegram: form.contactTelegram,
        },
        location: {
          province: form.locationProvince,
          city: form.locationCity,
          address: form.locationAddress,
        },
        policies: {
          shipping: form.policyShipping,
          returns: form.policyReturns,
        },
      };
      await updateSellerProfile(payload);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "خطا در ذخیره پروفایل");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
        <p>{error}</p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          <RefreshCw className="h-4 w-4" />
          تلاش مجدد
        </button>
      </div>
    );
  }

  if (isLoading || !data || !form) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-text)]">پروفایل فروشگاه</h2>
        <p className="text-sm text-[var(--color-muted)]">اطلاعات فروشگاه شما برای نمایش در نخشا</p>
      </div>

      {/* Read-only server-controlled status */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="وضعیت فروشگاه" value={data.status === "active" ? "فعال" : data.status} />
        <InfoCard
          label="تأیید هویت"
          value={VERIFICATION_LABEL[data.verification?.status ?? "pending"] ?? "در انتظار"}
        />
        <InfoCard label="شناسه فروشگاه" value={`@${data.slug || "—"}`} />
        <InfoCard
          label="تاریخ ایجاد"
          value={formatDateTime(data.createdAt)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="اطلاعات پایه" icon={<Store className="h-4 w-4" />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="نام فروشگاه">
                <input value={form.storeName} onChange={(e) => set("storeName", e.target.value)} className={inputCls} />
              </Field>
              <Field label="لوگو (آدرس تصویر)">
                <input value={form.logo} onChange={(e) => set("logo", e.target.value)} className={inputCls} />
              </Field>
              <Field label="کاور (آدرس تصویر)" full>
                <input value={form.cover} onChange={(e) => set("cover", e.target.value)} className={inputCls} />
              </Field>
              <Field label="توضیحات فروشگاه" full>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={4}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          <Section title="راه‌های ارتباطی" icon={<ShieldCheck className="h-4 w-4" />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="تلفن">
                <input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={inputCls} />
              </Field>
              <Field label="ایمیل">
                <input value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={inputCls} />
              </Field>
              <Field label="وب‌سایت">
                <input value={form.contactWebsite} onChange={(e) => set("contactWebsite", e.target.value)} className={inputCls} />
              </Field>
              <Field label="اینستاگرام">
                <input value={form.contactInstagram} onChange={(e) => set("contactInstagram", e.target.value)} className={inputCls} />
              </Field>
              <Field label="تلگرام">
                <input value={form.contactTelegram} onChange={(e) => set("contactTelegram", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </Section>

          <Section title="موقعیت مکانی" icon={<MapPinIcon />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="استان">
                <input value={form.locationProvince} onChange={(e) => set("locationProvince", e.target.value)} className={inputCls} />
              </Field>
              <Field label="شهر">
                <input value={form.locationCity} onChange={(e) => set("locationCity", e.target.value)} className={inputCls} />
              </Field>
              <Field label="آدرس" full>
                <input value={form.locationAddress} onChange={(e) => set("locationAddress", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </Section>

          <Section title="سیاست‌ها" icon={<PolicyIcon />}>
            <div className="grid grid-cols-1 gap-4">
              <Field label="سیاست ارسال">
                <textarea value={form.policyShipping} onChange={(e) => set("policyShipping", e.target.value)} rows={3} className={inputCls} />
              </Field>
              <Field label="سیاست بازگشت">
                <textarea value={form.policyReturns} onChange={(e) => set("policyReturns", e.target.value)} rows={3} className={inputCls} />
              </Field>
            </div>
          </Section>
        </div>

        {/* Save column */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[var(--color-text)]">ذخیره تغییرات</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
              فقط فیلدهای قابل ویرایش ارسال می‌شوند؛ مواردی مانند تأیید هویت و وضعیت توسط سرور کنترل می‌شوند.
            </p>
            {saveError ? (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{saveError}</p>
            ) : null}
            {saved ? (
              <p className="mt-3 rounded-lg bg-green-50 p-3 text-xs text-green-700">پروفایل با موفقیت ذخیره شد.</p>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "در حال ذخیره..." : "ذخیره پروفایل"}
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[var(--color-text)]">آمار فروشگاه</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-muted)]">کل محصولات</dt>
                <dd className="font-semibold text-[var(--color-text)]">
                  {faNumber(typeof data.stats?.totalProducts === "number" ? data.stats.totalProducts : 0)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-muted)]">کل سفارش‌ها</dt>
                <dd className="font-semibold text-[var(--color-text)]">
                  {faNumber(typeof data.stats?.totalOrders === "number" ? data.stats.totalOrders : 0)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-muted)]">امتیاز</dt>
                <dd className="font-semibold text-[var(--color-text)]">
                  {faNumber(typeof data.stats?.averageRating === "number" ? data.stats.averageRating : 0)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── UI helpers ──────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]";

function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={full ? "sm:col-span-2" : ""}>
      <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--color-text)]">{value}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
        <span className="text-[var(--color-primary)]">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function MapPinIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
      />
    </svg>
  );
}

function PolicyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-48 animate-pulse rounded bg-[var(--color-border)]/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--color-border)]/50" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-[var(--color-border)]/40" />
    </div>
  );
}

export default ProfileSeller;