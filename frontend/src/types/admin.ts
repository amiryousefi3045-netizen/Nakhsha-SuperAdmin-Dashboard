/**
 * Type definitions for the Super Admin dashboard.
 *
 * Shapes mirror the DTOs emitted by `backend/controllers/AdminController.js`
 * and `backend/services/adminStats.js`.
 */

export type AdminRole = "user" | "creator" | "seller" | "admin" | "super_admin";
export type AssignableRole = "user" | "creator" | "seller" | "admin";

export type AdminPermission = "DELETE_USERS" | "APPROVE_CONTENT" | "VIEW_AUDIT_LOGS";

/** TOTP (2FA) state for the signed-in super admin account. */
export interface AdminTotpStatus {
  enabled: boolean;
  provisioned: boolean;
}

/** Response of POST /admin/2fa/provision — secret shown exactly once. */
export interface AdminTotpProvision {
  secret: string;
  otpauthUri: string;
}

export type ListingType = "post" | "tour" | "training" | "academy";
export type ListingStatus = "draft" | "pending" | "published" | "rejected" | "archived";

export type CraftKind = "artwork" | "class" | "service";

export type ProviderStatus = "active" | "suspended" | "pending";

/** Shared owner/author reference used across admin DTOs. */
export interface AdminActorRef {
  id: string;
  name: string;
  handle?: string | null;
}

export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  handle: string | null;
  avatar: string;
  role: AdminRole;
  isBlocked: boolean;
  moderatorNote: string;
  permissions: AdminPermission[];
  isVerified: boolean;
  creatorType: "artisan" | "tour_leader";
  createdAt: string;
  updatedAt: string;
}

export interface AdminProvider extends AdminUser {
  status: ProviderStatus;
  bio?: string;
  /** Present only on the single-provider endpoint. */
  stats?: { listings: number; published: number; crafts: number };
}

/** One skipped/failed item in a bulk operation response. */
export interface BatchResultItem {
  id: string;
  reason: string;
}

/** Shape returned by the admin bulk endpoints. */
export interface BatchResponse {
  batchId: string;
  summary: { total: number; succeeded: number; skipped: number; failed: number };
  succeeded: string[];
  skipped: BatchResultItem[];
  failed: BatchResultItem[];
}

