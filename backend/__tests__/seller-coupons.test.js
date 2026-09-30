const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Coupon = require("../models/Coupon");
const CouponRedemption = require("../models/CouponRedemption");
const AuditLog = require("../models/AuditLog");
const OrderService = require("../services/OrderService");
const CouponService = require("../services/CouponService");
const sellerEventHub = require("../services/SellerEventHub");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 35 — coupons, discounts and campaigns (P1-07).
 *
 * A coupon is the one place where the client hands the server a string and
 * expects money back, so these tests concentrate on the things that must never
 * be wrong: the discount comes from the server's own pricing, the caps hold
 * under concurrency, a code cannot be spent twice by one buyer, and cancelling
 * an order gives the use back.
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

const AUTH = (token) => `Bearer ${token}`;

const PHONES = {
  owner: "09141100061",
  manager: "09141100062",
  staff: "09141100063",
  other: "09141100064",
  buyer: "09141100065",
  buyer2: "09141100066",
};

let ownerToken;
let managerToken;
let staffToken;
let otherToken;
let buyerToken;
let buyer2Token;
let profileId;
let otherProfileId;
let sellerUserId;
let productId;
let otherProductId;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await TeamMember.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await Coupon.deleteMany({});
  await CouponRedemption.deleteMany({});
  await AuditLog.deleteMany({});
}

async function makeProduct({ sellerId, sellerUserId, sku, price = 100000, stock = null }) {
  return Product.create({
    sellerId,
    sellerUserId,
    title: `کالای ${sku}`,
    description: "",
    sku,
    price,
    currency: "IRR",
    category: "pottery",
    status: "active",
    stockPolicy: "tracked",
    stock: stock || { onHand: 900, reserved: 0, incoming: 0 },
    lowStockThreshold: 2,
  });
}

