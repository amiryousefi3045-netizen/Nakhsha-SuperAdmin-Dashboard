import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { logout } from "../services/auth";

const Navbar = () => {
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const onLogout = () => {
    logout();
    setUser(null);
    nav("/");
  };
  return (
    <nav className="bg-white border-b sticky top-0 z-50 h-14">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center h-full justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-bold text-primary-600 ml-2">
                نخشا
              </span>
            </Link>
          </div>

          {/* Search Bar */}
          <div className="flex-1 mx-4 relative max-w-2xl">
            <div className="flex items-center border rounded-md bg-gray-50 px-3 py-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-gray-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
              <input
                type="text"
                placeholder="جستجو در آثار و صنایع‌دستی..."
                className="bg-transparent border-none focus:outline-none w-full mr-2 text-right"
              />
            </div>
          </div>

          {/* City Selector & Actions */}
          <div className="flex items-center space-x-4 mr-4">
            <div className="flex items-center text-gray-700">
              <span>تهران</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 mr-1"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                />
              </svg>
            </div>

            {user ? (
              <>
                <Link
                  to="/create-craft"
                  className="bg-primary-600 text-white px-3 py-1.5 rounded-md hover:bg-primary-700 transition-colors text-sm"
                >
                  ثبت محصول
                </Link>
                <Link to="/my" className="text-sm text-primary-700 mx-2">
                  آثار من
                </Link>
                <div className="mx-3 text-sm text-gray-700">
                  {user.name || "کاربر"} ({user.role})
                </div>
                <button onClick={onLogout} className="text-sm text-red-600">
                  خروج
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm text-primary-700">
                  ورود
                </Link>
                <Link
                  to="/register"
                  className="bg-primary-600 text-white px-3 py-1.5 rounded-md hover:bg-primary-700 transition-colors text-sm"
                >
                  ثبت‌نام
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
