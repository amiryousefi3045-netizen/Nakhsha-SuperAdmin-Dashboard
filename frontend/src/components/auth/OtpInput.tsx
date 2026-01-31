import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";

type Props = {
  value: string;
  length?: number;
  autoFocus?: boolean;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  error?: boolean;
  loading?: boolean;
};

const persianToEnglish = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));

export default function OtpInput({
  value,
  length = 6,
  autoFocus = false,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  loading = false,
}: Props) {
  const digits = value.split("").slice(0, length);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const prevCompleteRef = useRef(false);
  const prevCompleteValueRef = useRef<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (autoFocus && refs.current[0]) refs.current[0].focus();
  }, [autoFocus]);

  // Call onComplete only when transitioning from not-complete -> complete
  // and when the complete value differs from the last completed value.
  useEffect(() => {
    if (disabled || !onComplete) return;
    const current = digits.join("");
    const isComplete = current.length === length;
    if (isComplete && !prevCompleteRef.current) {
      if (prevCompleteValueRef.current !== current) {
        prevCompleteValueRef.current = current;
        prevCompleteRef.current = true;
        onComplete(current);
      }
    } else if (!isComplete) {
      prevCompleteRef.current = false;
    }
  }, [digits, length, onComplete, disabled]);

  const setAt = (idx: number, ch: string) => {
    const arr = value.split("");
    arr[idx] = ch;
    const next = arr.slice(0, length).join("");
    onChange(next);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (disabled) return;
    const key = e.key;
    if (key === "Backspace") {
      e.preventDefault();
      const arr = value.split("");
      if (arr[idx]) {
        arr[idx] = "";
        onChange(arr.join("").slice(0, length));
        refs.current[idx] && refs.current[idx]!.focus();
      } else if (idx > 0) {
        refs.current[idx - 1] && refs.current[idx - 1]!.focus();
        const arr2 = value.split("");

        onChange(arr2.join("").slice(0, length));
      }
    } else if (/^[0-9۰-۹٠-٩]$/.test(key)) {
      e.preventDefault();
      const ch = persianToEnglish(key);
      setAt(idx, ch);
      const nextIdx = Math.min(length - 1, idx + 1);
      refs.current[nextIdx] && refs.current[nextIdx]!.focus();
    } else if (key === "ArrowLeft" && idx > 0) {
      refs.current[idx - 1] && refs.current[idx - 1]!.focus();
    } else if (key === "ArrowRight" && idx < length - 1) {
      refs.current[idx + 1] && refs.current[idx + 1]!.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    const pasted = e.clipboardData.getData("text");
    const normalized = persianToEnglish(pasted)
      .replace(/\D/g, "")
      .slice(0, length);
    if (!normalized) return;
    onChange(normalized);
    // clear previous complete value so onComplete can fire for this new paste
    prevCompleteValueRef.current = null;
  };

  return (
    <div className="w-full">
      {/* OTP Input */}
      <div
        className="flex justify-center gap-2 flex-row-reverse relative"
        onPaste={handlePaste}
        dir="rtl"
      >
        {Array.from({ length }).map((_, i) => {
          const ch = digits[i] || "";
          const isFocused = focusedIndex === i;
          const hasValue = !!ch;
          const isError = error;

          return (
            <div key={i} className="relative">
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={ch}
                onChange={() => {}}
                onKeyDown={(e) => handleKey(e, i)}
                onFocus={() => setFocusedIndex(i)}
                onBlur={() => setFocusedIndex(null)}
                disabled={disabled || loading}
                aria-label={`رقم ${i + 1}`}
                className={`w-10 h-10 text-center text-lg font-bold rounded-lg border-2 outline-none transition-all duration-200 transform ${
                  disabled || loading
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:scale-105"
                } ${
                  isFocused
                    ? "scale-110 shadow-lg"
                    : hasValue
                      ? "scale-105"
                      : ""
                } ${
                  isError
                    ? "border-red-500 bg-red-50 text-red-600 animate-pulse"
                    : hasValue
                      ? "border-[#1A5F7A] bg-blue-50 text-[#1A5F7A] shadow-md"
                      : isFocused
                        ? "border-[#1A5F7A] bg-blue-50"
                        : "border-gray-300 bg-white hover:border-gray-400"
                }`}
                style={{
                  color: isError
                    ? "#DC2626"
                    : hasValue || isFocused
                      ? "#1A5F7A"
                      : "#2E2E2E",
                }}
              />

              {/* Loading spinner overlay */}
              {loading && i === Math.floor(length / 2) && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-[#1A5F7A] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error message with animation */}
      {error && (
        <div className="mt-4 flex items-center justify-center gap-2 animate-shake">
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
          <p className="text-red-600 text-sm font-medium">
            کد وارد شده صحیح نمی‌باشد
          </p>
        </div>
      )}
    </div>
  );
}
