/**
 * Seller-domain formatting helpers.
 *
 * Currency-aware price rendering: the backend stores prices in integer
 * minor/base units with a `currency` code (default "IRR"). The rest of the
 * Nakhsha frontend renders prices as «تومان»; we follow that established UI
 * convention for IRR while passing through any other currency code verbatim.
 * No conversion math is invented here.
 */

import { faNumber } from "./adminFormat";

/** Render a price as «١٢٬٥٠٠ تومان» for IRR, else «value CODE». */
export function formatSellerPrice(value: number, currency?: string): string {
  const formatted = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value);
  if (!currency || currency.toUpperCase() === "IRR") return `${formatted} تومان`;
  return `${formatted} ${currency}`;
}

export const PRODUCT_STATUS_LABEL: Record<string, string> = {
  draft: "پیش‌نویس",
  pending_review: "در انتظار بررسی",
  active: "فعال",
  paused: "متوقف",
  archived: "بایگانی",
  rejected: "ردشده",
};

export const PRODUCT_STATUS_TONE: Record<string, "gray" | "amber" | "green" | "red"> = {
  draft: "gray",
  pending_review: "amber",
  active: "green",
  paused: "amber",
  archived: "gray",
  rejected: "red",
};

// ── Order status ────────────────────────────────────────────────────────────

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار",
  confirmed: "تأییدشده",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  cancelled: "لغو‌شده",
  returned: "مرجوع‌شده",
};

export const ORDER_STATUS_TONE: Record<string, "gray" | "amber" | "green" | "blue" | "red"> = {
  pending: "amber",
  confirmed: "blue",
  processing: "blue",
  shipped: "green",
  delivered: "green",
  cancelled: "gray",
  returned: "red",
};

export { faNumber };