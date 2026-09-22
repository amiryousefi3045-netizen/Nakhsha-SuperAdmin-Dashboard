const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payout = require("../models/Payout");
const AuditLog = require("../models/AuditLog");
const OrderService = require("../services/OrderService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Seller settings & team — HTTP integration tests for the owner/member
 * capability matrix. Business rules live in SettingsService (covered by
 * settings-unit.test.js); these tests pin the HTTP contract: endpoints,
 * owner-only guards, member escalation, role gates and the audit trail.
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
  seller: "09147000030",
  memberManager: "09147000031",
  memberStaff: "09147000032",
  plainUser: "09147000033",
  otherOwner: "09147000034",
  adminUser: "09147000035",
};

const TEAM_AUDIT_ACTIONS = [
  "SELLER_SETTINGS_UPDATED",
  "TEAM_MEMBER_INVITED",
  "TEAM_MEMBER_ROLE_CHANGED",
  "TEAM_MEMBER_REMOVED",
  "PAYOUT_REQUESTED",
  "PAYOUT_CANCELLED",
];

let ownerUser;
let ownerToken;
let ownerProfile;
let managerUser;
let managerToken;
let staffUser;
let staffToken;
let plainUser;
let otherOwnerUser;
let adminUser;

async function setFinanceTerms(profile) {
  await SellerProfile.findByIdAndUpdate(profile._id, {
    $set: { finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 } },
  });
}

