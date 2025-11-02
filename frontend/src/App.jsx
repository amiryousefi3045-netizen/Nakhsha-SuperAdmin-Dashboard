import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import RecipeDetail from "./pages/RecipeDetail";
import CreateRecipe from "./pages/CreateRecipe";
import EditRecipe from "./pages/EditRecipe";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MyRecipes from "./pages/MyRecipes";
import AuthProvider from "./components/AuthProvider";
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
            <Route path="craft/:id" element={<RecipeDetail />} />
            <Route
              path="craft/:id/edit"
              element={
                <RequireAuth>
                  <EditRecipe />
                </RequireAuth>
              }
            />
            <Route
              path="create-craft"
              element={
                <RequireAuth roles={["admin", "user"]}>
                  <CreateRecipe />
                </RequireAuth>
              }
            />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route
              path="my"
              element={
                <RequireAuth>
                  <MyRecipes />
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
const CreateRecipePlaceholder = () => null;

export default App;
