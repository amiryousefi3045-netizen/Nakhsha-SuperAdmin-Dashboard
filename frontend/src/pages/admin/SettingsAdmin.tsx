import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, KeyRound, LogOut, ShieldCheck, Save } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useAdminFetch } from "../../hooks/useAdminFetch";
import {
  adminLogoutAll,
  disableAdminTotp,
  enableAdminTotp,
  getAdminSettings,
  getAdminTotpStatus,
  provisionAdminTotp,
  updateAdminProfile,
} from "../../services/adminService";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { faNumber, formatDateTime } from "../../lib/adminFormat";
import type { AdminTotpStatus } from "../../types/admin";

const SETTING_LABEL: Record<string, string> = {
  SUPER_ADMIN_PHONE: "شماره سوپر ادمین",
  JWT_SECRET: "راز JWT",
  MONGODB_URI: "اتصال مونگودب",
  REFRESH_TOKEN_SECRET: "راز توکن تازه‌سازی",
  OTP_SECRET: "راز کد یکبارمصرف",
  ALLOWED_ORIGINS: "دامنه‌های مجاز",
  SENTRY_DSN: "ردیابی خطا (Sentry)",
};

// ── 2FA (TOTP) section ─────────────────────────────────────────────────────

function TwoFactorSection() {
  const [status, setStatus] = useState<AdminTotpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [provisionUri, setProvisionUri] = useState<string | null>(null);
  const [provisionSecret, setProvisionSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Load status on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getAdminTotpStatus();
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "خطا در دریافت وضعیت ۲FA");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleProvision = async () => {
    setBusy(true);
    setMsg(null);
    setError(null);
    setProvisionUri(null);
    setProvisionSecret(null);
    try {
      const result = await provisionAdminTotp();
      setProvisionUri(result.otpauthUri);
      setProvisionSecret(result.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در مقداردهی اولیه");
    } finally {
      setBusy(false);
    }
  };

  const handleEnable = async () => {
    if (!code || code.length !== 6) return setMsg("کد ۶ رقمی را وارد کنید.");
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await enableAdminTotp(code);
      setStatus({ enabled: true, provisioned: true });
      setProvisionUri(null);
      setProvisionSecret(null);
      setCode("");
      setMsg("احراز هویت دومرحله‌ای فعال شد.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "کد نادرست است.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!code || code.length !== 6) return setMsg("کد ۶ رقمی را وارد کنید.");
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await disableAdminTotp(code);
      setStatus({ enabled: false, provisioned: true });
      setCode("");
      setMsg("احراز هویت دومرحله‌ای غیرفعال شد.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "کد نادرست است.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
          <ShieldCheck className="h-4 w-4 text-[var(--color-primary)]" />
          احراز هویت دومرحله‌ای (TOTP)
        </h3>
        <p className="mt-2 text-sm text-[var(--color-muted)]">در حال بررسی وضعیت...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
        <ShieldCheck className="h-4 w-4 text-[var(--color-primary)]" />
        احراز هویت دومرحله‌ای (TOTP)
      </h3>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}

      <div className="mt-3">
        <StatusBadge
          label={status?.enabled ? "فعال" : status?.provisioned ? "مقداردهی شده (غیرفعال)" : "غیرفعال"}
          tone={status?.enabled ? "green" : "red"}
        />
      </div>

      {!status?.enabled && !provisionUri && (
        <button
          type="button"
          onClick={handleProvision}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50"
        >
          {busy ? "در حال دریافت..." : "مقداردهی اولیه"}
        </button>
      )}

      {provisionUri && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <p className="text-sm font-medium text-[var(--color-text)] mb-2">
            QR 코드 را در اپلیکیشن Google Authenticator اسکن کنید:
          </p>

          {/* Simple QR placeholder — show the otpauth URI so user can add it manually */}
          <a
            href={provisionUri}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-[var(--color-primary)] break-all hover:underline mb-3"
          >
            {provisionUri}
          </a>

          <p className="text-xs text-[var(--color-muted)] mb-3">
            اگر QR را اسکن نمی‌کنید، این کلید را به صورت دستی وارد کنید:
          </p>
          <p
            className="mb-3 rounded-lg bg-white border border-[var(--color-border)] px-3 py-2 font-mono text-sm select-all break-all"
            style={{ direction: "ltr", textAlign: "left" }}
          >
            {provisionSecret}
          </p>

          <label className="block mb-2">
            <span className="text-xs text-[var(--color-muted)]">کد ۶ رقمی اپلیکیشن را وارد کنید:</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="123456"
            />
          </label>

          <button
            type="button"
            onClick={handleEnable}
            disabled={busy || code.length !== 6}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "در حال بررسی..." : "فعال کردن"}
          </button>
        </div>
      )}

      {status?.enabled && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <p className="text-sm text-[var(--color-muted)] mb-3">
            برای غیرفعال کردن، کد ۶ رقمی اپلیکیشن را وارد کنید:
          </p>
          <div className="flex gap-3 items-end">
            <label className="block flex-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                placeholder="123456"
              />
            </label>
            <button
              type="button"
              onClick={handleDisable}
              disabled={busy || code.length !== 6}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "در حال بررسی..." : "غیرفعال کردن"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsAdmin() {
  const { user, refreshMe, logout } = useAuth();
  const navigate = useNavigate();
  const { data: settings, isLoading, error } = useAdminFetch(getAdminSettings);

  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setBio(user.bio ?? "");
    }
  }, [user]);

  const handleSaveProfile = async () => {
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      await updateAdminProfile({ name: name.trim(), bio: bio.trim() });
      await refreshMe();
      setProfileMsg("پروفایل به‌روزرسانی شد.");
    } catch (e) {
      setProfileMsg(e instanceof Error ? e.message : "خطا در ذخیره پروفایل");
    } finally {
      setProfileBusy(false);
    }
  };

  const handleLogoutAll = useCallback(async () => {
    setLogoutBusy(true);
    setLogoutError(null);
    try {
      await adminLogoutAll();
      logout();
      navigate("/admin/login", { replace: true });
    } catch (e) {
      setLogoutError(e instanceof Error ? e.message : "بستن نشست‌ها ناموفق بود");
    } finally {
      setLogoutBusy(false);
      setLogoutOpen(false);
    }
  }, [logout, navigate]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-text)]">تنظیمات</h2>
        <p className="text-sm text-[var(--color-muted)]">وضعیت زیرساخت و حساب سوپر ادمین</p>
      </div>

      {/* Database status */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
          <Database className="h-4 w-4 text-[var(--color-primary)]" />
          وضعیت دیتابیس
        </h3>
        {error ? (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        ) : isLoading || !settings ? (
          <p className="mt-2 text-sm text-[var(--color-muted)]">در حال بررسی...</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <StatusBadge
              label={settings.database.status === "up" ? "در دسترس" : "غیر در دسترس"}
              tone={settings.database.status === "up" ? "green" : "red"}
            />
            <span className="text-xs text-[var(--color-muted)]">
              آخرین بررسی: {formatDateTime(settings.database.lastCheckedAt)}
            </span>
          </div>
        )}
      </div>

      {/* Environment settings */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
          <KeyRound className="h-4 w-4 text-[var(--color-primary)]" />
          متغیرهای محیطی
        </h3>
        {error ? (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        ) : isLoading || !settings ? (
          <p className="mt-2 text-sm text-[var(--color-muted)]">در حال دریافت...</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {settings.settings.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--color-text)]">{SETTING_LABEL[s.key] ?? s.key}</span>
                <StatusBadge
                  label={s.isConfigured ? "پیکربندی شده" : "تنظیم نشده"}
                  tone={s.isConfigured ? "green" : "red"}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2FA (TOTP) */}
      <TwoFactorSection />

      {/* Profile */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-text)]">پروفایل ادمین</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">نام</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>
          <div className="sm:col-span-2">
            <label className="block">
              <span className="mb-1 block text-sm text-[var(--color-muted)]">بیوگرافی</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </label>
          </div>
        </div>
        {profileMsg ? (
          <p className="mt-3 text-sm text-[var(--color-muted)]">{profileMsg}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSaveProfile()}
          disabled={profileBusy}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {profileBusy ? "در حال ذخیره..." : "ذخیره پروفایل"}
        </button>
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-red-700">منطقه حساس</h3>
        <p className="mt-1 text-sm text-red-600">
          بستن همه نشست‌های فعال شما ({faNumber(1)} نشست فعلی). پس از آن باید دوباره با OTP وارد شوید.
        </p>
        {logoutError ? <p className="mt-2 text-sm text-red-700">{logoutError}</p> : null}
        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          <LogOut className="h-4 w-4" />
          بستن همه نشست‌ها
        </button>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="بستن همه نشست‌ها"
        message="آیا از بستن همه نشست‌های فعال مطمئن هستید؟ باید دوباره با شماره و کد OTP وارد شوید."
        confirmLabel="بستن نشست‌ها"
        danger
        busy={logoutBusy}
        onConfirm={() => void handleLogoutAll()}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
}

export default SettingsAdmin;