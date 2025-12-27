import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AuthModal from "./auth/AuthModal";
import UserAvatarDropdown from "./UserAvatarDropdown";

const Navbar = () => {
  const nav = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const { user } = useAuth();
  return (
    <nav className="bg-nakhsha-bg border-b border-nakhsha-border sticky top-0 z-50">
      <div className="max-w-[1280px] mx-auto px-4 py-3 md:py-4">
        <div className="flex items-center justify-between mb-4 md:mb-0">
          {/* Logo */}
          <div className="flex items-center">
            <Link
              to="/"
              className="flex items-center focus-visible:ring-2 focus-visible:ring-primary-500 rounded-lg px-2 py-1 transition-all duration-200"
              aria-label="نخشا - صفحه اصلی"
            >
              <span className="text-2xl font-bold text-primary-500 ml-2">
                نخشا
              </span>
            </Link>
          </div>

          {/* Search & City Controls - Desktop */}
          <div className="hidden md:flex items-center gap-3 flex-1 mx-4 max-w-2xl">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <div className="flex items-center h-11 rounded-full bg-white shadow-sm border border-nakhsha-border px-4 focus-within:ring-2 focus-within:ring-primary-500/30 focus-within:shadow-md transition-all duration-200">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2"
                  aria-hidden="true"
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
                  className="bg-transparent border-none focus:outline-none w-full mr-2 text-sm md:text-base text-nakhsha-text placeholder-gray-400"
                  aria-label="جستجو در آثار و صنایع‌دستی"
                />
              </div>
            </div>

            {/* City Selector */}
            <div className="relative">
              <button
                className="flex items-center h-11 rounded-full bg-white shadow-sm border border-nakhsha-border px-4 hover:bg-nakhsha-bg focus-visible:ring-2 focus-visible:ring-primary-500 transition-all duration-200 gap-2"
                aria-label="انتخاب شهر"
                title="انتخاب شهر"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5 text-primary-600"
                  aria-hidden="true"
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
                <span className="text-sm text-nakhsha-text whitespace-nowrap">
                  تهران
                </span>
              </button>
            </div>
          </div>

          {/* Actions - Right Side */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Mobile Search Button */}
            <button
              className="md:hidden w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-nakhsha-text/60 focus-visible:ring-2 focus-visible:ring-primary-500 transition-all duration-200"
              aria-label="جستجو"
              title="جستجو"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </button>

            {/* Mobile City Button */}
            <button
              className="md:hidden w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-500 transition-all duration-200"
              aria-label="انتخاب شهر"
              title="انتخاب شهر"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
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
            </button>

            {user ? (
              <>
                <Link
                  to="/create-craft"
                  className="hidden sm:inline-block bg-primary-600 text-white px-4 py-2 rounded-full hover:bg-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-all duration-200 text-sm font-medium"
                  aria-label="ثبت محصول جدید"
                >
                  ثبت محصول
                </Link>

                {/* Mobile Create Button */}
                <Link
                  to="/create-craft"
                  className="sm:hidden w-10 h-10 rounded-full bg-primary-600 hover:bg-primary-700 flex items-center justify-center text-white focus-visible:ring-2 focus-visible:ring-primary-500 transition-all duration-200"
                  aria-label="ثبت محصول جدید"
                  title="ثبت محصول جدید"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                </Link>

                {/* User Avatar Dropdown */}
                <UserAvatarDropdown user={user} />
              </>
            ) : (
              <>
                <>
                  <button
                    onClick={() => setShowAuth(true)}
                    className="hidden sm:inline-block text-sm text-primary-700 hover:text-primary-800 focus-visible:ring-2 focus-visible:ring-primary-500 rounded px-3 py-2 transition-all duration-200"
                    aria-label="ورود به حساب"
                    title="ورود"
                  >
                    ورود
                  </button>
                  <AuthModal
                    isOpen={showAuth}
                    onClose={() => setShowAuth(false)}
                  />
                </>

                {/* Mobile Login Icon */}
                <button
                  onClick={() => setShowAuth(true)}
                  className="sm:hidden w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-nakhsha-text/60 focus-visible:ring-2 focus-visible:ring-primary-500 transition-all duration-200"
                  aria-label="ورود به حساب"
                  title="ورود به حساب"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-6 h-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="md:hidden">
          <div className="flex items-center h-11 rounded-full bg-nakhsha-bg border border-nakhsha-border px-4 focus-within:ring-2 focus-within:ring-primary-500/30 focus-within:shadow-md transition-all duration-200">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              placeholder="جستجو..."
              className="bg-transparent border-none focus:outline-none w-full mr-2 text-sm text-nakhsha-text placeholder-gray-400"
              aria-label="جستجو در آثار و صنایع‌دستی"
            />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
