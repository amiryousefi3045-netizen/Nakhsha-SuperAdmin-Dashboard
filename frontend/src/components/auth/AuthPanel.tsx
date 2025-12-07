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
  const [devCode, setDevCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(59);
  const [loading, setLoading] = useState(false);
  const [canAutoSubmit, setCanAutoSubmit] = useState(true);
  const [rateLimitActive, setRateLimitActive] = useState(false);

  // Prevent duplicate/concurrent verify calls
  const isVerifyingRef = useRef(false);
  // Store last submitted code to avoid resubmitting the same failing code
  const lastSubmittedCodeRef = useRef<string | null>(null);

  const phoneRef = useRef<HTMLInputElement | null>(null);

  const phoneRegex = /^09\d{9}$/;
  const isPhoneValid = phoneRegex.test(phone.trim());

  useEffect(() => {
    if (step === "CODE") {
      // don't overwrite an active rate-limit countdown
      if (!rateLimitActive) setSecondsLeft(59);
    }
  }, [step, rateLimitActive]);

  // Run countdown whenever there are seconds left (covers rate-limit and normal resend timer)
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(
      () => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
      1000
    );
    return () => clearInterval(t);
  }, [secondsLeft]);

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
    setDevCode(null);
    if (!isPhoneValid) return setError("فرمت شماره تلفن صحیح نیست.");
    setLoading(true);
    try {
      const res = await otpStart(phone.trim());
      // res may contain retryAfterSeconds
      setStep("CODE");
      setOtp("");
      setSecondsLeft(res?.retryAfterSeconds || 59);
      if ((res as any)?.devCode) {
        setDevCode((res as any).devCode);
      }
    } catch (e: any) {
      if (e?.status === 429 && e?.retryAfterSeconds) {
        // start a live rate-limit countdown
        setError(null);
        setRateLimitActive(true);
        setCanAutoSubmit(false);
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

    // Don't auto-submit if disabled or already verifying
    if (!canAutoSubmit) return;
    if (isVerifyingRef.current) return;

    // Avoid resubmitting the same code repeatedly
    if (lastSubmittedCodeRef.current === c) return;

    isVerifyingRef.current = true;
    lastSubmittedCodeRef.current = c;
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
        // rate limit: show live countdown and block auto-submit
        setError(null);
        setRateLimitActive(true);
        setCanAutoSubmit(false);
        setSecondsLeft(e.retryAfterSeconds);
      } else {
        // Invalid code (400 or other client error): show once and stop auto-retries
        setError(e?.message || "کد واردشده نادرست است.");
        setCanAutoSubmit(false);
        // keep lastSubmittedCodeRef to block re-submission until user changes digits
      }
    } finally {
      isVerifyingRef.current = false;
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
        setError(null);
        setRateLimitActive(true);
        setCanAutoSubmit(false);
        setSecondsLeft(e.retryAfterSeconds);
      } else setError(e?.message || "خطا در ارسال مجدد کد");
    } finally {
      setLoading(false);
    }
  };

  // When rate-limit cooldown finishes, re-enable auto-submit and clear rate-limit state
  useEffect(() => {
    if (rateLimitActive && secondsLeft <= 0) {
      setRateLimitActive(false);
      setCanAutoSubmit(true);
      lastSubmittedCodeRef.current = null;
      setError(null);
    }
  }, [rateLimitActive, secondsLeft]);

  return (
    <div
      className="w-full max-w-md mx-auto p-8"
      dir="rtl"
      style={{ backgroundColor: "#FAFAF7" }}
    >
      {/* Removed tab row and email logic */}
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

          {rateLimitActive && secondsLeft > 0 ? (
            <div className="mt-3 text-sm text-red-600">
              {`لطفاً پس از ${formatTimer(secondsLeft)} دوباره تلاش کنید.`}
            </div>
          ) : null}
          {error && (
            <div className="mt-3 text-sm text-red-600">{error}</div>
          )}

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
            کد را به شماره <span className="font-medium">{phone}</span> فرستادیم.
          </p>

          <div className="mb-4">
            <OtpInput
              value={otp}
              onChange={(v) => {
                // normalize persian digits to english before storing
                const normalized = v
                  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
                  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
                setOtp(normalized);
                // user edited digits: allow auto-submit again
                setCanAutoSubmit(true);
                lastSubmittedCodeRef.current = null;
              }}
              autoFocus={true}
              onComplete={(v) => {
                // Only auto-submit if allowed
                if (v && v.length === 6) handleVerify(v);
              }}
              error={!!error}
              disabled={loading}
            />
          </div>

          {devCode && (
            <div
              className="mb-4 text-sm rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 font-mono text-blue-700 flex items-center gap-2"
              style={{ direction: "ltr" }}
            >
              <span>کد توسعه: {devCode}</span>
              <button
                className="ml-2 px-2 py-1 text-xs bg-blue-100 rounded hover:bg-blue-200"
                onClick={() => navigator.clipboard.writeText(devCode)}
                type="button"
              >
                کپی
              </button>
            </div>
          )}

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

          {rateLimitActive && secondsLeft > 0 ? (
            <div className="text-sm text-red-600 mb-4">
              {`لطفاً پس از ${formatTimer(secondsLeft)} دوباره تلاش کنید.`}
            </div>
          ) : (
            error && <div className="text-sm text-red-600 mb-4">{error}</div>
          )}

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
