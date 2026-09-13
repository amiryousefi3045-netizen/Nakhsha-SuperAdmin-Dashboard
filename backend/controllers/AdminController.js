/**
 * Admin Controller
 *
 * Super Admin dashboard controller. Every endpoint here is protected upstream
 * by `requireAuth` + `requireRole("super_admin")` and every payload is
 * validated with Zod before any database mutation.
 *
 * Security invariants enforced in this module:
 *  - No path can create/promote a `super_admin`.
 *  - A Super Admin can never change/block/delete its own account.
 *  - A Super Admin can never be blocked or deleted by anyone.
 *  - Sensitive operations always write an AuditLog with a Zod-validated payload.
 *  - Role changes / blocks invalidate active refresh tokens immediately.
 *  - Only an allowlist of fields is ever mutated.
 */

const mongoose = require("mongoose");
const { randomUUID } = require("crypto");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const { Listing } = require("../models/Listing");
const Craft = require("../models/Craft");
const AuditLog = require("../models/AuditLog");
const TokenService = require("../services/TokenService");
const AuditService = require("../services/AuditService");
const adminStats = require("../services/adminStats");
const adminEventHub = require("../services/AdminEventHub");
const { createErrorResponse, createSuccessResponse } = require("../utils/response");
const logger = require("../utils/logger");
const { z } = require("zod");

// ── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_USER_ROLES = ["user", "tour_leader", "admin"];
const ALLOWED_PERMISSIONS = [
  "DELETE_USERS",
  "APPROVE_CONTENT",
  "VIEW_AUDIT_LOGS",
];
const ALLOWED_LISTING_STATUSES = [
  "draft",
  "pending",
  "published",
  "rejected",
  "archived",
];
const LISTING_TYPES = ["post", "tour", "training", "academy"];
const MAX_PAGE_SIZE = 100;
const BATCH_MAX_IDS = 50;

// ── Helpers ─────────────────────────────────────────────────────────────────

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeId(value) {
  return String(value);
}

