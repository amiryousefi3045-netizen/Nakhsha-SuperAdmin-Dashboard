/**
 * Returns / RMA contract (Phase 33, P1-04).
 *
 * Deliberately neutral and dependency-free: the buyer and the seller see the
 * SAME return from two sides, so the wire contract lives here once and both
 * `types/seller.ts` and `types/storefront.ts` build on it. Duplicating the
 * state machine in two files is how the two sides drift and start disagreeing
 * about whether a request is still open.
 *
 * The state machine mirrors `backend/models/ReturnRequest.js`. It is separate
 * from the order state on purpose: the order says where the goods are, the RMA
 * says where the dispute is. A buyer filing a claim does NOT make an order
 * `returned` — only an issued refund does.
 */

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "received"
  | "refunded"
  | "cancelled";

/** Every RMA state, in the order a claim usually travels through them. */
export const RETURN_STATUSES: ReturnStatus[] = [
  "requested",
  "approved",
  "rejected",
  "received",
  "refunded",
  "cancelled",
];

/**
 * The states a claim may legally move to from the current one. `received` can
 * only reach `refunded`, and refunding is deliberately NOT reachable through
 * this table: it moves money, so it has its own validated endpoint.
 */
export const RETURN_STATUS_ACTIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["received", "cancelled"],
  received: ["refunded"],
  rejected: [],
  refunded: [],
  cancelled: [],
};

/**
 * Terminal states close the claim. Only here does the order stop blocking new
 * requests — while a claim is `approved` or `received` the order still has one
 * open dispute attached to it.
 */
export const RETURN_TERMINAL_STATUSES: ReturnStatus[] = ["rejected", "refunded", "cancelled"];

/** A claim is actionable by the store until it reaches a terminal state. */
export function isOpenReturn(status: ReturnStatus): boolean {
  return !RETURN_TERMINAL_STATUSES.includes(status);
}

/** Persian labels for the seller's filter chips and the buyer's status text. */
export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "در انتظار بررسی",
  approved: "تأیید شده",
  rejected: "رد شده",
  received: "کالا دریافت شد",
  refunded: "استرداد شد",
  cancelled: "لغو شده",
};

export interface ReturnItem {
  productId: string;
  title: string;
  price: number;
  qty: number;
}

export interface ReturnTimelineEntry {
  status: ReturnStatus;
  at: string;
  by: string | null;
  note: string;
}
