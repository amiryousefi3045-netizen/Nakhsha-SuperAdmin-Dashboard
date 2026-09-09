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
  },
  TokenManager: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));

import {
  getAdminStats,
  getAdminUsers,
  updateUserRole,
  updateUserPermissions,
  toggleUserBlock,
  deleteAdminUser,
  getAdminListings,
  updateListingContent,
  updateListingStatus,
  getAdminCrafts,
  setCraftPublish,
  getAdminProviders,
  updateProviderStatus,
  getAdminAuditLogs,
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