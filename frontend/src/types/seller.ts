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

export interface SellerAnalytics {
  inventory: {
    totalOnHand: number;
    totalReserved: number;
    available: number;
    products: number;
  };
  byStatus: Partial<Record<ProductStatus, number>>;
  note: string;
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
  payment: { status: string };
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