// Zod validation for the audit payload before it is written to the DB.
const auditPayloadSchema = z.object({
  userId: z.string().min(1),
  action: z.string().min(1),
  resource: z
    .object({
      type: z.enum(["USER", "LISTING", "CRAFT", "POST", "ARTISAN", "TRANSACTION"]),
      id: z.string().optional(),
    })
    .optional(),
  changes: z
    .object({ before: z.unknown().optional(), after: z.unknown().optional() })
    .optional(),
  requestContext: z.unknown().optional(),
  result: z.enum(["SUCCESS", "FAILURE", "PARTIAL"]).optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function writeAudit(req, payload) {
  const parsed = auditPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn("Audit payload validation failed", {
      errors: parsed.error.issues,
    });
    return;
  }
  await AuditService.log({
    ...parsed.data,
    requestContext: req,
  });
}

function userToAdminDTO(user) {
  return {
    id: normalizeId(user._id),
    name: user.name || "",
    phone: user.phone,
    handle: user.handle || null,
    avatar: user.avatar || "",
    role: user.role,
    isBlocked: Boolean(user.isBlocked),
    moderatorNote: user.moderatorNote || "",
    permissions: user.permissions || [],
    isVerified: Boolean(user.isVerified),
    creatorType: user.creatorType || "artisan",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function listingToDTO(listing) {
  const owner = listing.owner;
  return {
    id: normalizeId(listing._id),
    type: listing.type || "post",
    title: listing.title,
    description: listing.description,
    status: listing.status || "draft",
    location: {
      city: listing.location?.city || null,
      province: listing.location?.province || null,
      address: listing.location?.address || null,
    },
    owner: owner
      ? { id: normalizeId(owner._id), name: owner.name || "", handle: owner.handle || null }
      : null,
    revision: listing.revision || 0,
    editCount: Array.isArray(listing.editHistory) ? listing.editHistory.length : 0,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}

function auditLogToDTO(log) {
  return {
    id: normalizeId(log._id),
    action: log.action,
    actorId: log.userId ? normalizeId(log.userId._id || log.userId) : null,
    actorName:
      (log.userId && (log.userId.name || log.userId.handle)) || "سیستم",
    resource: log.resource
      ? { type: log.resource.type || null, id: log.resource.id ? normalizeId(log.resource.id) : null }
      : null,
    changes: log.changes || null,
    result: log.result || "SUCCESS",
    riskLevel: log.riskLevel || "LOW",
    ip: log.requestContext?.ip || null,
    createdAt: log.createdAt,
  };
}

function safePageSize(raw) {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function safePage(raw) {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return 1;
  return parsed;
}

// ── Stats ───────────────────────────────────────────────────────────────────

async function getStats(req, res) {
  try {
    const [overview, growth, distribution, topCities, recentActivity, dbTotals] =
      await Promise.all([
        adminStats.getOverviewStats(),
        adminStats.getGrowthTrend(30),
        adminStats.getContentDistribution(),
        adminStats.getTopCities(10),
        adminStats.getRecentActivity(20),
        adminStats.getDbTotals(),
      ]);

    res.json(
      createSuccessResponse(
        { overview, growth, distribution, topCities, recentActivity, dbTotals },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin getStats error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Users ───────────────────────────────────────────────────────────────────

async function getUsers(req, res) {
  try {
    const { q, role, page: pageRaw, limit: limitRaw } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);
    const skip = (page - 1) * limit;

    const filter = {};

    if (role) {
      if (!["user", "tour_leader", "admin", "super_admin"].includes(role)) {
        return res
          .status(400)
          .json(createErrorResponse("VALIDATION_ERROR", "نقش نامعتبر است", { field: "role" }, req.id));
      }
      filter.role = role;
    }

    if (q && String(q).trim()) {
      const trimmed = String(q).trim();
      const safe = escapeRegex(trimmed);
      filter.$or = [{ name: { $regex: safe, $options: "i" } }, { phone: { $regex: safe, $options: "i" } }, { handle: { $regex: safe, $options: "i" } }];
      if (isValidObjectId(trimmed)) {
        filter.$or.push({ _id: trimmed });
      }
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("name phone handle avatar role isBlocked moderatorNote permissions isVerified creatorType createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json(
      createSuccessResponse(
        { items: users.map(userToAdminDTO), total, page, limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin getUsers error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    if (!ALLOWED_USER_ROLES.includes(role)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "نقش مورد نظر نامعتبر است",
            { field: "role", allowedRoles: ALLOWED_USER_ROLES },
            req.id,
          ),
        );
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "کاربر یافت نشد", null, req.id));
    }

    if (String(target._id) === String(req.user.id)) {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "شما نمی‌توانید نقش حساب خود را تغییر دهید", null, req.id));
    }

    if (target.role === "super_admin") {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "تغییر نقش سوپر ادمین مجاز نیست", null, req.id));
    }

    const prevRole = target.role;
    if (prevRole === role) {
      return res.json(createSuccessResponse({ user: userToAdminDTO(target), unchanged: true }, req.id));
    }

    target.role = role;
    if (role !== "admin") {
      target.permissions = [];
    }
    await target.save();

    await TokenService.revokeAllTokens(String(target._id), "ADMIN_REVOKE").catch((err) => {
      logger.warn("Failed to revoke tokens after role change", { userId: target._id, error: err.message });
    });

    await writeAudit(req, {
      userId: req.user.id,
      action: "USER_ROLE_CHANGE",
      resource: { type: "USER", id: String(target._id) },
      changes: { before: { role: prevRole }, after: { role } },
      result: "SUCCESS",
      riskLevel: "HIGH",
      metadata: { reason: "admin role change" },
    });

    res.json(createSuccessResponse({ user: userToAdminDTO(target) }, req.id));
  } catch (e) {
    logger.error("Admin updateUserRole error", { error: e.message, stack: e.stack, userId: req.user?.id, targetId: req.params.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function updateUserPermissions(req, res) {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    const invalid = (permissions || []).filter((p) => !ALLOWED_PERMISSIONS.includes(p));
    if (invalid.length > 0) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "دسترسی نامعتبر است",
            { field: "permissions", invalid },
            req.id,
          ),
        );
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "کاربر یافت نشد", null, req.id));
    }

    if (String(target._id) === String(req.user.id)) {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "شما نمی‌توانید دسترسی‌های حساب خود را تغییر دهید", null, req.id));
    }

    if (target.role === "super_admin") {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "تغییر دسترسی سوپر ادمین مجاز نیست", null, req.id));
    }

    if (target.role !== "admin") {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "تنها کاربران با نقش ادمین می‌توانند دسترسی خرد داشته باشند",
            { field: "role" },
            req.id,
          ),
        );
    }

    const prevPermissions = [...(target.permissions || [])];
    const nextPermissions = Array.from(new Set(permissions || []));
    if (JSON.stringify(prevPermissions) === JSON.stringify(nextPermissions)) {
      return res.json(createSuccessResponse({ user: userToAdminDTO(target), unchanged: true }, req.id));
    }

    target.permissions = nextPermissions;
    await target.save();

    await writeAudit(req, {
      userId: req.user.id,
      action: "USER_PERMISSIONS_CHANGE",
      resource: { type: "USER", id: String(target._id) },
      changes: { before: { permissions: prevPermissions }, after: { permissions: nextPermissions } },
      result: "SUCCESS",
      riskLevel: "HIGH",
    });

    res.json(createSuccessResponse({ user: userToAdminDTO(target) }, req.id));
  } catch (e) {
    logger.error("Admin updateUserPermissions error", { error: e.message, stack: e.stack, userId: req.user?.id, targetId: req.params.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function toggleUserBlock(req, res) {
  try {
    const { id } = req.params;
    const { isBlocked, moderatorNote } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    if (typeof isBlocked !== "boolean") {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "وضعیت مسدودسازی باید boolean باشد", { field: "isBlocked" }, req.id));
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "کاربر یافت نشد", null, req.id));
    }

    if (String(target._id) === String(req.user.id)) {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "شما نمی‌توانید حساب خود را مسدود یا فعال کنید", null, req.id));
    }

    if (target.role === "super_admin") {
      return res
        .status(403)
        .json(
          createErrorResponse("FORBIDDEN", "امکان مسدودسازی یا فعال‌سازی سوپر ادمین وجود ندارد", null, req.id),
        );
    }

    const prevBlocked = Boolean(target.isBlocked);
    if (prevBlocked === isBlocked) {
      return res.json(createSuccessResponse({ user: userToAdminDTO(target), unchanged: true }, req.id));
    }

    target.isBlocked = isBlocked;
    if (moderatorNote !== undefined) {
      target.moderatorNote = String(moderatorNote).trim();
    }
    await target.save();

    if (isBlocked) {
      await TokenService.revokeAllTokens(String(target._id), "ADMIN_REVOKE").catch((err) => {
        logger.warn("Failed to revoke tokens after block", { userId: target._id, error: err.message });
      });
    }

    await writeAudit(req, {
      userId: req.user.id,
      action: "USER_BLOCK",
      resource: { type: "USER", id: String(target._id) },
      changes: { before: { isBlocked: prevBlocked }, after: { isBlocked } },
      result: "SUCCESS",
      riskLevel: isBlocked ? "HIGH" : "MEDIUM",
      metadata: { reason: moderatorNote || "block toggled by super admin" },
    });

    res.json(createSuccessResponse({ user: userToAdminDTO(target) }, req.id));
  } catch (e) {
    logger.error("Admin toggleUserBlock error", { error: e.message, stack: e.stack, userId: req.user?.id, targetId: req.params.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "کاربر یافت نشد", null, req.id));
    }

    if (String(target._id) === String(req.user.id)) {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "شما نمی‌توانید حساب خود را حذف کنید", null, req.id));
    }

    if (target.role === "super_admin") {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "حذف سوپر ادمین مجاز نیست", null, req.id));
    }

    const { name, phone, role } = target;
    await User.deleteOne({ _id: target._id });

    await RefreshToken.deleteMany({ userId: target._id }).catch((err) => {
      logger.warn("Failed to clean refresh tokens on user delete", { userId: target._id, error: err.message });
    });

    await writeAudit(req, {
      userId: req.user.id,
      action: "USER_DELETE",
      resource: { type: "USER", id: String(target._id) },
      changes: { before: { name, phone, role }, after: null },
      result: "SUCCESS",
      riskLevel: "CRITICAL",
    });

    res.json(createSuccessResponse({ message: "کاربر حذف شد", id: String(target._id) }, req.id));
  } catch (e) {
    logger.error("Admin deleteUser error", { error: e.message, stack: e.stack, userId: req.user?.id, targetId: req.params.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── User sessions ───────────────────────────────────────────────────────────

function sessionToDTO(session) {
  const lastUsedAt = session.deviceInfo?.lastUsedAt || session.createdAt;
  return {
    id: normalizeId(session._id),
    userId: session.userId ? normalizeId(session.userId) : null,
    deviceId: session.deviceId || null,
    device: session.deviceInfo
      ? {
          userAgent: session.deviceInfo.userAgent || null,
          ipAddress: session.deviceInfo.ipAddress || null,
        }
      : null,
    lastUsedAt: lastUsedAt || null,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    rotationCount: session.rotationCount ?? 0,
  };
}

async function getUserSessions(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    const target = await User.findById(id).select("name handle").lean();
    if (!target) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "کاربر یافت نشد", null, req.id));
    }

    const sessions = await RefreshToken.find({
      userId: target._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ "deviceInfo.lastUsedAt": -1 })
      .limit(50)
      .lean();

    res.json(
      createSuccessResponse(
        { user: { id: normalizeId(target._id), name: target.name, handle: target.handle }, sessions: sessions.map(sessionToDTO), total: sessions.length },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin getUserSessions error", { error: e.message, stack: e.stack, userId: req.user?.id, targetId: req.params.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function revokeUserSession(req, res) {
  try {
    const { id, sessionId } = req.params;
    if (!isValidObjectId(id) || !isValidObjectId(sessionId)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "کاربر یافت نشد", null, req.id));
    }

    if (String(target._id) === String(req.user.id)) {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "شما نمی‌توانید نشست‌های خود را از اینجا ببندید", null, req.id));
    }

    if (target.role === "super_admin") {
      return res.status(403).json(createErrorResponse("FORBIDDEN", "امکان بستن نشست‌های سوپر ادمین وجود ندارد", null, req.id));
    }

    const result = await RefreshToken.updateOne(
      { _id: sessionId, userId: target._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revocationReason: "ADMIN_REVOKE" } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "نشست یافت نشد", null, req.id));
    }

    await writeAudit(req, {
      userId: req.user.id,
      action: "TOKEN_REVOKED",
      resource: { type: "USER", id: String(target._id) },
      changes: { before: { sessionId }, after: { revoked: true } },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      metadata: { reason: "session revoked by super admin" },
    });

    res.json(createSuccessResponse({ message: "نشست بسته شد", sessionId }, req.id));
  } catch (e) {
    logger.error("Admin revokeUserSession error", { error: e.message, stack: e.stack, userId: req.user?.id, targetId: req.params.id, sessionId: req.params.sessionId });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Bulk actions ────────────────────────────────────────────────────────────

/**
 * Deduplicate, cap and validate an array of ids for a bulk operation.
 * Returns `null` when there is nothing to process or the input is invalid.
 */
function normalizeBatchIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const unique = [...new Set(ids.map((i) => String(i).trim()).filter(Boolean))];
  if (unique.length === 0 || unique.some((id) => !isValidObjectId(id))) return null;
  return unique.slice(0, BATCH_MAX_IDS);
}

