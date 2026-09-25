import type { FC, ReactNode } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import CraftDetail from "./pages/CraftDetail";
import EditCraft from "./pages/EditCraft";
import Login from "./pages/Login";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import MyCrafts from "./pages/MyCrafts";
import ProfilePage from "./pages/ProfilePage";
import PublicProfile from "./pages/PublicProfile";
import PublicProfilePage from "./pages/PublicProfilePage";
import PostDetailPage from "./pages/PostDetailPage";
import TourDetailPage from "./pages/TourDetailPage";
import TutorialDetailPage from "./pages/TutorialDetailPage";
import CreateListingTypePage from "./pages/CreateListingTypePage";
import CreateListingWizardPage from "./pages/CreateListingWizardPage";
import { AdminLayout } from "./components/admin/AdminLayout";
import { SuperAdminGuard } from "./components/admin/SuperAdminGuard";
import { SellerGuard } from "./components/seller/SellerGuard";
import { SellerLayout } from "./components/seller/SellerLayout";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import "./App.css";

const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const DashboardAdmin = lazy(() => import("./pages/admin/DashboardAdmin"));
const UsersAdmin = lazy(() => import("./pages/admin/UsersAdmin"));
const ProvidersAdmin = lazy(() => import("./pages/admin/ProvidersAdmin"));
const ListingsAdmin = lazy(() => import("./pages/admin/ListingsAdmin"));
const CraftsAdmin = lazy(() => import("./pages/admin/CraftsAdmin"));
const CommentsAdmin = lazy(() => import("./pages/admin/CommentsAdmin"));
const AuditLogsAdmin = lazy(() => import("./pages/admin/AuditLogsAdmin"));
const AdminPayouts = lazy(() => import("./pages/admin/AdminPayouts"));
const NotificationQueueAdmin = lazy(() => import("./pages/admin/NotificationQueueAdmin"));
const SettingsAdmin = lazy(() => import("./pages/admin/SettingsAdmin"));

const DashboardSeller = lazy(() => import("./pages/seller/DashboardSeller"));
const ProfileSeller = lazy(() => import("./pages/seller/ProfileSeller"));
const AnalyticsSeller = lazy(() => import("./pages/seller/AnalyticsSeller"));
const ProductsSeller = lazy(() => import("./pages/seller/ProductsSeller"));
const ProductFormSeller = lazy(() => import("./pages/seller/ProductFormSeller"));
const ProductDetailSeller = lazy(() => import("./pages/seller/ProductDetailSeller"));
const InventorySeller = lazy(() => import("./pages/seller/InventorySeller"));
const StockHistorySeller = lazy(() => import("./pages/seller/StockHistorySeller"));
const OrdersSeller = lazy(() => import("./pages/seller/OrdersSeller"));
const OrderDetailSeller = lazy(() => import("./pages/seller/OrderDetailSeller"));
const FulfillmentSeller = lazy(() => import("./pages/seller/FulfillmentSeller"));
const FinanceSeller = lazy(() => import("./pages/seller/FinanceSeller"));
const ReviewsSeller = lazy(() => import("./pages/seller/ReviewsSeller"));
const SettingsSeller = lazy(() => import("./pages/seller/SettingsSeller"));

const StorefrontPage = lazy(() => import("./pages/storefront/StorefrontPage"));
const StorefrontProductPage = lazy(
  () => import("./pages/storefront/StorefrontProductPage"),
);
const StorefrontDirectoryPage = lazy(
  () => import("./pages/storefront/StorefrontDirectoryPage"),
);
const BuyerOrderPage = lazy(() => import("./pages/storefront/BuyerOrderPage"));
const BuyerOrdersPage = lazy(() => import("./pages/storefront/BuyerOrdersPage"));

const SellerPageSuspense: FC<{ children: ReactNode }> = ({ children }) => (
  <Suspense
    fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-[var(--color-muted)]">در حال بارگذاری داشبورد فروشنده...</div>
      </div>
    }
  >
    {children}
  </Suspense>
);

