const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../server");
const User = require("../models/User");
const OtpCode = require("../models/OtpCode");
const RefreshToken = require("../models/RefreshToken");
const AuditLog = require("../models/AuditLog");
const Craft = require("../models/Craft");
const { PostListing } = require("../models/Listing");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

// ── Helpers ────────────────────────────────────────────────────────────────

async function otpLogin(phone) {
  const start = await request(app)
    .post("/api/auth/otp/start")
    .send({ phone })
    .expect(200);

  const verify = await request(app)
    .post("/api/auth/otp/verify")
    .send({ phone, code: start.body.devCode })
    .expect(200);

  return verify.body;
}

function verOf(token) {
  return jwt.decode(token)?.ver;
}

// ── Test phones (5 distinct → under the rate-limit budget of the file) ─────
const PHONES = {
  admin: "09142000001",
  admin2: "09142000002",
  user: "09142000003",
  creator: "09142000004",
  user2: "09142000005",
};

// ── Fixtures ───────────────────────────────────────────────────────────────

let adminTokens = {};
let regularUser;
let targetUser;
let creator;

let listingId;
let craftId;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  // The ONLY legal bootstrap path: OTP login with this phone gets super_admin.
  process.env.SUPER_ADMIN_PHONE = PHONES.admin;
  _resetRateLimitStoreForTests();

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";

  // Wait — this suite shares the test DB with other suites when run with
  // --runInBand. Deleting every collection would break them, so we only
  // clear the collections this suite controls.
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;
});

afterAll(async () => {
  delete process.env.SUPER_ADMIN_PHONE;
  await OtpCode.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await mongoose.connection.close();
});

