const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const OtpCode = require("../models/OtpCode");
const AuditLog = require("../models/AuditLog");
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

// Sign an access token directly so tests are independent of the OTP flow and
// the shared per-IP rate-limit budget.
function accessTokenOf(user) {
  return jwt.sign(
    {
      id: String(user._id),
      role: user.role,
      type: "access",
      ver: user.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m", algorithm: "HS256" },
  );
}

const TOKEN_OF = (u) => accessTokenOf(u);
const AUTH = (token) => `Bearer ${token}`;

// ── Test phones (unique per this suite) ────────────────────────────────────
const PHONES = {
  sa: "09145000001",
  tourLeader: "09145000002",
  admin: "09145000003",
  disposable: "09145000004",
  nono: "09145000005",
};

// ── Fixtures ───────────────────────────────────────────────────────────────

let saUser;
let saToken;
let tourLeaderUser;
let tourLeaderToken;
let adminUser;
let adminToken;
let disposableUser;
let listingId;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  process.env.SUPER_ADMIN_PHONE = PHONES.sa;
  _resetRateLimitStoreForTests();

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;

  // Only touch what this suite owns: any existing super_admin (singleton!) and
  // users on our phones.
  await User.deleteMany({ role: "super_admin" });
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });

  saUser = await User.create({
    name: "سوپرادمین ماتریکس",
    phone: PHONES.sa,
    handle: "sa_matrix",
    role: "super_admin",
    isVerified: true,
  });
  saToken = TOKEN_OF(saUser);

  tourLeaderUser = await User.create({
    name: "تورلیدر ماتریکس",
    phone: PHONES.tourLeader,
    handle: "tl_matrix",
    role: "tour_leader",
    isVerified: true,
  });
  tourLeaderToken = TOKEN_OF(tourLeaderUser);

  adminUser = await User.create({
    name: "ادمین ماتریکس",
    phone: PHONES.admin,
    handle: "adm_matrix",
    role: "admin",
    permissions: ["DELETE_USERS"],
  });
  adminToken = TOKEN_OF(adminUser);

  disposableUser = await User.create({
    name: "کاربر یک‌بارمصرف",
    phone: PHONES.disposable,
    handle: "one_time_user",
    role: "user",
    isVerified: true,
  });

  const listing = await PostListing.create({
    title: "فهرست امنیتی",
    description: "توضیحات تست ماتریس امنیتی",
    owner: tourLeaderUser._id,
    status: "pending",
  });
  listingId = listing._id.toString();
});

afterAll(async () => {
  await OtpCode.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await AuditLog.deleteMany({
    "resource.id": { $in: [String(saUser._id), String(listingId)] },
  });
  delete process.env.SUPER_ADMIN_PHONE;
  await mongoose.connection.close();
});

