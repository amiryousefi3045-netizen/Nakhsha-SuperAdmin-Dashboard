const { Router } = require("express");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRole } = require("../middleware/auth");
const adminController = require("../controllers/AdminController");

const router = Router();

// ---------------------------------------------------------------------------
// Shared pagination schema
// ---------------------------------------------------------------------------
const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

// ---------------------------------------------------------------------------
// Audit logs
//   GET /api/admin/audit-logs
// ---------------------------------------------------------------------------
const auditLogsQuerySchema = z.object({
  ...paginationSchema,
  actorId: z.string().trim().optional(),
  action: z.string().trim().min(1).optional(),
  targetType: z.string().trim().optional(),
  targetId: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.get(
  "/audit-logs",
  requireAuth,
  requireRole("super_admin"),
  validate(auditLogsQuerySchema, "query"),
  adminController.listAuditLogs,
);

// NOTE: export must be registered BEFORE "/audit-logs/:id" so "export"
// is not captured as an :id.
router.get(
  "/audit-logs/export",
  requireAuth,
  requireRole("super_admin"),
  adminController.exportAuditLogs,
);

router.get(
  "/audit-logs/:id",
  requireAuth,
  requireRole("super_admin"),
  adminController.getAuditLog,
);

// ---------------------------------------------------------------------------
// Dashboard stats
//   GET /api/admin/stats
// ---------------------------------------------------------------------------
router.get(
  "/stats",
  requireAuth,
  requireRole("super_admin"),
  adminController.getStats,
);

// ---------------------------------------------------------------------------
// Live events (Server-Sent Events)
//   GET /api/admin/events/live
// ---------------------------------------------------------------------------
router.get(
  "/events/live",
  requireAuth,
  requireRole("super_admin"),
  adminController.streamLiveEvents,
);

// ---------------------------------------------------------------------------
// User management
//   GET     /api/admin/users
//   PATCH   /api/admin/users/:id/role
//   PATCH   /api/admin/users/:id/permissions
//   PATCH   /api/admin/users/:id/block
//   DELETE  /api/admin/users/:id
// ---------------------------------------------------------------------------
const listUsersQuerySchema = z.object({
  ...paginationSchema,
  q: z.string().trim().max(100).optional(),
  role: z.enum(["user", "tour_leader", "admin", "super_admin"]).optional(),
});

const userIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const updateUserRoleSchema = z.object({
  role: z.enum(["user", "tour_leader", "admin"]),
});

const updateUserPermissionsSchema = z.object({
  permissions: z
    .array(z.enum(["DELETE_USERS", "APPROVE_CONTENT", "VIEW_AUDIT_LOGS"]))
    .default([]),
});

const toggleUserBlockSchema = z.object({
  isBlocked: z.boolean(),
  moderatorNote: z.string().trim().max(500).optional(),
});

router.get(
  "/users",
  requireAuth,
  requireRole("super_admin"),
  validate(listUsersQuerySchema, "query"),
  adminController.getUsers,
);

router.patch(
  "/users/:id/role",
  requireAuth,
  requireRole("super_admin"),
  validate(userIdParamsSchema, "params"),
  validate(updateUserRoleSchema, "body"),
  adminController.updateUserRole,
);

router.patch(
  "/users/:id/permissions",
  requireAuth,
  requireRole("super_admin"),
  validate(userIdParamsSchema, "params"),
  validate(updateUserPermissionsSchema, "body"),
  adminController.updateUserPermissions,
);

router.patch(
  "/users/:id/block",
  requireAuth,
  requireRole("super_admin"),
  validate(userIdParamsSchema, "params"),
  validate(toggleUserBlockSchema, "body"),
  adminController.toggleUserBlock,
);

router.delete(
  "/users/:id",
  requireAuth,
  requireRole("super_admin"),
  validate(userIdParamsSchema, "params"),
  adminController.deleteUser,
);

// Bulk user actions
//   POST /api/admin/users/batch/block
//   POST /api/admin/users/batch/role
//   POST /api/admin/users/batch/delete
const batchIdsSchema = {
  ids: z.array(z.string().trim().min(1)).min(1).max(50),
};

const bulkUserBlockSchema = z.object({
  ...batchIdsSchema,
  isBlocked: z.boolean(),
  moderatorNote: z.string().trim().max(500).optional(),
});

const bulkUserRoleSchema = z.object({
  ...batchIdsSchema,
  role: z.enum(["user", "tour_leader", "admin"]),
});

const bulkUserDeleteSchema = z.object(batchIdsSchema);

router.post(
  "/users/batch/block",
  requireAuth,
  requireRole("super_admin"),
  validate(bulkUserBlockSchema, "body"),
  adminController.batchBlockUsers,
);

router.post(
  "/users/batch/role",
  requireAuth,
  requireRole("super_admin"),
  validate(bulkUserRoleSchema, "body"),
  adminController.batchUpdateUserRole,
);

router.post(
  "/users/batch/delete",
  requireAuth,
  requireRole("super_admin"),
  validate(bulkUserDeleteSchema, "body"),
  adminController.batchDeleteUsers,
);

// User sessions (device management)
//   GET     /api/admin/users/:id/sessions
//   DELETE  /api/admin/users/:id/sessions/:sessionId
const userSessionParamsSchema = z.object({
  id: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
});

router.get(
  "/users/:id/sessions",
  requireAuth,
  requireRole("super_admin"),
  validate(userIdParamsSchema, "params"),
  adminController.getUserSessions,
);

router.delete(
  "/users/:id/sessions/:sessionId",
  requireAuth,
  requireRole("super_admin"),
  validate(userSessionParamsSchema, "params"),
  adminController.revokeUserSession,
);

// ---------------------------------------------------------------------------
// Listings (content) management
//   GET     /api/admin/listings
//   PATCH   /api/admin/listings/:id/status
//   PATCH   /api/admin/listings/:id/content
// ---------------------------------------------------------------------------
const listListingsQuerySchema = z.object({
  ...paginationSchema,
  type: z.enum(["post", "tour", "training", "academy"]).optional(),
  status: z
    .enum(["draft", "pending", "published", "rejected", "archived"])
    .optional(),
});

const listingIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const updateListingStatusSchema = z.object({
  status: z.enum(["draft", "pending", "published", "rejected", "archived"]),
});

const updateListingContentSchema = z
  .object({
    title: z.string().trim().min(5).max(200).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
  })
  .refine(
    (body) => body.title !== undefined || body.description !== undefined,
    { message: "حداقل یکی از فیلدهای title یا description باید ارسال شود" },
  );

router.get(
  "/listings",
  requireAuth,
  requireRole("super_admin"),
  validate(listListingsQuerySchema, "query"),
  adminController.getListings,
);

router.patch(
  "/listings/:id/status",
  requireAuth,
  requireRole("super_admin"),
  validate(listingIdParamsSchema, "params"),
  validate(updateListingStatusSchema, "body"),
  adminController.updateListingStatus,
);

// Bulk listing actions
//   POST /api/admin/listings/batch/status
const bulkListingStatusSchema = z.object({
  ...batchIdsSchema,
  status: z.enum(["draft", "pending", "published", "rejected", "archived"]),
});

router.post(
  "/listings/batch/status",
  requireAuth,
  requireRole("super_admin"),
  validate(bulkListingStatusSchema, "body"),
  adminController.batchUpdateListingStatus,
);

router.patch(
  "/listings/:id/content",
  requireAuth,
  requireRole("super_admin"),
  validate(listingIdParamsSchema, "params"),
  validate(updateListingContentSchema, "body"),
  adminController.updateListingContent,
);

// ---------------------------------------------------------------------------
// Crafts management
//   GET     /api/admin/crafts
//   PATCH   /api/admin/crafts/:id/publish
// ---------------------------------------------------------------------------
const listCraftsQuerySchema = z.object({
  ...paginationSchema,
  kind: z.enum(["artwork", "class", "service"]).optional(),
  craftType: z.string().trim().max(50).optional(),
});

const craftIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const setCraftPublishSchema = z.object({
  isPublished: z.boolean(),
});

router.get(
  "/crafts",
  requireAuth,
  requireRole("super_admin"),
  validate(listCraftsQuerySchema, "query"),
  adminController.getCrafts,
);

router.patch(
  "/crafts/:id/publish",
  requireAuth,
  requireRole("super_admin"),
  validate(craftIdParamsSchema, "params"),
  validate(setCraftPublishSchema, "body"),
  adminController.setCraftPublish,
);

// ---------------------------------------------------------------------------
// Comment moderation (crafts)
//   GET     /api/admin/comments
//   DELETE  /api/admin/comments/:craftId/:commentId
// ---------------------------------------------------------------------------
const listCommentsQuerySchema = z.object({
  ...paginationSchema,
  q: z.string().trim().max(200).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const commentParamsSchema = z.object({
  craftId: z.string().trim().min(1),
  commentId: z.string().trim().min(1),
});

router.get(
  "/comments",
  requireAuth,
  requireRole("super_admin"),
  validate(listCommentsQuerySchema, "query"),
  adminController.listComments,
);

router.delete(
  "/comments/:craftId/:commentId",
  requireAuth,
  requireRole("super_admin"),
  validate(commentParamsSchema, "params"),
  adminController.removeComment,
);

// ---------------------------------------------------------------------------
// Settings / Health
//   GET /api/admin/settings
// ---------------------------------------------------------------------------
router.get(
  "/settings",
  requireAuth,
  requireRole("super_admin"),
  adminController.getSettings,
);

// ---------------------------------------------------------------------------
// Security & database health audit
//   GET /api/admin/security-audit
// ---------------------------------------------------------------------------
router.get(
  "/security-audit",
  requireAuth,
  requireRole("super_admin"),
  adminController.runSecurityAudit,
);

// ---------------------------------------------------------------------------
// Provider (admins & tour guides) management
//   GET     /api/admin/providers
//   GET     /api/admin/providers/:providerId
//   PATCH   /api/admin/providers/:providerId/status
// ---------------------------------------------------------------------------
const listProvidersQuerySchema = z.object({
  ...paginationSchema,
  status: z.enum(["active", "suspended", "pending"]).optional(),
  role: z.enum(["admin", "tour_leader"]).default("tour_leader"),
});

router.get(
  "/providers",
  requireAuth,
  requireRole("super_admin"),
  validate(listProvidersQuerySchema, "query"),
  adminController.listProviders,
);

const providerIdParamsSchema = z.object({
  providerId: z.string().trim().min(1),
});

router.get(
  "/providers/:providerId",
  requireAuth,
  requireRole("super_admin"),
  validate(providerIdParamsSchema, "params"),
  adminController.getProvider,
);

const providerStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(500).optional(),
});

router.patch(
  "/providers/:providerId/status",
  requireAuth,
  requireRole("super_admin"),
  validate(providerIdParamsSchema, "params"),
  validate(providerStatusSchema, "body"),
  adminController.updateProviderStatus,
);

// ---------------------------------------------------------------------------
// Account management
//   PATCH   /api/admin/profile
//   POST    /api/admin/logout-all
// ---------------------------------------------------------------------------
const adminProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    bio: z.string().trim().max(500).optional(),
    avatar: z.string().trim().max(2048).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.bio !== undefined ||
      body.avatar !== undefined,
    { message: "هیچ فیلدی برای به‌روزرسانی ارسال نشده است" },
  );

router.patch(
  "/profile",
  requireAuth,
  requireRole("super_admin"),
  validate(adminProfileSchema, "body"),
  adminController.updateProfile,
);

router.post(
  "/logout-all",
  requireAuth,
  requireRole("super_admin"),
  adminController.logoutAll,
);

module.exports = router;