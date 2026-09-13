const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
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

const PHONES = {
  sa: "09147000001",
  userA: "09147000002",
};

let saUser;
let saToken;
let userAToken;
let richLogId;
let simpleLogId;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  process.env.SUPER_ADMIN_PHONE = PHONES.sa;

  const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;

  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });

  saUser = await User.create({
    name: "سوپرادمین لاگ",
    phone: PHONES.sa,
    handle: "sa_logs",
    role: "super_admin",
    isVerified: true,
  });
  saToken = accessTokenOf(saUser);

  await AuditLog.deleteMany({ userId: saUser._id });

  const userA = await User.create({
    name: "کاربر بدون دسترسی",
    phone: PHONES.userA,
    handle: "u_no_access",
    role: "user",
    isVerified: true,
  });
  userAToken = accessTokenOf(userA);

  const rich = await AuditLog.create({
    userId: saUser._id,
    action: "ADMIN_CONTENT_REMOVED",
    resource: { type: "CRAFT", id: new mongoose.Types.ObjectId() },
    changes: { before: { comment: { text: "متن قبلی" } }, after: null },
    requestContext: {
      ip: "10.0.0.5",
      userAgent: "supertest/1",
      endpoint: "/api/admin/comments/:craftId/:commentId",
      method: "DELETE",
      statusCode: 200,
    },
    result: "SUCCESS",
    riskLevel: "HIGH",
    metadata: { reason: "گزارش کاربر" },
    compliance: { gdprRelevant: true, dataCategories: ["PERSONAL_DATA"] },
  });

  const simple = await AuditLog.create({
    userId: saUser._id,
    action: "LOGIN",
    resource: { type: "USER", id: saUser._id },
    result: "SUCCESS",
    riskLevel: "LOW",
  });

  richLogId = rich._id.toString();
  simpleLogId = simple._id.toString();
});

afterAll(async () => {
  await AuditLog.deleteMany({ userId: { $in: [saUser._id] } });
  await RefreshToken.deleteMany({ userId: saUser._id });
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  delete process.env.SUPER_ADMIN_PHONE;
  await mongoose.connection.close();
});

describe("Audit log detail — protection", () => {
  it("rejects unauthenticated requests with 401", async () => {
    await request(app).get(`/api/admin/audit-logs/${richLogId}`).expect(401);
    await request(app).get("/api/admin/audit-logs/export").expect(401);
  });

  it("rejects non-super_admin with 403", async () => {
    const denied = await request(app)
      .get(`/api/admin/audit-logs/${richLogId}`)
      .set("Authorization", AUTH(userAToken))
      .expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });
});

describe("Audit log detail", () => {
  it("returns full DTO with context/metadata/compliance for a rich log", async () => {
    const res = await request(app)
      .get(`/api/admin/audit-logs/${richLogId}`)
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    const log = res.body.log;
    expect(log.id).toBe(richLogId);
    expect(log.action).toBe("ADMIN_CONTENT_REMOVED");
    expect(log.riskLevel).toBe("HIGH");
    expect(log.result).toBe("SUCCESS");
    expect(log.actorName).toBe("سوپرادمین لاگ");
    expect(log.requestContext.ip).toBe("10.0.0.5");
    expect(log.requestContext.statusCode).toBe(200);
    expect(log.metadata.reason).toBe("گزارش کاربر");
    expect(log.error).toBeNull();
    expect(log.compliance.gdprRelevant).toBe(true);
    expect(log.compliance.dataCategories).toEqual(["PERSONAL_DATA"]);
  });

  it("returns null-safe optional fields for a minimal log", async () => {
    const res = await request(app)
      .get(`/api/admin/audit-logs/${simpleLogId}`)
      .set("Authorization", AUTH(saToken))
      .expect(200);

    const log = res.body.log;
    expect(log.id).toBe(simpleLogId);
    expect(log.action).toBe("LOGIN");
    expect(log.requestContext).toBeNull();
    expect(log.metadata).toBeNull();
    expect(log.error).toBeNull();
    expect(log.compliance).toEqual({ gdprRelevant: false, dataCategories: [] });
  });

  it("returns 404 for a non-existent log", async () => {
    const missing = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/admin/audit-logs/${missing}`)
      .set("Authorization", AUTH(saToken))
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a structurally invalid id", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs/not-an-objectid")
      .set("Authorization", AUTH(saToken))
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Audit log CSV export", () => {
  it("returns a CSV attachment with header row and BOM", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs/export")
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toMatch(/audit-logs-\d{4}-\d{2}-\d{2}\.csv/);

    const body = res.text;
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const withoutBom = body.slice(1);
    const lines = withoutBom.split("\r\n");
    expect(lines[0]).toBe(
      '"createdAt","action","actorName","actorId","resourceType","resourceId","result","riskLevel","ip","userAgent","endpoint","method","statusCode","changesBefore","changesAfter","metadataReason","gdprRelevant","dataCategories"',
    );
    expect(lines.some((l) => l.includes('"ADMIN_CONTENT_REMOVED"'))).toBe(true);
    expect(lines.some((l) => l.includes('"LOGIN"'))).toBe(true);
  });

  it("respects filters (actorId limits rows; action filters rows)", async () => {
    const byActor = await request(app)
      .get("/api/admin/audit-logs/export")
      .query({ actorId: String(saUser._id) })
      .set("Authorization", AUTH(saToken))
      .expect(200);
    expect(byActor.text.slice(1).split("\r\n")).toHaveLength(3); // header + 2 logs

    const byAction = await request(app)
      .get("/api/admin/audit-logs/export")
      .query({ actorId: String(saUser._id), action: "LOGIN" })
      .set("Authorization", AUTH(saToken))
      .expect(200);
    const lines = byAction.text.slice(1).split("\r\n");
    expect(lines).toHaveLength(2); // header + 1 log
    expect(lines[1]).toContain('"LOGIN"');
  });

  it("returns 400 for invalid filter values", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs/export")
      .query({ actorId: "not-an-objectid" })
      .set("Authorization", AUTH(saToken))
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("keeps /export distinct from /:id (returns 200, not a 400 id parse)", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs/export")
      .set("Authorization", AUTH(saToken))
      .expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
  });
});