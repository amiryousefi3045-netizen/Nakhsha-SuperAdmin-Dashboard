/**
 * Types for the Seller Dashboard.
 *
 * Shapes mirror the DTOs emitted by `backend/controllers/SellerController.js`.
 * The Seller domain is independent of the Creator domain (no `creatorType`,
 * no `/creator/seller` nesting).
 */

export type ProductStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "paused"
  | "archived"
  | "rejected";

export type SellerProfileStatus = "active" | "suspended" | "pending";
export type SellerVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected";

export type StockPolicy = "tracked" | "untracked";
export type StockAdjustmentType = "receipt" | "adjustment" | "correction" | "count";

export interface SellerContact {
  phone?: string;
  email?: string;
  website?: string;
  instagram?: string;
  telegram?: string;
  [key: string]: unknown;
}

export interface SellerLocation {
  province?: string;
  city?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface SellerPolicies {
  shipping?: string;
  returns?: string;
  [key: string]: unknown;
}

export interface SellerProfile {
  id: string;
  userId: string;
  storeName: string;
  slug: string;
  description?: string;
  logo?: string;
  cover?: string;
  contact?: SellerContact;
  location?: SellerLocation;
  verification?: {
    status: SellerVerificationStatus;
    verifiedAt: string | null;
  };
  policies?: SellerPolicies;
  status: SellerProfileStatus;
  stats?: Record<string, unknown>;
  /** Settlement terms (read-only from the seller dashboard). */
  finance?: {
    commissionPercent: number;
    payoutMinimum: number;
    holdDays: number;
  };
  createdAt: string;
  updatedAt: string;
  /** The caller's own roster role; "owner" for the profile holder. */
  myRole?: "owner" | "manager" | "staff";
}

export interface ProductStock {
  onHand: number;
  reserved: number;
  incoming: number;
  available: number;
}

export interface SellerProduct {
  id: string;
  sellerId: string;
  title: string;
  description?: string;
  images: string[];
  category?: string;
  price: number;
  currency: string;
  sku?: string;
  status: ProductStatus;
  rejectionReason?: string;
  stock: ProductStock;
  isLowStock: boolean;
  isOutOfStock: boolean;
  stockPolicy: StockPolicy;
  lowStockThreshold: number;
  sourceCraftId?: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SellerDashboardData {
  overview: {
    totalProducts: number;
    activeProducts: number;
    lowStock: number;
    outOfStock: number;
    pendingProducts: number;
  };
  orders: {
    byStatus: OrderCounts;
    total: number;
    needAction: number;
    open: number;
  };
  revenue: {
    shipped: number;
    delivered: number;
    total: number;
  };
  recentProducts: SellerProduct[];
  profile: SellerProfile;
}

/** Envelope shape returned by every seller list endpoint. */
export interface SellerPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** One row of the stock adjustment history. */
export interface StockAdjustmentEntry {
  id: string;
  delta: number;
  type: StockAdjustmentType;
  reason?: string;
  before?: { onHand: number; reserved?: number };
  after?: { onHand: number; reserved?: number };
  createdAt: string;
}

export interface StockAdjustmentHistory {
  product: { id: string; title: string; sku?: string };
  items: StockAdjustmentEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface AnalyticsOrderStatusRow {
  status: OrderStatus;
  count: number;
  total: number;
}

export interface AnalyticsSalesBlock {
  period: { from: string; to: string };
  days: number;
  current: {
    orders: number;
    units: number;
    subtotal: number;
    shippingFee: number;
    discount: number;
    total: number;
    avgOrderValue: number;
    byStatus: AnalyticsOrderStatusRow[];
  };
  previous: {
    orders: number;
    units: number;
    total: number;
  };
  daily: SalesReportDay[];
  currency: "IRR";
}

export interface SellerAnalytics {
  inventory: {
    totalOnHand: number;
    totalReserved: number;
    available: number;
    products: number;
  };
  byStatus: Partial<Record<ProductStatus, number>>;
  sales: AnalyticsSalesBlock;
}

export interface AnalyticsParams {
  from?: string;
  to?: string;
}

// ── Sales report (Phase 24) ────────────────────────────────────────────────

export interface SalesReportSummary {
  orders: number;
  units: number;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
}

export interface SalesReportStatusRow {
  status: OrderStatus;
  count: number;
  total: number;
}

export interface SalesReportTopProduct {
  productId: string;
  title: string;
  orders: number;
  units: number;
  revenue: number;
}

export interface SalesReportDay {
  day: string;
  orders: number;
  total: number;
}

export interface SellerSalesReport {
  period: { from: string; to: string };
  summary: SalesReportSummary;
  byStatus: SalesReportStatusRow[];
  topProducts: SalesReportTopProduct[];
  daily: SalesReportDay[];
  currency: "IRR";
}

export interface SalesReportParams {
  from?: string;
  to?: string;
  top?: number;
}

// ── Settlement report (Phase 28, P0-04) ─────────────────────────────────────

export interface PayoutReportStatusSummary {
  count: number;
  amount: number;
}

export interface PayoutReportMethodRow {
  method: PayoutMethod;
  count: number;
  amount: number;
}

export interface PayoutReportDay {
  day: string;
  count: number;
  amount: number;
}

export interface SellerPayoutReport {
  period: { from: string; to: string };
  summary: Record<PayoutStatus, PayoutReportStatusSummary> & {
    total: PayoutReportStatusSummary;
  };
  byMethod: PayoutReportMethodRow[];
  daily: PayoutReportDay[];
  currency: "IRR";
}

export interface PayoutReportParams {
  from?: string;
  to?: string;
}

// ── Store activity feed (Phase 26) ─────────────────────────────────────────

export type SellerActivityAction =
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "PRODUCT_STATUS_CHANGED"
  | "PRODUCT_ARCHIVED"
  | "STOCK_ADJUSTED"
  | "ORDER_CREATED"
  | "ORDER_STATUS_CHANGED"
  | "PAYOUT_REQUESTED"
  | "PAYOUT_CANCELLED"
  | "PAYOUT_STATUS_CHANGED"
  | "SELLER_SETTINGS_UPDATED"
  | "TEAM_MEMBER_INVITED"
  | "TEAM_MEMBER_ROLE_CHANGED"
  | "TEAM_MEMBER_REMOVED"
  | "REVIEW_VISIBILITY_CHANGED"
  | "SELLER_REVIEW_REPLIED"
  | "SELLER_REVIEW_REPLY_REMOVED"
  | "SELLER_PROFILE_UPDATE"
  | string;

export type ActivityRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SellerActivityItem {
  id: string;
  action: SellerActivityAction;
  riskLevel: ActivityRiskLevel;
  result: "SUCCESS" | "FAILURE" | "PARTIAL";
  resource: { type: string; id?: string | null } | null;
  after?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  endpoint?: string | null;
  createdAt: string;
}

export interface SellerActivityPage {
  items: SellerActivityItem[];
  total: number;
  page: number;
  limit: number;
}

export interface SellerActivityParams {
  page?: number;
  limit?: number;
}

// ── Live store events (Phase 31, P1-05) ────────────────────────────────────

export type SellerLiveEventType =
  | "initial"
  | "heartbeat"
  | "activity"
  | "order"
  | "payout";

export interface SellerLiveActivityPayload {
  id: string;
  action: string;
  riskLevel: ActivityRiskLevel;
  result: "SUCCESS" | "FAILURE" | "PARTIAL";
  resourceType: string | null;
  resourceId: string | null;
  createdAt: string;
}

export interface SellerLiveOrderPayload {
  id: string;
  orderNumber: number;
  from: OrderStatus | null;
  status: OrderStatus;
  total: number;
  currency: string;
  at: string;
}

export interface SellerLivePayoutPayload {
  id: string;
  from: string | null;
  status: string;
  amount: number;
  currency: string;
  at: string;
}

export type SellerLiveEventPayload =
  | { at: string }
  | SellerLiveActivityPayload
  | SellerLiveOrderPayload
  | SellerLivePayoutPayload;

export interface SellerLiveEvent {
  type: SellerLiveEventType;
  payload: SellerLiveEventPayload;
}

/** A toast raised by the live bell for one store event. */
export interface SellerLiveAlert {
  id: string;
  type: "activity" | "order" | "payout";
  title: string;
  body: string;
  at: string;
}

/**
 * Outcome of one row inside a bulk action (Phase 32, P1-06).
 *
 * Typed per bucket because the server is: a row the seller actually changed
 * comes back as a bare id (plus the order number for orders, so the UI can
 * name it), while a row that was skipped or failed ALWAYS carries the reason
 * it did not happen. Collapsing these into one loose union would make
 * `failed[0].reason` a type error even though the server guarantees it.
 */
export type BulkSucceededRow = { id: string; orderNumber?: number };
export type BulkSkippedRow = { id: string; reason: string; orderNumber?: number };
export type BulkFailedRow = { id: string; reason: string; orderNumber?: number };

/** Any row from any bucket — what the bulk result bar renders. */
export type BulkRowOutcome = BulkSucceededRow | BulkSkippedRow | BulkFailedRow;

export interface BulkActionResult {
  batchId: string;
  summary: { total: number; succeeded: number; skipped: number; failed: number };
  succeeded: BulkSucceededRow[];
  skipped: BulkSkippedRow[];
  failed: BulkFailedRow[];
}

// ── Orders & fulfillment ────────────────────────────────────────────────────

/**
 * Order workflow states, mirroring `backend/models/Order.js`. Terminal states
 * (`cancelled`, `returned`, `delivered`) are actions-free; the rest drive the
 * seller's fulfillment queue.
 */
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

export interface OrderCustomer {
  name: string;
  phone?: string;
  note?: string;
}

export interface OrderItem {
  productId: string;
  title: string;
  sku: string;
  image: string;
  price: number;
  currency: string;
  qty: number;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  at: string;
  by: string | null;
  reason?: string;
}

export interface SellerOrder {
  id: string;
  sellerId: string;
  orderNumber: number;
  customer: OrderCustomer;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  currency: string;
  status: OrderStatus;
  itemCount: number;
  timeline: OrderTimelineEntry[];
  carrierInfo: Record<string, unknown>;
  /**
   * The refund snapshot written when an RMA is settled (Phase 33). Both fields
   * are absent until a refund is actually issued, so they are optional: a
   * partial refund must never be rendered as the order total.
   */
  payment: {
    status: string;
    refundedAmount?: number;
    refundedAt?: string | null;
  };
  customerNote?: string;
  sellerNote?: string;
  createdAt: string;
  updatedAt: string;
}

/** Aggregate per-status counts for the fulfillment queue. */
export interface OrderCounts {
  pending: number;
  confirmed: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  returned: number;
}

export interface FulfillmentSummary {
  counts: OrderCounts;
  needAction: number;
  needingShipment: number;
  recent: SellerOrder[];
}

// ── Returns / RMA (Phase 33, P1-04) ─────────────────────────────────────────

/**
 * The RMA state machine itself lives in `types/returns.ts` because the buyer
 * and the seller describe the same return. It is re-exported here so the rest
 * of the seller dashboard can keep importing from one place.
 */
export {
  RETURN_STATUSES,
  RETURN_STATUS_ACTIONS,
  RETURN_TERMINAL_STATUSES,
  RETURN_STATUS_LABELS,
  isOpenReturn,
} from "./returns";
export type { ReturnStatus, ReturnItem, ReturnTimelineEntry } from "./returns";

import type { ReturnItem, ReturnStatus, ReturnTimelineEntry } from "./returns";

export interface SellerReturn {
  id: string;
  sellerId: string;
  orderId: string;
  orderNumber: number;
  rmaNumber: number;
  /** Null for a seller-filed (walk-in) request: there is no claiming buyer. */
  buyerUserId: string | null;
  status: ReturnStatus;
  isOpen: boolean;
  reason: string;
  resolutionNote: string;
  customerName: string;
  customerPhone: string;
  items: ReturnItem[];
  refundAmount: number;
  refundCurrency: string;
  refundedAt: string | null;
  /**
   * What the buyer actually paid for this order. The refund input is bounded
   * by THIS, not by the sum of the item lines — those disagree as soon as a
   * discount is involved. Null only if the order was deleted underneath.
   */
  orderTotal: number | null;
  orderCurrency: string;
  timeline: ReturnTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ReturnCounts {
  requested: number;
  approved: number;
  rejected: number;
  received: number;
  refunded: number;
  cancelled: number;
  /** Needs the seller's decision or their physical receipt: the work queue. */
  awaitingDecision: number;
  open: number;
}

export interface ListSellerReturnsParams {
  page?: number;
  limit?: number;
  status?: ReturnStatus;
}

export interface CreateReturnInput {
  orderId: string;
  reason: string;
}

export interface RefundReturnInput {
  refundAmount: number;
  note?: string;
}

// ── Reviews (Phase 16) ───────────────────────────────────────────────────────

/** Review visibility states the seller can moderate. */
export type ReviewStatus = "published" | "hidden";

/** The store owner's reply to a review (one per review, updatable). */
export interface SellerReply {
  comment: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/** One buyer review as seen by the store owner (real name + product context). */
export interface SellerReview {
  id: string;
  productId: string;
  productTitle: string;
  rating: number;
  comment: string;
  buyerName: string;
  isAnonymous: boolean;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  sellerReply: SellerReply | null;
}

export interface ListSellerReviewsParams {
  page?: number;
  limit?: number;
  status?: ReviewStatus;
  productId?: string;
}

// ── Finance & payouts ────────────────────────────────────────────────────────

export type PayoutStatus = "requested" | "processing" | "paid" | "cancelled" | "rejected";
export type PayoutMethod = "bank_transfer" | "card" | "wallet" | "other";

export interface SellerPayout {
  id: string;
  sellerId: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  method: PayoutMethod;
  note?: string;
  reference?: string;
  timeline: OrderTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface SellerFinanceSummary {
  currency: string;
  gross: {
    delivered: number;
    held: number;
    awaiting: number;
  };
  commission: { percent: number; amount: number };
  net: { earned: number; available: number };
  outlaid: { requested: number; processing: number; paid: number; total: number };
  cancelledPayouts: number;
  hold: { days: number; amount: number };
  asOf: string;
}

export interface SellerPayoutListParams {
  page?: number;
  limit?: number;
  status?: PayoutStatus;
}

export interface RequestSellerPayoutInput {
  amount: number;
  method?: PayoutMethod;
  note?: string;
}

// ── Settings & team ─────────────────────────────────────────────────────────

export interface SellerSettings {
  storefrontPublished: boolean;
  notificationEmail: boolean;
  notificationSms: boolean;
  defaultPayoutMethod: PayoutMethod;
}

export interface SellerSettingsUpdate {
  storefrontPublished?: boolean;
  notificationEmail?: boolean;
  notificationSms?: boolean;
  defaultPayoutMethod?: PayoutMethod;
}

export type TeamMemberRole = "manager" | "staff";

export interface TeamMember {
  id: string;
  userId: string;
  role: TeamMemberRole;
  note: string;
  name: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface SellerTeam {
  items: TeamMember[];
  total: number;
  owner: { userId: string; name: string; phone: string } | null;
}

export interface InviteTeamMemberInput {
  phone: string;
  role: TeamMemberRole;
  note?: string;
}

/**
 * Honest response for domains that are planned but not yet implemented on the
 * backend (e.g. settings screens). Never fabricated data.
 */
export interface DomainGap {
  status: "planned";
  domain: string;
  message: string;
}