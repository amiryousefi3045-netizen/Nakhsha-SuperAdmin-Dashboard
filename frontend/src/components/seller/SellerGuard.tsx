import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

/**
 * SellerGuard — only `seller` accounts may enter /seller/*.
 *
 * - Loading the session  → loader.
 * - Signed out           → redirect to the home page (auth is modal-based).
 * - Signed in but not a seller (user/creator/admin) → redirect home.
 *
 * The backend enforces the same authorization on every /api/seller/* route
 * (requireAuth + requireRole("seller") + requireSellerProfile).
 */
export function SellerGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-[var(--color-muted)]">در حال بررسی دسترسی...</div>
      </div>
    );
  }

  if (!user || user.role !== "seller") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}