describe("Admin Routes - bootstrap and guards", () => {
  it("logs in via OTP with SUPER_ADMIN_PHONE (not first-user logic) and can hit /api/admin/stats", async () => {
    await User.deleteMany({});
    await AuditLog.deleteMany({});

    // Nothing exists yet → the SUPER_ADMIN_PHONE holder, and only they, gets
    // promoted. There is no "very first user becomes super_admin" logic.
    const body = await otpLogin(PHONES.admin);
    expect(body.user.role).toBe("super_admin");

    adminTokens.accessToken = body.accessToken;
    adminTokens.refreshToken = body.refreshToken;

    const stats = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${body.accessToken}`)
      .expect(200);

    expect(stats.body.success).toBe(true);
    expect(stats.body.overview).toBeDefined();
    expect(stats.body.overview.totalUsers).toBeGreaterThanOrEqual(1);
  });

  it("a second user whose phone is NOT SUPER_ADMIN_PHONE is never promoted and gets 403", async () => {
    const body = await otpLogin(PHONES.user);
    expect(body.user.role).toBe("user");
    regularUser = {
      ...body,
      userId: body.user.id,
    };

    const denied = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${body.accessToken}`)
      .expect(403);

    expect(denied.body.success).toBe(false);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects requests without a token or with an invalid token", async () => {
    const noToken = await request(app).get("/api/admin/stats").expect(401);
    expect(noToken.body.error.code).toBe("UNAUTHORIZED");

    const badToken = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", "Bearer not.a.jwt")
      .expect(401);
    expect(badToken.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("Admin Routes - bootstrap audit log", () => {
  it("writes a USER_ROLE_CHANGE audit record when SUPER_ADMIN_PHONE matches", async () => {
    const log = await AuditLog.findOne({
      action: "USER_ROLE_CHANGE",
      "metadata.autoAssigned": true,
    });
    expect(log).toBeTruthy();
    expect(log.resource.type).toBe("USER");
    expect(log.result).toBe("SUCCESS");
    expect(log.changes.after.role).toBe("super_admin");
    expect(log.metadata.source).toBe("SUPER_ADMIN_PHONE");
  });
});

describe("Admin Routes - user management", () => {
  let targetView;

  beforeAll(async () => {
    // A plain admin user (not super_admin) so role/permission changes are legal.
    const body = await otpLogin(PHONES.admin2);
    targetUser = {
      ...body,
      userId: body.user.id,
    };
    await User.findByIdAndUpdate(targetUser.userId, { role: "admin" });
    targetView = await User.findById(targetUser.userId).lean();
  });

  it("an `admin`-role user is DENIED all /api/admin/* routes with 403", async () => {
    // targetUser currently has role "admin" (set in beforeAll). The admin panel
    // is super_admin-only — the plain `admin` role must never pass.
    const denied = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${targetUser.accessToken}`)
      .expect(403);
    expect(denied.body.success).toBe(false);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("GET /api/admin/users lists users with pagination", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.items).toBeDefined();
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(res.body.page).toBe(1);

    const ids = res.body.items.map((u) => u.id);
    expect(ids).toContain(targetUser.userId);
  });

  it("supports role / q filters", async () => {
    const byRole = await request(app)
      .get("/api/admin/users?role=admin")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(200);
    expect(byRole.body.items.length).toBeGreaterThanOrEqual(1);
    expect(
      byRole.body.items.every((u) => u.role === "admin"),
    ).toBe(true);

    const byQ = await request(app)
      .get(`/api/admin/users?q=${encodeURIComponent(targetUser.userId)}`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(200);
    expect(byQ.body.items.length).toBe(1);
    expect(byQ.body.items[0].id).toBe(targetUser.userId);
  });

  it("PATCH /api/admin/users/:id/role changes the role and bumps tokenVersion", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${targetUser.userId}/role`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ role: "creator" })
      .expect(200);

    expect(res.body.user.role).toBe("creator");

    // Role change revokes refresh tokens and bumps tokenVersion → old ver dead.
    const fresh = await User.findById(targetUser.userId).lean();
    expect(fresh.tokenVersion).toBeGreaterThan(targetView.tokenVersion);

    const audit = await AuditLog.findOne({
      action: "USER_ROLE_CHANGE",
      "metadata.autoAssigned": { $ne: true },
    }).sort({ createdAt: -1 });
    expect(audit).toBeTruthy();
    expect(audit.resource.id.toString()).toBe(targetUser.userId);
  });

  it("rejects assigning super_admin role via the admin API", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${targetUser.userId}/role`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ role: "super_admin" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Admin Routes - block a user", () => {
  let targetView;

  beforeAll(async () => {
    const body = await otpLogin(PHONES.user2);
    targetUser = {
      ...body,
      userId: body.user.id,
    };
    targetView = await User.findById(targetUser.userId).lean();
  });

  it("PATCH block sets isBlocked, bumps tokenVersion, writes audit, and blocks access", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${targetUser.userId}/block`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ isBlocked: true, moderatorNote: "تست بلاک" })
      .expect(200);

    expect(res.body.user.isBlocked).toBe(true);
    expect(res.body.user.moderatorNote).toBe("تست بلاک");

    const fresh = await User.findById(targetUser.userId).lean();
    expect(fresh.isBlocked).toBe(true);
    expect(fresh.tokenVersion).toBeGreaterThan(targetView.tokenVersion);

    const audit = await AuditLog.findOne({ action: "USER_BLOCK" });
    expect(audit).toBeTruthy();

    // The blocked user's previously valid access token must now be rejected.
    const denied = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${targetUser.accessToken}`)
      .expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("PATCH unblock reactivates the account", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${targetUser.userId}/block`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ isBlocked: false })
      .expect(200);

    expect(res.body.user.isBlocked).toBe(false);
  });

  it("forbids a super admin from blocking their own account", async () => {
    await User.findByIdAndUpdate(adminTokens.userId, {}).catch(() => {});

    // The bootstrap user is the current admin; find its user id from token.
    const decoded = jwt.decode(adminTokens.accessToken);
    const res = await request(app)
      .patch(`/api/admin/users/${decoded.id}/block`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ isBlocked: true })
      .expect(403);

    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("Admin Routes - providers", () => {
  beforeAll(async () => {
    const body = await otpLogin(PHONES.creator);
    creator = {
      ...body,
      userId: body.user.id,
    };
    await User.findByIdAndUpdate(creator.userId, {
      role: "creator",
      isVerified: true,
    });
  });

  it("GET /api/admin/providers lists creator providers", async () => {
    const res = await request(app)
      .get("/api/admin/providers")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(200);

    const providers = res.body.items.filter(
      (p) => p.id === creator.userId,
    );
    expect(providers.length).toBe(1);
    expect(providers[0].status).toBe("active");
  });

  it("GET /api/admin/providers/:providerId returns stats for a provider", async () => {
    const res = await request(app)
      .get(`/api/admin/providers/${creator.userId}`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(200);

    expect(res.body.provider.id).toBe(creator.userId);
    expect(res.body.provider.stats).toBeDefined();
  });

  it("PATCH /api/admin/providers/:providerId/status approves a pending provider", async () => {
    // Drop verification → the provider becomes "pending" (not blocked, not verified).
    await User.findByIdAndUpdate(creator.userId, {
      isVerified: false,
      isBlocked: false,
    });

    const pendingList = await request(app)
      .get("/api/admin/providers")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .query({ status: "pending" })
      .expect(200);
    const pendingRow = pendingList.body.items.find((p) => p.id === creator.userId);
    expect(pendingRow).toBeDefined();
    expect(pendingRow.status).toBe("pending");

    // As the super admin, approve → "active" verifies the provider in the same call.
    const res = await request(app)
      .patch(`/api/admin/providers/${creator.userId}/status`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ status: "active" })
      .expect(200);

    expect(res.body.provider.status).toBe("active");
    expect(res.body.provider.unchanged).toBeUndefined();

    const fresh = await User.findById(creator.userId).lean();
    expect(fresh.isVerified).toBe(true);
    expect(fresh.isBlocked).toBe(false);
  });

  it("PATCH /api/admin/providers/:providerId/status suspends a provider", async () => {
    const res = await request(app)
      .patch(`/api/admin/providers/${creator.userId}/status`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ status: "suspended", reason: "آزمایشی" })
      .expect(200);

    expect(res.body.provider.status).toBe("suspended");

    // A provider suspended while logged in loses access immediately.
    const denied = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${creator.accessToken}`)
      .expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");

    const audit = await AuditLog.findOne({ action: "PROVIDER_STATUS_CHANGE" });
    expect(audit).toBeTruthy();
  });
});

describe("Admin Routes - listings & crafts", () => {
  beforeAll(async () => {
    // Restore the tour leader so their content can be owned by a valid user.
    await User.findByIdAndUpdate(creator.userId, { isBlocked: false });

    const listing = await PostListing.create({
      title: "آزمایش محتوای ادمین",
      description: "توضیحات برای تست ماژول ادمین",
      owner: creator.userId,
      status: "pending",
    });
    listingId = listing._id.toString();

    const craft = await Craft.create({
      title: "گلیم دست‌بافت ادمین",
      description: "گلیم برای تست ماژول ادمین",
      kind: "artwork",
      craftType: "carpet",
      author: creator.userId,
      isPublished: false,
    });
    craftId = craft._id.toString();
  });

  it("GET /api/admin/listings lists content with status filter", async () => {
    const res = await request(app)
      .get("/api/admin/listings?status=pending")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(200);

    const item = res.body.items.find((l) => l.id === listingId);
    expect(item).toBeDefined();
    expect(item.status).toBe("pending");
    expect(item.owner.id).toBe(creator.userId);
  });

  it("PATCH /api/admin/listings/:id/status publishes a listing and verifies the owner", async () => {
    const res = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ status: "published" })
      .expect(200);

    expect(res.body.listing.status).toBe("published");

    const owner = await User.findById(creator.userId).lean();
    expect(owner.isVerified).toBe(true);

    const audit = await AuditLog.findOne({ action: "LISTING_STATUS_CHANGED" });
    expect(audit).toBeTruthy();
  });

  it("PATCH /api/admin/listings/:id/content edits the listing and bumps revision", async () => {
    const res = await request(app)
      .patch(`/api/admin/listings/${listingId}/content`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ title: "عنوان ویرایش‌شده توسط ادمین" })
      .expect(200);

    expect(res.body.listing.title).toBe(
      "عنوان ویرایش‌شده توسط ادمین",
    );
    expect(res.body.listing.revision).toBeGreaterThan(0);
  });

  it("GET /api/admin/crafts lists crafts", async () => {
    const res = await request(app)
      .get("/api/admin/crafts?kind=artwork")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(200);

    const item = res.body.items.find((c) => c.id === craftId);
    expect(item).toBeDefined();
    expect(item.kind).toBe("artwork");
  });

  it("PATCH /api/admin/crafts/:id/publish marks a craft published", async () => {
    const res = await request(app)
      .patch(`/api/admin/crafts/${craftId}/publish`)
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ isPublished: true })
      .expect(200);

    expect(res.body.craft.isPublished).toBe(true);
  });
});

describe("Admin Routes - profile & audit logs & settings", () => {
  it("PATCH /api/admin/profile updates the profile and writes an audit", async () => {
    const res = await request(app)
      .patch("/api/admin/profile")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({ name: "ادمین نخشا" })
      .expect(200);

    expect(res.body.user.name).toBe("ادمین نخشا");

    const audit = await AuditLog.findOne({ action: "ADMIN_PROFILE_UPDATE" });
    expect(audit).toBeTruthy();
  });

  it("GET /api/admin/audit-logs lists recent sensitive activity", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it("GET /api/admin/settings reports env configuration presence", async () => {
    const res = await request(app)
      .get("/api/admin/settings")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(200);

    expect(res.body.settings).toBeDefined();
    expect(res.body.database.status).toBe("up");
  });

  it("POST /api/admin/logout-all revokes every session", async () => {
    const res = await request(app)
      .post("/api/admin/logout-all")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .send({})
      .expect(200);

    expect(res.body.success).toBe(true);

    // The very same access token must now be rejected.
    const denied = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", `Bearer ${adminTokens.accessToken}`)
      .expect(401);
    expect(denied.body.error.code).toBe("UNAUTHORIZED");

    // Refresh token for the admin must also be revoked.
    const history = await RefreshToken.find({
      userId: jwt.decode(adminTokens.accessToken).id,
      revokedAt: { $ne: null },
    });
    expect(history.length).toBeGreaterThan(0);
  });
});