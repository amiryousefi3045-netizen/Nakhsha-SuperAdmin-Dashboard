import React, { useEffect, useRef, useState } from "react";
import OtpInput from "./OtpInput";
import { otpStart, otpVerify } from "../../services/auth";
import { useAuth } from "../../hooks/useAuth";

type Props = {
  onClose: () => void;
  onSuccess?: (user: any) => void;
};

export default function AuthPanel({ onClose, onSuccess }: Props) {
  const { setUser } = useAuth();
  const [step, setStep] = useState<"PHONE" | "CODE">("PHONE");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(59);
  const [loading, setLoading] = useState(false);

  const phoneRef = useRef<HTMLInputElement | null>(null);

  const phoneRegex = /^09\d{9}$/;
  const isPhoneValid = phoneRegex.test(phone.trim());

  useEffect(() => {
    if (step === "CODE") setSecondsLeft(59);
  }, [step]);

  useEffect(() => {
    if (step !== "CODE" || secondsLeft <= 0) return;
    const t = setInterval(
      () => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
      1000
    );
    return () => clearInterval(t);
  }, [step, secondsLeft]);

  useEffect(() => {
    // autofocus phone on mount
    phoneRef.current && phoneRef.current.focus();
  }, []);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePhoneSubmit = async () => {
    setError(null);
    if (!isPhoneValid) return setError("فرمت شماره تلفن صحیح نیست.");
    setLoading(true);
    try {
      const res = await otpStart(phone.trim());
      // res may contain retryAfterSeconds
      setStep("CODE");
      setOtp("");
      setSecondsLeft(res?.retryAfterSeconds || 59);
      if ((res as any)?.devCode) {
        // show code briefly in dev for debugging
        setError(`کد توسعه: ${(res as any).devCode}`);
      }
    } catch (e: any) {
      if (e?.status === 429 && e?.retryAfterSeconds) {
        setError(`لطفاً پس از ${e.retryAfterSeconds} ثانیه دوباره تلاش کنید.`);
        setSecondsLeft(e.retryAfterSeconds);
      } else setError(e?.message || "خطا در ارسال کد");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code?: string) => {
    setError(null);
    const c = code ?? otp;
    if (c.length !== 6) return setError("لطفاً کد ۶ رقمی را وارد کنید.");
    setLoading(true);
    try {
      const { token, user } = await otpVerify(phone.trim(), c);
      try {
        localStorage.setItem("token", token);
      } catch {}
      if (user) setUser(user);
      onSuccess && onSuccess(user);
      onClose();
    } catch (e: any) {
      if (e?.status === 429 && e?.retryAfterSeconds) {
        setError(`لطفاً پس از ${e.retryAfterSeconds} ثانیه دوباره تلاش کنید.`);
        setSecondsLeft(e.retryAfterSeconds);
      } else setError(e?.message || "کد واردشده نادرست است.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await otpStart(phone.trim());
      setSecondsLeft(res?.retryAfterSeconds || 59);
    } catch (e: any) {
      if (e?.status === 429 && e?.retryAfterSeconds) {
        setError(`لطفاً پس از ${e.retryAfterSeconds} ثانیه دوباره تلاش کنید.`);
        setSecondsLeft(e.retryAfterSeconds);
      } else setError(e?.message || "خطا در ارسال مجدد کد");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="w-full max-w-md mx-auto p-8"
      dir="rtl"
      style={{ backgroundColor: "#FAFAF7" }}
    >
      <span style={{ paddingTop: "10rem" }}></span>
      {step === "PHONE" ? (
        <div>
          <label className="block text-sm mb-2" style={{ color: "#2E2E2E" }}>
            شماره موبایل
          </label>
          <input
            ref={phoneRef}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handlePhoneSubmit()}
            className="w-full px-3 py-3 rounded-lg border-2"
            style={{
              borderColor: phone ? "#1A5F7A" : "#C7CCD8",
              color: "#2E2E2E",
            }}
            placeholder="09123456789"
            aria-label="شماره موبایل"
          />
          <p className="text-xs mt-2" style={{ color: "#666" }}>
            شماره را با ۰۹ وارد کنید (مثلاً 09123456789).
          </p>

          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

          <div className="mt-6">
            <button
              onClick={handlePhoneSubmit}
              disabled={!isPhoneValid || loading}
              className="w-full py-3 rounded-lg text-white"
              style={{ backgroundColor: "#1A5F7A" }}
            >
              {loading ? "لطفاً صبر کنید..." : "دریافت کد ورود"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-bold mb-2" style={{ color: "#2E2E2E" }}>
            کد ورود را وارد کنید
          </h3>
          <p className="text-sm mb-4" style={{ color: "#666" }}>
            کد را به شماره <span className="font-medium">{phone}</span>{" "}
            فرستادیم.
          </p>

          <div className="mb-4">
            <OtpInput
              value={otp}
              onChange={(v) => setOtp(v)}
              autoFocus={true}
              onComplete={(v) => handleVerify(v)}
              error={!!error}
              disabled={loading}
            />
          </div>

          <div className="text-center mb-4">
            {secondsLeft > 0 ? (
              <p style={{ color: "#666" }}>
                ارسال دوباره کد تأیید تا {formatTimer(secondsLeft)}
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={loading}
                className="underline text-sm"
                style={{ color: "#1A5F7A" }}
              >
                ارسال مجدد کد
              </button>
            )}
          </div>

          {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep("PHONE");
                setOtp("");
                setError(null);
              }}
              className="flex-1 py-2 rounded-lg"
              style={{ backgroundColor: "#E5E7EB" }}
            >
              بازگشت
            </button>
            <button
              onClick={() => handleVerify()}
              disabled={otp.length !== 6 || loading}
              className="flex-1 py-2 rounded-lg text-white"
              style={{ backgroundColor: "#1A5F7A" }}
            >
              {loading ? "لطفاً صبر کنید..." : "تأیید و ورود"}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs mt-6 text-center" style={{ color: "#666" }}>
        با ورود شما قوانین استفاده و حریم خصوصی نخشا را می‌پذیرید.
      </p>
    </div>
  );
}