const AdminPageSuspense: FC<{ children: ReactNode }> = ({ children }) => (
  <Suspense
    fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-[var(--color-muted)]">در حال بارگذاری پنل مدیریت...</div>
      </div>
    }
  >
    {children}
  </Suspense>
);

interface RequireAuthProps {
  children: ReactNode;
  roles?: string[];
}

const RequireAuth: FC<RequireAuthProps> = ({ children, roles }) => {
  const { user, isLoading } = useAuth();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-gray-600">در حال بارگذاری...</div>
      </div>
    );
  }

  // For modal-only UX, don't navigate to login - just return null or a CTA
  if (!user) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center px-4 text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          برای دسترسی وارد شوید
        </h2>
        <p className="text-gray-600 mb-6">
          برای دسترسی به این بخش ابتدا وارد حساب کاربری‌تان شوید
        </p>
      </div>
    );
  }

  // Check role permissions
  if (roles && !roles.includes(user.role || "")) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center px-4 text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          دسترسی محدود
        </h2>
        <p className="text-gray-600">
          شما دسترسی لازم برای مشاهده این بخش را ندارید
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="craft/:id" element={<CraftDetail />} />
            <Route
              path="craft/:id/edit"
              element={
                <RequireAuth>
                  <EditCraft />
                </RequireAuth>
              }
            />
            {/* Step-0: listing type selector → /create */}
            <Route
              path="create"
              element={
                <RequireAuth>
                  <CreateListingTypePage />
                </RequireAuth>
              }
            />
            {/* Step 1-7: listing wizard → /create/new?type=... */}
            <Route
              path="create/new"
              element={
                <RequireAuth>
                  <CreateListingWizardPage />
                </RequireAuth>
              }
            />
            {/* Legacy routes – redirect to new wizard flow */}
            <Route
              path="create/post"
              element={<Navigate to="/create" replace />}
            />
            <Route
              path="createpostpage"
              element={<Navigate to="/create" replace />}
            />
            <Route
              path="create-craft"
              element={<Navigate to="/create" replace />}
            />
            <Route path="login" element={<Login />} />
            <Route path="terms" element={<Terms />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="profile" element={<ProfilePage />} />
            {/* Public profile routes */}
            <Route path="u/:handle" element={<PublicProfilePage />} />
            <Route path="profile/:id" element={<PublicProfile />} />
            {/* Content detail routes */}
            <Route path="p/:id" element={<PostDetailPage />} />
            <Route path="tour/:id" element={<TourDetailPage />} />
            <Route path="learn/:id" element={<TutorialDetailPage />} />
            {/* Buyer "my orders" — Phase 13 (must precede /store/:slug) */}
            <Route
              path="store/orders"
              element={
                <RequireAuth>
                  <Suspense
                    fallback={<div className="p-8 text-center text-sm text-[var(--color-muted)]">در حال بارگذاری سفارش‌ها...</div>}
                  >
                    <BuyerOrdersPage />
                  </Suspense>
                </RequireAuth>
              }
            />
            {/* Buyer receipt — Phase 12 (must precede /store/:slug) */}
            <Route
              path="store/orders/:orderId"
              element={
                <RequireAuth>
                  <Suspense
                    fallback={<div className="p-8 text-center text-sm text-[var(--color-muted)]">در حال بارگذاری رسید...</div>}
                  >
                    <BuyerOrderPage />
                  </Suspense>
                </RequireAuth>
              }
            />
            {/* Public storefront directory — Phase 15 */}
            <Route
              path="storefronts"
              element={
                <Suspense
                  fallback={<div className="p-8 text-center text-sm text-[var(--color-muted)]">در حال بارگذاری فروشگاه‌ها...</div>}
                >
                  <StorefrontDirectoryPage />
                </Suspense>
              }
            />
            {/* Public storefront — Phase 11 */}
            <Route
              path="store/:slug"
              element={
                <Suspense
                  fallback={<div className="p-8 text-center text-sm text-[var(--color-muted)]">در حال بارگذاری ویترین...</div>}
                >
                  <StorefrontPage />
                </Suspense>
              }
            />
            <Route
              path="store/:slug/p/:productId"
              element={
                <Suspense
                  fallback={<div className="p-8 text-center text-sm text-[var(--color-muted)]">در حال بارگذاری محصول...</div>}
                >
                  <StorefrontProductPage />
                </Suspense>
              }
            />
            <Route
              path="my"
              element={
                <RequireAuth>
                  <MyCrafts />
                </RequireAuth>
              }
            />
          </Route>
          {/* Super admin dashboard */}
          <Route
            path="admin/login"
            element={
              <AdminPageSuspense>
                <AdminLogin />
              </AdminPageSuspense>
            }
          />
          <Route
            path="admin"
            element={
              <SuperAdminGuard>
                <AdminLayout />
              </SuperAdminGuard>
            }
          >
            <Route
              index
              element={
                <AdminPageSuspense>
                  <DashboardAdmin />
                </AdminPageSuspense>
              }
            />
            <Route
              path="users"
              element={
                <AdminPageSuspense>
                  <UsersAdmin />
                </AdminPageSuspense>
              }
            />
            <Route
              path="providers"
              element={
                <AdminPageSuspense>
                  <ProvidersAdmin />
                </AdminPageSuspense>
              }
            />
            <Route
              path="listings"
              element={
                <AdminPageSuspense>
                  <ListingsAdmin />
                </AdminPageSuspense>
              }
            />
            <Route
              path="crafts"
              element={
                <AdminPageSuspense>
                  <CraftsAdmin />
                </AdminPageSuspense>
              }
            />
            <Route
              path="comments"
              element={
                <AdminPageSuspense>
                  <CommentsAdmin />
                </AdminPageSuspense>
              }
            />
            <Route
              path="audit-logs"
              element={
                <AdminPageSuspense>
                  <AuditLogsAdmin />
                </AdminPageSuspense>
              }
            />
            <Route
              path="payouts"
              element={
                <AdminPageSuspense>
                  <AdminPayouts />
                </AdminPageSuspense>
              }
            />
            <Route
              path="notification-queue"
              element={
                <AdminPageSuspense>
                  <NotificationQueueAdmin />
                </AdminPageSuspense>
              }
            />
            <Route
              path="settings"
              element={
                <AdminPageSuspense>
                  <SettingsAdmin />
                </AdminPageSuspense>
              }
            />
          </Route>
          {/* Seller dashboard (independent domain, never nested under /creator) */}
          <Route
            path="seller"
            element={
              <SellerGuard>
                <SellerLayout />
              </SellerGuard>
            }
          >
            <Route
              index
              element={
                <SellerPageSuspense>
                  <DashboardSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="profile"
              element={
                <SellerPageSuspense>
                  <ProfileSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="analytics"
              element={
                <SellerPageSuspense>
                  <AnalyticsSeller />
                </SellerPageSuspense>
              }
            />
            {/* Products catalog — Phase 5 */}
            <Route
              path="products"
              element={
                <SellerPageSuspense>
                  <ProductsSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="products/new"
              element={
                <SellerPageSuspense>
                  <ProductFormSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="products/:id"
              element={
                <SellerPageSuspense>
                  <ProductDetailSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="products/:id/edit"
              element={
                <SellerPageSuspense>
                  <ProductFormSeller />
                </SellerPageSuspense>
              }
            />
            {/* Inventory — Phase 6 */}
            <Route
              path="inventory"
              element={
                <SellerPageSuspense>
                  <InventorySeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="inventory/:productId/history"
              element={
                <SellerPageSuspense>
                  <StockHistorySeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="orders"
              element={
                <SellerPageSuspense>
                  <OrdersSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="orders/:id"
              element={
                <SellerPageSuspense>
                  <OrderDetailSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="fulfillment"
              element={
                <SellerPageSuspense>
                  <FulfillmentSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="reviews"
              element={
                <SellerPageSuspense>
                  <ReviewsSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="finance"
              element={
                <SellerPageSuspense>
                  <FinanceSeller />
                </SellerPageSuspense>
              }
            />
            <Route
              path="settings"
              element={
                <SellerPageSuspense>
                  <SettingsSeller />
                </SellerPageSuspense>
              }
            />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
