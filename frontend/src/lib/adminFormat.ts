/**
 * Persian formatting helpers shared by the admin dashboard.
 *
 * Pure functions — safe to unit-test without a browser or Intl support.
 */

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert a string or number's ASCII digits to Persian digits. */
export function faNumber(value: string | number): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date/ISO string as `YYYY/MM/DD` with Persian digits. */
export function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return faNumber(
    `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`,
  );
}

/** Format a Date/ISO string as `YYYY/MM/DD HH:mm` with Persian digits. */
export function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return faNumber(
    `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  );
}

/** Localized labels map – kept here so pages stay declarative. */
export const RISK_LABEL: Record<string, string> = {
  LOW: "کم",
  MEDIUM: "متوسط",
  HIGH: "زیاد",
  CRITICAL: "بحرانی",
};