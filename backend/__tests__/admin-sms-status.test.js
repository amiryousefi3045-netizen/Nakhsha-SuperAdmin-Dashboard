const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");

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

  await User.deleteMany({ phone: { $in: ["09210000001", "09210000002"] } });

  saUser = await User.create({
    name: "سوپرادمین اس‌ام‌اس",
    phone: "09210000001",
    handle: "sa_sms",
    role: "super_admin",
    isVerified: true,
  });
  saToken = accessTokenOf(saUser);

  normalUser = await User.create({
    name: "کاربر عادی",
    phone: "09210000002",
    handle: "u_sms",
    role: "user",
    isVerified: true,
  });
  normalToken = accessTokenOf(normalUser);
});

afterAll(async () => {
  await User.deleteMany({ phone: { $in: ["09210000001", "09210000002"] } });
});

describe("GET /api/admin/sms-status", () => {
  it("returns a structured status payload for super-admin", async () => {
    const res = await request(app)
      .get("/api/admin/sms-status")
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.configured).toBe("boolean");
    expect(typeof res.body.mock).toBe("boolean");
    expect(["mock", "live", "disabled"]).toContain(res.body.mode);
    expect(typeof res.body.from).toBe("string");
    expect(typeof res.body.toFormat).toBe("string");
    // No provider probe may ever run from the test environment.
    if (res.body.mode !== "live") {
      expect(res.body.credit).toBeNull();
    }
  });

  it("rejects a non-super-admin role with 403", async () => {
    const res = await request(app)
      .get("/api/admin/sms-status")
      .set("Authorization", AUTH(normalToken))
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it("rejects anonymous requests with 401", async () => {
    const res = await request(app).get("/api/admin/sms-status").expect(401);
    expect(res.body.success).toBe(false);
  });
});