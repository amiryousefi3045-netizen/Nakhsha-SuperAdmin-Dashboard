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
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import "./App.css";

function RequireAuth({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
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
