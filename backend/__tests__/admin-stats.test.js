const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const crypto = require("crypto");
const app = require("../server");
const User = require("../models/User");
const Craft = require("../models/Craft");
const { PostListing } = require("../models/Listing");
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
  sa: "09140000021",
};

let saUser;
let saToken;
let extraUser;

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
  await User.deleteMany({ role: "super_admin" });
  await Craft.deleteMany({ title: "آمار تست کد" });
  await PostListing.deleteMany({ title: "آمار تست پست" });
  await AuditLog.deleteMany({ action: "DATA_EXPORTED" });

  saUser = await User.create({
    name: "سوپرادمین آمار",
    phone: PHONES.sa,
    handle: "sa_stats",
    role: "super_admin",
    isVerified: true,
  });
  saToken = accessTokenOf(saUser);

  extraUser = await User.create({
    name: "کاربر آمار",
    phone: "09140000022",
    handle: "u_stats_seed",
    role: "user",
    isVerified: true,
  });

  await PostListing.create({
    title: "آمار تست پست",
    description: "توضیح برای تست شمارش آمار دیتابیس",
    status: "published",
    owner: extraUser._id,
  });

  await Craft.create({
    title: "آمار تست کد",
    description: "کد برای تست شمارش آمار دیتابیس",
    kind: "artwork",
    craftType: "pottery",
    isPublished: true,
    author: extraUser._id,
  });

  await RefreshToken.create({
    userId: extraUser._id,
    tokenHash: crypto.createHash("sha256").update(`stats-${Date.now()}`).digest("hex"),
    deviceId: "dev-stats",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });

  await AuditLog.create({
    userId: extraUser._id,
    action: "DATA_EXPORTED",
    resource: { type: "USER", id: extraUser._id },
    result: "SUCCESS",
    riskLevel: "LOW",
  });
});

afterAll(async () => {
  await AuditLog.deleteMany({ action: "DATA_EXPORTED" });
  await RefreshToken.deleteMany({ userId: { $in: [saUser._id, extraUser._id] } });
  await Craft.deleteMany({ title: "آمار تست کد" });
  await PostListing.deleteMany({ title: "آمار تست پست" });
  await User.deleteMany({ phone: { $in: ["09140000021", "09140000022"] } });
  delete process.env.SUPER_ADMIN_PHONE;
  await mongoose.connection.close();
});

describe("Admin stats — protection", () => {
  it("rejects unauthenticated and non-super_admin access", async () => {
    await request(app).get("/api/admin/stats").expect(401);
  });
});

describe("Admin stats — dashboard blocks", () => {
  it("returns overview, growth, distribution, topCities, recentActivity and dbTotals", async () => {
    const res = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    const data = res.body;

    expect(data.overview).toMatchObject({
      totalUsers: expect.any(Number),
      activeContent: expect.any(Number),
      pendingContent: expect.any(Number),
      blockedUsers: expect.any(Number),
    });
    expect(Array.isArray(data.growth)).toBe(true);
    expect(Array.isArray(data.distribution)).toBe(true);
    expect(Array.isArray(data.topCities)).toBe(true);
    expect(Array.isArray(data.recentActivity)).toBe(true);

    expect(data.dbTotals).toEqual({
      users: expect.any(Number),
      listings: expect.any(Number),
      crafts: expect.any(Number),
      auditLogs: expect.any(Number),
      refreshTokens: expect.any(Number),
    });

    expect(data.dbTotals.users).toBeGreaterThanOrEqual(2);
    expect(data.dbTotals.listings).toBeGreaterThanOrEqual(1);
    expect(data.dbTotals.crafts).toBeGreaterThanOrEqual(1);
    expect(data.dbTotals.auditLogs).toBeGreaterThanOrEqual(1);
    expect(data.dbTotals.refreshTokens).toBeGreaterThanOrEqual(1);

    expect(data.overview.totalUsers).toBeGreaterThanOrEqual(2);
    expect(data.overview.activeContent).toBeGreaterThanOrEqual(2);
    expect(data.distribution.some((d) => d.type === "post")).toBe(true);
  });
});