/** Create a coupon directly through the service (bypasses the HTTP surface). */
async function seedCoupon(overrides = {}) {
  return CouponService.createCoupon({
    sellerId: profileId,
    sellerUserId: sellerUserId,
    code: `CODE${Math.floor(Math.random() * 100000)}`,
    type: "percent",
    value: 10,
    ...overrides,
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  _resetRateLimitStoreForTests();

  const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;
  await wipe();

  const owner = await User.create({
    name: "فروشندهٔ کوپن",
    phone: PHONES.owner,
    handle: "coupon_owner",
    role: "seller",
    isVerified: true,
  });
  sellerUserId = owner._id;
  profileId = (await SellerProfile.create({
    userId: owner._id,
    storeName: "فروشگاه کوپن",
    slug: "coupon-shop",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  }))._id;
  ownerToken = accessTokenOf(owner);

  const manager = await User.create({
    name: "مدیر فروشگاه",
    phone: PHONES.manager,
    handle: "coupon_manager",
    role: "seller",
    isVerified: true,
  });
  await TeamMember.create({
    sellerProfileId: profileId,
    userId: manager._id,
    name: manager.name,
    phone: manager.phone,
    role: "manager",
    status: "active",
  });
  managerToken = accessTokenOf(manager);

  const staff = await User.create({
    name: "کارمند فروشگاه",
    phone: PHONES.staff,
    handle: "coupon_staff",
    role: "seller",
    isVerified: true,
  });
  await TeamMember.create({
    sellerProfileId: profileId,
    userId: staff._id,
    name: staff.name,
    phone: staff.phone,
    role: "staff",
    status: "active",
  });
  staffToken = accessTokenOf(staff);

  const other = await User.create({
    name: "فروشندهٔ دیگر",
    phone: PHONES.other,
    handle: "coupon_other",
    role: "seller",
    isVerified: true,
  });
  otherProfileId = (await SellerProfile.create({
    userId: other._id,
    storeName: "فروشگاه دیگر",
    slug: "coupon-other",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  }))._id;
  otherToken = accessTokenOf(other);

  productId = (await makeProduct({ sellerId: profileId, sellerUserId, sku: "CPN-1" }))._id;
  otherProductId = (await makeProduct({
    sellerId: otherProfileId,
    sellerUserId: other._id,
    sku: "CPN-OTHER",
  }))._id;

  buyerToken = accessTokenOf(
    await User.create({
      name: "خریدار یک",
      phone: PHONES.buyer,
      handle: "coupon_buyer",
      isVerified: true,
    }),
  );
  buyer2Token = accessTokenOf(
    await User.create({
      name: "خریدار دو",
      phone: PHONES.buyer2,
      handle: "coupon_buyer2",
      isVerified: true,
    }),
  );
});

describe("coupons: the arithmetic (P1-07)", () => {
  it("takes a percentage and rounds it once", () => {
    expect(CouponService.computeDiscount({ type: "percent", value: 10 }, 100000)).toBe(10000);
    // 15% of 999 is 149.85 -> 150. Rounding per line item would drift.
    expect(CouponService.computeDiscount({ type: "percent", value: 15 }, 999)).toBe(150);
  });

  it("honours the ceiling on a percentage coupon", () => {
    expect(
      CouponService.computeDiscount({ type: "percent", value: 50, maxDiscount: 20000 }, 100000),
    ).toBe(20000);
  });

  it("never discounts more than the goods value", () => {
    // A fixed coupon larger than the cart must not also swallow the shipping.
    expect(CouponService.computeDiscount({ type: "fixed", value: 500000 }, 100000)).toBe(100000);
  });

  it("returns zero for an empty cart instead of a negative discount", () => {
    expect(CouponService.computeDiscount({ type: "percent", value: 10 }, 0)).toBe(0);
  });

  it("normalises typed codes so case and stray spaces do not matter", () => {
    expect(CouponService.normaliseCode("  summer 1404 ")).toBe("SUMMER1404");
    // Too short to be a real code, and wildcard-ish input never reaches the DB.
    expect(CouponService.normaliseCode("ab")).toBe("");
    expect(CouponService.normaliseCode("SUMMER%")).toBe("");
    expect(CouponService.normaliseCode(null)).toBe("");
  });
});

describe("coupons: seller surface (P1-07)", () => {
  it("lets a manager mint a coupon and refuses a staff member", async () => {
    const res = await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(staffToken))
      .send({ code: "STAFFTRY", type: "percent", value: 5 })
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    // The refused attempt must not have created anything.
    expect(await Coupon.findOne({ code: "STAFFTRY" })).toBeNull();

    const ok = await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(managerToken))
      .send({ code: "WELCOME10", type: "percent", value: 10 })
      .expect(201);
    expect(ok.body.coupon.code).toBe("WELCOME10");
    expect(ok.body.coupon.usedCount).toBe(0);
  });

  it("rejects a malformed coupon instead of storing it", async () => {
    const attempts = [
      { code: "AB", type: "percent", value: 10 },
      { code: "PERCENT200", type: "percent", value: 200 },
      { code: "ZERO", type: "percent", value: 0 },
      // No `type` at all: `parseCouponInput` has nothing to check, so this is
      // caught by the schema. A seller's typo must still be a 400, never a 500.
      { code: "NOTYPE1", value: 10 },
      { code: "BADTYPE1", type: "free-money", value: 10 },
    ];
    for (const payload of attempts) {
      const res = await request(app)
        .post("/api/seller/coupons")
        .set("Authorization", AUTH(ownerToken))
        .send(payload)
        .expect(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBeTruthy();
    }
    // Nothing half-created survived the refusals.
    for (const { code } of attempts) {
      expect(await Coupon.countDocuments({ code })).toBe(0);
    }
  });

  it("rejects a duplicate code for the same store but allows it elsewhere", async () => {
    await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(ownerToken))
      .send({ code: "DUPE123", type: "fixed", value: 5000 })
      .expect(201);

    await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(ownerToken))
      .send({ code: "DUPE123", type: "fixed", value: 9000 })
      .expect(400);

    // The same string in another store is a different campaign, not a clash.
    await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(otherToken))
      .send({ code: "DUPE123", type: "fixed", value: 9000 })
      .expect(201);
  });

  it("hides another store's coupon behind 400 and never leaks it", async () => {
    const mine = await seedCoupon({ code: "PRIVATE1" });

    await request(app)
      .get(`/api/seller/coupons/${mine._id}`)
      .set("Authorization", AUTH(otherToken))
      .expect(400);
  });

  it("pauses a coupon instead of deleting it, so history survives", async () => {
    const coupon = await seedCoupon({ code: "PAUSE001" });
    const res = await request(app)
      .patch(`/api/seller/coupons/${coupon._id}/status`)
      .set("Authorization", AUTH(ownerToken))
      .send({ status: "paused" })
      .expect(200);
    expect(res.body.coupon.status).toBe("paused");
    // Still present: the redemption rows still point at it.
    expect(await Coupon.findById(coupon._id)).not.toBeNull();
  });

  it("actually writes an audit trail for every seller change", async () => {
    // Regression guard. AuditService.log swallows its own failures so that a
    // broken audit can never break a seller's request — which also means a
    // missing resource type would silently drop the trail while every HTTP test
    // stayed green. These assertions are what make that impossible to miss.
    const created = await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(ownerToken))
      .send({ code: "AUDIT001", type: "percent", value: 15 })
      .expect(201);

    await request(app)
      .patch(`/api/seller/coupons/${created.body.coupon.id}`)
      .set("Authorization", AUTH(ownerToken))
      .send({ value: 20 })
      .expect(200);
    await request(app)
      .patch(`/api/seller/coupons/${created.body.coupon.id}/status`)
      .set("Authorization", AUTH(ownerToken))
      .send({ status: "paused" })
      .expect(200);

    const rows = await AuditLog.find({ action: /^COUPON_/ }).lean();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.resource.type).toBe("COUPON");
      expect(row.resource.id).toBeTruthy();
    }
  });

  it("audits the redemption so seller reporting has a trail", async () => {
    const coupon = await seedCoupon({ code: "REDEMAUD", type: "percent", value: 10 });
    const res = await checkout({ token: buyerToken, code: "REDEMAUD" }).expect(200);
    const orderId = res.body.order.id;

    const row = await AuditLog.findOne({
      action: "COUPON_REDEEMED",
      "metadata.orderId": orderId,
    });
    expect(row).not.toBeNull();
    expect(row.resource.type).toBe("COUPON");
    expect(String(row.resource.id)).toBe(String(coupon._id));
    expect(row.metadata.code).toBe("REDEMAUD");
    expect(row.metadata.discount).toBe(10000);
  });
});

