const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const crypto = require("crypto");
const app = require("../server");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const RefreshToken = require("../models/RefreshToken");

// ── Helpers ────────────────────────────────────────────────────────────────

function accessTokenOf(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role, type: "access", ver: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "15m", algorithm: "HS256" },
  );
}

const AUTH = (token) => `Bearer ${token}`;

function makeTokenHash(seed) {
  return crypto.createHash("sha256").update(`session-${seed}-${Date.now()}`).digest("hex");
}

const PHONES = {
  sa: "09148000001",
  userA: "09148000002",
};
const TARGET_PHONE = "09148000004";

const ALL_PHONES = [...Object.values(PHONES), TARGET_PHONE];

let saUser;
let saToken;
let userAToken;
let targetUser;
let targetUserId;
let activeA;
let activeB;
let revokedSession;

const FIFTEEN_MIN = 15 * 60 * 1000;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  process.env.SUPER_ADMIN_PHONE = PHONES.sa;

  const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;

  await User.deleteMany({ phone: { $in: ALL_PHONES } });
  await User.deleteMany({ role: "super_admin" });

  saUser = await User.create({
    name: "سوپرادمین نشست",
    phone: PHONES.sa,
    handle: "sa_sessions",
    role: "super_admin",
    isVerified: true,
  });
  saToken = accessTokenOf(saUser);

  const userA = await User.create({
    name: "کاربر بدون دسترسی",
    phone: PHONES.userA,
    handle: "u_no_access",
    role: "user",
    isVerified: true,
  });
  userAToken = accessTokenOf(userA);

  targetUser = await User.create({
    name: "کاربر هدف نشست",
    phone: TARGET_PHONE,
    handle: "u_sessions_target",
    role: "user",
    isVerified: true,
  });
  targetUserId = String(targetUser._id);

  await RefreshToken.deleteMany({ userId: { $in: [saUser._id, targetUser._id, userA._id] } });

  activeA = await RefreshToken.create({
    userId: targetUser._id,
    tokenHash: makeTokenHash("A"),
    deviceId: "dev-aaaa",
    deviceInfo: {
      userAgent: "Chrome/120 on Windows",
      ipAddress: "192.168.1.10",
      lastUsedAt: new Date(Date.now() - 2 * 60 * 1000),
    },
    expiresAt: new Date(Date.now() + FIFTEEN_MIN),
  });

  activeB = await RefreshToken.create({
    userId: targetUser._id,
    tokenHash: makeTokenHash("B"),
    deviceId: "dev-bbbb",
    deviceInfo: {
      userAgent: "Nakhsha Android App",
      ipAddress: "10.0.0.42",
      lastUsedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
    expiresAt: new Date(Date.now() + FIFTEEN_MIN),
  });

  revokedSession = await RefreshToken.create({
    userId: targetUser._id,
    tokenHash: makeTokenHash("C"),
    deviceId: "dev-cccc",
    deviceInfo: { userAgent: "Old iPhone", ipAddress: "172.16.0.8", lastUsedAt: new Date() },
    expiresAt: new Date(Date.now() + FIFTEEN_MIN),
    revokedAt: new Date(Date.now() - 5 * 60 * 1000),
    revocationReason: "LOGOUT",
  });
});

afterAll(async () => {
  await RefreshToken.deleteMany({ userId: { $in: [saUser._id, targetUser._id] } });
  await AuditLog.deleteMany({ userId: saUser._id });
  await User.deleteMany({ phone: { $in: ALL_PHONES } });
  delete process.env.SUPER_ADMIN_PHONE;
  await mongoose.connection.close();
});

describe("User sessions — protection", () => {
  it("rejects unauthenticated requests with 401", async () => {
    await request(app).get(`/api/admin/users/${targetUserId}/sessions`).expect(401);
    await request(app)
      .delete(`/api/admin/users/${targetUserId}/sessions/${activeA._id}`)
      .expect(401);
  });

  it("rejects non-super_admin with 403", async () => {
    const denied = await request(app)
      .get(`/api/admin/users/${targetUserId}/sessions`)
      .set("Authorization", AUTH(userAToken))
      .expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });
});

describe("User sessions — listing", () => {
  it("returns only active sessions, newest first, with device info", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUserId}/sessions`)
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(2);
    expect(res.body.user.id).toBe(targetUserId);
    expect(res.body.sessions).toHaveLength(2);

    const [first, second] = res.body.sessions;
    expect(first.id).toBe(String(activeA._id));
    expect(first.deviceId).toBe("dev-aaaa");
    expect(first.device.userAgent).toBe("Chrome/120 on Windows");
    expect(first.device.ipAddress).toBe("192.168.1.10");
    expect(first.lastUsedAt).toBeTruthy();
    expect(first.expiresAt).toBeTruthy();

    expect(second.deviceId).toBe("dev-bbbb");
    expect(second.device.userAgent).toBe("Nakhsha Android App");
  });

  it("excludes revoked sessions", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUserId}/sessions`)
      .set("Authorization", AUTH(saToken))
      .expect(200);
    const ids = res.body.sessions.map((s) => s.id);
    expect(ids).not.toContain(String(revokedSession._id));
  });

  it("returns 404 for a missing user", async () => {
    const missing = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/admin/users/${missing}/sessions`)
      .set("Authorization", AUTH(saToken))
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid user id", async () => {
    const res = await request(app)
      .get("/api/admin/users/not-an-id/sessions")
      .set("Authorization", AUTH(saToken))
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("User sessions — revocation", () => {
  it("revokes a target session and writes a TOKEN_REVOKED audit entry", async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${targetUserId}/sessions/${activeB._id}`)
      .set("Authorization", AUTH(saToken))
      .expect(200);
    expect(res.body.success).toBe(true);

    const session = await RefreshToken.findById(activeB._id).lean();
    expect(session.revokedAt).toBeTruthy();
    expect(session.revocationReason).toBe("ADMIN_REVOKE");

    const log = await AuditLog.findOne({
      action: "TOKEN_REVOKED",
      userId: saUser._id,
      "resource.type": "USER",
      "resource.id": new mongoose.Types.ObjectId(targetUserId),
    }).lean();
    expect(log).toBeTruthy();
    expect(log.riskLevel).toBe("MEDIUM");
    expect(log.changes.before.sessionId).toBe(String(activeB._id));
  });

  it("no longer lists a revoked session", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${targetUserId}/sessions`)
      .set("Authorization", AUTH(saToken))
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.sessions[0].id).toBe(String(activeA._id));
  });

  it("returns 404 for a missing or already-revoked session", async () => {
    const missing = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/admin/users/${targetUserId}/sessions/${missing}`)
      .set("Authorization", AUTH(saToken))
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("forbids revoking your own sessions", async () => {
    const mySession = await RefreshToken.create({
      userId: saUser._id,
      tokenHash: makeTokenHash("SA"),
      deviceId: "dev-sa",
      deviceInfo: { userAgent: "Admin Console", ipAddress: "127.0.0.1", lastUsedAt: new Date() },
      expiresAt: new Date(Date.now() + FIFTEEN_MIN),
    });

    const res = await request(app)
      .delete(`/api/admin/users/${saUser._id}/sessions/${mySession._id}`)
      .set("Authorization", AUTH(saToken))
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 for structurally invalid ids", async () => {
    const res = await request(app)
      .delete(`/api/admin/users/not-an-id/sessions/also-not`)
      .set("Authorization", AUTH(saToken))
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});