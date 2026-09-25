const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const NotificationService = require("../services/NotificationService");
const notificationQueueService = require("../services/NotificationQueueService");
const { createOrder } = require("../services/OrderService");
const { sendTelegram } = require("../services/telegram/telegramSender");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 22 — Telegram is the third delivery channel of the buyer notification
 * pipeline. The chat id is linked by the buyer on their own account
 * (PATCH /api/users/me/telegram), checkout tags the order with it server-side
 * (never from the public form), and transitions emit a "telegram" record that
 * rides the same atomic claim engine as sms/email.
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
  owner: "09146000011",
  buyer: "09146000012",
};

const FINANCE_TERMS = { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 };
const STORE_SETTINGS = {
  storefrontPublished: true,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "bank_transfer",
};

const CHAT_ID = "22001100";

let ownerToken;
let buyerToken;
let productId;

async function wipeNdata() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
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
    name: "مالک تلگرام",
    phone: PHONES.owner,
    handle: "telegram_owner",
    role: "seller",
    isVerified: true,
  });
  ownerToken = TOKEN_OF(owner);

  const store = await SellerProfile.create({
    userId: owner._id,
    storeName: "فروشگاه تلگرام",
    slug: "telegram-store",
    description: "فروشگاه تست اعلان تلگرام",
    status: "active",
    verification: { status: "verified" },
    settings: { ...STORE_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  const product = await Product.create({
    sellerId: store._id,
    sellerUserId: owner._id,
    title: "سفال تلگرام",
    price: 150000,
    category: "pottery",
    stock: { onHand: 100, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  productId = String(product._id);

  const buyer = await User.create({
    name: "خریدار تلگرام",
    phone: PHONES.buyer,
    handle: "telegram_buyer",
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

async function linkTelegram(chatId) {
  return request(app)
    .patch("/api/users/me/telegram")
    .set("Authorization", AUTH(buyerToken))
    .send({ chatId });
}

async function checkout() {
  const res = await request(app)
    .post("/api/storefront/telegram-store/checkout")
    .set("Authorization", AUTH(buyerToken))
    .send({
      customer: {
        name: "مشتری تلگرام",
        phone: "09123456777",
        email: "tg@example.com",
      },
      items: [{ productId, qty: 1 }],
      paymentMethod: "card",
    });
  expect(res.status).toBe(200);
  return res.body.order;
}

async function sellerTransition(orderId, status) {
  const res = await request(app)
    .patch(`/api/seller/orders/${orderId}/status`)
    .set("Authorization", AUTH(ownerToken))
    .send({ status });
  expect(res.status).toBe(200);
  return res.body.order;
}

describe("telegramSender seams", () => {
  it("resolves silently in test mode (mock)", async () => {
    await expect(sendTelegram(CHAT_ID, "پیام تست")).resolves.toBeUndefined();
  });

  it("throws on a simulated failure", async () => {
    process.env.TELEGRAM_MOCK = "true";
    process.env.TELEGRAM_MOCK_FAIL = "true";
    try {
      await expect(sendTelegram(CHAT_ID, "پیام تست")).rejects.toThrow(
        /simulated/,
      );
    } finally {
      delete process.env.TELEGRAM_MOCK_FAIL;
      process.env.TELEGRAM_MOCK = "true";
    }
  });

  it("rejects a non-numeric chat id", async () => {
    await expect(sendTelegram("not-a-number", "پیام")).rejects.toThrow(
      /numeric/,
    );
  });
});

describe("NotificationService telegram helpers", () => {
  const base = {
    origin: "storefront",
    buyerUserId: new mongoose.Types.ObjectId(),
    phone: "09120000000",
    customer: { phone: "09120000000", email: "a@example.com", telegram: CHAT_ID },
  };

  it("hasTelegramTarget requires storefront origin, buyer and chat id", () => {
    expect(NotificationService.hasTelegramTarget(base)).toBe(true);
    expect(
      NotificationService.hasTelegramTarget({ ...base, origin: "seller" }),
    ).toBe(false);
    expect(
      NotificationService.hasTelegramTarget({ ...base, buyerUserId: null }),
    ).toBe(false);
    expect(
      NotificationService.hasTelegramTarget({
        ...base,
        customer: { phone: "0912", email: "a@b.c", telegram: "" },
      }),
    ).toBe(false);
  });
});

describe("PATCH /api/users/me/telegram", () => {
  it("links a numeric chat id and reports linked=true", async () => {
    const res = await linkTelegram(CHAT_ID);
    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(true);
    expect(res.body.telegramChatId).toBe(CHAT_ID);
    const stored = await User.findOne({ phone: PHONES.buyer });
    expect(stored.telegramChatId).toBe(CHAT_ID);
  });

  it("clears the link with an empty chat id", async () => {
    const res = await linkTelegram("");
    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(false);
    const stored = await User.findOne({ phone: PHONES.buyer });
    expect(stored.telegramChatId).toBe("");
  });

  it("rejects a non-numeric chat id", async () => {
    const res = await linkTelegram("user");
    expect(res.status).toBe(400);
  });
});

describe("buyer telegram notifications via seller transition (HTTP)", () => {
  it("emits a telegram record (with sms+email) once the buyer is linked", async () => {
    await linkTelegram(CHAT_ID);
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");

    await NotificationService.deliverOrderNotifications(order.id);
    const stored = await Order.findById(order.id);
    expect(stored.notifications).toHaveLength(3);

    const tg = stored.notifications.find((n) => n.channel === "telegram");
    expect(tg.to).toBe(CHAT_ID);
    expect(tg.status).toBe("confirmed");
    expect(tg.delivered).toBe(true);
    expect(tg.error).toBe("");
    expect(tg.message).toContain("تأیید شد");
  });

  it("never emits a telegram record for an unlinked buyer", async () => {
    await linkTelegram("");
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");

    await NotificationService.deliverOrderNotifications(order.id);
    const stored = await Order.findById(order.id);
    expect(stored.notifications.some((n) => n.channel === "telegram")).toBe(false);
    expect(stored.notifications).toHaveLength(2);
  });

  it("keeps channels independent when telegram delivery fails", async () => {
    await linkTelegram(CHAT_ID);
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");

    process.env.TELEGRAM_MOCK = "true";
    process.env.TELEGRAM_MOCK_FAIL = "true";
    try {
      await NotificationService.deliverOrderNotifications(order.id);
    } finally {
      delete process.env.TELEGRAM_MOCK_FAIL;
      process.env.TELEGRAM_MOCK = "true";
    }

    const stored = await Order.findById(order.id);
    const tg = stored.notifications.find((n) => n.channel === "telegram");
    const sms = stored.notifications.find((n) => n.channel === "sms");
    const email = stored.notifications.find((n) => n.channel === "email");
    expect(sms.delivered).toBe(true);
    expect(email.delivered).toBe(true);
    expect(tg.delivered).toBe(false);
    expect(tg.error).toContain("simulated");
  });

  it("exposes the telegram record on the buyer receipt without the chat id", async () => {
    await linkTelegram(CHAT_ID);
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");
    await sellerTransition(order.id, "processing");
    await sellerTransition(order.id, "shipped");

    await NotificationService.deliverOrderNotifications(order.id);
    const receipt = await request(app)
      .get(`/api/storefront/orders/${order.id}`)
      .set("Authorization", AUTH(buyerToken));
    expect(receipt.status).toBe(200);
    const tg = receipt.body.order.notifications.find(
      (n) => n.channel === "telegram" && n.status === "shipped",
    );
    expect(tg.delivered).toBe(true);
    expect(tg.message).toContain("سفارش شما ارسال شد");
    expect(tg.to).toBeUndefined();
  });
});

describe("telegram through the stage-19 retry queue", () => {
  it("sweeps an undrained telegram record and delivers it", async () => {
    const store = await SellerProfile.findOne({ slug: "telegram-store" });
    const buyer = await User.findOne({ phone: PHONES.buyer });
    const created = await createOrder({
      sellerId: String(store._id),
      sellerUserId: String(store.userId),
      origin: "storefront",
      buyerUserId: buyer._id,
      customer: {
        name: "صف تلگرام",
        phone: "09120000000",
        email: "queue@example.com",
        telegram: CHAT_ID,
      },
      items: [
        { productId, title: "سفال تلگرام", price: 150000, currency: "IRR", qty: 1 },
      ],
      subtotal: 150000,
      total: 150000,
    });
    // A deliverable that never got drained: the queue sweep must pick it up.
    await Order.updateOne(
      { _id: created._id },
      {
        $push: {
          notifications: {
            channel: "telegram",
            status: "confirmed",
            to: CHAT_ID,
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
    const tg = stored.notifications.find((n) => n.channel === "telegram");
    expect(tg.delivered).toBe(true);
    expect(tg.message).toContain("تأیید شد");
    await Order.deleteMany({ _id: created._id });
  });
});