async function deliverAnOrder(profile, userId, price = 1000000) {
  const product = await Product.create({
    sellerId: profile._id,
    sellerUserId: userId,
    title: "سفال عضویت",
    price,
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  const order = await OrderService.createOrder({
    sellerId: profile._id,
    sellerUserId: userId,
    customer: { name: "علی", phone: "09120000001" },
    items: [{ productId: String(product._id), qty: 1 }],
  });
  for (const step of ["confirmed", "processing", "shipped", "delivered"]) {
    await OrderService.transitionOrder({
      orderId: String(order._id),
      sellerId: profile._id,
      nextStatus: step,
      sellerUserId: userId,
    });
  }
  return order;
}

async function wipeDomain() {
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await TeamMember.deleteMany({});
  await AuditLog.deleteMany({ action: { $in: TEAM_AUDIT_ACTIONS } });
  if (ownerProfile) {
    await setFinanceTerms(ownerProfile);
    await SellerProfile.findByIdAndUpdate(ownerProfile._id, {
      $set: {
        settings: {
          storefrontPublished: false,
          notificationEmail: true,
          notificationSms: false,
          defaultPayoutMethod: "bank_transfer",
        },
      },
    });
  }
}

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

  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await wipeDomain();

  ownerUser = await User.create({
    name: "مالک فروشگاه",
    phone: PHONES.seller,
    handle: "seller_settings_owner",
    role: "seller",
    isVerified: true,
  });
  ownerToken = TOKEN_OF(ownerUser);
  ownerProfile = await SellerProfile.create({
    userId: ownerUser._id,
    storeName: "فروشگاه تنظیمات",
    status: "active",
    verification: { status: "verified" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });

  managerUser = await User.create({
    name: "مدیر فروشگاه",
    phone: PHONES.memberManager,
    handle: "seller_settings_manager",
    role: "seller",
  });
  managerToken = TOKEN_OF(managerUser);

  staffUser = await User.create({
    name: "کارمند فروشگاه",
    phone: PHONES.memberStaff,
    handle: "seller_settings_staff",
    role: "seller",
  });
  staffToken = TOKEN_OF(staffUser);

  plainUser = await User.create({
    name: "کاربر ساده",
    phone: PHONES.plainUser,
    handle: "seller_settings_plain",
    role: "user",
  });

  otherOwnerUser = await User.create({
    name: "صاحب فروشگاه دیگر",
    phone: PHONES.otherOwner,
    handle: "seller_settings_other",
    role: "seller",
  });
  await SellerProfile.create({
    userId: otherOwnerUser._id,
    storeName: "فروشگاه دیگر",
    status: "active",
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });

  adminUser = await User.create({
    name: "ادمین سکو",
    phone: PHONES.adminUser,
    handle: "seller_settings_admin",
    role: "admin",
  });
});

beforeEach(async () => {
  await wipeDomain();
  // Re-seed roster (wipeDomain deletes it) so capability tests are deterministic.
  await TeamMember.create({
    sellerProfileId: ownerProfile._id,
    userId: managerUser._id,
    role: "manager",
  });
  await TeamMember.create({
    sellerProfileId: ownerProfile._id,
    userId: staffUser._id,
    role: "staff",
  });
});

afterAll(async () => {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await TeamMember.deleteMany({});
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await mongoose.connection.close();
});

// ── Settings surface ────────────────────────────────────────────────────────

describe("GET/PATCH /api/seller/settings", () => {
  it("GET returns the store defaults for the owner", async () => {
    const res = await request(app).get("/api/seller/settings").set("Authorization", AUTH(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.settings).toEqual({
      storefrontPublished: false,
      notificationEmail: true,
      notificationSms: false,
      defaultPayoutMethod: "bank_transfer",
    });
  });

  it("PATCH persists a partial update and GET reflects it", async () => {
    const patch = await request(app)
      .patch("/api/seller/settings")
      .set("Authorization", AUTH(ownerToken))
      .send({ defaultPayoutMethod: "card", storefrontPublished: true });
    expect(patch.status).toBe(200);
    expect(patch.body.settings.defaultPayoutMethod).toBe("card");
    expect(patch.body.settings.storefrontPublished).toBe(true);

    const get = await request(app).get("/api/seller/settings").set("Authorization", AUTH(ownerToken));
    expect(get.body.settings.defaultPayoutMethod).toBe("card");

    const audit = await AuditLog.findOne({ action: "SELLER_SETTINGS_UPDATED" }).lean();
    expect(audit).toBeTruthy();
    expect(audit.metadata.updatedFields).toEqual(
      expect.arrayContaining(["defaultPayoutMethod", "storefrontPublished"]),
    );
    expect(audit.metadata.updatedFields).toHaveLength(2);
  });

  it("PATCH rejects an unknown payout method", async () => {
    const res = await request(app)
      .patch("/api/seller/settings")
      .set("Authorization", AUTH(ownerToken))
      .send({ defaultPayoutMethod: "neft" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.field).toBe("defaultPayoutMethod");
  });

  it("members can read settings but not write them", async () => {
    const read = await request(app)
      .get("/api/seller/settings")
      .set("Authorization", AUTH(staffToken));
    expect(read.status).toBe(200);
    expect(read.body.settings.defaultPayoutMethod).toBe("bank_transfer");

    const write = await request(app)
      .patch("/api/seller/settings")
      .set("Authorization", AUTH(staffToken))
      .send({ notificationSms: true });
    expect(write.status).toBe(403);
    expect(write.body.success).toBe(false);
    expect(write.body.error.code).toBe("FORBIDDEN");
  });

  it("an unauthenticated user cannot reach settings", async () => {
    const res = await request(app).get("/api/seller/settings");
    expect(res.status).toBe(401);
  });
});

// ── Team surface ────────────────────────────────────────────────────────────

describe("/api/seller/team", () => {
  it("owner lists the roster with owner info", async () => {
    const res = await request(app).get("/api/seller/team").set("Authorization", AUTH(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.owner.userId).toBe(String(ownerUser._id));
    expect(res.body.items.map((m) => m.role).sort()).toEqual(["manager", "staff"]);
  });

  it("invite adds a member, escalates the user role, and audits", async () => {
    const res = await request(app)
      .post("/api/seller/team")
      .set("Authorization", AUTH(ownerToken))
      .send({ phone: PHONES.plainUser, role: "manager", note: "مسئول فروش" });
    expect(res.status).toBe(200);
    expect(res.body.member).toEqual(
      expect.objectContaining({
        userId: String(plainUser._id),
        role: "manager",
        note: "مسئول فروش",
        name: plainUser.name,
      }),
    );

    const escalated = await User.findById(plainUser._id).lean();
    expect(escalated.role).toBe("seller");

    const audit = await AuditLog.findOne({ action: "TEAM_MEMBER_INVITED" }).lean();
    expect(audit).toBeTruthy();
    expect(audit.metadata.userId).toBe(String(plainUser._id));
    expect(audit.metadata.roleChanged).toBe(true);
  });

  it("invite rejects the owner's own phone", async () => {
    const res = await request(app)
      .post("/api/seller/team")
      .set("Authorization", AUTH(ownerToken))
      .send({ phone: PHONES.seller, role: "staff" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TEAM_MEMBER_SELF_INVITE");
  });

  it("invite rejects an unknown phone", async () => {
    const res = await request(app)
      .post("/api/seller/team")
      .set("Authorization", AUTH(ownerToken))
      .send({ phone: "09147000099", role: "staff" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TEAM_MEMBER_USER_NOT_FOUND");
  });

  it("invite rejects a platform admin", async () => {
    const res = await request(app)
      .post("/api/seller/team")
      .set("Authorization", AUTH(ownerToken))
      .send({ phone: adminUser.phone, role: "staff" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TEAM_MEMBER_INVALID_USER");
  });

  it("invite rejects a user who owns another store", async () => {
    const res = await request(app)
      .post("/api/seller/team")
      .set("Authorization", AUTH(ownerToken))
      .send({ phone: PHONES.otherOwner, role: "staff" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TEAM_MEMBER_IS_OWNER");
  });

  it("invite rejects a user already on the roster", async () => {
    const res = await request(app)
      .post("/api/seller/team")
      .set("Authorization", AUTH(ownerToken))
      .send({ phone: PHONES.memberStaff, role: "manager" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TEAM_MEMBER_ALREADY_EXISTS");
  });

  it("owner changes a member role with an audit showing from/to", async () => {
    const list = await request(app).get("/api/seller/team").set("Authorization", AUTH(ownerToken));
    const staffId = list.body.items.find((m) => m.userId === String(staffUser._id)).id;

    const res = await request(app)
      .patch(`/api/seller/team/${staffId}/role`)
      .set("Authorization", AUTH(ownerToken))
      .send({ role: "manager" });
    expect(res.status).toBe(200);
    expect(res.body.member.role).toBe("manager");

    const audit = await AuditLog.findOne({ action: "TEAM_MEMBER_ROLE_CHANGED" }).lean();
    expect(audit).toBeTruthy();
    expect(audit.metadata.from).toBe("staff");
    expect(audit.metadata.to).toBe("manager");
  });

  it("change role rejects an invalid role value", async () => {
    const list = await request(app).get("/api/seller/team").set("Authorization", AUTH(ownerToken));
    const staffId = list.body.items.find((m) => m.userId === String(staffUser._id)).id;

    const res = await request(app)
      .patch(`/api/seller/team/${staffId}/role`)
      .set("Authorization", AUTH(ownerToken))
      .send({ role: "boss" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("owner removes a member and the roster shrinks", async () => {
    const list = await request(app).get("/api/seller/team").set("Authorization", AUTH(ownerToken));
    const staffId = list.body.items.find((m) => m.userId === String(staffUser._id)).id;

    const res = await request(app)
      .delete(`/api/seller/team/${staffId}`)
      .set("Authorization", AUTH(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(staffId);

    const audit = await AuditLog.findOne({ action: "TEAM_MEMBER_REMOVED" }).lean();
    expect(audit).toBeTruthy();
    expect(audit.metadata.userId).toBe(String(staffUser._id));

    const after = await request(app).get("/api/seller/team").set("Authorization", AUTH(ownerToken));
    expect(after.body.total).toBe(1);
  });

  it("the whole team surface is owner-only", async () => {
    const list = await request(app).get("/api/seller/team").set("Authorization", AUTH(managerToken));
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe("FORBIDDEN");

    const invite = await request(app)
      .post("/api/seller/team")
      .set("Authorization", AUTH(managerToken))
      .send({ phone: PHONES.plainUser, role: "staff" });
    expect(invite.status).toBe(403);
  });
});

// ── Member capability matrix ────────────────────────────────────────────────

describe("team membership access", () => {
  it("members can use the read-only dashboard surface", async () => {
    const res = await request(app)
      .get("/api/seller/dashboard")
      .set("Authorization", AUTH(staffToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("manager can read analytics; staff cannot", async () => {
    const manager = await request(app)
      .get("/api/seller/analytics")
      .set("Authorization", AUTH(managerToken));
    expect(manager.status).toBe(200);

    const staff = await request(app)
      .get("/api/seller/analytics")
      .set("Authorization", AUTH(staffToken));
    expect(staff.status).toBe(403);
    expect(staff.body.error.code).toBe("FORBIDDEN");
  });

  it("manager may mutate order status; staff is blocked before the controller", async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const staff = await request(app)
      .patch(`/api/seller/orders/${fakeId}/status`)
      .set("Authorization", AUTH(staffToken))
      .send({ status: "confirmed" });
    expect(staff.status).toBe(403);

    const manager = await request(app)
      .patch(`/api/seller/orders/${fakeId}/status`)
      .set("Authorization", AUTH(managerToken))
      .send({ status: "confirmed" });
    expect(manager.status).not.toBe(403);
  });

  it("finance + payouts are closed to members", async () => {
    const finance = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(staffToken));
    expect(finance.status).toBe(403);

    const payouts = await request(app)
      .get("/api/seller/payouts")
      .set("Authorization", AUTH(managerToken));
    expect(payouts.status).toBe(403);

    const requestPayout = await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(managerToken))
      .send({ amount: 500000 });
    expect(requestPayout.status).toBe(403);
  });
});

// ── Settings-backed payout default (HTTP) ───────────────────────────────────

describe("payout default method across the API", () => {
  it("requestPayout uses the store default method set via settings", async () => {
    await request(app)
      .patch("/api/seller/settings")
      .set("Authorization", AUTH(ownerToken))
      .send({ defaultPayoutMethod: "wallet" });
    await deliverAnOrder(ownerProfile, ownerUser._id);

    const res = await request(app)
      .post("/api/seller/payouts")
      .set("Authorization", AUTH(ownerToken))
      .send({ amount: 100000 });
    expect(res.status).toBe(200);
    expect(res.body.payout.method).toBe("wallet");
  });
});