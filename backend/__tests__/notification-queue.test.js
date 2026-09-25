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
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 19 — notification retry queue.
 *
 * Engine guarantees: every claim is atomic (attempts++ guarded by
 * delivered/attempts/nextAttemptAt filters), failed sends get a linear backoff
 * via nextAttemptAt, and records past the retry budget are given up on (never
 * retried, still visible to ops as "failed").
 *
 * Scheduler guarantees: one bounded sweep only touches records in "pending"
 * state (not delivered, attempts left, retry time passed) — delivered and
 * backoff-waiting records are never re-attempted.
 *
 * Admin ops: super_admin-only GET summary/list + POST retry (audited).
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
  owner: "09148000001",
  buyer: "09148000002",
  sa: "09148000003",
  normal: "09148000004",
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
let saToken;
let normalToken;
let productId;

async function wipeData() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({ action: "NOTIFICATION_QUEUE_RETRIED" });
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  // Hermetic queue defaults for this suite: failures become immediately
  // retry-eligible (backoff 0) and the budget is 3 attempts unless a test
  // overrides it explicitly.
  process.env.NOTIFICATION_RETRY_BACKOFF_MS = "0";
  process.env.NOTIFICATION_MAX_ATTEMPTS = "3";
  _resetRateLimitStoreForTests();

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;
  await wipeData();

  const owner = await User.create({
    name: "مالک صف اعلان",
    phone: PHONES.owner,
    handle: "queue_owner",
    role: "seller",
    isVerified: true,
  });
  ownerToken = TOKEN_OF(owner);

  const store = await SellerProfile.create({
    userId: owner._id,
    storeName: "فروشگاه صف اعلان",
    slug: "queue-store",
    status: "active",
    verification: { status: "verified" },
    settings: { ...STORE_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  const product = await Product.create({
    sellerId: store._id,
    sellerUserId: owner._id,
    title: "ظرف سفالی صف",
    price: 200000,
    category: "pottery",
    stock: { onHand: 30, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  productId = String(product._id);

  const buyer = await User.create({
    name: "خریدار صف",
    phone: PHONES.buyer,
    handle: "queue_buyer",
    role: "user",
    isVerified: true,
  });
  buyerToken = TOKEN_OF(buyer);

  const sa = await User.create({
    name: "سوپرادمین صف",
    phone: PHONES.sa,
    handle: "queue_sa",
    role: "super_admin",
    isVerified: true,
  });
  saToken = TOKEN_OF(sa);

  const normal = await User.create({
    name: "کاربر عادی صف",
    phone: PHONES.normal,
    handle: "queue_normal",
    role: "user",
    isVerified: true,
  });
  normalToken = TOKEN_OF(normal);
});

afterAll(async () => {
  await wipeData();
  delete process.env.NOTIFICATION_RETRY_BACKOFF_MS;
  delete process.env.NOTIFICATION_MAX_ATTEMPTS;
  process.env.SMS_MOCK = "true";
  delete process.env.SMS_MOCK_FAIL;
  await mongoose.connection.close();
});

const CHECKOUT_BODY = {
  customer: { name: "مشتری صف", phone: "09123456789" },
  items: [],
  paymentMethod: "card",
};

async function checkout() {
  const res = await request(app)
    .post("/api/storefront/queue-store/checkout")
    .set("Authorization", AUTH(buyerToken))
    .send({ ...CHECKOUT_BODY, items: [{ productId, qty: 1 }] });
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

describe("NotificationService.engine bookkeeping", () => {
  it("marks the first attempt delivered and never re-sends a delivered record", async () => {
    const order = await checkout();
    await sellerTransition(order.id, "confirmed");
    // The automatic dispatch owns the single claim; wait for it to settle.
    await new Promise((r) => setTimeout(r, 25));
    const before = await Order.findById(order.id);
    expect(before.notifications).toHaveLength(1);
    expect(before.notifications[0].delivered).toBe(true);
    expect(before.notifications[0].attempts).toBe(1);

    // A later dispatch on a delivered record must be a no-op.
    const summary = await NotificationService.deliverOrderNotifications(order.id);
    expect(summary.attempted).toBe(0);
    const after = await Order.findById(order.id);
    expect(after.notifications[0].attempts).toBe(1);
    expect(after.notifications[0].delivered).toBe(true);
  });

  it("respects the backoff window after a failure (waiting state)", async () => {
    const order = await checkout();
    process.env.NOTIFICATION_RETRY_BACKOFF_MS = "60000";
    process.env.SMS_MOCK_FAIL = "true";
    try {
      await sellerTransition(order.id, "confirmed");
      // Wait for the automatic first attempt to settle.
      await new Promise((r) => setTimeout(r, 25));
      const stored = await Order.findById(order.id);
      const record = stored.notifications[0];
      expect(record.delivered).toBe(false);
      expect(record.attempts).toBe(1);
      expect(record.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      expect(NotificationService.notificationRecordState(record)).toBe("waiting");

      // A direct deliver with the default `now` must NOT retry while waiting.
      const summary = await NotificationService.deliverOrderNotifications(order.id);
      expect(summary.attempted).toBe(0);
    } finally {
      process.env.NOTIFICATION_RETRY_BACKOFF_MS = "0";
      delete process.env.SMS_MOCK_FAIL;
    }
  });

  it("retries once the backoff has elapsed", async () => {
    const order = await checkout();
    process.env.NOTIFICATION_RETRY_BACKOFF_MS = "0";
    process.env.SMS_MOCK_FAIL = "true";
    try {
      await sellerTransition(order.id, "confirmed");
      await new Promise((r) => setTimeout(r, 25));
    } finally {
      delete process.env.SMS_MOCK_FAIL;
    }

    const summary = await NotificationService.deliverOrderNotifications(order.id, {
      now: new Date(Date.now() + 2000),
    });
    expect(summary.attempted).toBe(1);
    expect(summary.delivered).toBe(1);

    const stored = await Order.findById(order.id);
    expect(stored.notifications[0].delivered).toBe(true);
    expect(stored.notifications[0].attempts).toBe(2);
  });

  it("gives up after the retry budget is exhausted (state=failed)", async () => {
    const order = await checkout();
    process.env.NOTIFICATION_MAX_ATTEMPTS = "2";
    process.env.SMS_MOCK_FAIL = "true";
    try {
      await sellerTransition(order.id, "confirmed");
      await new Promise((r) => setTimeout(r, 25));
      // Attempt 2 (same failure, retry-eligible because backoff is 0).
      await NotificationService.deliverOrderNotifications(order.id, {
        now: new Date(Date.now() + 2000),
      });
    } finally {
      delete process.env.SMS_MOCK_FAIL;
      process.env.NOTIFICATION_MAX_ATTEMPTS = "3";
    }

    // A third claim must be refused (budget spent) — clamp maxAttempts to the
    // suite-local budget of 2 (the default env is back to 3 after the try).
    const summary = await NotificationService.deliverOrderNotifications(order.id, {
      now: new Date(Date.now() + 4000),
      maxAttempts: 2,
    });
    expect(summary.attempted).toBe(0);

    const stored = await Order.findById(order.id);
    const record = stored.notifications[0];
    expect(record.delivered).toBe(false);
    expect(record.attempts).toBe(2);
    // State must be "failed" against the 2-attempt budget — the env default is
    // back to 3, so pass the same budget the engine was clamped with.
    expect(NotificationService.notificationRecordState(record, { maxAttempts: 2 })).toBe(
      "failed",
    );
    expect(record.error).toContain("simulated");
  });
});

describe("NotificationQueueService scheduler", () => {
  it("sweeps only pending-eligible records (delivered & waiting are skipped)", async () => {
    // A: delivered on first attempt.
    const orderA = await checkout();
    await sellerTransition(orderA.id, "confirmed");
    await new Promise((r) => setTimeout(r, 25));

    // B: failed once with backoff 0 → eligible for retry.
    const orderB = await checkout();
    process.env.SMS_MOCK_FAIL = "true";
    try {
      await sellerTransition(orderB.id, "confirmed");
      await new Promise((r) => setTimeout(r, 25));
    } finally {
      delete process.env.SMS_MOCK_FAIL;
    }

    // C: failed once, then put far into backoff (waiting).
    const orderC = await checkout();
    process.env.SMS_MOCK_FAIL = "true";
    process.env.NOTIFICATION_RETRY_BACKOFF_MS = "60000";
    try {
      await sellerTransition(orderC.id, "confirmed");
      await new Promise((r) => setTimeout(r, 25));
    } finally {
      delete process.env.SMS_MOCK_FAIL;
      process.env.NOTIFICATION_RETRY_BACKOFF_MS = "0";
    }

    await notificationQueueService.runOnce({ limit: 100 });

    const [a, b, c] = await Promise.all([
      Order.findById(orderA.id),
      Order.findById(orderB.id),
      Order.findById(orderC.id),
    ]);
    expect(a.notifications[0].delivered).toBe(true);
    expect(a.notifications[0].attempts).toBe(1);

    expect(b.notifications[0].delivered).toBe(true);
    expect(b.notifications[0].attempts).toBe(2);

    expect(c.notifications[0].delivered).toBe(false);
    expect(c.notifications[0].attempts).toBe(1);
    expect(NotificationService.notificationRecordState(c.notifications[0])).toBe("waiting");
  });

  it("reports run stats on the singleton", async () => {
    const stats = notificationQueueService.getStats();
    expect(stats.isRunning).toBe(false);
    expect(stats.runs).toBeGreaterThanOrEqual(1);
    expect(stats.config.backoffMs).toBe(0);
    expect(stats.config.maxAttempts).toBe(3);
  });
});

describe("Admin notification queue API", () => {
  it("rejects anonymous access", async () => {
    const res = await request(app).get("/api/admin/notification-queue");
    expect(res.status).toBe(401);
  });

  it("rejects non-super-admin roles", async () => {
    const res = await request(app)
      .get("/api/admin/notification-queue")
      .set("Authorization", AUTH(normalToken));
    expect(res.status).toBe(403);
  });

  it("returns summary + ledger list for super-admin", async () => {
    const res = await request(app)
      .get("/api/admin/notification-queue")
      .set("Authorization", AUTH(saToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { summary, items, total } = res.body;
    expect(typeof summary.delivered).toBe("number");
    expect(typeof summary.pending).toBe("number");
    expect(typeof summary.waiting).toBe("number");
    expect(typeof summary.failed).toBe("number");
    expect(total).toBe(items.length);
    if (items.length > 0) {
      expect(["pending", "waiting", "failed", "delivered"]).toContain(items[0].state);
      expect(typeof items[0].orderNumber).toBe("number");
      expect(typeof items[0].attempts).toBe("number");
    }
  });

  it("filters the list by state", async () => {
    const delivered = await request(app)
      .get("/api/admin/notification-queue?state=delivered")
      .set("Authorization", AUTH(saToken));
    expect(delivered.status).toBe(200);
    for (const item of delivered.body.items) {
      expect(item.state).toBe("delivered");
    }

    const bogus = await request(app)
      .get("/api/admin/notification-queue?state=nonsense")
      .set("Authorization", AUTH(saToken));
    expect(bogus.status).toBe(400);
  });

  it("retries the pending queue on demand and audits the action", async () => {
    const order = await checkout();
    process.env.SMS_MOCK_FAIL = "true";
    try {
      await sellerTransition(order.id, "confirmed");
      await new Promise((r) => setTimeout(r, 25));
    } finally {
      delete process.env.SMS_MOCK_FAIL;
    }

    const before = await Order.findById(order.id);
    expect(before.notifications[0].delivered).toBe(false);
    expect(NotificationService.notificationRecordState(before.notifications[0])).toBe(
      "pending",
    );

    const res = await request(app)
      .post("/api/admin/notification-queue/retry")
      .set("Authorization", AUTH(saToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.scanned).toBeGreaterThanOrEqual(1);

    const after = await Order.findById(order.id);
    expect(after.notifications[0].delivered).toBe(true);
    expect(after.notifications[0].attempts).toBe(2);

    expect(
      await AuditLog.countDocuments({ action: "NOTIFICATION_QUEUE_RETRIED" }),
    ).toBeGreaterThanOrEqual(1);
  });
});