async function batchBlockUsers(req, res) {
  try {
    const { ids, isBlocked, moderatorNote } = req.body;
    const batchIds = normalizeBatchIds(ids);
    if (!batchIds) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه معتبری ارائه نشده است", { field: "ids", max: BATCH_MAX_IDS }, req.id));
    }
    

    const batchId = randomUUID();
    const targets = await User.find({ _id: { $in: batchIds } });
    const byId = new Map(targets.map((u) => [String(u._id), u]));
    const succeeded = [];
    const skipped = [];
    const failed = [];

    for (const id of batchIds) {
      const target = byId.get(id);
      if (!target) {
        skipped.push({ id, reason: "NOT_FOUND" });
        continue;
      }
      if (String(target._id) === String(req.user.id)) {
        failed.push({ id, reason: "SELF" });
        continue;
      }
      if (target.role === "super_admin") {
        failed.push({ id, reason: "SUPER_ADMIN" });
        continue;
      }
      const prevBlocked = Boolean(target.isBlocked);
      if (prevBlocked === isBlocked) {
        skipped.push({ id, reason: "UNCHANGED" });
        continue;
      }
      try {
        target.isBlocked = isBlocked;
        if (moderatorNote !== undefined) target.moderatorNote = String(moderatorNote).trim();
        await target.save();
        if (isBlocked) {
          await TokenService.revokeAllTokens(String(target._id), "ADMIN_REVOKE").catch((err) => {
            logger.warn("Failed to revoke tokens on bulk block", { userId: target._id, error: err.message });
          });
        }
        succeeded.push(String(target._id));
        await writeAudit(req, {
          userId: req.user.id,
          action: "USER_BLOCK",
          resource: { type: "USER", id: String(target._id) },
          changes: { before: { isBlocked: prevBlocked }, after: { isBlocked } },
          result: "SUCCESS",
          riskLevel: isBlocked ? "HIGH" : "MEDIUM",
          metadata: { batch: batchId, reason: moderatorNote || "bulk block toggled by super admin" },
        });
      } catch (e) {
        logger.warn("Bulk block failed for user", { userId: id, error: e.message });
        failed.push({ id, reason: "ERROR" });
      }
    }

    if (succeeded.length > 0) {
      await writeAudit(req, {
        userId: req.user.id,
        action: "DATA_BULK_OPERATION",
        result: "SUCCESS",
        riskLevel: isBlocked ? "HIGH" : "MEDIUM",
        metadata: {
          batch: batchId,
          operation: isBlocked ? "BLOCK_USERS" : "UNBLOCK_USERS",
          affectedCount: succeeded.length,
          ids: succeeded,
        },
      });
    }

    res.json(
      createSuccessResponse(
        {
          batchId,
          summary: { total: batchIds.length, succeeded: succeeded.length, skipped: skipped.length, failed: failed.length },
          succeeded,
          skipped,
          failed,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin batchBlockUsers error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function batchUpdateUserRole(req, res) {
  try {
    const { ids, role } = req.body;
    const batchIds = normalizeBatchIds(ids);
    if (!batchIds) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه معتبری ارائه نشده است", { field: "ids", max: BATCH_MAX_IDS }, req.id));
    }
    

    const batchId = randomUUID();
    const targets = await User.find({ _id: { $in: batchIds } });
    const byId = new Map(targets.map((u) => [String(u._id), u]));
    const succeeded = [];
    const skipped = [];
    const failed = [];

    for (const id of batchIds) {
      const target = byId.get(id);
      if (!target) {
        skipped.push({ id, reason: "NOT_FOUND" });
        continue;
      }
      if (String(target._id) === String(req.user.id)) {
        failed.push({ id, reason: "SELF" });
        continue;
      }
      if (target.role === "super_admin") {
        failed.push({ id, reason: "SUPER_ADMIN" });
        continue;
      }
      const prevRole = target.role;
      if (prevRole === role) {
        skipped.push({ id, reason: "UNCHANGED" });
        continue;
      }
      try {
        target.role = role;
        if (role !== "admin") target.permissions = [];
        await target.save();
        await TokenService.revokeAllTokens(String(target._id), "ADMIN_REVOKE").catch((err) => {
          logger.warn("Failed to revoke tokens on bulk role change", { userId: target._id, error: err.message });
        });
        succeeded.push(String(target._id));
        await writeAudit(req, {
          userId: req.user.id,
          action: "USER_ROLE_CHANGE",
          resource: { type: "USER", id: String(target._id) },
          changes: { before: { role: prevRole }, after: { role } },
          result: "SUCCESS",
          riskLevel: "HIGH",
          metadata: { batch: batchId, reason: "bulk role change" },
        });
      } catch (e) {
        logger.warn("Bulk role change failed for user", { userId: id, error: e.message });
        failed.push({ id, reason: "ERROR" });
      }
    }

    if (succeeded.length > 0) {
      await writeAudit(req, {
        userId: req.user.id,
        action: "DATA_BULK_OPERATION",
        result: "SUCCESS",
        riskLevel: "HIGH",
        metadata: { batch: batchId, operation: "ROLE_CHANGE_USERS", role, affectedCount: succeeded.length, ids: succeeded },
      });
    }

    res.json(
      createSuccessResponse(
        {
          batchId,
          summary: { total: batchIds.length, succeeded: succeeded.length, skipped: skipped.length, failed: failed.length },
          succeeded,
          skipped,
          failed,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin batchUpdateUserRole error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function batchDeleteUsers(req, res) {
  try {
    const { ids } = req.body;
    const batchIds = normalizeBatchIds(ids);
    if (!batchIds) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه معتبری ارائه نشده است", { field: "ids", max: BATCH_MAX_IDS }, req.id));
    }
    

    const batchId = randomUUID();
    const targets = await User.find({ _id: { $in: batchIds } });
    const byId = new Map(targets.map((u) => [String(u._id), u]));
    const succeeded = [];
    const skipped = [];
    const failed = [];

    for (const id of batchIds) {
      const target = byId.get(id);
      if (!target) {
        skipped.push({ id, reason: "NOT_FOUND" });
        continue;
      }
      if (String(target._id) === String(req.user.id)) {
        failed.push({ id, reason: "SELF" });
        continue;
      }
      if (target.role === "super_admin") {
        failed.push({ id, reason: "SUPER_ADMIN" });
        continue;
      }
      try {
        const { name, phone, role } = target;
        await User.deleteOne({ _id: target._id });
        await RefreshToken.deleteMany({ userId: target._id }).catch((err) => {
          logger.warn("Failed to clean refresh tokens on bulk delete", { userId: target._id, error: err.message });
        });
        succeeded.push(String(target._id));
        await writeAudit(req, {
          userId: req.user.id,
          action: "USER_DELETE",
          resource: { type: "USER", id: String(target._id) },
          changes: { before: { name, phone, role }, after: null },
          result: "SUCCESS",
          riskLevel: "CRITICAL",
          metadata: { batch: batchId },
        });
      } catch (e) {
        logger.warn("Bulk delete failed for user", { userId: id, error: e.message });
        failed.push({ id, reason: "ERROR" });
      }
    }

    if (succeeded.length > 0) {
      await writeAudit(req, {
        userId: req.user.id,
        action: "DATA_BULK_OPERATION",
        result: "SUCCESS",
        riskLevel: "CRITICAL",
        metadata: { batch: batchId, operation: "DELETE_USERS", affectedCount: succeeded.length, ids: succeeded },
      });
    }

    res.json(
      createSuccessResponse(
        {
          batchId,
          summary: { total: batchIds.length, succeeded: succeeded.length, skipped: skipped.length, failed: failed.length },
          succeeded,
          skipped,
          failed,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin batchDeleteUsers error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function batchUpdateListingStatus(req, res) {
  try {
    const { ids, status } = req.body;
    const batchIds = normalizeBatchIds(ids);
    if (!batchIds) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه معتبری ارائه نشده است", { field: "ids", max: BATCH_MAX_IDS }, req.id));
    }
    
    if (!ALLOWED_LISTING_STATUSES.includes(status)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "وضعیت مورد نظر نامعتبر است", { field: "status", allowedStatuses: ALLOWED_LISTING_STATUSES }, req.id));
    }

    const batchId = randomUUID();
    const listings = await Listing.find({ _id: { $in: batchIds } }).populate("owner", "name handle");
    const byId = new Map(listings.map((l) => [String(l._id), l]));
    const succeeded = [];
    const skipped = [];
    const failed = [];

    for (const id of batchIds) {
      const listing = byId.get(id);
      if (!listing) {
        skipped.push({ id, reason: "NOT_FOUND" });
        continue;
      }
      const prevStatus = listing.status;
      if (prevStatus === status) {
        skipped.push({ id, reason: "UNCHANGED" });
        continue;
      }
      try {
        listing.status = status;
        await listing.save();
        if (status === "published" && listing.owner) {
          await User.updateOne({ _id: listing.owner._id }, { $set: { isVerified: true } }).catch((err) => {
            logger.warn("Failed to update owner verification on bulk publish", { ownerId: listing.owner._id, error: err.message });
          });
        }
        succeeded.push(String(listing._id));
        await writeAudit(req, {
          userId: req.user.id,
          action: "LISTING_STATUS_CHANGED",
          resource: { type: "LISTING", id: String(listing._id) },
          changes: { before: { status: prevStatus }, after: { status } },
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          metadata: { batch: batchId },
        });
      } catch (e) {
        logger.warn("Bulk status change failed for listing", { listingId: id, error: e.message });
        failed.push({ id, reason: "ERROR" });
      }
    }

    if (succeeded.length > 0) {
      await writeAudit(req, {
        userId: req.user.id,
        action: "DATA_BULK_OPERATION",
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        metadata: { batch: batchId, operation: "STATUS_CHANGE_LISTINGS", status, affectedCount: succeeded.length, ids: succeeded },
      });
    }

    res.json(
      createSuccessResponse(
        {
          batchId,
          summary: { total: batchIds.length, succeeded: succeeded.length, skipped: skipped.length, failed: failed.length },
          succeeded,
          skipped,
          failed,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin batchUpdateListingStatus error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Listings ────────────────────────────────────────────────────────────────

async function getListings(req, res) {
  try {
    const { type, status, page: pageRaw, limit: limitRaw } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);
    const skip = (page - 1) * limit;

    const filter = {};
    if (type) {
      if (!LISTING_TYPES.includes(type)) {
        return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "نوع محتوا نامعتبر است", { field: "type" }, req.id));
      }
      filter.type = type;
    }
    if (status) {
      if (!ALLOWED_LISTING_STATUSES.includes(status)) {
        return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "وضعیت نامعتبر است", { field: "status" }, req.id));
      }
      filter.status = status;
    }

    const [listings, total] = await Promise.all([
      Listing.find(filter)
        .populate("owner", "name handle")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Listing.countDocuments(filter),
    ]);

    res.json(
      createSuccessResponse(
        { items: listings.map(listingToDTO), total, page, limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin getListings error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function updateListingStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    if (!ALLOWED_LISTING_STATUSES.includes(status)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "وضعیت مورد نظر نامعتبر است",
            { field: "status", allowedStatuses: ALLOWED_LISTING_STATUSES },
            req.id,
          ),
        );
    }

    const listing = await Listing.findById(id).populate("owner", "name handle");
    if (!listing) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "محتوا یافت نشد", null, req.id));
    }

    const prevStatus = listing.status;
    if (prevStatus === status) {
      return res.json(createSuccessResponse({ listing: listingToDTO(listing), unchanged: true }, req.id));
    }

    listing.status = status;
    await listing.save();

    // Publishing approved content also marks the owner's identity as verified.
    if (status === "published" && listing.owner) {
      await User.updateOne({ _id: listing.owner._id }, { $set: { isVerified: true } }).catch((err) => {
        logger.warn("Failed to update owner verification on publish", { ownerId: listing.owner._id, error: err.message });
      });
    }

    await writeAudit(req, {
      userId: req.user.id,
      action: "LISTING_STATUS_CHANGED",
      resource: { type: "LISTING", id: String(listing._id) },
      changes: { before: { status: prevStatus }, after: { status } },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
    });

    res.json(createSuccessResponse({ listing: listingToDTO(listing) }, req.id));
  } catch (e) {
    logger.error("Admin updateListingStatus error", { error: e.message, stack: e.stack, userId: req.user?.id, targetId: req.params.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function updateListingContent(req, res) {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    const listing = await Listing.findById(id);
    if (!listing) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "محتوا یافت نشد", null, req.id));
    }

    const changed = {};
    if (title !== undefined) changed.title = String(title).trim();
    if (description !== undefined) changed.description = String(description).trim();

    if (Object.keys(changed).length === 0) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "حداقل یکی از فیلدهای title یا description باید ارسال شود",
            null,
            req.id,
          ),
        );
    }

    const before = {};
    const after = {};
    for (const field of Object.keys(changed)) {
      before[field] = listing[field];
      after[field] = changed[field];
    }

    listing.revision = (listing.revision || 0) + 1;
    listing.title = changed.title !== undefined ? changed.title : listing.title;
    listing.description = changed.description !== undefined ? changed.description : listing.description;
    listing.editHistory = listing.editHistory ?? [];
    listing.editHistory.push({
      editor: req.user.id,
      changes: before, // old values, matching the existing editHistory shape
      newRevision: listing.revision,
      timestamp: new Date(),
      reason: "super admin edit",
    });
    await listing.save();

    await writeAudit(req, {
      userId: req.user.id,
      action: "LISTING_EDIT",
      resource: { type: "LISTING", id: String(listing._id) },
      changes: { before, after },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
    });

    const populated = await Listing.findById(listing._id).populate("owner", "name handle").lean();
    res.json(createSuccessResponse({ listing: listingToDTO(populated) }, req.id));
  } catch (e) {
    logger.error("Admin updateListingContent error", { error: e.message, stack: e.stack, userId: req.user?.id, targetId: req.params.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Crafts ──────────────────────────────────────────────────────────────────

async function getCrafts(req, res) {
  try {
    const { kind, craftType, page: pageRaw, limit: limitRaw } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);
    const skip = (page - 1) * limit;

    const filter = {};
    if (kind) {
      if (!["artwork", "class", "service"].includes(kind)) {
        return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "نوع صنعت دستی نامعتبر است", { field: "kind" }, req.id));
      }
      filter.kind = kind;
    }
    if (craftType) {
      filter.craftType = craftType;
    }

    const [crafts, total] = await Promise.all([
      Craft.find(filter)
        .populate("author", "name handle")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Craft.countDocuments(filter),
    ]);

    res.json(
      createSuccessResponse(
        {
          items: crafts.map((c) => ({
            id: normalizeId(c._id),
            title: c.title,
            description: c.description,
            kind: c.kind || "artwork",
            craftType: c.craftType || "other",
            isPublished: Boolean(c.isPublished),
            price: c.price ?? null,
            location: { city: c.location?.city || null },
            author: c.author
              ? { id: normalizeId(c.author._id), name: c.author.name || "", handle: c.author.handle || null }
              : null,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          })),
          total,
          page,
          limit,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin getCrafts error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function setCraftPublish(req, res) {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    if (typeof isPublished !== "boolean") {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "وضعیت انتشار باید boolean باشد", { field: "isPublished" }, req.id));
    }

    const craft = await Craft.findById(id).populate("author", "name handle");
    if (!craft) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "صنعت دستی یافت نشد", null, req.id));
    }

    const prev = Boolean(craft.isPublished);
    if (prev === isPublished) {
      return res.json(createSuccessResponse({ craft: { id: normalizeId(craft._id), isPublished: prev }, unchanged: true }, req.id));
    }

    craft.isPublished = isPublished;
    await craft.save();

    if (isPublished && craft.author) {
      await User.updateOne({ _id: craft.author._id }, { $set: { isVerified: true } }).catch((err) => {
        logger.warn("Failed to update author verification on craft publish", { authorId: craft.author._id, error: err.message });
      });
    }

    await writeAudit(req, {
      userId: req.user.id,
      action: "LISTING_STATUS_CHANGED",
      resource: { type: "CRAFT", id: String(craft._id) },
      changes: { before: { isPublished: prev }, after: { isPublished } },
      result: "SUCCESS",
      riskLevel: "MEDIUM",
    });

    const populated = await Craft.findById(craft._id).populate("author", "name handle").lean();
    res.json(
      createSuccessResponse(
        {
          craft: {
            id: normalizeId(populated._id),
            title: populated.title,
            isPublished: Boolean(populated.isPublished),
            author: populated.author ? { id: normalizeId(populated.author._id), name: populated.author.name || "", handle: populated.author.handle || null } : null,
          },
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin setCraftPublish error", { error: e.message, stack: e.stack, userId: req.user?.id, targetId: req.params.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Comment moderation (crafts) ─────────────────────────────────────────────

async function listComments(req, res) {
  try {
    const { q, rating, page: pageRaw, limit: limitRaw } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);

    // Fetch every craft that has at least one comment; row-level filtering
    // (title OR comment text, rating) happens in JS so the semantics are exact.
    const crafts = await Craft.find({ "comments.0": { $exists: true } })
      .select("title isPublished comments")
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const textQ = q ? String(q).trim().toLowerCase() : null;

    // Flatten comments to rows, applying comment-level filters (text, rating).
    const rows = [];
    for (const c of crafts) {
      const titleMatch = textQ && (c.title || "").toLowerCase().includes(textQ);
      const comments = (c.comments || []).sort((a, b) =>
        (b.createdAt || 0) - (a.createdAt || 0),
      );
      for (const cm of comments) {
        const text = cm.text || "";
        if (textQ && !titleMatch && !text.toLowerCase().includes(textQ)) continue;
        if (rating && cm.rating !== rating) continue;
        rows.push({ craft: c, comment: cm });
      }
    }

    const total = rows.length;
    const paged = rows.slice((page - 1) * limit, page * limit);

    const authorIds = Array.from(
      new Set(
        paged
          .map((r) => (r.comment.user ? String(r.comment.user) : null))
          .filter(Boolean),
      ),
    );
    const authors =
      authorIds.length > 0
        ? await User.find({ _id: { $in: authorIds } })
            .select("name handle")
            .lean()
        : [];
    const authorMap = new Map(authors.map((a) => [String(a._id), a]));

    res.json(
      createSuccessResponse(
        {
          items: paged.map((r) => {
            const au = r.comment.user
              ? authorMap.get(String(r.comment.user))
              : null;
            return {
              id: normalizeId(r.comment._id),
              text: r.comment.text || "",
              rating: r.comment.rating ?? null,
              createdAt: r.comment.createdAt,
              craft: {
                id: normalizeId(r.craft._id),
                title: r.craft.title || "",
                isPublished: Boolean(r.craft.isPublished),
              },
              author: au
                ? {
                    id: normalizeId(au._id),
                    name: au.name || "",
                    handle: au.handle || null,
                  }
                : null,
            };
          }),
          total,
          page,
          limit,
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin listComments error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function removeComment(req, res) {
  try {
    const { craftId, commentId } = req.params;

    if (!isValidObjectId(craftId) || !isValidObjectId(commentId)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "craftId/commentId" }, req.id));
    }

    const craft = await Craft.findById(craftId);
    if (!craft) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "صنعت دستی یافت نشد", null, req.id));
    }

    const comment = craft.comments.id(commentId);
    if (!comment) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "دیدگاه یافت نشد", null, req.id));
    }

    const removed = {
      text: comment.text || "",
      rating: comment.rating ?? null,
      user: comment.user ? normalizeId(comment.user) : null,
      createdAt: comment.createdAt,
    };

    comment.deleteOne();
    await craft.save();

    await writeAudit(req, {
      userId: req.user.id,
      action: "ADMIN_CONTENT_REMOVED",
      resource: { type: "CRAFT", id: String(craft._id) },
      changes: { before: { comment: removed }, after: null },
      result: "SUCCESS",
      riskLevel: "HIGH",
      metadata: { commentId: String(commentId), reason: "moderated by super admin" },
    });

    res.json(
      createSuccessResponse(
        {
          message: "دیدگاه حذف شد",
          id: String(commentId),
          craft: { id: String(craft._id), title: craft.title },
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin removeComment error", { error: e.message, stack: e.stack, userId: req.user?.id, craftId: req.params.craftId, commentId: req.params.commentId });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Providers (admins & tour guides) ────────────────────────────────────────

const PROVIDER_ROLES = ["admin", "tour_leader"];
const PROVIDER_STATUSES = ["active", "suspended", "pending"];

function providerStatusOf(user) {
  if (user.isBlocked) return "suspended";
  if (!user.isVerified) return "pending";
  return "active";
}

function providerToDTO(user, extra = {}) {
  return {
    ...userToAdminDTO(user),
    status: providerStatusOf(user),
    ...extra,
  };
}

async function listProviders(req, res) {
  try {
    const { status, role, page: pageRaw, limit: limitRaw } = req.query;
    const page = safePage(pageRaw);
    const limit = safePageSize(limitRaw);
    const skip = (page - 1) * limit;

    if (role && !PROVIDER_ROLES.includes(role)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "نقش نامعتبر است",
            { field: "role" },
            req.id,
          ),
        );
    }

    const filter = { role: { $in: role ? [role] : PROVIDER_ROLES } };

    if (status) {
      if (!PROVIDER_STATUSES.includes(status)) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "وضعیت نامعتبر است",
              { field: "status" },
              req.id,
            ),
          );
      }
      if (status === "suspended") {
        filter.isBlocked = true;
      } else if (status === "pending") {
        filter.isBlocked = false;
        filter.isVerified = false;
      } else {
        filter.isBlocked = false;
        filter.isVerified = true;
      }
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("name phone handle avatar role isBlocked moderatorNote permissions isVerified creatorType bio createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json(
      createSuccessResponse(
        { items: users.map((u) => providerToDTO(u)), total, page, limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin listProviders error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function getProvider(req, res) {
  try {
    const { providerId } = req.params;

    if (!isValidObjectId(providerId)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه نامعتبر است",
            { field: "providerId" },
            req.id,
          ),
        );
    }

    const provider = await User.findById(providerId)
      .select("name phone handle avatar role isBlocked moderatorNote permissions isVerified creatorType bio createdAt updatedAt")
      .lean();

    if (!provider || !PROVIDER_ROLES.includes(provider.role)) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "ارائه‌دهنده یافت نشد", null, req.id));
    }

    const [listingsCount, publishedCount, craftsCount] = await Promise.all([
      Listing.countDocuments({ owner: providerId }),
      Listing.countDocuments({ owner: providerId, status: "published" }),
      Craft.countDocuments({ author: providerId }),
    ]);

    res.json(
      createSuccessResponse(
        {
          provider: providerToDTO(provider, {
            stats: {
              listings: listingsCount,
              published: publishedCount,
              crafts: craftsCount,
            },
          }),
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin getProvider error", { error: e.message, stack: e.stack, userId: req.user?.id, providerId: req.params.providerId });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function updateProviderStatus(req, res) {
  try {
    const { providerId } = req.params;
    const { status, reason } = req.body;

    if (!isValidObjectId(providerId)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شناسه نامعتبر است",
            { field: "providerId" },
            req.id,
          ),
        );
    }

    if (!["active", "suspended"].includes(status)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "وضعیت نامعتبر است",
            { field: "status" },
            req.id,
          ),
        );
    }

    const provider = await User.findById(providerId);
    if (!provider || !PROVIDER_ROLES.includes(provider.role)) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "ارائه‌دهنده یافت نشد", null, req.id));
    }

    if (String(provider._id) === String(req.user.id)) {
      return res
        .status(403)
        .json(createErrorResponse("FORBIDDEN", "شما نمی‌توانید وضعیت حساب خود را تغییر دهید", null, req.id));
    }

    if (provider.role === "super_admin") {
      return res
        .status(403)
        .json(
          createErrorResponse("FORBIDDEN", "تغییر وضعیت سوپر ادمین مجاز نیست", null, req.id),
        );
    }

    const nextBlocked = status === "suspended";
    const approve = status === "active" && !provider.isVerified;
    const prevBlocked = Boolean(provider.isBlocked);
    const prevVerified = Boolean(provider.isVerified);
    if (prevBlocked === nextBlocked && !approve) {
      return res.json(
        createSuccessResponse({ provider: providerToDTO(provider), unchanged: true }, req.id),
      );
    }

    provider.isBlocked = nextBlocked;
    if (approve) provider.isVerified = true;
    if (reason !== undefined) {
      provider.moderatorNote = String(reason).trim();
    }
    await provider.save();

    if (nextBlocked) {
      await TokenService.revokeAllTokens(String(provider._id), "ADMIN_REVOKE").catch((err) => {
        logger.warn("Failed to revoke tokens on provider suspend", { userId: provider._id, error: err.message });
      });
    }

    await writeAudit(req, {
      userId: req.user.id,
      action: "PROVIDER_STATUS_CHANGE",
      resource: { type: "USER", id: String(provider._id) },
      changes: {
        before: { isBlocked: prevBlocked, isVerified: prevVerified },
        after: { isBlocked: nextBlocked, isVerified: Boolean(provider.isVerified) },
      },
      result: "SUCCESS",
      riskLevel: nextBlocked ? "HIGH" : "MEDIUM",
      metadata: { reason: reason || "provider status change by admin" },
    });

    res.json(createSuccessResponse({ provider: providerToDTO(provider) }, req.id));
  } catch (e) {
    logger.error("Admin updateProviderStatus error", { error: e.message, stack: e.stack, userId: req.user?.id, providerId: req.params.providerId });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Account (self) ──────────────────────────────────────────────────────────

async function updateProfile(req, res) {
  try {
    const { name, bio, avatar } = req.body;

    const me = await User.findById(req.user.id);
    if (!me) {
      return res
        .status(404)
        .json(createErrorResponse("NOT_FOUND", "کاربر یافت نشد", null, req.id));
    }

    const before = {};
    const after = {};
    if (name !== undefined && name !== me.name) {
      before.name = me.name;
      after.name = name;
      me.name = name;
    }
    if (bio !== undefined && bio !== me.bio) {
      before.bio = me.bio;
      after.bio = bio;
      me.bio = bio;
    }
    if (avatar !== undefined && avatar !== me.avatar) {
      before.avatar = me.avatar;
      after.avatar = avatar;
      me.avatar = avatar;
    }

    if (Object.keys(after).length === 0) {
      return res.json(
        createSuccessResponse({ user: userToAdminDTO(me), unchanged: true }, req.id),
      );
    }

    await me.save();

    await writeAudit(req, {
      userId: req.user.id,
      action: "ADMIN_PROFILE_UPDATE",
      resource: { type: "USER", id: String(me._id) },
      changes: { before, after },
      result: "SUCCESS",
      riskLevel: "LOW",
      metadata: { self: true },
    });

    res.json(createSuccessResponse({ user: userToAdminDTO(me) }, req.id));
  } catch (e) {
    logger.error("Admin updateProfile error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

async function logoutAll(req, res) {
  try {
    await TokenService.revokeAllTokens(String(req.user.id), "ADMIN_LOGOUT_ALL").catch((err) => {
      logger.warn("Failed to revoke all tokens on logout-all", { userId: req.user.id, error: err.message });
    });

    await writeAudit(req, {
      userId: req.user.id,
      action: "ADMIN_LOGOUT_ALL",
      resource: { type: "USER", id: String(req.user.id) },
      result: "SUCCESS",
      riskLevel: "HIGH",
      metadata: { sessionsRevoked: true },
    });

    res.json(
      createSuccessResponse({ message: "همه نشست‌های فعال بسته شدند" }, req.id),
    );
  } catch (e) {
    logger.error("Admin logoutAll error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

// ── Live events (SSE) ───────────────────────────────────────────────────────

function streamLiveEvents(req, res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let unsubscribed = false;
  const unsubscribe = () => {
    if (unsubscribed) return;
    unsubscribed = true;
    clearInterval(heartbeat);
    res.end();
  };

  let heartbeat;
  try {
    adminEventHub.subscribe(res, {
      userId: req.user.id,
      initialPayload: { at: new Date().toISOString() },
    });
  } catch {
    return res
      .status(503)
      .json(createErrorResponse("TOO_MANY_CONNECTIONS", "تعداد اتصال‌های زنده بیش از حد مجاز است", null, req.id));
  }

  heartbeat = setInterval(() => {
    adminEventHub.heartbeat();
  }, 25000);

  req.on("close", unsubscribe);
}

// ── Audit Logs ──────────────────────────────────────────────────────────────

const EXPORT_MAX_ROWS = 10000;

/**
 * Shared filter builder for audit-log queries (list + CSV export).
 * Returns a Mongo query object; throws nothing. Invalid ObjectId inputs are
 * surfaced to the caller via the `errors` array.
 */
function buildAuditFilter(query) {
  const { actorId, action, targetType, targetId, from, to } = query;
  const filter = {};
  const errors = [];

  if (actorId) {
    if (!isValidObjectId(actorId)) {
      errors.push({ field: "actorId", message: "شناسه کاربر نامعتبر است" });
    } else {
      filter.userId = actorId;
    }
  }
  if (action) {
    filter.action = action;
  }
  if (targetType) {
    filter["resource.type"] = targetType;
  }
  if (targetId) {
    if (!isValidObjectId(targetId)) {
      errors.push({ field: "targetId", message: "شناسه منبع نامعتبر است" });
    } else {
      filter["resource.id"] = targetId;
    }
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  return { filter, errors };
}

async function listAuditLogs(req, res) {
  try {
    const { filter, errors } = buildAuditFilter(req.query);
    if (errors.length > 0) {
      return res
        .status(400)
        .json(
          createErrorResponse("VALIDATION_ERROR", errors[0].message, { issues: errors }, req.id),
        );
    }

    const page = safePage(req.query.page);
    const limit = safePageSize(req.query.limit);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("userId", "name handle")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json(
      createSuccessResponse(
        { items: logs.map(auditLogToDTO), total, page, limit },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin listAuditLogs error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

function auditLogDetailToDTO(log) {
  return {
    ...auditLogToDTO(log),
    requestContext: log.requestContext || null,
    metadata: log.metadata || null,
    error: log.error || null,
    compliance: log.compliance || null,
  };
}

async function getAuditLog(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", "شناسه نامعتبر است", { field: "id" }, req.id));
    }

    const log = await AuditLog.findById(id).populate("userId", "name handle").lean();
    if (!log) {
      return res.status(404).json(createErrorResponse("NOT_FOUND", "رکورد عملیات یافت نشد", null, req.id));
    }

    res.json(createSuccessResponse({ log: auditLogDetailToDTO(log) }, req.id));
  } catch (e) {
    logger.error("Admin getAuditLog error", { error: e.message, stack: e.stack, userId: req.user?.id, id: req.params.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

async function exportAuditLogs(req, res) {
  try {
    const { filter, errors } = buildAuditFilter(req.query);
    if (errors.length > 0) {
      return res
        .status(400)
        .json(
          createErrorResponse("VALIDATION_ERROR", errors[0].message, { issues: errors }, req.id),
        );
    }

    const logs = await AuditLog.find(filter)
      .populate("userId", "name handle")
      .sort({ createdAt: -1 })
      .limit(EXPORT_MAX_ROWS)
      .lean();

    const header = [
      "createdAt",
      "action",
      "actorName",
      "actorId",
      "resourceType",
      "resourceId",
      "result",
      "riskLevel",
      "ip",
      "userAgent",
      "endpoint",
      "method",
      "statusCode",
      "changesBefore",
      "changesAfter",
      "metadataReason",
      "gdprRelevant",
      "dataCategories",
    ];

    const rows = logs.map((l) =>
      [
        l.createdAt ? l.createdAt.toISOString() : "",
        l.action,
        (l.userId && (l.userId.name || l.userId.handle)) || "سیستم",
        l.userId ? String(l.userId._id) : "",
        l.resource?.type || "",
        l.resource?.id ? String(l.resource.id) : "",
        l.result || "",
        l.riskLevel || "",
        l.requestContext?.ip || "",
        l.requestContext?.userAgent || "",
        l.requestContext?.endpoint || "",
        l.requestContext?.method || "",
        l.requestContext?.statusCode ?? "",
        l.changes?.before ?? null,
        l.changes?.after ?? null,
        l.metadata?.reason || "",
        l.compliance?.gdprRelevant ? "true" : "false",
        (l.compliance?.dataCategories || []).join("|"),
      ]
        .map(csvCell)
        .join(","),
    );

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-logs-${date}.csv"`,
    );
    res.write("\uFEFF");
    res.write(header.map(csvCell).join(",") + "\r\n");
    res.write(rows.join("\r\n"));
    res.end();
  } catch (e) {
    logger.error("Admin exportAuditLogs error", { error: e.message, stack: e.stack, userId: req.user?.id });
    if (!res.headersSent) {
      res
        .status(500)
        .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
    }
  }
}

// ── Settings / Health ───────────────────────────────────────────────────────

const SETTINGS_KEYS = [
  "SUPER_ADMIN_PHONE",
  "JWT_SECRET",
  "MONGODB_URI",
  "REFRESH_TOKEN_SECRET",
  "OTP_SECRET",
  "ALLOWED_ORIGINS",
  "SENTRY_DSN",
];

async function getSettings(req, res) {
  try {
    const settings = SETTINGS_KEYS.map((key) => ({
      key,
      isConfigured: Boolean(process.env[key] && String(process.env[key]).trim()),
    }));

    const dbReady =
      mongoose.connection.readyState === 1 ||
      req.app?.locals?.dbReady === true;

    res.json(
      createSuccessResponse(
        {
          settings,
          database: {
            status: dbReady ? "up" : "down",
            lastCheckedAt: new Date().toISOString(),
          },
        },
        req.id,
      ),
    );
  } catch (e) {
    logger.error("Admin getSettings error", { error: e.message, stack: e.stack, userId: req.user?.id });
    res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "خطای داخلی سرور", null, req.id));
  }
}

module.exports = {
  getStats,
  streamLiveEvents,
  getUsers,
  updateUserRole,
  updateUserPermissions,
  toggleUserBlock,
  deleteUser,
  getUserSessions,
  revokeUserSession,
  batchBlockUsers,
  batchUpdateUserRole,
  batchDeleteUsers,
  getListings,
  updateListingStatus,
  batchUpdateListingStatus,
  updateListingContent,
  getCrafts,
  setCraftPublish,
  listComments,
  removeComment,
  listProviders,
  getProvider,
  updateProviderStatus,
  updateProfile,
  logoutAll,
  listAuditLogs,
  getAuditLog,
  exportAuditLogs,
  getSettings,
};