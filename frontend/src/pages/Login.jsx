import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { otpStart, otpVerify } from "../services/auth";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("PHONE"); // PHONE | CODE
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState(null);

  const phoneRegex = /^09\d{9}$/;

  const sendCode = async (e) => {
    e && e.preventDefault();
    setError("");
    setInfo("");
    const p = phone.trim();
    if (!phoneRegex.test(p)) {
      setError("فرمت شماره تلفن باید به صورت 09xxxxxxxxx باشد.");
      return;
    }
    setLoading(true);
    try {
      const res = await otpStart(p);
      if (res?.devCode) setDevCode(res.devCode);
      setStep("CODE");
      setInfo("کد ورود ارسال شد. لطفاً کد را وارد کنید.");
    } catch (err) {
      if (err?.status === 429 && err?.retryAfterSeconds) {
        setError(
          `لطفاً پس از ${err.retryAfterSeconds} ثانیه دوباره تلاش کنید.`
        );
      } else {
        setError(err?.message || "ارسال کد ناموفق بود.");
      }
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e) => {
    e && e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await otpVerify(phone.trim(), code.trim());
      if (user) setUser(user);
      nav("/");
    } catch (err) {
      if (err?.status === 429 && err?.retryAfterSeconds) {
        setError(
          `لطفاً پس از ${err.retryAfterSeconds} ثانیه دوباره تلاش کنید.`
        );
      } else {
        setError(err?.message || "تأیید کد ناموفق بود.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto p-4" dir="rtl">
      <h1 className="text-xl font-bold mb-4">ورود با تلفن</h1>

      {error && (
        <div className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
          {error}
        </div>
      )}

      {info && (
        <div className="text-[13px] text-[#1A5F7A] bg-[#FAFAF7] border border-[#C7CCD8] rounded-lg px-3 py-2 mb-2">
          {info}
        </div>
      )}

      {step === "PHONE" && (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="text-sm block">
            شماره تلفن
            <input
              placeholder="09xxxxxxxxx"
              className="mt-1 w-full rounded-lg border border-[#C7CCD8] px-3 py-2 focus:outline-none"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2 text-white"
            style={{ backgroundColor: "#1A5F7A" }}
          >
            {loading ? "لطفاً صبر کنید…" : "دریافت کد ورود"}
          </button>
        </form>
      )}

      {step === "CODE" && (
        <form onSubmit={verify} className="space-y-3">
          <label className="text-sm block">
            کد ورود
            <input
              className="mt-1 w-full rounded-lg border border-[#C7CCD8] px-3 py-2 focus:outline-none"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {devCode && (
            <div className="text-xs text-[#2E2E2E]">کد تست: {devCode}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStep("PHONE");
                setCode("");
              }}
              className="flex-1 rounded-lg py-2"
              style={{ backgroundColor: "#D9A441", color: "#2E2E2E" }}
            >
              بازگشت
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg py-2 text-white"
              style={{ backgroundColor: "#1A5F7A" }}
            >
              {loading ? "در حال بررسی…" : "ورود با کد"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
