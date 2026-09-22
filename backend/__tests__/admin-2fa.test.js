const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const TotpCredential = require("../models/TotpCredential");
const TotpService = require("../services/TotpService");

// ── Helpers ────────────────────────────────────────────────────────────────

function accessTokenOf(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role, type: "access", ver: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "15m", algorithm: "HS256" },
  );
}

const AUTH = (token) => `Bearer ${token}`;

let saUser;
let saToken;
let normalUser;
let normalToken;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";

  const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;

  await User.deleteMany({ phone: { $in: ["09210000101", "09210000102"] } });
  await TotpCredential.deleteMany({});

  saUser = await User.create({
    name: "سوپرادمین ۲FA",
    phone: "09210000101",
    handle: "sa_2fa",
    role: "super_admin",
    isVerified: true,
  });
  saToken = accessTokenOf(saUser);

  normalUser = await User.create({
    name: "کاربر عادی ۲FA",
    phone: "09210000102",
    handle: "u_2fa",
    role: "user",
    isVerified: true,
  });
  normalToken = accessTokenOf(normalUser);
});

afterAll(async () => {
  await TotpCredential.deleteMany({});
  await User.deleteMany({ phone: { $in: ["09210000101", "09210000102"] } });
});

// ── GET /api/admin/2fa/status ──────────────────────────────────────────────

describe("GET /api/admin/2fa/status", () => {
  it("returns { enabled: false, provisioned: false } before setup", async () => {
    const res = await request(app)
      .get("/api/admin/2fa/status")
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.enabled).toBe(false);
    expect(res.body.provisioned).toBe(false);
  });

  it("rejects non-super-admin with 403", async () => {
    const res = await request(app)
      .get("/api/admin/2fa/status")
      .set("Authorization", AUTH(normalToken))
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it("rejects anonymous requests with 401", async () => {
    const res = await request(app).get("/api/admin/2fa/status").expect(401);
    expect(res.body.success).toBe(false);
  });
});

// ── POST /api/admin/2fa/provision ──────────────────────────────────────────

describe("POST /api/admin/2fa/provision", () => {
  it("creates a new TOTP credential and returns secret + otpauthUri", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/provision")
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.secret).toBe("string");
    expect(res.body.secret.length).toBeGreaterThan(10);
    expect(typeof res.body.otpauthUri).toBe("string");
    expect(res.body.otpauthUri).toContain("otpauth://totp/");

    const cred = await TotpCredential.findOne({ userId: saUser._id });
    expect(cred).toBeTruthy();
    expect(cred.secret).toBe(res.body.secret);
    expect(cred.enabled).toBe(false);
  });

  it("overwrites an existing secret on re-provision", async () => {
    const first = await request(app)
      .post("/api/admin/2fa/provision")
      .set("Authorization", AUTH(saToken))
      .expect(200);

    const second = await request(app)
      .post("/api/admin/2fa/provision")
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(second.body.secret).not.toBe(first.body.secret);

    const cred = await TotpCredential.findOne({ userId: saUser._id });
    expect(cred.secret).toBe(second.body.secret);
    expect(cred.enabled).toBe(false);
    expect(cred.verifiedAt).toBeNull();
  });
});

// ── POST /api/admin/2fa/enable ─────────────────────────────────────────────

describe("POST /api/admin/2fa/enable", () => {
  beforeAll(async () => {
    await TotpCredential.deleteMany({ userId: saUser._id });
  });

  it("rejects when no credential is provisioned", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/enable")
      .set("Authorization", AUTH(saToken))
      .send({ code: "123456" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TOTP_NOT_PROVISIONED");
  });

  it("rejects a non-6-digit code", async () => {
    await TotpCredential.create({ userId: saUser._id, secret: TotpService.generateSecret(), enabled: false });

    const res = await request(app)
      .post("/api/admin/2fa/enable")
      .set("Authorization", AUTH(saToken))
      .send({ code: "12345" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid TOTP code", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/enable")
      .set("Authorization", AUTH(saToken))
      .send({ code: "000000" })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TOTP_REQUIRED");
  });

  it("enables 2FA with a valid TOTP code", async () => {
    const cred = await TotpCredential.findOne({ userId: saUser._id });
    const validCode = TotpService.generateCode(cred.secret);

    const res = await request(app)
      .post("/api/admin/2fa/enable")
      .set("Authorization", AUTH(saToken))
      .send({ code: validCode })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.enabled).toBe(true);

    const updated = await TotpCredential.findOne({ userId: saUser._id });
    expect(updated.enabled).toBe(true);
    expect(updated.verifiedAt).toBeTruthy();
  });
});

// ── POST /api/admin/2fa/disable ────────────────────────────────────────────

describe("POST /api/admin/2fa/disable", () => {
  it("rejects a non-6-digit code", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/disable")
      .set("Authorization", AUTH(saToken))
      .send({ code: "123" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid TOTP code", async () => {
    const res = await request(app)
      .post("/api/admin/2fa/disable")
      .set("Authorization", AUTH(saToken))
      .send({ code: "999999" })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TOTP_REQUIRED");
  });

  it("disables 2FA with a valid TOTP code", async () => {
    const cred = await TotpCredential.findOne({ userId: saUser._id });
    const validCode = TotpService.generateCode(cred.secret);

    const res = await request(app)
      .post("/api/admin/2fa/disable")
      .set("Authorization", AUTH(saToken))
      .send({ code: validCode })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.enabled).toBe(false);

    const updated = await TotpCredential.findOne({ userId: saUser._id });
    expect(updated.enabled).toBe(false);
    expect(updated.verifiedAt).toBeNull();
  });

  it("returns error when 2FA is already disabled", async () => {
    const cred = await TotpCredential.findOne({ userId: saUser._id });
    const validCode = TotpService.generateCode(cred.secret);

    const res = await request(app)
      .post("/api/admin/2fa/disable")
      .set("Authorization", AUTH(saToken))
      .send({ code: validCode })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TOTP_NOT_ENABLED");
  });
});
