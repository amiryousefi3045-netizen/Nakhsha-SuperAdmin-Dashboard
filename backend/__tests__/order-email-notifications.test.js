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
const notificationQueueService = require("../services/NotificationQueueService");
const { createOrder } = require("../services/OrderService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 21 — email is the second channel of the buyer notification pipeline.
 *
 * A storefront order with a customer email gets BOTH an sms and an email
 * record on every announced transition; the email record rides the same
 * atomic claim engine (attempts/backoff/retry). Orders without an address
 * stay sms-only. Failure on one channel never blocks the other.
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
  owner: "09146000001",
  buyer: "09146000002",
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
  process.env.NOTIFICATION_RETRY_BACKOFF_MS = "0";
  process.env.NOTIFICATION_MAX_ATTEMPTS = "3";
  _resetRateLimitStoreForTests();

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;
  await wipeNdata();

  const owner = await User.create({
    name: "مالک ایمیل",
    phone: PHONES.owner,
    handle: "email_owner",
    role: "seller",
    isVerified: true,
  });
  ownerToken = TOKEN_OF(owner);

  const store = await SellerProfile.create({
    userId: owner._id,
    storeName: "فروشگاه ایمیل",
    slug: "email-store",
    description: "فروشگاه تست اعلان ایمیل",
    status: "active",
    verification: { status: "verified" },
    settings: { ...STORE_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  const product = await Product.create({
    sellerId: store._id,
    sellerUserId: owner._id,
    title: "سفال ایمیل",
    price: 250000,
    category: "pottery",
    stock: { onHand: 15, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  productId = String(product._id);

  const buyer = await User.create({
    name: "خریدار ایمیل",
    phone: PHONES.buyer,
    handle: "email_buyer",
    role: "user",
    isVerified: true,
  });
  buyerToken = TOKEN_OF(buyer);
});

afterAll(async () => {
  await wipeNdata();
  delete process.env.NOTIFICATION_RETRY_BACKOFF_MS;
  delete process.env.NOTIFICATION_MAX_ATTEMPTS;
  await mongoose.connection.close();
});

const CHECKOUT_BODY = {
  customer: {
    name: "مشتری ایمیل",
    phone: "09123456788",
    email: "buyer@example.com",
  },
  paymentMethod: "card",
};

async function checkout({ email = "buyer@example.com" } = {}) {
  const res = await request(app)
    .post("/api/storefront/email-store/checkout")
    .set("Authorization", AUTH(buyerToken))
    .send({
      ...CHECKOUT_BODY,
      customer: { ...CHECKOUT_BODY.customer, email },
      items: [{ productId, qty: 1 }],
    });
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

describe("NotificationService email helpers", () => {
  const base = {
    origin: "storefront",
    buyerUserId: new mongoose.Types.ObjectId(),
    orderNumber: 22,
    customer: { phone: "09120000000", email: "a@example.com" },
  };

  it("hasEmailTarget requires storefront origin, a buyer and an address", () => {
    expect(NotificationService.hasEmailTarget(base)).toBe(true);
    expect(
      NotificationService.hasEmailTarget({ ...base, origin: "seller" }),
    ).toBe(false);
    expect(
      NotificationService.hasEmailTarget({ ...base, buyerUserId: null }),
    ).toBe(false);
    expect(
      NotificationService.hasEmailTarget({ ...base, customer: { phone: "0912" } }),
    ).toBe(false);
  });

  it("builds a Persian subject mirroring the status template", () => {
    const subject = NotificationService.buildEmailSubject(base, "confirmed");
    expect(subject).toContain("تأیید شد");
    expect(subject).toContain("22");
  });
});

describe("buyer email notifications via seller transition (HTTP)", () => {
  it("records an sms AND an email record when the buyer has both targets", async () => {
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");

    await NotificationService.deliverOrderNotifications(order.id);
    const stored = await Order.findById(order.id);
    expect(stored.notifications).toHaveLength(2);

    const sms = stored.notifications.find((n) => n.channel === "sms");
    const email = stored.notifications.find((n) => n.channel === "email");
    expect(sms.to).toBe(stored.customer.phone);
    expect(email.to).toBe(stored.customer.email);
    expect(email.status).toBe("confirmed");
    expect(sms.delivered).toBe(true);
    expect(email.delivered).toBe(true);
    expect(email.message).toContain("تأیید شد");
    expect(email.error).toBe("");
  });

  it("stays sms-only when the buyer has no email address", async () => {
    const order = await checkout({ email: "" });
    await sellerTransition(order.id, "confirmed");

    await NotificationService.deliverOrderNotifications(order.id);
    const stored = await Order.findById(order.id);
    expect(stored.notifications).toHaveLength(1);
    expect(stored.notifications[0].channel).toBe("sms");
  });

  it("keeps delivery idempotent across channels (each fired exactly once)", async () => {
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");
    await sellerTransition(order.id, "processing");

    await NotificationService.deliverOrderNotifications(order.id);
    await NotificationService.deliverOrderNotifications(order.id);
    const stored = await Order.findById(order.id);
    expect(stored.notifications).toHaveLength(4);
    expect(stored.notifications.every((n) => n.delivered)).toBe(true);
  });

  it("exposes the email record on the buyer receipt without the address", async () => {
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");

    await NotificationService.deliverOrderNotifications(order.id);
    const receipt = await request(app)
      .get(`/api/storefront/orders/${order.id}`)
      .set("Authorization", AUTH(buyerToken));
    expect(receipt.status).toBe(200);
    const email = receipt.body.order.notifications.find((n) => n.channel === "email");
    expect(email.channel).toBe("email");
    expect(email.delivered).toBe(true);
    expect(email.message).toContain("تأیید شد");
    expect(email.to).toBeUndefined();
  });

  it("keeps channels independent when email delivery fails", async () => {
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");

    process.env.EMAIL_MOCK = "true";
    process.env.EMAIL_MOCK_FAIL = "true";
    try {
      await NotificationService.deliverOrderNotifications(order.id);
    } finally {
      delete process.env.EMAIL_MOCK_FAIL;
      process.env.EMAIL_MOCK = "true";
    }

    const stored = await Order.findById(order.id);
    const sms = stored.notifications.find((n) => n.channel === "sms");
    const email = stored.notifications.find((n) => n.channel === "email");
    expect(sms.delivered).toBe(true);
    expect(email.delivered).toBe(false);
    expect(email.error).toContain("simulated");
  });
});

describe("email through the stage-19 retry queue", () => {
  it("sweeps email records via the queue and delivers them", async () => {
    const store = await SellerProfile.findOne({ slug: "email-store" });
    const buyer = await User.findOne({ phone: PHONES.buyer });
    const created = await createOrder({
      sellerId: String(store._id),
      sellerUserId: String(store.userId),
      origin: "storefront",
      buyerUserId: buyer._id,
      customer: { name: "صف ایمیل", phone: "09120000000", email: "queue@example.com" },
      items: [
        { productId, title: "سفال ایمیل", price: 250000, currency: "IRR", qty: 1 },
      ],
      subtotal: 250000,
      total: 250000,
    });
    // A deliverable got stuck (e.g. enqueued but never drained): the queue
    // sweep must pick it up and mark it delivered.
    await Order.updateOne(
      { _id: created._id },
      {
        $push: {
          notifications: {
            channel: "email",
            status: "confirmed",
            to: "queue@example.com",
            reason: "",
            delivered: false,
            error: "",
            at: new Date(),
          },
        },
      },
    );

    const summary = await notificationQueueService.runOnce();

    expect(summary.attempted).toBeGreaterThanOrEqual(1);
    const stored = await Order.findById(created._id);
    const email = stored.notifications.find((n) => n.channel === "email");
    expect(email.delivered).toBe(true);
    expect(email.message).toContain("تأیید شد");
    await Order.deleteMany({ _id: created._id });
  });
});