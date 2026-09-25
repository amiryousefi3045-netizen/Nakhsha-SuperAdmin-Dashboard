const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const AuditLog = require("../models/AuditLog");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 26 — seller store activity feed (GET /api/seller/activity).
 * The feed covers the owner PLUS their roster, newest first, and never leaks
 * other stores' rows; `changes.before` is stripped server-side.
 */

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

const PHONES = {
  owner: "09146900001",
  manager: "09146900002",
  staff: "09146900003",
  otherSeller: "09146900004",
};

let ownerToken;
let managerToken;
let staffToken;
let otherToken;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await TeamMember.deleteMany({});
  await AuditLog.deleteMany({});
}

const DAY = 86400000;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  _resetRateLimitStoreForTests();

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;
  await wipe();

  async function makeUser(name, phone, handle) {
    return User.create({ name, phone, handle, role: "seller", isVerified: true });
  }

  const owner = await makeUser("مالک رویداد", PHONES.owner, "act_owner");
  const manager = await makeUser("مدیر رویداد", PHONES.manager, "act_manager");
  const staff = await makeUser("کارمند رویداد", PHONES.staff, "act_staff");
  const other = await makeUser("فروشنده دیگر", PHONES.otherSeller, "act_other");

  ownerToken = TOKEN_OF(owner);
  managerToken = TOKEN_OF(manager);
  staffToken = TOKEN_OF(staff);
  otherToken = TOKEN_OF(other);

  const profile = await SellerProfile.create({
    userId: owner._id,
    storeName: "فروشگاه رویدادها",
    slug: "act-shop",
    status: "active",
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });

  await TeamMember.create({ sellerProfileId: profile._id, userId: manager._id, role: "manager" });
  await TeamMember.create({ sellerProfileId: profile._id, userId: staff._id, role: "staff" });

  const base = Date.now();
  await AuditLog.create({
    userId: owner._id, // store owner
    action: "PRODUCT_CREATED",
    resource: { type: "SELLER_PROFILE", id: profile._id },
    changes: { after: { title: "گلدان" } },
    riskLevel: "MEDIUM",
    result: "SUCCESS",
    metadata: { title: "گلدان" },
    createdAt: new Date(base - 3 * DAY),
  });
  await AuditLog.create({
    userId: manager._id, // roster member
    action: "PAYOUT_REQUESTED",
    resource: { type: "TRANSACTION", id: new mongoose.Types.ObjectId() },
    riskLevel: "HIGH",
    result: "SUCCESS",
    createdAt: new Date(base - 2 * DAY),
  });
  await AuditLog.create({
    userId: owner._id,
    action: "STOCK_ADJUSTED",
    resource: { type: "SELLER_PROFILE", id: profile._id },
    changes: { after: { delta: -3 } },
    riskLevel: "HIGH",
    result: "SUCCESS",
    createdAt: new Date(base - 1 * DAY),
  });
  await AuditLog.create({
    userId: other._id, // another store — must not leak
    action: "ORDER_STATUS_CHANGED",
    resource: { type: "TRANSACTION", id: new mongoose.Types.ObjectId() },
    riskLevel: "LOW",
    result: "SUCCESS",
    createdAt: new Date(base),
  });
});

afterAll(async () => {
  await wipe();
  await mongoose.connection.close();
});

describe("seller activity feed", () => {
  it("returns owner + roster events newest-first, excluding other stores", async () => {
    const res = await request(app)
      .get("/api/seller/activity")
      .set("Authorization", AUTH(ownerToken));
    expect(res.status).toBe(200);

    const { items, total, page, limit } = res.body;
    expect(total).toBe(3); // owner 2 + manager 1; other store's row is excluded
    expect(items).toHaveLength(3);

    expect(items[0].action).toBe("STOCK_ADJUSTED");
    expect(items[1].action).toBe("PAYOUT_REQUESTED");
    expect(items[2].action).toBe("PRODUCT_CREATED");

    expect(items.map((i) => i.action)).not.toContain("ORDER_STATUS_CHANGED");
    expect(items.every((i) => i.before === undefined)).toBe(true);
    expect(items.find((i) => i.action === "STOCK_ADJUSTED").after.delta).toBe(-3);
    expect(items.find((i) => i.action === "PAYOUT_REQUESTED").riskLevel).toBe("HIGH");
    expect(page).toBe(1);
    expect(limit).toBe(25);
  });

  it("paginates with page/limit", async () => {
    const res = await request(app)
      .get("/api/seller/activity?page=2&limit=2")
      .set("Authorization", AUTH(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.page).toBe(2);
    expect(res.body.items[0].action).toBe("PRODUCT_CREATED");
  });

  it("lets a manager roster member see the store feed", async () => {
    const res = await request(app)
      .get("/api/seller/activity")
      .set("Authorization", AUTH(managerToken));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  it("denies staff members (not owner/manager)", async () => {
    const res = await request(app)
      .get("/api/seller/activity")
      .set("Authorization", AUTH(staffToken));
    expect(res.status).toBe(403);
  });

  it("isolates other stores completely", async () => {
    const res = await request(app)
      .get("/api/seller/activity")
      .set("Authorization", AUTH(otherToken));
    expect(res.status).toBe(403); // other seller has no profile here
  });
});