import { useCallback, useEffect, useState } from "react";
import {
  SlidersHorizontal,
  Users,
  RefreshCw,
  Save,
  UserPlus,
  Phone,
  Store,
  Mail,
  MessageSquare,
  Wallet,
  Trash2,
  Info,
  ShieldCheck,
} from "lucide-react";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import {
  changeSellerTeamMemberRole,
  getSellerSettings,
  getSellerTeam,
  inviteSellerTeamMember,
  removeSellerTeamMember,
  updateSellerSettings,
} from "../../services/sellerService";
import type {
  PayoutMethod,
  SellerSettings,
  SellerTeam,
  TeamMember,
  TeamMemberRole,
} from "../../types/seller";
import { Switch } from "../../components/admin/Switch";
import { StatusBadge } from "../../components/admin/StatusBadge";
import { formatDateTime } from "../../lib/adminFormat";
import {
  PAYOUT_METHOD_LABEL,
  TEAM_ROLE_LABEL,
  TEAM_ROLE_TONE,
} from "../../lib/sellerFormat";

function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-[var(--color-muted)]">در حال بارگذاری...</div>
    </div>
  );
}

type TabKey = "settings" | "team";

export function SettingsSeller() {
  const [tab, setTab] = useState<TabKey>("settings");
  const {
    data: settings,
    isLoading,
    error,
    reload,
  } = useSellerFetch(getSellerSettings);

  const [form, setForm] = useState<SellerSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Team state ────────────────────────────────────────────────────────────
  const [team, setTeam] = useState<SellerTeam | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamMemberRole>("staff");
  const [inviteNote, setInviteNote] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [teamMsg, setTeamMsg] = useState<string | null>(null);

  // Seed the settings form once when settings arrive.
  useEffect(() => {
    if (settings && form === null) {
      setForm(settings);
    }
  }, [settings, form]);

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    setTeamError(null);
    try {
      const res = await getSellerTeam();
      setTeam(res);
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "بارگذاری اعضای تیم ناموفق بود");
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "team") {
      void loadTeam();
    }
  }, [tab, loadTeam]);

  const handleSaveSettings = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateSellerSettings({
        storefrontPublished: form.storefrontPublished,
        notificationEmail: form.notificationEmail,
        notificationSms: form.notificationSms,
        defaultPayoutMethod: form.defaultPayoutMethod,
      });
      setForm(updated);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "ذخیره تنظیمات ناموفق بود");
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setTeamMsg(null);
    setTeamError(null);
    try {
      await inviteSellerTeamMember({
        phone: invitePhone,
        role: inviteRole,
        ...(inviteNote.trim() ? { note: inviteNote.trim() } : {}),
      });
      setTeamMsg("عضو جدید به تیم فروشگاه اضافه شد.");
      setInvitePhone("");
      setInviteNote("");
      setInviteRole("staff");
      await loadTeam();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "افزودن عضو ناموفق بود");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: TeamMember, role: TeamMemberRole) => {
    if (member.role === role) return;
    setBusyId(member.id);
    setTeamMsg(null);
    try {
      await changeSellerTeamMemberRole(member.id, role);
      setTeam((t) =>
        t
          ? {
              ...t,
              items: t.items.map((m) => (m.id === member.id ? { ...m, role } : m)),
            }
          : t,
      );
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "تغییر نقش ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    if (!window.confirm(`آیا از حذف «${member.name || member.phone}» از تیم فروشگاه مطمئن هستید؟`)) {
      return;
    }
    setBusyId(member.id);
    setTeamMsg(null);
    try {
      await removeSellerTeamMember(member.id);
      setTeam((t) =>
        t
          ? { ...t, items: t.items.filter((m) => m.id !== member.id), total: Math.max(0, t.total - 1) }
          : t,
      );
      setTeamMsg("عضو تیم حذف شد.");
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "حذف عضو ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">تنظیمات فروشگاه</h2>
          <p className="text-sm text-[var(--color-muted)]">مدیریت تنظیمات فروشگاه و اعضای تیم</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-white p-1">
          <button
            type="button"
            onClick={() => setTab("settings")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "settings"
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            تنظیمات فروشگاه
          </button>
          <button
            type="button"
            onClick={() => setTab("team")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "team"
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
            }`}
          >
            <Users className="h-4 w-4" />
            اعضای تیم
          </button>
        </div>
      </div>

      {tab === "settings" ? (
        error ? (
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
        ) : isLoading ? (
          <Loading />
        ) : form ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                <Store className="h-4 w-4 text-[var(--color-primary)]" />
                نمایش فروشگاه
              </h3>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">نمایش در ویترین عمومی</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      فروشگاه شما بعد از انتشار ویترین عمومی سایت نمایان خواهد شد.
                    </p>
                  </div>
                  <Switch
                    checked={form.storefrontPublished}
                    onChange={(v) => setForm((f) => (f ? { ...f, storefrontPublished: v } : f))}
                    label="نمایش در ویترین عمومی"
                  />
                </div>
              </div>

              <h3 className="mt-8 flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                <ShieldCheck className="h-4 w-4 text-[var(--color-primary)]" />
                اعلان‌ها
              </h3>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)]">
                      <Mail className="h-4 w-4 text-[var(--color-muted)]" />
                      اعلان‌های ایمیلی
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">سفارش جدید، اعلان تسویه و موارد دیگر</p>
                  </div>
                  <Switch
                    checked={form.notificationEmail}
                    onChange={(v) => setForm((f) => (f ? { ...f, notificationEmail: v } : f))}
                    label="اعلان ایمیلی"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)]">
                      <MessageSquare className="h-4 w-4 text-[var(--color-muted)]" />
                      اعلان‌های پیامکی
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">اعلان فوری از طریق پیامک</p>
                  </div>
                  <Switch
                    checked={form.notificationSms}
                    onChange={(v) => setForm((f) => (f ? { ...f, notificationSms: v } : f))}
                    label="اعلان پیامکی"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                <Wallet className="h-4 w-4 text-[var(--color-primary)]" />
                روش پیش‌فرض تسویه
              </h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                اگر هنگام درخواست تسویه روشی انتخاب نشود، این روش استفاده می‌شود.
              </p>
              <div className="mt-4">
                <label htmlFor="settings-payout-method" className="mb-1 block text-xs text-[var(--color-muted)]">
                  روش پرداخت پیش‌فرض
                </label>
                <select
                  id="settings-payout-method"
                  value={form.defaultPayoutMethod}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, defaultPayoutMethod: e.target.value as PayoutMethod } : f))
                  }
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                >
                  {Object.keys(PAYOUT_METHOD_LABEL).map((m) => (
                    <option key={m} value={m}>
                      {PAYOUT_METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 flex items-start gap-2 rounded-lg bg-[var(--color-primary)]/5 px-3 py-2.5 text-xs text-[var(--color-muted)]">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                تغییر روش پیش‌فرض فقط روی درخواست‌های بعدی اعمال می‌شود؛ تسویه‌های در جریان را تغییر نمی‌دهد.
              </div>

              {saveError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {saveError}
                </div>
              )}
              {saved && (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  تنظیمات فروشگاه ذخیره شد.
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleSaveSettings()}
                disabled={saving}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
              </button>
            </div>
          </div>
        ) : null
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                  <UserPlus className="h-4 w-4 text-[var(--color-primary)]" />
                  افزودن عضو جدید
                </h3>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  با شماره موبایل کاربری را به تیم فروشگاه دعوت کنید. مدیر یا کارمند؟
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)]/5 px-3 py-2 text-xs text-[var(--color-muted)]">
                <Store className="h-4 w-4 text-[var(--color-primary)]" />
                مالک: {team?.owner?.name || "—"}
                {team?.owner?.phone ? ` (${team.owner.phone})` : ""}
              </div>
            </div>
            <form onSubmit={handleInvite} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <label htmlFor="invite-phone" className="mb-1 block text-xs text-[var(--color-muted)]">
                  شماره موبایل
                </label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
                  <input
                    id="invite-phone"
                    type="text"
                    inputMode="numeric"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 11))}
                    placeholder="09xxxxxxxxx"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2 pl-3 pr-9 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="invite-role" className="mb-1 block text-xs text-[var(--color-muted)]">
                  نقش
                </label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as TeamMemberRole)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                >
                  {Object.keys(TEAM_ROLE_LABEL).map((r) => (
                    <option key={r} value={r}>
                      {TEAM_ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={inviting || invitePhone.length !== 11}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <UserPlus className="h-4 w-4" />
                  {inviting ? "در حال افزودن..." : "افزودن عضو"}
                </button>
              </div>
            </form>
            <div className="mt-3">
              <label htmlFor="invite-note" className="mb-1 block text-xs text-[var(--color-muted)]">
                یادداشت (اختیاری)
              </label>
              <input
                id="invite-note"
                type="text"
                value={inviteNote}
                onChange={(e) => setInviteNote(e.target.value)}
                placeholder="مثلاً: مسئول ثبت سفارش‌ها"
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          </div>

          {teamMsg && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {teamMsg}
            </div>
          )}
          {teamError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {teamError}
            </div>
          )}

          <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--color-text)]">اعضای تیم</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-[var(--color-muted)]">
                  {team ? team.total : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void loadTeam()}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
              >
                <RefreshCw className="h-4 w-4" />
                به‌روزرسانی
              </button>
            </div>

            {teamLoading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-[var(--color-border)]/40" />
                ))}
              </div>
            ) : teamError && !teamMsg ? (
              <p className="p-5 text-sm text-red-600">{teamError}</p>
            ) : !team || team.items.length === 0 ? (
              <p className="p-5 text-sm text-[var(--color-muted)]">
                هنوز عضوی به تیم فروشگاه اضافه نشده است.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-right text-xs text-[var(--color-muted)]">
                      <th className="px-5 py-3 font-medium">نام</th>
                      <th className="px-5 py-3 font-medium">شماره موبایل</th>
                      <th className="px-5 py-3 font-medium">نقش</th>
                      <th className="px-5 py-3 font-medium">یادداشت</th>
                      <th className="px-5 py-3 font-medium">تاریخ عضویت</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {team.items.map((m) => (
                      <tr key={m.id} className="border-b border-[var(--color-border)]/60 last:border-0">
                        <td className="px-5 py-3 font-semibold text-[var(--color-text)]">{m.name || "—"}</td>
                        <td className="px-5 py-3 text-[var(--color-muted)]" dir="ltr">
                          {m.phone || "—"}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge tone={TEAM_ROLE_TONE[m.role]} label={TEAM_ROLE_LABEL[m.role]} />
                        </td>
                        <td className="max-w-40 truncate px-5 py-3 text-[var(--color-muted)]">{m.note || "—"}</td>
                        <td className="px-5 py-3 text-[var(--color-muted)]">{formatDateTime(m.createdAt)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              value={m.role}
                              disabled={busyId === m.id}
                              onChange={(e) => void handleRoleChange(m, e.target.value as TeamMemberRole)}
                              className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
                              title={`تغییر نقش ${m.name || m.phone}`}
                            >
                              {Object.keys(TEAM_ROLE_LABEL).map((r) => (
                                <option key={r} value={r}>
                                  {TEAM_ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => void handleRemove(m)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsSeller;