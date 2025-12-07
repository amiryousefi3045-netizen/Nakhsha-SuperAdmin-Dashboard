import React, { useEffect, useRef } from "react";

type Props = {
  value: string;
  length?: number;
  autoFocus?: boolean;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  error?: boolean;
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
}: Props) {
  const digits = value.split("").slice(0, length);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus && refs.current[0]) refs.current[0].focus();
  }, [autoFocus]);

  useEffect(() => {
    if (digits.join("").length === length)
      onComplete && onComplete(digits.join(""));
  }, [digits, length, onComplete]);

  const setAt = (idx: number, ch: string) => {
    const arr = value.split("");
    arr[idx] = ch;
    const next = arr.slice(0, length).join("");
    onChange(next);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
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

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    const pasted = e.clipboardData.getData("text");
    const normalized = persianToEnglish(pasted)
      .replace(/\D/g, "")
      .slice(0, length);
    if (!normalized) return;
    onChange(normalized);
  };

  return (
    <div
      className="flex justify-center gap-2 flex-row-reverse"
      onPaste={handlePaste}
      dir="rtl"
    >
      {Array.from({ length }).map((_, i) => {
        const ch = digits[i] || "";
        return (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={ch}
            onChange={() => {}}
            onKeyDown={(e) => handleKey(e, i)}
            disabled={disabled}
            aria-label={`رقم ${i + 1}`}
            className="w-12 h-12 text-center text-lg font-semibold bg-transparent border-b-2 outline-none"
            style={{
              borderColor: error ? "#DC2626" : ch ? "#1A5F7A" : "#C7CCD8",
              color: "#2E2E2E",
            }}
          />
        );
      })}
    </div>
  );
}
