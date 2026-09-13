/**
 * Super Admin API service.
 *
 * Every function targets `/api/admin/*` (the apiClient base URL already
 * includes `/api`). All routes require `super_admin` on the backend; the
 * token is injected automatically by the apiClient interceptor.
 */

import { apiClient, API_BASE_URL, TokenManager } from "../lib/apiClient";
import type { ApiError, ApiResult, PaginationMeta } from "../types/apiClient";
import type {
  AdminComment,
  AdminCraft,
  AdminListing,
  AdminLiveEvent,
  AdminPage,
  AdminPermission,
  AdminProvider,
  AdminSettings,
  AdminStats,
  AdminUser,
  AssignableRole,
  AuditLogDetail,
  AuditLogEntry,
  ExportFile,
  ListingStatus,
  ListAuditLogsParams,
  ListCommentsParams,
  ListCraftsParams,
  ListListingsParams,
  ListProvidersParams,
  ListUsersParams,
  UserSessionsResult,
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

// ── User sessions ──────────────────────────────────────────────────────────

/** GET /admin/users/:id/sessions */
export async function getUserSessions(userId: string): Promise<UserSessionsResult> {
  const res = await apiClient.get<UserSessionsResult>(`/admin/users/${userId}/sessions`);
  return unwrap(res);
}

/** DELETE /admin/users/:id/sessions/:sessionId */
export async function revokeUserSession(
  userId: string,
  sessionId: string,
): Promise<{ message: string; sessionId: string }> {
  const res = await apiClient.delete<{ message: string; sessionId: string }>(
    `/admin/users/${userId}/sessions/${sessionId}`,
  );
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

/** GET /admin/audit-logs/:id */
export async function getAdminAuditLogDetail(id: string): Promise<AuditLogDetail> {
  const res = await apiClient.get<{ log: AuditLogDetail }>(`/admin/audit-logs/${encodeURIComponent(id)}`);
  return unwrap(res).log;
}

/** GET /admin/audit-logs/export (CSV download) */
export async function exportAdminAuditLogs(
  params: Omit<ListAuditLogsParams, "page" | "limit"> = {},
): Promise<ExportFile> {
  const response = await apiClient.rawGet<Blob>("/admin/audit-logs/export", {
    params,
    responseType: "blob",
  });

  const disposition = String(response.headers["content-disposition"] ?? "");
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return {
    blob: response.data,
    filename: match?.[1] ?? `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

// ── Comment moderation──────────────────────────────────────────────────────

/** GET /admin/comments */
export async function getAdminComments(params: ListCommentsParams = {}): Promise<AdminPaged<AdminComment>> {
  const res = await apiClient.get<AdminPage<AdminComment>>("/admin/comments", { params });
  return paged(res);
}

/** DELETE /admin/comments/:craftId/:commentId */
export async function deleteAdminComment(
  craftId: string,
  commentId: string,
): Promise<{ id: string; craft: { id: string } }> {
  const res = await apiClient.delete<{ id: string; craft: { id: string } }>(
    `/admin/comments/${encodeURIComponent(craftId)}/${encodeURIComponent(commentId)}`,
  );
  return unwrap(res);
}

// ── Live events (SSE) ──────────────────────────────────────────────────────

export interface LiveEventHandlers {
  onEvent: (event: AdminLiveEvent) => void;
  onError?: (err: unknown) => void;
  onClose?: () => void;
}

/** Parses one SSE block ("event: x\ndata: {...}").
 *  Exported for unit tests. */
export function parseAdminLiveEvent(block: string): AdminLiveEvent | null {
  const typeMatch = /^event:\s*(.+)$/m.exec(block);
  const dataMatch = /^data:\s*(.+)$/m.exec(block);
  if (!dataMatch) return null;
  const type = (typeMatch ? typeMatch[1].trim() : "message") as AdminLiveEvent["type"];

  try {
    const payload = JSON.parse(dataMatch[1].trim());
    if (type === "audit") return { type, payload: payload as AdminLiveEvent["payload"] };
    return { type, at: (payload as { at?: string } | undefined)?.at };
  } catch {
    return null;
  }
}

/**
 * Subscribes to /admin/events/live over fetch+ReadableStream (EventSource can't
 * send an Authorization header, so a raw stream is used instead). Returns an
 * unsubscribe function. The token is injected via Bearer header automatically.
 */
export function subscribeAdminLiveEvents(handlers: LiveEventHandlers): () => void {
  const controller = new AbortController();
  const token = TokenManager.get();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let buffer = "";
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    handlers.onClose?.();
  };

  (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/events/live`, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const event = parseAdminLiveEvent(part);
          if (event) handlers.onEvent(event);
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        handlers.onError?.(err);
      }
    } finally {
      closed = true;
    }
  })();

  return close;
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