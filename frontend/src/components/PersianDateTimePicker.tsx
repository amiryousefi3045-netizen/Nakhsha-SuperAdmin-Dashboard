/**
 * PersianDateTimePicker
 * A styled wrapper around react-multi-date-picker that renders a Jalali
 * calendar with optional time-picker and converts selection to/from ISO strings.
 *
 * Usage:
 *   <PersianDateTimePicker
 *     value={isoString}          // ISO string stored in state ("" = empty)
 *     onChange={(iso) => …}       // receives ISO string or "" when cleared
 *     withTime                    // show time picker section
 *     minDateToday                // disable past dates
 *     required                    // show * badge on label
 *     label="تاریخ شروع"
 *     placeholder="انتخاب تاریخ…"
 *   />
 */
import { type FC, useCallback } from "react";
import DatePicker from "react-multi-date-picker";
import type { Value } from "react-multi-date-picker";
import TimePicker from "react-multi-date-picker/plugins/time_picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import type DateObject from "react-date-object";
import { CalendarDays, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PersianDateTimePickerProps {
  value: string; // ISO string ("") → no selection
  onChange: (iso: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  withTime?: boolean;
  /** Disable all days before today */
  minDateToday?: boolean;
  disabled?: boolean;
  /** Additional wrapper class */
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a react-date-object to a JS Date → ISO string */
function dateObjectToISO(d: DateObject): string {
  // toDate() returns a native JS Date in the Gregorian equivalent
  return d.toDate().toISOString();
}

/** Convert an ISO string to a Date that DatePicker accepts as `value` */
function isoToDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Format an ISO string as a Persian display string */
function formatPersian(iso: string, withTime: boolean): string {
  if (!iso) return "";
  try {
    // Use Intl if available; otherwise fall back to en-US
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = {
      calendar: "persian",
      numberingSystem: "latn",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    if (withTime) {
      opts.hour = "2-digit";
      opts.minute = "2-digit";
    }
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", opts).format(d);
  } catch {
    return iso;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const PersianDateTimePicker: FC<PersianDateTimePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = "انتخاب تاریخ…",
  required = false,
  withTime = false,
  minDateToday = false,
  disabled = false,
  className = "",
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleChange = useCallback(
    (dateObj: DateObject | DateObject[] | null) => {
      if (!dateObj || Array.isArray(dateObj)) {
        onChange("");
        return;
      }
      onChange(dateObjectToISO(dateObj));
    },
    [onChange],
  );

  const selectedDate = isoToDate(value);
  const displayValue = value ? formatPersian(value, withTime) : "";

  const inputTrigger = (
    <div
      className={[
        "relative flex items-center w-full",
        disabled ? "opacity-60 pointer-events-none" : "",
      ].join(" ")}
    >
      {/* Calendar icon */}
      <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)] pointer-events-none" />

      {/* Fake input face – DatePicker will attach its click handler to this element */}
      <input
        readOnly
        dir="rtl"
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        className={[
          "w-full pr-9 pl-9 py-2.5 rounded-xl border text-sm",
          "bg-white text-[var(--color-text)] placeholder:text-[var(--color-muted)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]",
          "transition-colors duration-150 cursor-pointer border-[var(--color-border)]",
        ].join(" ")}
      />

      {/* Clear button */}
      {value && !disabled && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-red-500 transition-colors"
          title="پاک کردن تاریخ"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-semibold text-[var(--color-text)]">
          {label}
          {required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}

      <DatePicker
        value={selectedDate as Value}
        onChange={handleChange}
        calendar={persian}
        locale={persian_fa}
        calendarPosition="bottom-right"
        fixMainPosition
        minDate={minDateToday ? today : undefined}
        format={withTime ? "YYYY/MM/DD HH:mm" : "YYYY/MM/DD"}
        plugins={withTime ? [<TimePicker key="tp" position="bottom" />] : []}
        render={inputTrigger}
        // Keep popup inside viewport — portal to body
        portal
        portalTarget={document.body}
        containerClassName="w-full"
        className="nakhsha-datepicker"
        // Do NOT set readOnly=true on the DatePicker itself; we handle it on our input
      />
    </div>
  );
};

export default PersianDateTimePicker;
