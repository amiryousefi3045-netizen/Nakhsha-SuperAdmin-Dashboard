const mongoose = require("mongoose");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payout = require("../models/Payout");
const SettingsService = require("../services/SettingsService");
const FinanceService = require("../services/FinanceService");
const { createOrder, transitionOrder } = require("../services/OrderService");

/**
 * Settings & team domain — unit tests (business rules + persistence).
 * The seller HTTP surface is covered by settings-team.test.js.
 */

const FINANCE_TERMS = { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 };

let userIdA;

beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  userIdA = new mongoose.Types.ObjectId();
});

let profileA;
let profileB;

async function makeProfile(terms = FINANCE_TERMS) {
  const user = await makeUser({ role: "seller" });
  const profile = await SellerProfile.create({
    userId: user._id,
    storeName: `فروشگاه ${Date.now()}`,
    status: "active",
    finance: { ...FINANCE_TERMS, ...terms },
  });
  return profile;
}

async function makeUser(over = {}) {
  return User.create({
    name: "کاربر تستی",
    phone: `09${String(Math.floor(100000000 + Math.random() * 899999999))}`,
    handle: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    ...over,
  });
}

async function makeProduct(profile) {
  return Product.create({
    sellerId: profile._id,
    sellerUserId: userIdA,
    title: "ظرف سفالی",
    price: 200000,
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
}

async function deliverOrder(profile, price = 1000000) {
  const product = await makeProduct(profile);
  await Product.updateOne({ _id: product._id }, { $set: { price } });
  const order = await createOrder({
    sellerId: profile._id,
    sellerUserId: userIdA,
    customer: { name: "علی", phone: "09120000001" },
    items: [{ productId: String(product._id), qty: 1 }],
  });
  for (const step of ["confirmed", "processing", "shipped", "delivered"]) {
    await transitionOrder({
      orderId: String(order._id),
      sellerId: profile._id,
      nextStatus: step,
      sellerUserId: userIdA,
    });
  }
  return order;
}

beforeEach(async () => {
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await TeamMember.deleteMany({});
  await User.deleteMany({ handle: /^user_/ });
  await SellerProfile.deleteMany({});
  profileA = await makeProfile();
  profileB = await makeProfile();
});

afterAll(async () => {
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await TeamMember.deleteMany({});
  await User.deleteMany({ handle: /^user_/ });
  await SellerProfile.deleteMany({});
  await mongoose.connection.collection("atomiccounters").deleteMany({});
  await mongoose.connection.close();
});

// ── Settings ────────────────────────────────────────────────────────────────

describe("SettingsService.settings", () => {
  it("returns defaults for a profile without explicit settings", async () => {
    const settings = await SettingsService.getSettings(profileA._id);
    expect(settings).toEqual({
      storefrontPublished: false,
      notificationEmail: true,
      notificationSms: false,
      defaultPayoutMethod: "bank_transfer",
    });
  });

  it("persists a partial update and keeps the rest of the defaults", async () => {
    const updated = await SettingsService.updateSettings(profileA._id, {
      defaultPayoutMethod: "card",
      notificationSms: true,
    });
    expect(updated.defaultPayoutMethod).toBe("card");
    expect(updated.notificationSms).toBe(true);
    expect(updated.notificationEmail).toBe(true);
    expect(updated.storefrontPublished).toBe(false);

    const reread = await SettingsService.getSettings(profileA._id);
    expect(reread.defaultPayoutMethod).toBe("card");
    expect(reread.notificationSms).toBe(true);
  });

  it("accepts boolean/zero values as explicit overrides", async () => {
    const updated = await SettingsService.updateSettings(profileA._id, {
      notificationEmail: false,
      storefrontPublished: true,
    });
    expect(updated.notificationEmail).toBe(false);
    expect(updated.storefrontPublished).toBe(true);
  });

  it("rejects an unknown defaultPayoutMethod", async () => {
    await expect(
      SettingsService.updateSettings(profileA._id, { defaultPayoutMethod: "neft" }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", details: { field: "defaultPayoutMethod" } }),
    );
  });

  it("rejects an empty update body", async () => {
    await expect(
      SettingsService.updateSettings(profileA._id, {}),
    ).rejects.toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });
});

// ── Team roster ─────────────────────────────────────────────────────────────

describe("SettingsService.team", () => {
  it("listTeam returns an empty roster plus owner info", async () => {
    const team = await SettingsService.listTeam(profileA._id);
    expect(team.items).toEqual([]);
    expect(team.total).toBe(0);
    expect(team.owner).toEqual(
      expect.objectContaining({ userId: String(profileA.userId) }),
    );
  });

  it("invites a plain user, escales role to seller, and lists them", async () => {
    const user = await makeUser();
    const result = await SettingsService.inviteTeam({
      sellerId: profileA._id,
      ownerUserId: profileA.userId,
      phone: user.phone,
      role: "manager",
      note: "مدیر فروش",
    });

    expect(result.roleChanged).toBe(true);
    expect(result.member.role).toBe("manager");
    expect(result.member.name).toBe(user.name);

    const escalated = await User.findById(user._id).lean();
    expect(escalated.role).toBe("seller");

    const team = await SettingsService.listTeam(profileA._id);
    expect(team.total).toBe(1);
    expect(team.items[0]).toEqual(
      expect.objectContaining({ userId: String(user._id), role: "manager", note: "مدیر فروش" }),
    );
    expect(team.owner.userId).toBe(String(profileA.userId));
  });

  it("keeps an existing seller role as-is (roleChanged false)", async () => {
    const user = await makeUser({ role: "seller" });
    const result = await SettingsService.inviteTeam({
      sellerId: profileA._id,
      ownerUserId: profileA.userId,
      phone: user.phone,
      role: "staff",
    });
    expect(result.roleChanged).toBe(false);
    expect(result.member.role).toBe("staff");
  });

  it("defaults an unknown role to staff", async () => {
    const user = await makeUser();
    const result = await SettingsService.inviteTeam({
      sellerId: profileA._id,
      ownerUserId: profileA.userId,
      phone: user.phone,
      role: "superuser",
    });
    expect(result.member.role).toBe("staff");
  });

  it("rejects an invalid phone number", async () => {
    await expect(
      SettingsService.inviteTeam({
        sellerId: profileA._id,
        ownerUserId: profileA.userId,
        phone: "123",
        role: "staff",
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", details: { field: "phone" } }),
    );
  });

  it("rejects a phone with no platform user", async () => {
    await expect(
      SettingsService.inviteTeam({
        sellerId: profileA._id,
        ownerUserId: profileA.userId,
        phone: "09129999999",
        role: "staff",
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "TEAM_MEMBER_USER_NOT_FOUND" }),
    );
  });

  it("rejects inviting the store owner themselves", async () => {
    const owner = await makeUser({ role: "seller" });
    const ownerProfile = await SellerProfile.create({
      userId: owner._id,
      storeName: "فروشگاه مالک",
      status: "active",
      finance: FINANCE_TERMS,
    });
    await expect(
      SettingsService.inviteTeam({
        sellerId: ownerProfile._id,
        ownerUserId: owner._id,
        phone: owner.phone,
        role: "staff",
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "TEAM_MEMBER_SELF_INVITE" }));
  });

  it("rejects inviting a platform admin", async () => {
    const admin = await makeUser({ role: "admin" });
    await expect(
      SettingsService.inviteTeam({
        sellerId: profileA._id,
        ownerUserId: profileA.userId,
        phone: admin.phone,
        role: "staff",
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "TEAM_MEMBER_INVALID_USER" }));
  });

  it("rejects inviting a user who owns their own store", async () => {
    const other = await makeUser({ role: "seller" });
    await SellerProfile.create({
      userId: other._id,
      storeName: "فروشگاه مستقل",
      status: "active",
      finance: FINANCE_TERMS,
    });
    await expect(
      SettingsService.inviteTeam({
        sellerId: profileA._id,
        ownerUserId: profileA.userId,
        phone: other.phone,
        role: "staff",
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "TEAM_MEMBER_IS_OWNER" }));
  });

  it("rejects a duplicate invite of the same user", async () => {
    const user = await makeUser();
    await SettingsService.inviteTeam({
      sellerId: profileA._id,
      ownerUserId: profileA.userId,
      phone: user.phone,
      role: "staff",
    });
    await expect(
      SettingsService.inviteTeam({
        sellerId: profileA._id,
        ownerUserId: profileA.userId,
        phone: user.phone,
        role: "staff",
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "TEAM_MEMBER_ALREADY_EXISTS" }));
  });

  it("changeTeamRole updates the role and reports the previous one", async () => {
    const user = await makeUser();
    await SettingsService.inviteTeam({
      sellerId: profileA._id,
      ownerUserId: profileA.userId,
      phone: user.phone,
      role: "staff",
    });
    const roster = await SettingsService.listTeam(profileA._id);
    const memberId = roster.items[0].id;

    const result = await SettingsService.changeTeamRole({
      sellerId: profileA._id,
      memberId,
      role: "manager",
    });
    expect(result.from).toBe("staff");
    expect(result.member.role).toBe("manager");
  });

  it("changeTeamRole rejects an invalid role", async () => {
    const user = await makeUser();
    await SettingsService.inviteTeam({
      sellerId: profileA._id,
      ownerUserId: profileA.userId,
      phone: user.phone,
      role: "staff",
    });
    const roster = await SettingsService.listTeam(profileA._id);
    await expect(
      SettingsService.changeTeamRole({
        sellerId: profileA._id,
        memberId: roster.items[0].id,
        role: "boss",
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", details: { field: "role" } }),
    );
  });

  it("changeTeamRole cannot touch another store's member", async () => {
    const user = await makeUser();
    await SettingsService.inviteTeam({
      sellerId: profileA._id,
      ownerUserId: profileA.userId,
      phone: user.phone,
      role: "staff",
    });
    const roster = await SettingsService.listTeam(profileA._id);
    await expect(
      SettingsService.changeTeamRole({
        sellerId: profileB._id,
        memberId: roster.items[0].id,
        role: "manager",
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "TEAM_MEMBER_NOT_FOUND" }));
  });

  it("removeTeamMember deletes the roster entry and returns its identity", async () => {
    const user = await makeUser();
    await SettingsService.inviteTeam({
      sellerId: profileA._id,
      ownerUserId: profileA.userId,
      phone: user.phone,
      role: "staff",
    });
    const roster = await SettingsService.listTeam(profileA._id);
    const memberId = roster.items[0].id;

    const removed = await SettingsService.removeTeamMember({
      sellerId: profileA._id,
      memberId,
    });
    expect(removed.id).toBe(memberId);
    expect(removed.userId).toBe(String(user._id));

    const after = await SettingsService.listTeam(profileA._id);
    expect(after.total).toBe(0);
  });

  it("removeTeamMember on a cross-store id reports not found", async () => {
    const user = await makeUser();
    await SettingsService.inviteTeam({
      sellerId: profileA._id,
      ownerUserId: profileA.userId,
      phone: user.phone,
      role: "staff",
    });
    const roster = await SettingsService.listTeam(profileA._id);
    await expect(
      SettingsService.removeTeamMember({
        sellerId: profileB._id,
        memberId: roster.items[0].id,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "TEAM_MEMBER_NOT_FOUND" }));
  });
});

// ── Default payout method wiring ────────────────────────────────────────────

describe("requestPayout default method from store settings", () => {
  it("uses the store default method when the request omits one", async () => {
    await SettingsService.updateSettings(profileA._id, {
      defaultPayoutMethod: "card",
    });
    await deliverOrder(profileA, 1000000);

    const payout = await FinanceService.requestPayout({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      amount: 100000,
    });
    expect(payout.method).toBe("card");
  });

  it("an explicit method on the request wins over the store default", async () => {
    await SettingsService.updateSettings(profileA._id, {
      defaultPayoutMethod: "card",
    });
    await deliverOrder(profileA, 1000000);

    const payout = await FinanceService.requestPayout({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      amount: 100000,
      method: "wallet",
    });
    expect(payout.method).toBe("wallet");
  });
});