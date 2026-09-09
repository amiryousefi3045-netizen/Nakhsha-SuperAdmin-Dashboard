/**
 * Super Admin API service.
 *
 * Every function targets `/api/admin/*` (the apiClient base URL already
 * includes `/api`). All routes require `super_admin` on the backend; the
 * token is injected automatically by the apiClient interceptor.
 */

import { apiClient } from "../lib/apiClient";
import type { ApiError, ApiResult, PaginationMeta } from "../types/apiClient";
import type {
  AdminCraft,
  AdminListing,
  AdminPage,
  AdminPermission,
  AdminProvider,
  AdminSettings,
  AdminStats,
  AdminUser,
  AssignableRole,
  AuditLogEntry,
  ListingStatus,
  ListAuditLogsParams,
  ListCraftsParams,
  ListListingsParams,
  ListProvidersParams,
  ListUsersParams,
} from "../types/admin";

/** Result of a paginated admin fetch: items + pagination metadata. */
export interface AdminPaged<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Throws the normalized ApiError when a request failed. */
function unwrap<T>(res: ApiResult<T>): T {
  if (!res.success || res.data === undefined) {
    throw (res.error as ApiError) ?? new Error("پاسخ سرور نامعتبر است");
  }
  return res.data;
}

async function paged<T>(res: ApiResult<AdminPage<T>>): Promise<AdminPaged<T>> {
  const data = unwrap(res);
  return {
    items: data.items,
    meta: {
      page: data.page,
      limit: data.limit,
      total: data.total,
      totalPages: data.limit > 0 ? Math.ceil(data.total / data.limit) : 1,
    },
  };
}

// ── Dashboard stats ────────────────────────────────────────────────────────

/** GET /admin/stats */
export async function getAdminStats(): Promise<AdminStats> {
  const res = await apiClient.get<AdminStats>("/admin/stats");
  return unwrap(res);
}

// ── Users ──────────────────────────────────────────────────────────────────

type AdminUserResponse = { user: AdminUser; unchanged?: boolean };
type AdminUserListEnvelope = AdminPage<AdminUser>;

/** GET /admin/users */
export async function getAdminUsers(params: ListUsersParams = {}): Promise<AdminPaged<AdminUser>> {
  const res = await apiClient.get<AdminUserListEnvelope>("/admin/users", { params });
  return paged(res);
}

/** PATCH /admin/users/:id/role */
export async function updateUserRole(id: string, role: AssignableRole): Promise<AdminUser> {
  const res = await apiClient.patch<AdminUserResponse>(`/admin/users/${id}/role`, { role });
  return unwrap(res).user;
}

/** PATCH /admin/users/:id/permissions */
export async function updateUserPermissions(id: string, permissions: AdminPermission[]): Promise<AdminUser> {
  const res = await apiClient.patch<AdminUserResponse>(`/admin/users/${id}/permissions`, { permissions });
  return unwrap(res).user;
}

/** PATCH /admin/users/:id/block */
export async function toggleUserBlock(id: string, isBlocked: boolean, moderatorNote?: string): Promise<AdminUser> {
  const res = await apiClient.patch<AdminUserResponse>(`/admin/users/${id}/block`, {
    isBlocked,
    ...(moderatorNote !== undefined ? { moderatorNote } : {}),
  });
  return unwrap(res).user;
}

/** DELETE /admin/users/:id */
export async function deleteAdminUser(id: string): Promise<{ message: string; id: string }> {
  const res = await apiClient.delete<{ message: string; id: string }>(`/admin/users/${id}`);
  return unwrap(res);
}

// ── Listings ───────────────────────────────────────────────────────────────

type AdminListingResponse = { listing: AdminListing; unchanged?: boolean };

/** GET /admin/listings */
export async function getAdminListings(params: ListListingsParams = {}): Promise<AdminPaged<AdminListing>> {
  const res = await apiClient.get<AdminPage<AdminListing>>("/admin/listings", { params });
  return paged(res);
}

/** PATCH /admin/listings/:id/status */
export async function updateListingStatus(id: string, status: ListingStatus): Promise<AdminListing> {
  const res = await apiClient.patch<AdminListingResponse>(`/admin/listings/${id}/status`, { status });
  return unwrap(res).listing;
}

/** PATCH /admin/listings/:id/content */
export async function updateListingContent(
  id: string,
  payload: { title?: string; description?: string },
): Promise<AdminListing> {
  const res = await apiClient.patch<AdminListingResponse>(`/admin/listings/${id}/content`, payload);
  return unwrap(res).listing;
}

// ── Crafts ─────────────────────────────────────────────────────────────────

/** GET /admin/crafts */
export async function getAdminCrafts(params: ListCraftsParams = {}): Promise<AdminPaged<AdminCraft>> {
  const res = await apiClient.get<AdminPage<AdminCraft>>("/admin/crafts", { params });
  return paged(res);
}

type CraftPublishResponse = {
  craft: { id: string; title: string; isPublished: boolean; author?: { id: string; name: string; handle?: string | null } | null };
  unchanged?: boolean;
};

/** PATCH /admin/crafts/:id/publish */
export async function setCraftPublish(id: string, isPublished: boolean): Promise<CraftPublishResponse["craft"]> {
  const res = await apiClient.patch<CraftPublishResponse>(`/admin/crafts/${id}/publish`, { isPublished });
  return unwrap(res).craft;
}

// ── Providers ──────────────────────────────────────────────────────────────

type AdminProviderResponse = { provider: AdminProvider; unchanged?: boolean };

/** GET /admin/providers */
export async function getAdminProviders(params: ListProvidersParams = {}): Promise<AdminPaged<AdminProvider>> {
  const res = await apiClient.get<AdminPage<AdminProvider>>("/admin/providers", { params });
  return paged(res);
}

/** GET /admin/providers/:providerId */
export async function getAdminProviderDetail(providerId: string): Promise<AdminProvider> {
  const res = await apiClient.get<{ provider: AdminProvider }>(`/admin/providers/${providerId}`);
  return unwrap(res).provider;
}

/** PATCH /admin/providers/:providerId/status */
export async function updateProviderStatus(
  providerId: string,
  status: "active" | "suspended",
  reason?: string,
): Promise<AdminProvider> {
  const res = await apiClient.patch<AdminProviderResponse>(`/admin/providers/${providerId}/status`, {
    status,
    ...(reason !== undefined ? { reason } : {}),
  });
  return unwrap(res).provider;
}

// ── Audit logs ─────────────────────────────────────────────────────────────

/** GET /admin/audit-logs */
export async function getAdminAuditLogs(params: ListAuditLogsParams = {}): Promise<AdminPaged<AuditLogEntry>> {
  const res = await apiClient.get<AdminPage<AuditLogEntry>>("/admin/audit-logs", { params });
  return paged(res);
}

// ── Settings & account ─────────────────────────────────────────────────────

/** GET /admin/settings */
export async function getAdminSettings(): Promise<AdminSettings> {
  const res = await apiClient.get<AdminSettings>("/admin/settings");
  return unwrap(res);
}

/** PATCH /admin/profile */
export async function updateAdminProfile(payload: { name?: string; bio?: string; avatar?: string }): Promise<AdminUser> {
  const res = await apiClient.patch<{ user: AdminUser }>("/admin/profile", payload);
  return unwrap(res).user;
}

/** POST /admin/logout-all */
export async function adminLogoutAll(): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>("/admin/logout-all");
  return unwrap(res);
}