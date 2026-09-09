import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ShieldAlert, LogOut } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import AuthPanel from "../../components/auth/AuthPanel";
import { ROLE_LABEL } from "../../components/admin/StatusBadge";

/**
 * AdminLogin — entry point for the super admin dashboard.
 *
 * After a successful OTP login the account's role decides the outcome:
 *  - super_admin  → redirected into the panel.
 *  - any other role → a refusal card is shown (the server-side guards would
 *    reject /api/admin/* regardless).
 */
export function AdminLogin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: string } | null)?.from ?? "/admin";

  const refused = !!user && user.role !== "super_admin";

  if (user && user.role === "super_admin") {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-[var(--color-text)]">پنل مدیریت سرپرست</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            فقط حساب با نقش «سوپر ادمین» به این پنل دسترسی دارد.
          </p>
        </div>

        {refused ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-red-500" />
            <h2 className="mt-3 text-base font-bold text-red-700">دسترسی محدود</h2>
            <p className="mt-1 text-sm text-red-600">
              حساب شما نقش «{ROLE_LABEL[user!.role] ?? user!.role}» دارد و به پنل سوپر ادمین
              دسترسی ندارد. برای ورود با حساب دیگر ابتدا خارج شوید.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                <LogOut className="h-4 w-4" />
                خروج از حساب
              </button>
              <Link
                to="/"
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                بازگشت به سایت
              </Link>
            </div>
          </div>
        ) : (
          <div className="mb-6 text-center block">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary)]/80"
            >
              بازگشت به سایت
            </Link>
          </div>
        )}

        {!refused ? <AuthPanel onClose={() => navigate("/")} onSuccess={() => navigate(from)} /> : null}
      </div>
    </div>
  );
}

export default AdminLogin;