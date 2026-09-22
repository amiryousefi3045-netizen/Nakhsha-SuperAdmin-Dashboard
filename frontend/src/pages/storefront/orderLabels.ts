import type { BuyerOrderStatus } from "../../types/storefront";

/**
 * Shared buyer-visible order labels (order status, payment status, filter
 * tabs). Kept here so the list page, the receipt and (later) notification
 * surfaces render the same vocabulary.
 */

export const STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار پرداخت",
  confirmed: "تأیید شده",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال شده",
  delivered: "تحویل شده",
  cancelled: "لغو شده",
  returned: "مرجوعی",
};

export const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "پرداخت نشده",
  paid: "پرداخت شده",
  refunded: "مسترد شده",
};

export function statusColorClass(status: string): string {
  if (status === "cancelled" || status === "returned") return "bg-red-50 text-red-600";
  if (status === "delivered") return "bg-green-50 text-green-600";
  if (status === "pending") return "bg-amber-50 text-amber-600";
  return "bg-blue-50 text-blue-600";
}

export interface OrderStatusFilter {
  value: BuyerOrderStatus | "all";
  label: string;
}

export const ORDER_STATUS_FILTERS: OrderStatusFilter[] = [
  { value: "all", label: "همه" },
  { value: "pending", label: "در انتظار پرداخت" },
  { value: "confirmed", label: "تأیید شده" },
  { value: "processing", label: "در حال آماده‌سازی" },
  { value: "shipped", label: "ارسال شده" },
  { value: "delivered", label: "تحویل شده" },
  { value: "cancelled", label: "لغو شده" },
];

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}