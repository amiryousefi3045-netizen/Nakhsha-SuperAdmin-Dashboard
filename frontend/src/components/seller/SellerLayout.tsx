import { useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Truck,
  Wallet,
  BarChart3,
  FileBarChart2,
  Store,
  Settings,
  MessageSquareText,
  LogOut,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSellerFetch } from "../../hooks/useSellerFetch";
import { getSellerProfile } from "../../services/sellerService";
import cn from "classnames";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/seller", label: "داشبورد", icon: LayoutDashboard, end: true },
  { to: "/seller/products", label: "محصولات", icon: Package },
  { to: "/seller/inventory", label: "موجودی", icon: Boxes },
  { to: "/seller/orders", label: "سفارش‌ها", icon: ShoppingCart },
  { to: "/seller/fulfillment", label: "ارسال / تحویل", icon: Truck },
  { to: "/seller/reviews", label: "دیدگاه‌ها", icon: MessageSquareText },
  { to: "/seller/finance", label: "مالی و تسویه", icon: Wallet },
  { to: "/seller/analytics", label: "تحلیل عملکرد", icon: BarChart3 },
  { to: "/seller/reports/sales", label: "گزارش فروش", icon: FileBarChart2 },
  { to: "/seller/profile", label: "پروفایل فروشگاه", icon: Store },
  { to: "/seller/settings", label: "تنظیمات", icon: Settings },
];

function SidebarContent({ profile }: { profile?: import("../../types/seller").SellerProfile | null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]">نخشا</p>
          <p className="text-xs text-[var(--color-muted)]">داشبورد فروشنده</p>
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
            {() => (
              <>
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[var(--color-border)] p-3">
        {profile ? (
          <div className="mb-2 rounded-xl bg-[var(--color-primary)]/5 px-3 py-2.5">
            <p className="text-sm font-semibold text-[var(--color-text)]">{profile.storeName || "فروشگاه بدون نام"}</p>
            <p className="text-xs text-[var(--color-muted)]">@{profile.slug || "—"}</p>
          </div>
        ) : null}
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

export function SellerLayout() {
  const { user, logout } = useAuth();
  const { data: profile } = useSellerFetch(getSellerProfile);
  const [mobileOpen, setMobileOpen] = useState(false);
  const storeName = profile?.storeName || user?.name || "فروشنده";

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      {/* Desktop sidebar — first child lands on the right in RTL */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l border-[var(--color-border)] bg-white lg:block">
        <SidebarContent profile={profile} />
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
            <SidebarContent profile={profile} />
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
            <h1 className="text-base font-bold text-[var(--color-text)]">داشبورد فروشنده</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-end sm:block">
              <p className="text-sm font-semibold text-[var(--color-text)]">{storeName}</p>
              <p className="text-xs text-[var(--color-muted)]">{user?.role === "seller" ? "فروشنده" : ""}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
              {user?.name?.charAt(0) || "ف"}
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