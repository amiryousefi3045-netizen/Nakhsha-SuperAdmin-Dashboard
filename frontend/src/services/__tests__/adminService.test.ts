/**
 * Unit tests for the Super Admin API service.
 *
 * apiClient is fully mocked so no network calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    rawGet: vi.fn(),
  },
  TokenManager: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
  API_BASE_URL: "/api",
}));

import {
  getAdminStats,
  getAdminUsers,
  updateUserRole,
  updateUserPermissions,
  toggleUserBlock,
  deleteAdminUser,
  getUserSessions,
  revokeUserSession,
  getAdminListings,
  updateListingContent,
  updateListingStatus,
  getAdminCrafts,
  setCraftPublish,
  getAdminProviders,
  updateProviderStatus,
  getAdminAuditLogs,
  getAdminAuditLogDetail,
  exportAdminAuditLogs,
  getAdminComments,
  deleteAdminComment,
  parseAdminLiveEvent,
  getAdminSettings,
  adminLogoutAll,
} from "../adminService";
import { apiClient } from "../../lib/apiClient";

const ok = <T>(data: T) => ({ success: true as const, data });
const fail = () => ({
  success: false as const,
  error: { code: "FORBIDDEN", message: "دسترسی لازم را ندارید", status: 403 },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAdminStats", () => {
  it("returns the stats payload from the envelope", async () => {
    const payload = {
      overview: { totalUsers: 12, activeContent: 30, pendingContent: 2, blockedUsers: 1 },
      growth: [{ date: "2026-09-01", users: 1, content: 3 }],
      distribution: [{ type: "post", count: 3 }],
      topCities: [{ city: "تهران", count: 4 }],
      recentActivity: [],
      dbTotals: { users: 10, listings: 30, crafts: 4, auditLogs: 90, refreshTokens: 12 },
    };
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok(payload));

    await expect(getAdminStats()).resolves.toEqual(payload);
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/admin/stats");
  });

  it("throws the ApiError when the request fails", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(fail());
    await expect(getAdminStats()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("getAdminUsers", () => {
  it("calls GET /admin/users with query params and builds pagination meta", async () => {
    const envelope = {
      items: [
        { id: "u1", name: "علی", phone: "09120000000", role: "user" },
        { id: "u2", name: "سارا", phone: "09130000000", role: "admin" },
      ],
      total: 2,
      page: 1,
      limit: 15,
    };
    vi.mocked(apiClient.get).mockResolvedValueOnce(ok(envelope));

    const result = await getAdminUsers({ page: 1, q: "علی" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/admin/users", {
      params: { page: 1, q: "علی" },
    });
    expect(result.items).toHaveLength(2);
    expect(result.meta).toEqual({
      page: 1,
      limit: 15,
      total: 2,
      totalPages: 1,
    });
  });
});

describe("user mutations", () => {
  it("updateUserRole patches the role endpoint", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ user: { id: "u1", role: "admin" } }),
    );
    const user = await updateUserRole("u1", "admin");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith(
      "/admin/users/u1/role",
      { role: "admin" },
    );
    expect(user.role).toBe("admin");
  });

  it("updateUserPermissions patches the permissions endpoint", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ user: { id: "u2", permissions: ["APPROVE_CONTENT"] } }),
    );
    await updateUserPermissions("u2", ["APPROVE_CONTENT"]);
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith(
      "/admin/users/u2/permissions",
      { permissions: ["APPROVE_CONTENT"] },
    );
  });

  it("toggleUserBlock only includes moderatorNote when provided", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ user: { id: "u3", isBlocked: true } }),
    );
    await toggleUserBlock("u3", true, "تخلف مکرر");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/admin/users/u3/block", {
      isBlocked: true,
      moderatorNote: "تخلف مکرر",
    });

    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ user: { id: "u3", isBlocked: false } }),
    );
    await toggleUserBlock("u3", false);
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/admin/users/u3/block", {
      isBlocked: false,
    });
  });

  it("deleteAdminUser calls DELETE and returns the message", async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(
      ok({ message: "کاربر حذف شد", id: "u4" }),
    );
    await expect(deleteAdminUser("u4")).resolves.toMatchObject({
      message: "کاربر حذف شد",
    });
    expect(vi.mocked(apiClient.delete)).toHaveBeenCalledWith("/admin/users/u4");
  });
});

describe("content management", () => {
  it("getAdminListings passes type/status filters", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [], total: 0, page: 1, limit: 15 }),
    );
    await getAdminListings({ type: "tour", status: "published" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/admin/listings", {
      params: { type: "tour", status: "published" },
    });
  });

  it("updateListingContent patches title/description", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ listing: { id: "l1", title: "جدید" } }),
    );
    const listing = await updateListingContent("l1", { title: "جدید" });
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith(
      "/admin/listings/l1/content",
      { title: "جدید" },
    );
    expect(listing.title).toBe("جدید");
  });

  it("updateListingStatus patches the status endpoint", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ listing: { id: "l2", status: "rejected" } }),
    );
    await updateListingStatus("l2", "rejected");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith(
      "/admin/listings/l2/status",
      { status: "rejected" },
    );
  });

  it("getAdminCrafts passes the kind filter", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [], total: 0, page: 1, limit: 15 }),
    );
    await getAdminCrafts({ kind: "artwork" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/admin/crafts", {
      params: { kind: "artwork" },
    });
  });

  it("setCraftPublish patches the publish endpoint", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ craft: { id: "c1", title: "گلیم", isPublished: true } }),
    );
    const craft = await setCraftPublish("c1", true);
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith("/admin/crafts/c1/publish", {
      isPublished: true,
    });
    expect(craft.isPublished).toBe(true);
  });
});

describe("providers", () => {
  it("getAdminProviders forwards the status filter", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [], total: 0, page: 1, limit: 15 }),
    );
    await getAdminProviders({ status: "pending" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/admin/providers", {
      params: { status: "pending" },
    });
  });

  it("updateProviderStatus sends status and optional reason", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce(
      ok({ provider: { id: "p1", status: "suspended" } }),
    );
    await updateProviderStatus("p1", "suspended", "بدون فعالیت");
    expect(vi.mocked(apiClient.patch)).toHaveBeenCalledWith(
      "/admin/providers/p1/status",
      { status: "suspended", reason: "بدون فعالیت" },
    );
  });
});

describe("comment moderation", () => {
  it("getAdminComments forwards search + rating filters", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [], total: 0, page: 1, limit: 15 }),
    );
    await getAdminComments({ q: "گلیم", rating: 5 });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/admin/comments", {
      params: { q: "گلیم", rating: 5 },
    });
  });

  it("deleteAdminComment calls DELETE with both ids", async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(
      ok({ id: "c1", craft: { id: "craft1" } }),
    );
    const result = await deleteAdminComment("craft1", "c1");
    expect(vi.mocked(apiClient.delete)).toHaveBeenCalledWith(
      "/admin/comments/craft1/c1",
    );
    expect(result.craft.id).toBe("craft1");
  });
});

describe("audit log detail & export", () => {
  it("getAdminAuditLogDetail fetches /audit-logs/:id and unwraps the log", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({
        log: {
          id: "a1",
          action: "ADMIN_CONTENT_REMOVED",
          riskLevel: "HIGH" as const,
          requestContext: { ip: "10.0.0.5", userAgent: null, referer: null, endpoint: "/x", method: "DELETE", statusCode: 200 },
          metadata: { reason: "گزارش" },
          error: null,
          compliance: { gdprRelevant: false, dataCategories: [] },
        },
      }),
    );
    const log = await getAdminAuditLogDetail("a1");
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/admin/audit-logs/a1");
    expect(log.requestContext?.ip).toBe("10.0.0.5");
  });

  it("exportAdminAuditLogs downloads a blob with the server filename", async () => {
    vi.mocked(apiClient.rawGet).mockResolvedValueOnce({
      data: new Blob(["\uFEFFcreatedAt,action\r\n"], { type: "text/csv" }),
      headers: { "content-disposition": 'attachment; filename="audit-logs-2026-09-13.csv"' },
    } as never);
    const file = await exportAdminAuditLogs({ action: "LOGIN" });
    expect(vi.mocked(apiClient.rawGet)).toHaveBeenCalledWith("/admin/audit-logs/export", {
      params: { action: "LOGIN" },
      responseType: "blob",
    });
    expect(file.filename).toBe("audit-logs-2026-09-13.csv");
    expect(file.blob.type).toBe("text/csv");
  });

  it("exportAdminAuditLogs falls back to a default filename", async () => {
    vi.mocked(apiClient.rawGet).mockResolvedValueOnce({
      data: new Blob(["x"], { type: "text/csv" }),
      headers: {},
    } as never);
    const file = await exportAdminAuditLogs();
    expect(file.filename).toMatch(/^audit-logs-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe("user sessions", () => {
  it("getUserSessions fetches the sessions list", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ user: { id: "u1", name: "علی", handle: "ali" }, total: 1, sessions: [] }),
    );
    const result = await getUserSessions("u1");
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/admin/users/u1/sessions");
    expect(result.total).toBe(1);
  });

  it("revokeUserSession deletes a single session", async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(
      ok({ message: "نشست بسته شد", sessionId: "s1" }),
    );
    const result = await revokeUserSession("u1", "s1");
    expect(vi.mocked(apiClient.delete)).toHaveBeenCalledWith(
      "/admin/users/u1/sessions/s1",
    );
    expect(result.sessionId).toBe("s1");
  });
});

describe("admin live events parser", () => {
  it("parses an audit SSE block", () => {
    const block = 'event: audit\ndata: {"id":"a1","action":"USER_VERIFIED","riskLevel":"HIGH"}';
    const event = parseAdminLiveEvent(block);
    expect(event?.type).toBe("audit");
    expect(event?.payload?.action).toBe("USER_VERIFIED");
  });

  it("parses initial/heartbeat blocks", () => {
    const initial = parseAdminLiveEvent('event: initial\ndata: {"at":"2026-09-13T10:00:00.000Z"}');
    expect(initial?.type).toBe("initial");
    expect(initial?.at).toMatch(/^2026/);

    const heartbeat = parseAdminLiveEvent('event: heartbeat\ndata: {"at":"2026-09-13T10:00:00.000Z"}');
    expect(heartbeat?.type).toBe("heartbeat");
  });

  it("returns null for malformed data", () => {
    expect(parseAdminLiveEvent("event: audit\ndata: not-json")).toBeNull();
    expect(parseAdminLiveEvent("")).toBeNull();
  });
});

describe("audit logs, settings, account", () => {
  it("getAdminAuditLogs builds a date range", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({ items: [], total: 0, page: 1, limit: 20 }),
    );
    await getAdminAuditLogs({ action: "USER_BLOCK", from: "2026-01-01T00:00:00.000Z" });
    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith("/admin/audit-logs", {
      params: {
        action: "USER_BLOCK",
        from: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  it("getAdminSettings returns settings and database status", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      ok({
        settings: [{ key: "JWT_SECRET", isConfigured: true }],
        database: { status: "up" as const, lastCheckedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    const settings = await getAdminSettings();
    expect(settings.database.status).toBe("up");
    expect(settings.settings[0].key).toBe("JWT_SECRET");
  });

  it("adminLogoutAll calls POST /admin/logout-all", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(
      ok({ message: "همه نشست‌ها بسته شدند" }),
    );
    const result = await adminLogoutAll();
    expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith("/admin/logout-all");
    expect(result.message).toContain("نشست");
  });
});