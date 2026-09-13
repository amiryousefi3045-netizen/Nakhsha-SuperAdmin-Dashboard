import { useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BadgeCheck,
  FileText,
  Hammer,
  MessageSquare,
  ScrollText,
  Settings,
  LogOut,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import cn from "classnames";

const NAV_ITEMS = [
  { to: "/admin", label: "داشبورد", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "کاربران", icon: Users },
  { to: "/admin/providers", label: "ارائه‌دهندگان", icon: BadgeCheck },
  { to: "/admin/listings", label: "محتواها", icon: FileText },
  { to: "/admin/crafts", label: "صنایع دستی", icon: Hammer },
  { to: "/admin/comments", label: "دیدگاه‌ها", icon: MessageSquare },
  { to: "/admin/audit-logs", label: "گزارش عملیات", icon: ScrollText },
  { to: "/admin/settings", label: "تنظیمات", icon: Settings },
];

function SidebarContent() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
          <Hammer className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]">نخشا</p>
          <p className="text-xs text-[var(--color-muted)]">پنل سوپر ادمین</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-text)] hover:bg-[var(--color-primary)]/10",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[var(--color-border)] p-3">
        <Link
          to="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-primary)]/10"
        >
          <ExternalLink className="h-4 w-4" />
          مشاهده سایت
        </Link>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      {/* Desktop sidebar — first child lands on the right in RTL */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l border-[var(--color-border)] bg-white lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 right-0 w-64 bg-white shadow-xl">
            <div className="flex justify-end p-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
                aria-label="بستن منو"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text)] lg:hidden"
              aria-label="باز کردن منو"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base font-bold text-[var(--color-text)]">مدیریت نقشه هنرهای ایران</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-end sm:block">
              <p className="text-sm font-semibold text-[var(--color-text)]">{user?.name || "سوپر ادمین"}</p>
              <p className="text-xs text-[var(--color-muted)]">{faPhone(user?.phone)}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
              {user?.name?.charAt(0) || "ا"}
            </div>
            <button
              type="button"
              onClick={logout}
              title="خروج از حساب"
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function faPhone(phone?: string): string {
  if (!phone) return "";
  return phone.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}