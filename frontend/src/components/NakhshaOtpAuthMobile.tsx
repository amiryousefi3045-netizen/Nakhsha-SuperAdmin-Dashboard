import { useState, useEffect } from "react";
import { otpStart } from "../services/auth";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";

interface OtpError extends Error {
  status?: number;
  retryAfterSeconds?: number;
}

export default function NakhshaOtpAuthMobile() {
  const nav = useNavigate();
  const { loginWithOtpVerify } = useAuth();
  const [step, setStep] = useState<"PHONE" | "CODE">("PHONE");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [loading, setLoading] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);
  const [rateLimitActive, setRateLimitActive] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [lastSubmittedCode, setLastSubmittedCode] = useState<string | null>(
    null
  );

  const phoneRegex = /^09\d{9}$/;
  const isPhoneValid = phoneRegex.test(phone.trim());

  // Run countdown whenever there are seconds left (covers rate-limit and normal resend timer)
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const handlePhoneSubmit = async () => {
    setError(null);
    if (!isPhoneValid) {
      setError("فرمت شماره تلفن صحیح نیست.");
      return;
    }
    setLoading(true);
    try {
      await otpStart(phone.trim());
      setStep("CODE");
      setOtp("");
      setSecondsLeft(120);
    } catch (err) {
      const e = err as OtpError;
      if (e?.status === 429 && e?.retryAfterSeconds) {
        // start live countdown
        setError(null);
        setRateLimitActive(true);
        setSecondsLeft(e.retryAfterSeconds);
      } else {
        setError(e?.message || "خرابی در ارسال کد");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async () => {
    setError(null);
    if (otp.length !== 6) {
      setError("لطفاً کد ۶ رقمی را وارد کنید.");
      return;
    }
    // block if rate-limited or already verifying
    if (rateLimitActive || isVerifying) return;
    // avoid duplicate attempts with same code
    const c = otp.trim();
    if (lastSubmittedCode === c) return;

    setIsVerifying(true);
    setLastSubmittedCode(c);
    setLoading(true);
    try {
      const { user } = await loginWithOtpVerify(phone.trim(), c);
      nav("/");
    } catch (err) {
      const e = err as OtpError;
      if (e?.status === 429 && e?.retryAfterSeconds) {
        // rate-limit: start live countdown and block auto-submit
        setError(null);
        setRateLimitActive(true);
        setSecondsLeft(e.retryAfterSeconds);
      } else {
        setError(
          e?.message ||
            "کد واردشده اشتباه است. کد ارسال را بررسی و دوباره وارد کنید."
        );
      }
    } finally {
      setIsVerifying(false);
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setLoading(true);
    try {
      await otpStart(phone.trim());
      setOtp("");
      setSecondsLeft(120);
    } catch (err) {
      const e = err as OtpError;
      if (e?.status === 429 && e?.retryAfterSeconds) {
        // start live countdown
        setError(null);
        setRateLimitActive(true);
        setSecondsLeft(e.retryAfterSeconds);
      } else {
        setError(e?.message || "خرابی در ارسال مجدد کد");
      }
    } finally {
      setLoading(false);
    }
  };

  // When rate-limit cooldown finishes, clear rate-limit state so user can retry
  useEffect(() => {
    if (rateLimitActive && secondsLeft <= 0) {
      setRateLimitActive(false);
      setLastSubmittedCode(null);
      setError(null);
    }
  }, [rateLimitActive, secondsLeft]);

  const handleBackClick = () => {
    if (step === "PHONE") {
      // Close/dismiss (placeholder for modal or route back)
      nav("/");
    } else {
      setStep("PHONE");
      setOtp("");
      setError(null);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: "#FAFAF7" }}
      dir="rtl"
    >
      {/* Top-left EN toggle placeholder */}
      <div
        className="absolute top-4 left-4 text-xs"
        style={{ color: "#2E2E2E" }}
      >
        EN
      </div>

      {step === "PHONE" ? (
        // PHONE STEP
        <div className="w-full max-w-md">
          <h1
            className="text-4xl font-bold text-center mb-3"
            style={{ color: "#2E2E2E" }}
          >
            خوش آمدید!
          </h1>
          <p className="text-center text-sm mb-8" style={{ color: "#2E2E2E" }}>
            لطفاً شماره موبایلتان را وارد کنید تا بتوانیم با شما در ارتباط
            باشیم.
          </p>

          {error && (
            <div
              className="text-sm rounded-lg px-4 py-2 mb-4 text-center"
              style={{ color: "#DC2626", backgroundColor: "#FEE2E2" }}
            >
              {error}
            </div>
          )}

          {/* Phone Input */}
          <div className="relative mb-3">
            <label
              className={`absolute right-3 text-xs transition-all duration-200 pointer-events-none ${
                phoneFocused || phone
                  ? "top-1 scale-75 origin-right"
                  : "top-3.5 scale-100"
              }`}
              style={{ color: phoneFocused ? "#1A5F7A" : "#2E2E2E" }}
            >
              شماره موبایل
            </label>
            <input
              type="tel"
              placeholder=""
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && isPhoneValid) handlePhoneSubmit();
              }}
              className="w-full px-3 py-3 text-right rounded-lg border-2 transition-colors"
              style={{
                borderColor: phoneFocused || phone ? "#1A5F7A" : "#C7CCD8",
                color: "#2E2E2E",
              }}
            />
          </div>

          {/* Legal text */}
          <p className="text-xs text-center mb-8" style={{ color: "#666" }}>
            با ثبت‌نام در سایت،{" "}
            <a href="#" className="underline" style={{ color: "#1A5F7A" }}>
              قوانین و شرایط
            </a>{" "}
            و{" "}
            <a href="#" className="underline" style={{ color: "#1A5F7A" }}>
              بیانیه حریم خصوصی
            </a>{" "}
            را قبول می‌کنم.
          </p>

          {/* Bottom-left back button (styled as exit/close) */}
          <div className="fixed bottom-8 left-8">
            <button
              onClick={handleBackClick}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
              style={{
                backgroundColor:
                  isPhoneValid && step === "PHONE" ? "#1A5F7A" : "#E5E7EB",
              }}
              aria-label="بازگشت"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke={
                  isPhoneValid && step === "PHONE" ? "#FFFFFF" : "#2E2E2E"
                }
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </div>

          {/* Submit button - styled as right-side floating button or full width */}
          <button
            onClick={handlePhoneSubmit}
            disabled={!isPhoneValid || loading}
            className="w-full py-3 rounded-lg font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#1A5F7A" }}
          >
            {loading ? "لطفاً صبر کنید..." : "ادامه"}
          </button>
        </div>
      ) : (
        // CODE STEP
        <div className="w-full max-w-md">
          <h1
            className="text-3xl font-bold text-center mb-2"
            style={{ color: "#2E2E2E" }}
          >
            کد تأیید را وارد کنید
          </h1>
          <p className="text-center text-sm mb-6" style={{ color: "#666" }}>
            کد تأیید را به شماره <span className="font-semibold">{phone}</span>{" "}
            فرستادیم.
          </p>

          {/* Edit phone link */}
          <div className="text-center mb-6">
            <span style={{ color: "#666" }}>شماره موبایل اشتباه است؟ </span>
            <button
              onClick={() => {
                setStep("PHONE");
                setOtp("");
                setError(null);
              }}
              className="underline font-medium"
              style={{ color: "#1A5F7A" }}
            >
              ویرایش
            </button>
          </div>

          {error && (
            <div
              className="text-sm rounded-lg px-4 py-2 mb-4 text-center"
              style={{ color: "#DC2626", backgroundColor: "#FEE2E2" }}
            >
              {error}
            </div>
          )}

          {/* OTP Input - 6 slots */}
          <div className="flex justify-center gap-2 mb-6">
            {Array.from({ length: 6 }).map((_, idx) => {
              const underlineColor = error
                ? "#DC2626"
                : otpFocused || otp.length > 0
                ? "#1A5F7A"
                : "#C7CCD8";
              return (
                <div
                  key={idx}
                  className="w-12 h-12 flex items-center justify-center text-lg font-semibold transition-colors"
                  style={{
                    borderBottom: `2px solid ${underlineColor}`,
                    color: "#2E2E2E",
                  }}
                >
                  {otp[idx] || ""}
                </div>
              );
            })}
          </div>

          {/* Hidden input for OTP (handles all keyboard input) */}
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 6);
              setOtp(val);
              // user edited digits: allow retrying different code
              setLastSubmittedCode(null);
              if (val.length === 6) {
                // Auto-submit when 6 digits entered with slight delay
                setTimeout(() => handleOtpSubmit(), 300);
              }
            }}
            onKeyPress={(e) => {
              if (e.key === "Enter" && otp.length === 6) handleOtpSubmit();
            }}
            className="absolute opacity-0 w-0 h-0"
            autoFocus
            onFocus={() => setOtpFocused(true)}
            onBlur={() => setOtpFocused(false)}
          />

          {/* Timer or resend button */}
          <div className="text-center mb-8">
            {secondsLeft > 0 ? (
              <p style={{ color: "#666", fontSize: "14px" }}>
                ارسال دوباره کد تأیید تا {formatTimer(secondsLeft)}
              </p>
            ) : (
              <button
                onClick={handleResendCode}
                disabled={loading}
                className="font-medium underline disabled:opacity-50"
                style={{ color: "#1A5F7A" }}
              >
                ارسال مجدد کد
              </button>
            )}
          </div>

          {/* Bottom-left back button */}
          <div className="fixed bottom-8 left-8">
            <button
              onClick={handleBackClick}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: "#1A5F7A" }}
              aria-label="بازگشت"
            >
              <svg
                className="w-6 h-6 text-white"
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
            </button>
          </div>

          {/* Submit button */}
          <button
            onClick={handleOtpSubmit}
            disabled={otp.length !== 6 || loading}
            className="w-full py-3 rounded-lg font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#1A5F7A" }}
          >
            {loading ? "لطفاً صبر کنید..." : "تأیید و ورود"}
          </button>
        </div>
      )}
    </div>
  );
}