describe("coupons: the buyer's path (P1-07)", () => {
  it("previews a valid code and prices the cart server-side", async () => {
    await seedCoupon({ code: "PREVIEW10", type: "percent", value: 10 });
    const res = await request(app)
      .post("/api/storefront/coupon-shop/coupons/validate")
      .set("Authorization", AUTH(buyerToken))
      .send({ code: "PREVIEW10", items: [{ productId: String(productId), qty: 1 }] })
      .expect(200);

    expect(res.body.discount).toBe(10000);
    expect(res.body.subtotal).toBe(100000);
    expect(res.body.total).toBe(90000);
  });

  it("ignores a client that tries to lie about the subtotal", async () => {
    await seedCoupon({ code: "LYING", type: "fixed", value: 50000, minPurchase: 90000 });

    // Direction 1 — a fake LOW subtotal buys nothing. The server re-prices the
    // cart from live products (100,000), so the code is still accepted on its
    // real merits, and the returned subtotal is the server's, not the client's.
    const honest = await request(app)
      .post("/api/storefront/coupon-shop/coupons/validate")
      .set("Authorization", AUTH(buyerToken))
      .send({ code: "LYING", subtotal: 1, items: [{ productId: String(productId), qty: 1 }] })
      .expect(200);
    expect(honest.body.subtotal).toBe(100000);
    expect(honest.body.discount).toBe(50000);

    // Direction 2 — a fake HIGH subtotal unlocks nothing either.
    await seedCoupon({ code: "LYHIGH", type: "fixed", value: 5000, minPurchase: 200000 });
    const res = await request(app)
      .post("/api/storefront/coupon-shop/coupons/validate")
      .set("Authorization", AUTH(buyerToken))
      .send({ code: "LYHIGH", subtotal: 999999999, items: [{ productId: String(productId), qty: 1 }] })
      .expect(400);
    expect(res.body.error.code).toBe("COUPON_MIN_PURCHASE");
  });

  it("refuses another store's code in this store", async () => {
    await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(otherToken))
      .send({ code: "OTHERONLY", type: "percent", value: 50 })
      .expect(201);

    // Positive control: the same code IS honoured in the store that owns it,
    // so the refusal below is about store scoping and nothing else.
    const home = await request(app)
      .post("/api/storefront/coupon-other/coupons/validate")
      .set("Authorization", AUTH(buyerToken))
      .send({ code: "OTHERONLY", items: [{ productId: String(otherProductId), qty: 1 }] })
      .expect(200);
    expect(home.body.discount).toBeGreaterThan(0);

    // A valid code, valid for the wrong store: must not be honoured here.
    const res = await request(app)
      .post("/api/storefront/coupon-shop/coupons/validate")
      .set("Authorization", AUTH(buyerToken))
      .send({ code: "OTHERONLY", items: [{ productId: String(productId), qty: 1 }] })
      .expect(400);
    expect(res.body.error.code).toBe("COUPON_NOT_FOUND");
  });

  it("refuses a paused, expired or not-yet-started code", async () => {
    await seedCoupon({ code: "PAUSED01", type: "percent", value: 10, status: "paused" });
    await seedCoupon({
      code: "EXPIRED1",
      type: "percent",
      value: 10,
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    await seedCoupon({
      code: "FUTURE01",
      type: "percent",
      value: 10,
      startsAt: new Date(Date.now() + 86_400_000),
    });

    for (const [code, expected] of [
      ["PAUSED01", "COUPON_INACTIVE"],
      ["EXPIRED1", "COUPON_EXPIRED"],
      ["FUTURE01", "COUPON_NOT_STARTED"],
    ]) {
      const res = await request(app)
        .post("/api/storefront/coupon-shop/coupons/validate")
        .set("Authorization", AUTH(buyerToken))
        .send({ code, items: [{ productId: String(productId), qty: 1 }] })
        .expect(400);
      expect(res.body.error.code).toBe(expected);
    }
  });

  it("enforces the minimum spend", async () => {
    await seedCoupon({ code: "MINBUY50", type: "percent", value: 10, minPurchase: 500000 });
    const res = await request(app)
      .post("/api/storefront/coupon-shop/coupons/validate")
      .set("Authorization", AUTH(buyerToken))
      .send({ code: "MINBUY50", items: [{ productId: String(productId), qty: 1 }] })
      .expect(400);
    expect(res.body.error.code).toBe("COUPON_MIN_PURCHASE");
  });
});

/**
 * Place a real storefront order, optionally with a code.
 *
 * Returns the raw supertest request, not a promise, so each call site can
 * chain its own `.expect(...)`.
 */
function checkout({ token = null, code = null, qty = 1, slug = "coupon-shop" } = {}) {
  return request(app)
    .post(`/api/storefront/${slug}/checkout`)
    .set("Authorization", AUTH(token || buyerToken))
    .send({
      customer: { name: "خریدار تست", phone: "09121110000" , address: "تهران، خیابان آزادی، پلاک ۱۲" },
      items: [{ productId: String(productId), qty }],
      paymentMethod: "card",
      couponCode: code || "",
    });
}

describe("coupons: redemption at checkout (P1-07)", () => {
  it("applies the discount to the order total", async () => {
    const coupon = await seedCoupon({ code: "APPLY20", type: "percent", value: 20 });
    const res = await checkout({ code: "APPLY20" }).expect(200);

    const order = res.body.order;
    expect(order.subtotal).toBe(100000);
    expect(order.discount).toBe(20000);
    expect(order.total).toBe(80000);
    // The provenance snapshot travels with the order.
    expect(order.coupon.code).toBe("APPLY20");
    expect(order.coupon.discount).toBe(20000);

    // And the counter moved, with a matching ledger row.
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);
    expect(await CouponRedemption.countDocuments({ orderId: order.id })).toBe(1);
  });

  it("charges the discounted total, not the subtotal", async () => {
    await seedCoupon({ code: "PAYONLY", type: "fixed", value: 30000 });
    const res = await checkout({ code: "PAYONLY" }).expect(200);
    const order = res.body.order;
    expect(order.discount).toBe(30000);
    expect(order.total).toBe(70000);
    // The payment intent is built from the order total, so the gateway agrees.
    expect(res.body.paymentIntent.amount).toBe(70000);
  });

  it("leaves no stock held when the coupon is refused", async () => {
    await seedCoupon({ code: "GONE01", type: "percent", value: 10, maxUses: 1 });
    await checkout({ token: buyerToken, code: "GONE01" }).expect(200);
    const before = await Product.findById(productId).lean();

    // A refused coupon must fail BEFORE stock is reserved, so the second
    // buyer's rejection cannot hold inventory hostage.
    const res = await checkout({ token: buyer2Token, code: "GONE01" }).expect(400);
    expect(res.body.error.code).toBe("COUPON_EXHAUSTED");

    const after = await Product.findById(productId).lean();
    expect(after.stock.reserved).toBe(before.stock.reserved);
    expect(after.stock.onHand).toBe(before.stock.onHand);
  });

  it("leaves no stock held and gives the use back when a later item cannot be reserved", async () => {
    const second = await makeProduct({
      sellerId: profileId,
      sellerUserId,
      sku: "CPN-2",
      stock: { onHand: 0, reserved: 0 },
    });

    const coupon = await seedCoupon({
      code: "ROLLBACK",
      type: "percent",
      value: 10,
      maxUses: 0,
      maxUsesPerBuyer: 1,
    });
    const before = await Product.findById(productId).lean();

    // Item one is plentiful, item two is not. The whole order must abort, and
    // the reservation already taken for item one must be handed back.
    const res = await request(app)
      .post("/api/storefront/coupon-shop/checkout")
      .set("Authorization", AUTH(buyerToken))
      .send({
        customer: { name: "خریدار تست", phone: "09121110000" , address: "تهران، خیابان آزادی، پلاک ۱۲" },
        items: [
          { productId: String(productId), qty: 1 },
          { productId: String(second._id), qty: 1 },
        ],
        paymentMethod: "card",
        couponCode: "ROLLBACK",
      })
      .expect(400);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");

    const after = await Product.findById(productId).lean();
    expect(after.stock.reserved).toBe(before.stock.reserved);
    expect(after.stock.onHand).toBe(before.stock.onHand);

    // The coupon use is back too, so this buyer can still spend their allowance.
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0);
    expect(await CouponRedemption.countDocuments({ couponId: coupon._id })).toBe(0);

    await checkout({ token: buyerToken, code: "ROLLBACK" }).expect(200);
  });

  it("stops a second buyer from over-using a single-use coupon", async () => {
    await seedCoupon({ code: "ONEUSE01", type: "percent", value: 10, maxUses: 1 });

    await checkout({ token: buyerToken, code: "ONEUSE01" }).expect(200);
    // Second buyer, same code: the quota is gone.
    const res = await checkout({ token: buyer2Token, code: "ONEUSE01" }).expect(400);
    expect(res.body.error.code).toBe("COUPON_EXHAUSTED");
  });

  it("stops one buyer from spending a one-per-buyer code twice", async () => {
    const coupon = await seedCoupon({
      code: "ONEPERBUY",
      type: "percent",
      value: 10,
      maxUses: 0, // plenty of stock for everyone...
      maxUsesPerBuyer: 1, // ...but this buyer only gets one
    });

    await checkout({ token: buyerToken, code: "ONEPERBUY" }).expect(200);
    const res = await checkout({ token: buyerToken, code: "ONEPERBUY" }).expect(400);
    expect(res.body.error.code).toBe("COUPON_USER_LIMIT");

    // The failed attempt did not inflate the store-wide counter.
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);
  });

  it("survives two simultaneous checkouts racing for the last use", async () => {
    await seedCoupon({ code: "LASTONE1", type: "percent", value: 10, maxUses: 1 });

    const [a, b] = await Promise.all([
      checkout({ token: buyerToken, code: "LASTONE1" }),
      checkout({ token: buyer2Token, code: "LASTONE1" }),
    ]);

    const ok = [a, b].filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    // The ledger cannot show more redemptions than the cap allows.
    expect(await CouponRedemption.countDocuments({ code: "LASTONE1" })).toBe(1);
  });

  it("gives the use back when the order is cancelled", async () => {
    const coupon = await seedCoupon({ code: "CANCELME", type: "percent", value: 10 });
    const res = await checkout({ code: "CANCELME" }).expect(200);
    const orderId = res.body.order.id;
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);

    await OrderService.transitionOrder({
      orderId,
      sellerId: profileId,
      nextStatus: "cancelled",
    });

    // A dead checkout must not permanently burn a limited campaign.
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0);
    expect(await CouponRedemption.countDocuments({ orderId })).toBe(0);
  });

  it("checks out normally when no code is supplied", async () => {
    const res = await checkout({}).expect(200);
    const order = res.body.order;
    expect(order.discount).toBe(0);
    expect(order.total).toBe(100000);
    expect(order.coupon).toBeNull();
  });
});

