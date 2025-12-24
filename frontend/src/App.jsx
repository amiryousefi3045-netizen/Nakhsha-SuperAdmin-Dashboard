import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import CraftDetail from "./pages/CraftDetail";
import CreateCraft from "./pages/CreateCraft";
import EditCraft from "./pages/EditCraft";
import Login from "./pages/Login";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import MyCrafts from "./pages/MyCrafts";
import ProfilePage from "./pages/ProfilePage";
import PublicProfile from "./pages/PublicProfile";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import "./App.css";

function RequireAuth({ children, roles }) {
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
  if (roles && !roles.includes(user.role)) {
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

  return children;
}

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
            <Route
              path="create-craft"
              element={
                <RequireAuth roles={["admin", "user"]}>
                  <CreateCraft />
                </RequireAuth>
              }
            />
            <Route path="login" element={<Login />} />
            <Route path="terms" element={<Terms />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="profile" element={<ProfilePage />} />
            {/* Public profile routes */}
            <Route path="u/:handle" element={<PublicProfile />} />
            <Route path="profile/:id" element={<PublicProfile />} />
            <Route
              path="my"
              element={
                <RequireAuth>
                  <MyCrafts />
                </RequireAuth>
              }
            />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

// Placeholder components until we create the actual pages
const CreateCraftPlaceholder = () => null;

export default App;