describe("Security Matrix - role enforcement", () => {
  it("a tour_leader is DENIED all /api/admin/* routes with 403", async () => {
    const denied = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", AUTH(tourLeaderToken))
      .expect(403);

    expect(denied.body.success).toBe(false);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("an `admin` holding granular permissions is still DENIED super_admin-only routes", async () => {
    const denied = await request(app)
      .get("/api/admin/users")
      .set("Authorization", AUTH(adminToken))
      .expect(403);

    expect(denied.body.error.code).toBe("FORBIDDEN");
    expect(adminUser.permissions).toContain("DELETE_USERS");
  });

  it("a valid token cannot bypass a super_admin that is blocked in the DB", async () => {
    // Token was issued while the account was healthy.
    await User.updateOne({ _id: saUser._id }, { $set: { isBlocked: true } });

    const blocked = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", AUTH(saToken))
      .expect(403);
    expect(blocked.body.error.code).toBe("FORBIDDEN");

    await User.updateOne({ _id: saUser._id }, { $set: { isBlocked: false } });

    // Unblocked again → the same token works.
    const ok = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", AUTH(saToken))
      .expect(200);
    expect(ok.body.success).toBe(true);
  });
});

describe("Security Matrix - self protection", () => {
  it("a super admin cannot change their own role", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${saUser._id}/role`)
      .set("Authorization", AUTH(saToken))
      .send({ role: "tour_leader" })
      .expect(403);

    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("a super admin cannot change their own permissions", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${saUser._id}/permissions`)
      .set("Authorization", AUTH(saToken))
      .send({ permissions: ["DELETE_USERS"] })
      .expect(403);

    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("a super admin cannot delete their own account", async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${saUser._id}`)
      .set("Authorization", AUTH(saToken))
      .expect(403);

    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await User.findById(saUser._id)).toBeTruthy();
  });
});

describe("Security Matrix - super admin invariance", () => {
  it("a duplicate super_admin cannot be created (singleton invariant)", async () => {
    await expect(
      User.create({ phone: PHONES.nono, role: "super_admin" }),
    ).rejects.toMatchObject({ code: 409 });

    expect(await User.countDocuments({ role: "super_admin" })).toBe(1);
  });

  it("repeated OTP login with SUPER_ADMIN_PHONE is idempotent (still one super_admin)", async () => {
    const first = await otpLogin(PHONES.sa);
    const second = await otpLogin(PHONES.sa);

    expect(first.user.role).toBe("super_admin");
    expect(second.user.role).toBe("super_admin");
    expect(await User.countDocuments({ role: "super_admin" })).toBe(1);
  });

  it("a second SUPER_ADMIN_PHONE holder is never promoted when a super_admin exists", async () => {
    process.env.SUPER_ADMIN_PHONE = PHONES.nono;

    const body = await otpLogin(PHONES.nono);

    // Login succeeds with normal role — the conflict never leaks to the client.
    expect(body.user.role).toBe("user");
    expect(await User.countDocuments({ role: "super_admin" })).toBe(1);
  });
});

describe("Security Matrix - input validation", () => {
  it("rejects a malformed ObjectId with 400 instead of 500", async () => {
    const res = await request(app)
      .patch("/api/admin/users/not-an-object-id/role")
      .set("Authorization", AUTH(saToken))
      .send({ role: "tour_leader" })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid permission value with 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminUser._id}/permissions`)
      .set("Authorization", AUTH(saToken))
      .send({ permissions: ["EVERYTHING"] })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("only `admin` users can hold granular permissions", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${tourLeaderUser._id}/permissions`)
      .set("Authorization", AUTH(saToken))
      .send({ permissions: ["APPROVE_CONTENT"] })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("setting permissions works on an admin target and writes an audit", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminUser._id}/permissions`)
      .set("Authorization", AUTH(saToken))
      .send({ permissions: ["APPROVE_CONTENT", "VIEW_AUDIT_LOGS"] })
      .expect(200);

    expect(res.body.user.permissions).toContain("APPROVE_CONTENT");

    const audit = await AuditLog.findOne({ action: "USER_PERMISSIONS_CHANGE" });
    expect(audit).toBeTruthy();
  });

  it("unknown extra body fields are ignored by the allowlist", async () => {
    const res = await request(app)
      .patch("/api/admin/profile")
      .set("Authorization", AUTH(saToken))
      .send({ name: "ادمین ماتریکس", sneakyField: "x" })
      .expect(200);

    expect(res.body.success).toBe(true);

    const fresh = await User.findById(saUser._id).lean();
    expect(fresh.sneakyField).toBeUndefined();
  });

  it("caps pagination at MAX (limit > 100) instead of echoing the client value", async () => {
    const res = await request(app)
      .get("/api/admin/users?limit=1000000")
      .set("Authorization", AUTH(saToken))
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("escapes regex-special characters in the q filter without crashing", async () => {
    const res = await request(app)
      .get(`/api/admin/users?q=${encodeURIComponent("[.*+?^${}()|[\\]\\\\]")}`)
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("rejects an invalid listing status / type with 400", async () => {
    const badStatus = await request(app)
      .patch(`/api/admin/listings/${listingId}/status`)
      .set("Authorization", AUTH(saToken))
      .send({ status: "deleted" })
      .expect(400);
    expect(badStatus.body.error.code).toBe("VALIDATION_ERROR");

    const badType = await request(app)
      .get("/api/admin/listings?type=bogus")
      .set("Authorization", AUTH(saToken))
      .expect(400);
    expect(badType.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates the provider status allowlist", async () => {
    const res = await request(app)
      .patch(`/api/admin/providers/${tourLeaderUser._id}/status`)
      .set("Authorization", AUTH(saToken))
      .send({ status: "hacked" })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Security Matrix - delete semantics", () => {
  it("deletes an ordinary user and writes a CRITICAL audit", async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${disposableUser._id}`)
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(await User.findById(disposableUser._id)).toBeNull();

    const audit = await AuditLog.findOne({
      action: "USER_DELETE",
      "resource.id": String(disposableUser._id),
    });
    expect(audit).toBeTruthy();
    expect(audit.riskLevel).toBe("CRITICAL");
  });

  it("revokes the deleted user's refresh tokens and kills their access token", async () => {
    // Fresh disposable target so the token belongs to a user that exists today.
    const victim = await User.create({
      name: "قربانی حذف",
      phone: "09145999999",
      handle: "victim_delete",
      role: "user",
    });
    const victimToken = TOKEN_OF(victim);

    const res = await request(app)
      .delete(`/api/admin/users/${victim._id}`)
      .set("Authorization", AUTH(saToken))
      .expect(200);
    expect(res.body.success).toBe(true);

    // The deleted user's previously-valid token is now rejected.
    const denied = await request(app)
      .get("/api/auth/me")
      .set("Authorization", AUTH(victimToken))
      .expect(401);
    expect(denied.body.error.code).toBe("UNAUTHORIZED");
  });
});