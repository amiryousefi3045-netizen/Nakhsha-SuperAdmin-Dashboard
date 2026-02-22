import React from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthPanel from "../components/auth/AuthPanel";

export default function Login() {
  const nav = useNavigate();

  const handleSuccess = () => nav("/");
  const handleClose = () => nav("/");

  return (
    <div className="min-h-screen bg-nakhsha-bg flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6 block">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            بازگشت به خانه
          </Link>
        </div>
        <AuthPanel onClose={handleClose} onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
