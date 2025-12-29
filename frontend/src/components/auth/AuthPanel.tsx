import { useEffect, useRef, useState } from "react";
import OtpInput from "./OtpInput";
import { otpStart } from "../../services/auth";
import { useAuth } from "../../hooks/useAuth";

type Props = {
  onClose: () => void;
  onSuccess?: (user: any) => void;
};

export default function AuthPanel({ onClose, onSuccess }: Props) {
  const { loginWithOtpVerify } = useAuth();
  const [step, setStep] = useState<"PHONE" | "CODE">("PHONE");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [loading, setLoading] = useState(false);
  const [canAutoSubmit, setCanAutoSubmit] = useState(true);
  const [rateLimitActive, setRateLimitActive] = useState(false);
  const [hasReturnedFromCode, setHasReturnedFromCode] = useState(false);

  // Prevent duplicate/concurrent verify calls
  const isVerifyingRef = useRef(false);
  // Store last submitted code to avoid resubmitting the same failing code
  const lastSubmittedCodeRef = useRef<string | null>(null);

  const phoneRef = useRef<HTMLInputElement | null>(null);

  const phoneRegex = /^09\d{9}$/;

  const normalizePhone = (p: string) =>
    p
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      .replace(/[\s\-]/g, "");

  const isPhoneValid = phoneRegex.test(normalizePhone(phone || ""));

  useEffect(() => {
    if (step === "CODE") {
      // don't overwrite an active rate-limit countdown
      if (!rateLimitActive) setSecondsLeft(120);
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

  const handleSendCode = async () => {
    setError(null);
    setDevCode(null);
    const phoneNormalized = normalizePhone(phone.trim());
    if (!phoneRegex.test(phoneNormalized))
      return setError("شماره را با ۰۹ وارد کنید (مثلاً 09123456789).");
    setLoading(true);
    try {
      const res = await otpStart(phoneNormalized);
      // If rate-limited, backend should return 429 which is thrown below.
      // Only move to CODE step when start succeeds.
      setStep("CODE");
      setOtp("");
      setSecondsLeft(res?.retryAfterSeconds || 120); // Default to 120 seconds
      setHasReturnedFromCode(false); // Reset when successfully sending code
      if ((res as any)?.devCode) setDevCode((res as any).devCode);
    } catch (e: any) {
      if (e?.status === 429 && e?.retryAfterSeconds) {
        // start a live rate-limit countdown and do NOT enter CODE step
        setError(e?.message || "تعداد درخواست‌ها زیاد بوده");
        setRateLimitActive(true);
        setCanAutoSubmit(false);
        setSecondsLeft(e.retryAfterSeconds);
      } else {
        // Handle other errors more gracefully
        const errorMessage = e?.message || "خطا در ارسال کد";
        setError(errorMessage);
        // If it's a general error, don't enable rate limiting
        if (errorMessage.includes("زیاد") || errorMessage.includes("صبر")) {
          setRateLimitActive(true);
          setCanAutoSubmit(false);
          setSecondsLeft(120); // Default wait time
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (code?: string) => {
    setError(null);
    const c = code ?? otp;
    if (c.length !== 6) return setError("لطفاً کد ۶ رقمی را وارد کنید.");

    if (!canAutoSubmit) return;
    if (isVerifyingRef.current) return;

    if (lastSubmittedCodeRef.current === c) return;

    isVerifyingRef.current = true;
    lastSubmittedCodeRef.current = c;
    setLoading(true);
    try {
      const phoneNormalized = normalizePhone(phone.trim());
      const { user } = await loginWithOtpVerify(phoneNormalized, c);
      onSuccess && onSuccess(user);
      onClose();
    } catch (e: any) {
      if (e?.status === 429 && e?.retryAfterSeconds) {
        setError(e?.message || "تعداد تلاش‌ها زیاد بوده");
        setRateLimitActive(true);
        setCanAutoSubmit(false);
        setSecondsLeft(e.retryAfterSeconds);
      } else {
        const errorMessage = e?.message || "کد واردشده نادرست است.";
        setError(errorMessage);
        setCanAutoSubmit(false);
        // Give user a chance to try again after a short delay
        setTimeout(() => {
          setCanAutoSubmit(true);
          lastSubmittedCodeRef.current = null;
        }, 2000);
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
      setSecondsLeft(res?.retryAfterSeconds || 120);
      setRateLimitActive(false); // Reset rate limit state on successful resend
      setCanAutoSubmit(true);
      if ((res as any)?.devCode) setDevCode((res as any).devCode);
    } catch (e: any) {
      if (e?.status === 429 && e?.retryAfterSeconds) {
        setError(e?.message || "تعداد درخواست‌ها زیاد بوده");
        setRateLimitActive(true);
        setCanAutoSubmit(false);
        setSecondsLeft(e.retryAfterSeconds);
      } else {
        const errorMessage = e?.message || "خطا در ارسال مجدد کد";
        setError(errorMessage);
      }
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
    <div className="w-full max-w-md mx-auto" dir="rtl">
      {/* Close button */}
      <div className="flex justify-end p-3 pb-0">
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors duration-200"
          aria-label="بستن"
        >
          <svg
            className="w-5 h-5 text-gray-400 hover:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="px-4 pb-6 sm:px-6">
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
              onKeyPress={(e) => e.key === "Enter" && handleSendCode()}
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

            {hasReturnedFromCode && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-blue-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <p className="text-sm text-blue-700 font-medium">
                      شماره جدید یا تکرار شماره قبلی
                    </p>
                    <p className="text-xs text-blue-600">
                      می‌توانید همان شماره قبلی را دوباره وارد کنید یا شماره
                      جدید امتحان کنید
                    </p>
                  </div>
                </div>
              </div>
            )}

            {rateLimitActive && secondsLeft > 0 ? (
              <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    className="w-5 h-5 text-orange-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="font-medium text-orange-700">محدودیت زمانی</p>
                </div>
                <p className="text-sm text-orange-600 mb-2">
                  لطفاً پس از{" "}
                  <span className="font-mono font-bold">
                    {formatTimer(secondsLeft)}
                  </span>{" "}
                  دوباره تلاش کنید.
                </p>
                <p className="text-xs text-orange-500">
                  این محدودیت برای امنیت حساب شما اعمال شده است.
                </p>
              </div>
            ) : error ? (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 animate-shake">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-6">
              <button
                onClick={handleSendCode}
                disabled={
                  !isPhoneValid ||
                  loading ||
                  (rateLimitActive && secondsLeft > 0)
                }
                className={`w-full py-3 rounded-lg text-white transition-all duration-200 flex items-center justify-center gap-2 ${
                  !isPhoneValid ||
                  loading ||
                  (rateLimitActive && secondsLeft > 0)
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-[#164F66] transform hover:scale-[1.02]"
                }`}
                style={{ backgroundColor: "#1A5F7A" }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    لطفاً صبر کنید...
                  </>
                ) : rateLimitActive && secondsLeft > 0 ? (
                  <>
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
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    صبر کنید {formatTimer(secondsLeft)}
                  </>
                ) : (
                  <>
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
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                    دریافت کد ورود
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#1A5F7A] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h3
                className="text-xl font-bold mb-2"
                style={{ color: "#2E2E2E" }}
              >
                کد ورود را وارد کنید
              </h3>
              <div className="bg-gray-50 rounded-lg p-3 mb-4 border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm" style={{ color: "#666" }}>
                      کد را به شماره{" "}
                      <span className="font-medium text-[#1A5F7A]">
                        {phone}
                      </span>{" "}
                      فرستادیم.
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#999" }}>
                      اگر پیامک را دریافت نکردید، کمی صبر کنید
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      // Reset all states when changing phone
                      setStep("PHONE");
                      setOtp("");
                      setError(null);
                      setDevCode(null);
                      setRateLimitActive(false);
                      setCanAutoSubmit(true);
                      setSecondsLeft(0);
                      lastSubmittedCodeRef.current = null;
                    }}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    style={{ color: "#1A5F7A" }}
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
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                    تغییر
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-6">
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
                  if (v && v.length === 6) handleVerifyCode(v);
                }}
                error={!!error}
                disabled={loading}
                loading={loading}
              />
            </div>

            {devCode && (
              <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <p className="font-semibold text-blue-700">کد توسعه</p>
                </div>
                <div
                  className="bg-white rounded-lg border border-blue-200 p-3 mb-3 font-mono text-lg font-bold text-center tracking-wider"
                  style={{ direction: "ltr" }}
                >
                  {devCode}
                </div>
                <div className="flex gap-2">
                  <button
                    className="flex-1 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors flex items-center justify-center gap-2"
                    onClick={() => {
                      setOtp(devCode);
                      handleVerifyCode(devCode);
                    }}
                    type="button"
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
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    استفاده خودکار
                  </button>
                  <button
                    className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                    onClick={() => navigator.clipboard.writeText(devCode)}
                    type="button"
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
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    کپی
                  </button>
                </div>
              </div>
            )}

            <div className="text-center mb-6">
              {secondsLeft > 0 ? (
                <div className="bg-gray-50 rounded-lg p-3 border">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <svg
                      className="w-5 h-5 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="font-mono text-lg font-bold text-[#1A5F7A]">
                      {formatTimer(secondsLeft)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">ارسال دوباره کد تأیید</p>
                </div>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 hover:bg-blue-50"
                  style={{ color: "#1A5F7A" }}
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {loading ? "در حال ارسال..." : "ارسال مجدد کد"}
                </button>
              )}
            </div>

            {rateLimitActive && secondsLeft > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="font-medium text-red-700">
                    تعداد تلاش‌ها زیاد بوده
                  </p>
                </div>
                <p className="text-sm text-red-600">
                  لطفاً پس از {formatTimer(secondsLeft)} دوباره تلاش کنید.
                </p>
              </div>
            ) : (
              error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 animate-shake">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-red-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-red-600 text-sm font-medium">{error}</p>
                  </div>
                </div>
              )
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  // Reset all states completely when going back
                  setStep("PHONE");
                  setOtp("");
                  setError(null);
                  setDevCode(null);
                  setRateLimitActive(false);
                  setCanAutoSubmit(true);
                  setSecondsLeft(0);
                  setHasReturnedFromCode(true);
                  lastSubmittedCodeRef.current = null;
                }}
                className="flex-1 py-3 rounded-lg transition-all duration-200 hover:bg-gray-200 flex items-center justify-center gap-2"
                style={{ backgroundColor: "#E5E7EB" }}
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
                بازگشت
              </button>
              <button
                onClick={() => handleVerifyCode()}
                disabled={otp.length !== 6 || loading || !canAutoSubmit}
                className={`flex-1 py-3 rounded-lg text-white transition-all duration-200 flex items-center justify-center gap-2 ${
                  otp.length === 6 && !loading && canAutoSubmit
                    ? "hover:bg-[#164F66] transform hover:scale-[1.02]"
                    : "opacity-50 cursor-not-allowed"
                }`}
                style={{ backgroundColor: "#1A5F7A" }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    لطفاً صبر کنید...
                  </>
                ) : (
                  <>
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    تأیید و ورود
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <p className="text-xs mt-6 text-center" style={{ color: "#666" }}>
          با ورود شما{" "}
          <a
            href="/terms"
            className="text-[#1A5F7A] underline hover:no-underline transition-all"
            target="_blank"
            rel="noopener noreferrer"
          >
            قوانین استفاده
          </a>{" "}
          و{" "}
          <a
            href="/privacy"
            className="text-[#1A5F7A] underline hover:no-underline transition-all"
            target="_blank"
            rel="noopener noreferrer"
          >
            حریم خصوصی
          </a>{" "}
          نخشا را می‌پذیرید.
        </p>
      </div>
    </div>
  );
}
