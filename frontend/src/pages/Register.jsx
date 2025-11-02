import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register } from "../services/auth";
import { useAuth } from "../hooks/useAuth";

export default function Register() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    // Client-side validation
    const emailOk = /.+@.+\..+/.test(email);
    const phoneOk = /\d{10,15}/.test(phone.replace(/\D/g, ""));
    const passOk = typeof password === "string" && password.length >= 6;
    if (!name || !emailOk || !phoneOk || !passOk) {
      setLoading(false);
      if (!passOk) setError("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      else if (!emailOk) setError("ایمیل نامعتبر است.");
      else if (!phoneOk) setError("شماره تلفن نامعتبر است.");
      else setError("لطفاً همه فیلدها را به‌درستی پر کنید.");
      return;
    }
    try {
      console.log("Submitting registration:", {
        name,
        email,
        phone,
        password: "***",
      });
      const { user } = await register({ name, email, phone, password });
      console.log("Registration successful:", user);
      setUser(user);
      nav("/");
    } catch (err) {
      console.error("Registration error:", err);
      setError(
        `ثبت‌نام ناموفق: ${
          err.response?.data?.message || err.message || "خطایی رخ داده است"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">ثبت‌نام</h1>
      {error && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
          {error}
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <label className="text-sm block">
          نام
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm block">
          ایمیل
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-sm block">
          تلفن
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="text-sm block">
          رمز عبور
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          disabled={loading}
          className="w-full bg-primary-600 text-white rounded-lg py-2"
        >
          {loading ? "در حال ثبت…" : "ثبت‌نام"}
        </button>
      </form>
      <div className="text-sm text-gray-600 mt-3">
        حساب دارید؟{" "}
        <Link to="/login" className="text-primary-600">
          ورود
        </Link>
      </div>
    </div>
  );
}
