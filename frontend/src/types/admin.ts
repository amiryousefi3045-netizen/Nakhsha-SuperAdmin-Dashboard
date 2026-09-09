/**
 * Type definitions for the Super Admin dashboard.
 *
 * Shapes mirror the DTOs emitted by `backend/controllers/AdminController.js`
 * and `backend/services/adminStats.js`.
 */

export type AdminRole = "user" | "tour_leader" | "admin" | "super_admin";
export type AssignableRole = "user" | "tour_leader" | "admin";

export type AdminPermission = "DELETE_USERS" | "APPROVE_CONTENT" | "VIEW_AUDIT_LOGS";

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
  role?: "admin" | "tour_leader";
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