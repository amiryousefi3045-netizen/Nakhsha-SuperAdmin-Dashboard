const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const NotificationService = require("../services/NotificationService");
const { createOrder, transitionOrder } = require("../services/OrderService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 18 — buyer order-status notifications.
 *
 * Storefront transitions record a PENDING sms notification (atomically with
 * the status write); NotificationService drains the pending records
 * fire-and-forget and records delivery state. Seller-dashboard orders are
 * never announced. Delivery never throws out of the service.
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
  owner: "09149000001",
  buyer: "09149000002",
};

const FINANCE_TERMS = { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 };
const STORE_SETTINGS = {
  storefrontPublished: true,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "bank_transfer",
};

let ownerToken;
let buyerToken;
let productId;

async function wipeNdata() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({ action: "ORDER_STATUS_CHANGED" });
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
  await wipeNdata();

  const owner = await User.create({
    name: "مالک اعلان",
    phone: PHONES.owner,
    handle: "notif_owner",
    role: "seller",
    isVerified: true,
  });
  ownerToken = TOKEN_OF(owner);

  const store = await SellerProfile.create({
    userId: owner._id,
    storeName: "فروشگاه اعلان نخشا",
    slug: "notif-store",
    description: "فروشگاه تست اعلان وضعیت",
    status: "active",
    verification: { status: "verified" },
    settings: { ...STORE_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  const product = await Product.create({
    sellerId: store._id,
    sellerUserId: owner._id,
    title: "ظرف سفالی اعلان",
    price: 300000,
    category: "pottery",
    stock: { onHand: 20, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  productId = String(product._id);

  const buyer = await User.create({
    name: "خریدار اعلان",
    phone: PHONES.buyer,
    handle: "notif_buyer",
    role: "user",
    isVerified: true,
  });
  buyerToken = TOKEN_OF(buyer);
});

afterAll(async () => {
  await wipeNdata();
  await mongoose.connection.close();
});

const CHECKOUT_BODY = {
  customer: { name: "مشتری اعلان", phone: "09123456789" },
  items: [],
  paymentMethod: "card",
};

async function checkout() {
  const res = await request(app)
    .post("/api/storefront/notif-store/checkout")
    .set("Authorization", AUTH(buyerToken))
    .send({ ...CHECKOUT_BODY, items: [{ productId, qty: 1 }] });
  expect(res.status).toBe(200);
  return res.body.order;
}

async function sellerTransition(orderId, status, reason = "") {
  const res = await request(app)
    .patch(`/api/seller/orders/${orderId}/status`)
    .set("Authorization", AUTH(ownerToken))
    .send({ status, reason });
  expect(res.status).toBe(200);
  return res.body.order;
}

describe("NotificationService unit helpers", () => {
  const base = {
    origin: "storefront",
    buyerUserId: new mongoose.Types.ObjectId(),
    orderNumber: 101,
    customer: { phone: "09120000000" },
  };

  it("builds a Persian message with the order number and optional reason", () => {
    const confirmed = NotificationService.buildOrderStatusMessage(base, "confirmed");
    expect(confirmed).toContain("تأیید شد");
    expect(confirmed).toContain("101");

    const cancelled = NotificationService.buildOrderStatusMessage(
      base,
      "cancelled",
      "عدم موجودی",
    );
    expect(cancelled).toContain("لغو شد");
    expect(cancelled).toContain("عدم موجودی");
  });

  it("refuses to announce a pending order", () => {
    expect(NotificationService.buildOrderStatusMessage(base, "pending")).toBe("");
  });

  it("hasNotificationTarget requires storefront origin, a buyer and a phone", () => {
    expect(NotificationService.hasNotificationTarget(base)).toBe(true);
    expect(
      NotificationService.hasNotificationTarget({ ...base, origin: "seller" }),
    ).toBe(false);
    expect(
      NotificationService.hasNotificationTarget({ ...base, buyerUserId: null }),
    ).toBe(false);
    expect(
      NotificationService.hasNotificationTarget({
        ...base,
        customer: { phone: "" },
      }),
    ).toBe(false);
  });
});

describe("buyer notifications via seller transition (HTTP)", () => {
  it("never enqueues for a fresh storefront order (pending)", async () => {
    const order = await checkout();
    const receipt = await request(app)
      .get(`/api/storefront/orders/${order.id}`)
      .set("Authorization", AUTH(buyerToken));
    expect(receipt.status).toBe(200);
    expect(receipt.body.order.notifications).toHaveLength(0);
  });

  it("records + delivers an sms notification when the seller confirms", async () => {
    const order = await checkout();

    await sellerTransition(order.id, "confirmed");

    const stored = await Order.findById(order.id);
    expect(stored.notifications).toHaveLength(1);
    const record = stored.notifications[0];
    expect(record.channel).toBe("sms");
    expect(record.status).toBe("confirmed");
    expect(record.to).toBe(stored.customer.phone);

    await NotificationService.deliverOrderNotifications(order.id);
    const delivered = await Order.findById(order.id);
    expect(delivered.notifications[0].delivered).toBe(true);
    expect(delivered.notifications[0].error).toBe("");
    expect(delivered.notifications[0].message).toContain("تأیید شد");
    expect(delivered.notifications[0].message).toContain(
      String(stored.orderNumber),
    );
  });

  it("delivers a cancellation notice with the reason (payment failure path)", async () => {
    const order = await checkout();

    const res = await request(app)
      .post(`/api/storefront/payments/${order.id}/callback`)
      .send({ result: "FAIL", reason: "کاربر انصراف داد" });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("cancelled");

    await NotificationService.deliverOrderNotifications(order.id);
    const stored = await Order.findById(order.id);
    expect(stored.notifications).toHaveLength(1);
    expect(stored.notifications[0].status).toBe("cancelled");
    expect(stored.notifications[0].delivered).toBe(true);
    expect(stored.notifications[0].message).toContain("لغو شد");
    expect(stored.notifications[0].message).toContain("کاربر انصراف داد");
  });

  it("keeps delivery idempotent (exactly one record, still delivered)", async () => {
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");
    await sellerTransition(order.id, "processing");

    await NotificationService.deliverOrderNotifications(order.id);
    await NotificationService.deliverOrderNotifications(order.id);
    const stored = await Order.findById(order.id);
    expect(stored.notifications).toHaveLength(2);
    expect(stored.notifications.every((n) => n.delivered)).toBe(true);
  });

  it("exposes the notification on the buyer receipt without the phone number", async () => {
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");
    await sellerTransition(order.id, "processing");
    await sellerTransition(order.id, "shipped");
    await NotificationService.deliverOrderNotifications(order.id);

    const receipt = await request(app)
      .get(`/api/storefront/orders/${order.id}`)
      .set("Authorization", AUTH(buyerToken));
    expect(receipt.status).toBe(200);
    const dto = receipt.body.order.notifications.find((n) => n.status === "shipped");
    expect(dto.channel).toBe("sms");
    expect(dto.delivered).toBe(true);
    expect(dto.message).toContain("ارسال شد");
    expect(dto.to).toBeUndefined();
  });
});

describe("seller-dashboard orders are never announced", () => {
  it("does not enqueue when the seller enters the order manually", async () => {
    const sellerProfile = await SellerProfile.findOne({ slug: "notif-store" });
    const created = await createOrder({
      sellerId: String(sellerProfile._id),
      sellerUserId: String(sellerProfile.userId),
      customer: { name: "ثبت دستی", phone: "09120000000" },
      items: [
        { productId, title: "ظرف سفالی اعلان", price: 300000, currency: "IRR", qty: 1 },
      ],
      subtotal: 300000,
      total: 300000,
    });

    await transitionOrder({
      orderId: String(created._id),
      sellerId: String(sellerProfile._id),
      nextStatus: "confirmed",
      sellerUserId: String(sellerProfile.userId),
    });

    const stored = await Order.findById(created._id);
    expect(stored.origin).toBe("seller");
    expect(stored.notifications).toHaveLength(0);
  });
});

describe("delivery failures never reject", () => {
  it("marks the record with an error instead of throwing", async () => {
    const order = await checkout();

    process.env.SMS_MOCK = "true";
    process.env.SMS_MOCK_FAIL = "true";
    try {
      await sellerTransition(order.id, "confirmed");
      // Also drain explicitly while mock-fail is set: the automatic dispatch
      // races with this, but both attempts fail identically, so the final state
      // (delivered=false + error) is deterministic.
      await NotificationService.deliverOrderNotifications(order.id);
    } finally {
      delete process.env.SMS_MOCK_FAIL;
      process.env.SMS_MOCK = "true";
    }

    const stored = await Order.findById(order.id);
    expect(stored.notifications[0].delivered).toBe(false);
    expect(stored.notifications[0].error).toContain("simulated");
  });
});