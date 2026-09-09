import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

/**
 * SuperAdminGuard — only `super_admin` accounts may enter /admin/*.
 *
 * - Loading the session  → loader.
 * - Signed out           → redirect to /admin/login (remembers the origin).
 * - Signed in but not super admin → redirect to /admin/login; the login page
 *   shows the account's actual role and offers a logout button.
 */
export function SuperAdminGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-[var(--color-muted)]">در حال بررسی دسترسی...</div>
      </div>
    );
  }

  if (!user || user.role !== "super_admin") {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <>{children}</>;
}