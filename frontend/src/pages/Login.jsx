import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../services/auth";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [identifier, setIdentifier] = useState(""); // email or phone
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    // Build payload: detect phone vs email
    const trimmed = identifier.trim();
    const digits = trimmed.replace(/\D/g, "");
    const looksLikePhone = /^\d{10,15}$/.test(digits) && !trimmed.includes("@");
    const payload = looksLikePhone
      ? { phone: digits, password }
      : { email: trimmed.toLowerCase(), password };

    if (!trimmed || !password) {
      setLoading(false);
      setError("لطفاً ایمیل/تلفن و رمز عبور را وارد کنید.");
      return;
    }

    try {
      const { user } = await login(payload);
      setUser(user);
      nav("/");
    } catch (err) {
      if (err?.status === 429) {
        setError("تعداد تلاش‌ها زیاد است. لطفاً کمی بعد دوباره تلاش کنید.");
      } else {
        setError(err?.message || "ورود ناموفق. ایمیل/رمز اشتباه است.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">ورود</h1>
      {error && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
          {error}
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <label className="text-sm block">
          ایمیل یا تلفن
          <input
            className="mt-1 w-full rounded-lg border border-nakhsha-border px-3 py-2 hover:border-primary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </label>
        <label className="text-sm block">
          رمز عبور
          <div className="mt-1 flex items-center rounded-lg border border-nakhsha-border bg-white hover:border-primary-400 focus-within:border-primary-500">
            <input
              type={showPwd ? "text" : "password"}
              className="flex-1 rounded-l-lg px-3 py-2 outline-none border-0"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="px-3 py-2 text-sm text-nakhsha-text/60 hover:text-nakhsha-text transition-colors"
              aria-label={showPwd ? "پنهان کردن رمز" : "نمایش رمز"}
            >
              {showPwd ? "پنهان" : "نمایش"}
            </button>
          </div>
        </label>
        <button
          disabled={loading}
          className="w-full bg-primary-600 text-white rounded-lg py-2"
        >
          {loading ? "در حال ورود…" : "ورود"}
        </button>
      </form>
      <div className="text-sm text-nakhsha-text/60 mt-3">
        حساب ندارید؟{" "}
        <Link to="/register" className="text-primary-600">
          ثبت‌نام
        </Link>
      </div>
    </div>
  );
}