export interface AdminListing {
  id: string;
  type: ListingType;
  title: string;
  description: string;
  status: ListingStatus;
  location: { city: string | null; province: string | null; address: string | null };
  owner: AdminActorRef | null;
  revision: number;
  editCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCraft {
  id: string;
  title: string;
  description: string;
  kind: CraftKind;
  craftType: string;
  isPublished: boolean;
  price: number | null;
  location: { city: string | null };
  author: AdminActorRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditResource {
  type: string | null;
  id: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string;
  resource: AuditResource | null;
  changes: { before?: unknown; after?: unknown } | null;
  result: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ip: string | null;
  createdAt: string;
}

export type RecentActivity = AuditLogEntry;

/** Extended DTO returned by GET /admin/audit-logs/:id. */
export interface AuditLogDetail extends AuditLogEntry {
  requestContext: {
    ip: string | null;
    userAgent: string | null;
    referer: string | null;
    endpoint: string | null;
    method: string | null;
    statusCode: number | null;
  } | null;
  metadata: Record<string, unknown> | null;
  error: { code: string | null; message: string | null; stack?: string | null } | null;
  compliance: {
    gdprRelevant: boolean | null;
    dataCategories: string[];
    retentionRequired?: boolean | null;
    retentionUntil?: string | null;
  } | null;
}

/** One moderatable comment row (crafts ∧ comments). */
export interface AdminComment {
  id: string;
  craft: {
    id: string;
    title: string;
    isPublished: boolean;
  };
  author: AdminActorRef;
  text: string;
  rating: number | null;
  createdAt: string;
}

/** One active device session for a user (RefreshToken doc). */
export interface AdminSession {
  id: string;
  userId: string;
  deviceId: string | null;
  device: {
    userAgent: string | null;
    ipAddress: string | null;
  } | null;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string;
  rotationCount: number;
}

export interface UserSessionsResult {
  user: { id: string; name: string; handle: string | null };
  sessions: AdminSession[];
  total: number;
}

/** Live event pushed over the admin SSE stream. */
export interface AdminLiveEvent {
  type: "initial" | "heartbeat" | "audit";
  /** Present on `audit` events. */
  payload?: {
    id: string;
    action: string;
    actorId: string | null;
    resourceType: string | null;
    resourceId: string | null;
    result: string;
    riskLevel: string;
    ip: string | null;
    createdAt: string;
  };
  /** Present on `initial`/`heartbeat` events. */
  at?: string;
}

/** Downloaded CSV export file (blob + suggested filename). */
export interface ExportFile {
  blob: Blob;
  filename: string;
}

export interface AdminStats {
  overview: {
    totalUsers: number;
    activeContent: number;
    pendingContent: number;
    blockedUsers: number;
  };
  growth: Array<{ date: string; users: number; content: number }>;
  distribution: Array<{ type: string; count: number }>;
  topCities: Array<{ city: string; count: number }>;
  recentActivity: RecentActivity[];
  dbTotals: {
    users: number;
    listings: number;
    crafts: number;
    auditLogs: number;
    refreshTokens: number;
  };
}

/** Envelope shape of every admin list endpoint. */
export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** GET /admin/settings response. */
export interface AdminSettings {
  settings: Array<{ key: string; isConfigured: boolean }>;
  database: { status: "up" | "down"; lastCheckedAt: string };
}

// ── Query parameter helpers ────────────────────────────────────────────────

export interface ListUsersParams {
  page?: number;
  limit?: number;
  q?: string;
  role?: AdminRole;
}

export interface ListListingsParams {
  page?: number;
  limit?: number;
  type?: ListingType;
  status?: ListingStatus;
}

export interface ListCraftsParams {
  page?: number;
  limit?: number;
  kind?: CraftKind;
  craftType?: string;
}

export interface ListProvidersParams {
  page?: number;
  limit?: number;
  status?: ProviderStatus;
  role?: "admin" | "creator";
}

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
}

export interface ListCommentsParams {
  page?: number;
  limit?: number;
  q?: string;
  rating?: number;
}

// ── Payout settlement queue ────────────────────────────────────────────────

export type AdminPayoutStatus = "requested" | "processing" | "paid" | "cancelled" | "rejected";
export type AdminPayoutMethod = "bank_transfer" | "card" | "wallet" | "other";
export type AdminPayoutTransition = "processing" | "paid" | "rejected";

/** One payout timeline entry (who moved it and when). */
export interface AdminPayoutTimelineEntry {
  status: string;
  at: string;
  by: string | null;
  note: string;
}

/** Payout row in the admin settlement queue. */
export interface AdminPayout {
  id: string;
  sellerId: string;
  amount: number;
  currency: string;
  status: AdminPayoutStatus;
  method: AdminPayoutMethod;
  note: string;
  decisionNote: string;
  reference: string;
  timeline: AdminPayoutTimelineEntry[];
  createdAt: string;
  updatedAt: string;
  seller: { id: string; storeName: string; slug: string } | null;
}

/** One status bucket of GET /admin/payouts/overview. */
export interface AdminPayoutOverviewRow {
  status: AdminPayoutStatus;
  count: number;
  amount: number;
}

export interface AdminPayoutOverview {
  items: AdminPayoutOverviewRow[];
  totalCount: number;
  totalAmount: number;
}

export interface ListAdminPayoutsParams {
  page?: number;
  limit?: number;
  status?: AdminPayoutStatus;
  method?: AdminPayoutMethod;
  seller?: string;
}

/** Payload of PATCH /admin/payouts/:id/status. */
export interface UpdateAdminPayoutStatusInput {
  status: AdminPayoutTransition;
  note?: string;
  reference?: string;
}

// ── Notification queue (ops) ────────────────────────────────────────────────

export type NotificationQueueState = "pending" | "waiting" | "failed" | "delivered";

export interface NotificationQueueSummary {
  pending: number;
  waiting: number;
  failed: number;
  delivered: number;
}

/** One ledger record of GET /admin/notification-queue. */
export interface NotificationQueueRecord {
  orderId: string;
  orderNumber: number;
  channel: "sms" | "email";
  status: string;
  to: string;
  message: string;
  reason: string;
  delivered: boolean;
  attempts: number;
  error: string;
  state: NotificationQueueState;
  at: string;
  nextAttemptAt: string | null;
}

export interface ListNotificationQueueParams {
  page?: number;
  limit?: number;
  state?: NotificationQueueState;
}

/** Result summary of POST /admin/notification-queue/retry. */
export interface NotificationQueueRunSummary {
  scanned: number;
  attempted: number;
  delivered: number;
  failed: number;
  skipped: number;
}