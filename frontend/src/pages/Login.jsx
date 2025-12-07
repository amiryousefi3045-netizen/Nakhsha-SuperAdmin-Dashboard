import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { otpStart, otpVerify } from "../services/auth";
import { useAuth } from "../hooks/useAuth";
import OtpInput from "../components/auth/OtpInput";

function normalizePhone(input = "") {
  // convert persian/arabic digits to english, remove non-digits
  const eng = input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[^0-9]/g, "");
  return eng;
}

export default function Login() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState("PHONE");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [devCode, setDevCode] = useState(null);

  const phoneRef = useRef(null);

  const phoneRegex = /^09\d{9}$/;

  useEffect(() => {
    // autofocus phone on mount
    phoneRef.current && phoneRef.current.focus();
  }, []);

  useEffect(() => {
    if (step !== "CODE" || secondsLeft <= 0) return;
    const t = setInterval(
      () => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
      1000
    );
    return () => clearInterval(t);
  }, [step, secondsLeft]);

  const isPhoneValid = phoneRegex.test(normalizePhone(phone));

  const onSend = async (e) => {
    e && e.preventDefault();
    setTouched(true);
    setError(null);
    const ph = normalizePhone(phone);
    if (!phoneRegex.test(ph)) return setError("فرمت شماره تلفن صحیح نیست.");
    setLoading(true);
    try {
      const res = await otpStart(ph);
      setStep("CODE");
      setOtp("");
      setSecondsLeft(res?.retryAfterSeconds || 59);
      if (res && res.devCode) setDevCode(res.devCode);
    } catch (err) {
      if (err && err.status === 429 && err.retryAfterSeconds) {
        setError(
          `لطفاً پس از ${err.retryAfterSeconds} ثانیه دوباره تلاش کنید.`
        );
        setSecondsLeft(err.retryAfterSeconds);
      } else setError((err && err.message) || "خطا در ارسال کد");
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (code) => {
    setError(null);
    const c = (code ?? otp).replace(/[^0-9]/g, "");
    if (c.length !== 6) return setError("لطفاً کد ۶ رقمی را وارد کنید.");
    setLoading(true);
    try {
      const ph = normalizePhone(phone);
      const { token, user } = await otpVerify(ph, c);
      if (user) setUser(user);
      try {
        localStorage.setItem("token", token);
      } catch {
        null;
      }
      nav("/");
    } catch (err) {
      if (err && err.status === 429 && err.retryAfterSeconds) {
        setError(
          `لطفاً پس از ${err.retryAfterSeconds} ثانیه دوباره تلاش کنید.`
        );
        setSecondsLeft(err.retryAfterSeconds);
      } else setError((err && err.message) || "کد وارد شده نادرست است.");
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setError(null);
    setLoading(true);
    try {
      const ph = normalizePhone(phone);
      const res = await otpStart(ph);
      setSecondsLeft(res?.retryAfterSeconds || 59);
      setOtp("");
    } catch (err) {
      if (err && err.status === 429 && err.retryAfterSeconds) {
        setError(
          `لطفاً پس از ${err.retryAfterSeconds} ثانیه دوباره تلاش کنید.`
        );
        setSecondsLeft(err.retryAfterSeconds);
      } else setError((err && err.message) || "خطا در ارسال مجدد کد");
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="max-w-sm mx-auto p-4"
      dir="rtl"
      style={{ backgroundColor: "#FAFAF7" }}
    >
      {/* Clean start: no header, start directly with inputs */}

      {step === "PHONE" && (
        <form onSubmit={onSend} className="space-y-3 text-right">
          <label className="text-sm block" style={{ color: "#2E2E2E" }}>
            شماره موبایل
            <input
              ref={phoneRef}
              placeholder="09123456789"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-right"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouched(true)}
              style={{
                borderColor: touched
                  ? isPhoneValid
                    ? "#1A5F7A"
                    : "#DC2626"
                  : "#C7CCD8",
                color: "#2E2E2E",
              }}
            />
          </label>

          <p className="text-xs" style={{ color: "#666" }}>
            شماره را با ۰۹ وارد کنید (مثلاً 09123456789).
          </p>

          {touched && !isPhoneValid && (
            <div className="text-sm text-red-600">
              فرمت شماره تلفن صحیح نیست.
            </div>
          )}

          <button
            type="submit"
            disabled={!isPhoneValid || loading}
            className="w-full rounded-lg py-2 text-white"
            style={{ backgroundColor: !isPhoneValid ? "#C7CCD8" : "#1A5F7A" }}
          >
            {loading ? "لطفاً صبر کنید..." : "ارسال کد ورود"}
          </button>
        </form>
      )}

      {step === "CODE" && (
        <div className="space-y-3 text-right">
          <p className="text-sm" style={{ color: "#2E2E2E" }}>
            کد ورود را به <span className="font-medium">{phone}</span> ارسال
            کردیم.
          </p>

          <div>
            <OtpInput
              value={otp}
              onChange={(v) => {
                setOtp(v);
              }}
              onComplete={(v) => onVerify(v)}
              autoFocus
              error={!!error}
            />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="text-center">
            {secondsLeft > 0 ? (
              <div style={{ color: "#666" }}>
                ارسال دوباره کد تأیید تا {formatTimer(secondsLeft)}
              </div>
            ) : (
              <button
                onClick={onResend}
                className="text-sm underline"
                style={{ color: "#1A5F7A" }}
                disabled={loading}
              >
                ارسال مجدد کد
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setStep("PHONE");
                setOtp("");
                setError(null);
                setTouched(false);
              }}
              className="flex-1 py-2 rounded-lg"
              style={{ backgroundColor: "#E5E7EB", color: "#2E2E2E" }}
            >
              بازگشت
            </button>
            <button
              onClick={() => onVerify()}
              disabled={otp.length !== 6 || loading}
              className="flex-1 py-2 rounded-lg text-white"
              style={{ backgroundColor: "#1A5F7A" }}
            >
              {loading ? "لطفاً صبر کنید..." : "تأیید و ورود"}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs mt-6 text-center">
        با ورود شما{" "}
        <Link to="/terms" style={{ color: "#1A5F7A" }}>
          قوانین استفاده
        </Link>{" "}
        و{" "}
        <Link to="/privacy" style={{ color: "#1A5F7A" }}>
          حریم خصوصی
        </Link>{" "}
        نخشا را می‌پذیرید.
      </p>

      {/* Dev helper */}
      {devCode && (
        <div className="text-xs text-[#2E2E2E] mt-2">کد تست: {devCode}</div>
      )}
    </div>
  );
}
