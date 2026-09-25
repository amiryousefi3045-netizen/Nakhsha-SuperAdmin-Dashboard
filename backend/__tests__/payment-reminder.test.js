const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const NotificationService = require("../services/NotificationService");
const paymentReminderService = require("../services/PaymentReminderService");
const notificationQueueService = require("../services/NotificationQueueService");
const { createOrder, transitionOrder } = require("../services/OrderService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 20 — payment reminder for abandoned checkouts.
 *
 * The scheduler (PaymentReminderService) enqueues ONE sms reminder record on a
 * storefront order that is still `pending` past its grace period. Enqueueing
 * is idempotent (atomic guard on status + paymentReminderAt), the record rides
 * the stage-19 delivery queue for actual sending/retries, and it is dropped
 * the moment the order leaves pending so a buyer who already paid never gets
 * the nudge. Fresh orders, non-pending orders, seller-entered orders and
 * orders without a trackable buyer are all skipped.
 */

const PHONES = {
  owner: "09147000001",
  buyer: "09147000002",
  buyerWithoutUser: "09147000003",
};

const FINANCE_TERMS = { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 };
const STORE_SETTINGS = {
  storefrontPublished: true,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "bank_transfer",
};

let storeId;
let ownerUserId;
let buyerUserId;
let productId;

async function wipeNdata() {
  await Order.deleteMany({});
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
}

/** Each test starts with a clean Order collection — every test creates its own
 *  orders, and runOnce() sweeps the WHOLE pending set, so leftovers would
 *  otherwise bleed into later scans. */
beforeEach(async () => {
  await Order.deleteMany({});
});

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  // Hermetic settings for this suite: every pending storefront order is
  // reminder-due immediately (age 0) and the delivery queue retries with
  // zero backoff so test flow stays fast and deterministic.
  process.env.PAYMENT_REMINDER_AGE_MS = "0";
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
    name: "مالک یادآوری",
    phone: PHONES.owner,
    handle: "reminder_owner",
    role: "seller",
    isVerified: true,
  });
  ownerUserId = owner._id;

  const store = await SellerProfile.create({
    userId: owner._id,
    storeName: "فروشگاه یادآوری",
    slug: "reminder-store",
    description: "فروشگاه تست یادآوری پرداخت",
    status: "active",
    verification: { status: "verified" },
    settings: { ...STORE_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });
  storeId = store._id;

  const product = await Product.create({
    sellerId: store._id,
    sellerUserId: owner._id,
    title: "گلیم یادآوری",
    price: 400000,
    category: "textile",
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  productId = String(product._id);

  const buyer = await User.create({
    name: "خریدار یادآوری",
    phone: PHONES.buyer,
    handle: "reminder_buyer",
    role: "user",
    isVerified: true,
  });
  buyerUserId = buyer._id;
});

afterAll(async () => {
  await wipeNdata();
  delete process.env.PAYMENT_REMINDER_AGE_MS;
  delete process.env.NOTIFICATION_RETRY_BACKOFF_MS;
  delete process.env.NOTIFICATION_MAX_ATTEMPTS;
  await mongoose.connection.close();
});

/** A storefront checkout order that is pending payment from the start. */
async function pendingStorefrontOrder({ buyerUserId: buyer = buyerUserId, phone = PHONES.buyer } = {}) {
  return createOrder({
    sellerId: String(storeId),
    sellerUserId: String(ownerUserId),
    origin: "storefront",
    buyerUserId: buyer,
    customer: { name: "مشتری یادآوری", phone },
    items: [
      { productId, title: "گلیم یادآوری", price: 400000, currency: "IRR", qty: 1 },
    ],
    subtotal: 400000,
    total: 400000,
  });
}

describe("NotificationService reminder message", () => {
  it("builds a Persian nudge with the order number", () => {
    const message = NotificationService.buildPaymentReminderMessage({ orderNumber: 7 });
    expect(message).toContain("در انتظار پرداخت");
    expect(message).toContain("7");
  });

  it("announces status templates, reminder bodies and nothing else", () => {
    const order = { orderNumber: 9 };
    expect(NotificationService.buildNotificationMessage(order, "confirmed")).toContain("تأیید شد");
    expect(NotificationService.buildNotificationMessage(order, "pending", NotificationService.REMINDER_REASON)).toContain(
      "در انتظار پرداخت",
    );
    expect(NotificationService.buildNotificationMessage(order, "pending", "")).toBe("");
  });
});

describe("PaymentReminderService scheduler", () => {
  it("enqueues one reminder for an overdue pending storefront order", async () => {
    const order = await pendingStorefrontOrder();

    const summary = await paymentReminderService.runOnce();

    expect(summary).toMatchObject({ scanned: 1, reminded: 1, skipped: 0 });
    const stored = await Order.findById(order._id);
    expect(stored.paymentReminderAt).not.toBeNull();
    expect(stored.notifications).toHaveLength(1);
    const record = stored.notifications[0];
    expect(record.channel).toBe("sms");
    expect(record.status).toBe("pending");
    expect(record.reason).toBe(NotificationService.REMINDER_REASON);
    expect(record.to).toBe(stored.customer.phone);
    expect(record.delivered).toBe(false);
    expect(record.message).toContain("در انتظار پرداخت");
    expect(record.message).toContain(String(stored.orderNumber));
  });

  it("never enqueues twice (idempotent guard on paymentReminderAt)", async () => {
    const order = await pendingStorefrontOrder();
    await paymentReminderService.runOnce();

    const second = await paymentReminderService.runOnce();

    expect(second).toMatchObject({ scanned: 0, reminded: 0, skipped: 0 });
    const stored = await Order.findById(order._id);
    expect(stored.notifications).toHaveLength(1);
  });

  it("leaves orders still inside the grace period alone", async () => {
    const order = await pendingStorefrontOrder();

    process.env.PAYMENT_REMINDER_AGE_MS = "3600000";
    try {
      const summary = await paymentReminderService.runOnce();
      expect(summary.reminded).toBe(0);
    } finally {
      process.env.PAYMENT_REMINDER_AGE_MS = "0";
    }

    const stored = await Order.findById(order._id);
    expect(stored.paymentReminderAt).toBeNull();
    expect(stored.notifications).toHaveLength(0);
  });

  it("skips orders that are no longer pending", async () => {
    const order = await pendingStorefrontOrder();
    await transitionOrder({
      orderId: String(order._id),
      sellerId: String(storeId),
      nextStatus: "confirmed",
      sellerUserId: String(ownerUserId),
    });

    const summary = await paymentReminderService.runOnce();

    expect(summary.reminded).toBe(0);
    const stored = await Order.findById(order._id);
    expect(stored.paymentReminderAt).toBeNull();
    expect(stored.notifications.some((n) => n.reason === NotificationService.REMINDER_REASON)).toBe(false);
  });

  it("skips seller-entered orders", async () => {
    await createOrder({
      sellerId: String(storeId),
      sellerUserId: String(ownerUserId),
      customer: { name: "ثبت دستی یادآوری", phone: PHONES.buyerWithoutUser },
      items: [
        { productId, title: "گلیم یادآوری", price: 400000, currency: "IRR", qty: 1 },
      ],
      subtotal: 400000,
      total: 400000,
    });

    const summary = await paymentReminderService.runOnce();

    expect(summary.reminded).toBe(0);
    const sellerOrders = await Order.find({ origin: "seller" });
    expect(sellerOrders.every((o) => o.notifications.length === 0)).toBe(true);
  });

  it("skips storefront orders without a trackable buyer", async () => {
    await pendingStorefrontOrder({ buyerUserId: null });

    const summary = await paymentReminderService.runOnce();

    expect(summary.reminded).toBe(0);
    const storefront = await Order.find({ origin: "storefront", buyerUserId: null });
    expect(storefront.every((o) => o.paymentReminderAt === null)).toBe(true);
  });

  it("exposes run stats on the singleton", () => {
    const stats = paymentReminderService.getStats();
    expect(stats.config).toMatchObject({ ageMs: 0 });
    expect(stats.isRunning).toBe(false);
  });
});

describe("reminder delivery through the stage-19 queue", () => {
  it("rides the notification queue and lands as delivered", async () => {
    const order = await pendingStorefrontOrder();
    await paymentReminderService.runOnce();

    const queueSummary = await notificationQueueService.runOnce();

    expect(queueSummary.attempted).toBeGreaterThanOrEqual(1);
    const stored = await Order.findById(order._id);
    const reminder = stored.notifications.find(
      (n) => n.reason === NotificationService.REMINDER_REASON,
    );
    expect(reminder.delivered).toBe(true);
    expect(reminder.error).toBe("");
  });
});

describe("reminder lifecycle across order transitions", () => {
  it("drops the pending reminder once the order leaves pending, then never sends it", async () => {
    const order = await pendingStorefrontOrder();
    await paymentReminderService.runOnce();

    await transitionOrder({
      orderId: String(order._id),
      sellerId: String(storeId),
      nextStatus: "confirmed",
      sellerUserId: String(ownerUserId),
    });

    const stored = await Order.findById(order._id);
    expect(stored.notifications).toHaveLength(1);
    expect(stored.notifications[0].status).toBe("confirmed");
    expect(stored.notifications.some((n) => n.reason === NotificationService.REMINDER_REASON)).toBe(false);

    // Explicit deliver is idempotent — off-loop dispatch from the transition
    // may have already claimed it. Only the confirmation SMS is ever sent.
    await NotificationService.deliverOrderNotifications(order._id);
    const final = await Order.findById(order._id);
    expect(final.notifications.every((n) => n.delivered)).toBe(true);
    expect(final.notifications[0].message).toContain("تأیید شد");
    expect(final.notifications.some((n) => (n.message || "").includes("در انتظار پرداخت"))).toBe(false);
  });

  it("never fires a stale pending reminder even if one lingers on a non-pending order", async () => {
    const order = await pendingStorefrontOrder();
    await paymentReminderService.runOnce();

    // Bypass the service on purpose: flip the order straight to confirmed so
    // the transition cleanup does NOT run — a stale reminder should survive.
    await Order.updateOne({ _id: order._id }, { $set: { status: "confirmed" } });

    const summary = await NotificationService.deliverOrderNotifications(order._id);

    expect(summary.attempted).toBe(0);
    const stored = await Order.findById(order._id);
    const stale = stored.notifications.find((n) => n.reason === NotificationService.REMINDER_REASON);
    expect(stale).toBeTruthy();
    expect(stale.delivered).toBe(false);
    expect(stale.attempts).toBe(0);
  });
});