describe("coupons: seller reporting (P1-07)", () => {
  it("reports what the campaign actually cost", async () => {
    const coupon = await seedCoupon({ code: "REPORT01", type: "percent", value: 10 });
    await request(app)
      .post("/api/storefront/coupon-shop/checkout")
      .set("Authorization", AUTH(buyer2Token))
      .send({
        customer: { name: "خریدار گزارش", phone: "09121110000" , address: "تهران، خیابان آزادی، پلاک ۱۲" },
        items: [{ productId: String(productId), qty: 2 }],
        paymentMethod: "card",
        couponCode: "REPORT01",
      })
      .expect(200);

    const res = await request(app)
      .get("/api/seller/coupons")
      .set("Authorization", AUTH(ownerToken))
      .expect(200);

    const row = res.body.items.find((c) => c.code === "REPORT01");
    expect(row).toBeDefined();
    expect(row.usage.redemptions).toBe(1);
    // 10% off 200,000 = 20,000 given away.
    expect(row.usage.discountGiven).toBe(20000);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);
  });

  it("exports redemption rows as CSV for the same window", async () => {
    const res = await request(app)
      .get("/api/seller/coupons/usage/export")
      .set("Authorization", AUTH(ownerToken))
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("code");
    expect(res.text).toContain("REPORT01");
  });
});

describe("coupons: the seller's live dashboard (P1-05 parity)", () => {
  let publish;

  beforeEach(() => {
    publish = jest.spyOn(sellerEventHub, "publish").mockReturnValue(true);
  });

  afterEach(() => {
    publish.mockRestore();
  });

  /** The published payload for a given event name, or undefined. */
  const payloadFor = (event) =>
    publish.mock.calls.find(([, kind, payload]) => kind === "coupon" && payload.event === event);

  it("announces a new campaign to the store's own stream", async () => {
    const res = await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(ownerToken))
      .send({ code: "LIVE001", type: "percent", value: 10 })
      .expect(201);

    const call = payloadFor("created");
    expect(call).toBeDefined();
    // Scoped to THIS store: another store's dashboard must never see it.
    expect(String(call[0])).toBe(String(profileId));
    expect(call[2].code).toBe("LIVE001");
    expect(call[2].id).toBe(res.body.coupon.id);
    expect(call[2].status).toBe("active");
  });

  it("announces an edited campaign", async () => {
    const coupon = await seedCoupon({ code: "LIVE002", type: "percent", value: 10 });

    await request(app)
      .patch(`/api/seller/coupons/${coupon._id}`)
      .set("Authorization", AUTH(ownerToken))
      .send({ value: 25 })
      .expect(200);

    expect(payloadFor("updated")).toBeDefined();
  });

  it("announces a pause", async () => {
    const coupon = await seedCoupon({ code: "LIVE003", type: "percent", value: 10 });

    await request(app)
      .patch(`/api/seller/coupons/${coupon._id}/status`)
      .set("Authorization", AUTH(ownerToken))
      .send({ status: "paused" })
      .expect(200);

    const call = payloadFor("status_changed");
    expect(call).toBeDefined();
    expect(call[2].status).toBe("paused");
  });

  it("says nothing when the write was refused", async () => {
    await seedCoupon({ code: "LIVE004", type: "percent", value: 10 });

    await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(ownerToken))
      .send({ code: "LIVE004", type: "percent", value: 10 })
      .expect(400);

    // A refused write must not tell a dashboard that something changed.
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not tell another store about a campaign it is not allowed to see", async () => {
    const coupon = await seedCoupon({ code: "LIVE005", type: "percent", value: 10 });

    await request(app)
      .patch(`/api/seller/coupons/${coupon._id}`)
      .set("Authorization", AUTH(otherToken))
      .send({ value: 50 })
      // 400, not 404: a "missing" campaign and someone else's campaign are the
      // same answer on purpose, so this endpoint cannot be used to probe which
      // codes exist in another store.
      .expect(400);

    expect(publish).not.toHaveBeenCalled();
  });

  it("still succeeds when nobody is listening or the stream misbehaves", async () => {
    // A live push is a courtesy. If the hub throws, the seller's write is
    // already committed and must not be reported as a failure.
    publish.mockImplementation(() => {
      throw new Error("stream exploded");
    });

    const res = await request(app)
      .post("/api/seller/coupons")
      .set("Authorization", AUTH(ownerToken))
      .send({ code: "LIVE006", type: "percent", value: 10 })
      .expect(201);

    expect(res.body.coupon.code).toBe("LIVE006");
    // The coupon really was created, not rolled back by the failed push.
    expect(await Coupon.exists({ code: "LIVE006" })).toBeTruthy();
  });
});

afterAll(async () => {
  await mongoose.connection.close();
});
