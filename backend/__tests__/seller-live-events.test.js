const request = require("supertest");
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payout = require("../models/Payout");
const OrderService = require("../services/OrderService");
const AuditService = require("../services/AuditService");
const sellerEventHub = require("../services/SellerEventHub");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 31 — seller live store events (GET /api/seller/events/live, P1-05).
 * The stream is bound to ONE seller profile: an event published for another
 * store must never reach a subscriber. Order transitions, settlement changes
 * and store activity all push to the owning store.
 */

function accessTokenOf(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role, type: "access", ver: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "15m", algorithm: "HS256" },
  );
}

const AUTH = (token) => `Bearer ${token}`;

function waitFor(fn, timeout = 4000, interval = 40) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (fn()) return resolve();
      if (Date.now() - started > timeout) return reject(new Error("Timeout waiting for condition"));
      setTimeout(tick, interval);
    };
    tick();
  });
}

const PHONES = {
  seller: "09147100041",
  seller2: "09147100042",
  staff: "09147100043",
  buyer: "09147100044",
  sa: "09147100045",
};

let httpServer;
let port;
let sellerUser;
let sellerToken;
let seller2Token;
let staffToken;
let saToken;
let profileId;
let productId;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await TeamMember.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await Payout.deleteMany({});
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

  sellerUser = await User.create({
    name: "فروشنده زنده",
    phone: PHONES.seller,
    handle: "live_seller_a",
    role: "seller",
    isVerified: true,
  });
  profileId = (await SellerProfile.create({
    userId: sellerUser._id,
    storeName: "فروشگاه زنده",
    slug: "live-shop",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  }))._id;
  sellerToken = accessTokenOf(sellerUser);

  const seller2 = await User.create({
    name: "فروشنده زنده دیگر",
    phone: PHONES.seller2,
    handle: "live_seller_b",
    role: "seller",
    isVerified: true,
  });
  await SellerProfile.create({
    userId: seller2._id,
    storeName: "فروشگاه دیگر",
    slug: "live-shop-2",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  seller2Token = accessTokenOf(seller2);

  const staff = await User.create({
    name: "همکار زنده",
    phone: PHONES.staff,
    handle: "live_staff",
    role: "seller",
    isVerified: true,
  });
  staffToken = accessTokenOf(staff);
  await TeamMember.create({
    sellerProfileId: profileId,
    userId: staff._id,
    role: "staff",
  });

  const product = await Product.create({
    sellerId: profileId,
    sellerUserId: sellerUser._id,
    title: "کالای زنده",
    description: "",
    sku: "LIVE-1",
    price: 300000,
    currency: "IRR",
    category: "pottery",
    status: "active",
    stockPolicy: "tracked",
    stock: { onHand: 50, reserved: 0, incoming: 0 },
    lowStockThreshold: 2,
  });
  productId = product._id;

  process.env.SUPER_ADMIN_PHONE = PHONES.sa;
  const sa = await User.create({
    name: "سوپرادمین زنده",
    phone: PHONES.sa,
    handle: "live_sa",
    role: "super_admin",
    isVerified: true,
  });
  saToken = accessTokenOf(sa);

  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer.once("listening", resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  sellerEventHub.reset();
  delete process.env.SUPER_ADMIN_PHONE;
  await wipe();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await mongoose.connection.close();
});

function openLiveStream(token) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const streamReq = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/seller/events/live",
        method: "GET",
        headers: { Authorization: AUTH(token) },
      },
      (res) => {
        res.on("data", (chunk) => chunks.push(chunk.toString()));
        resolve({
          streamReq,
          res,
          text: () => chunks.join(""),
        });
      },
    );
    streamReq.on("error", reject);
    streamReq.end();
  });
}

describe("seller live events — protection", () => {
  it("rejects unauthenticated requests with 401", async () => {
    await request(app).get("/api/seller/events/live").expect(401);
  });

  it("rejects a seller without a profile with 403", async () => {
    const profileLess = await User.create({
      name: "بدون پروفایل",
      phone: PHONES.buyer,
      handle: "live_noprofile",
      role: "seller",
      isVerified: true,
    });
    const res = await request(app)
      .get("/api/seller/events/live")
      .set("Authorization", AUTH(accessTokenOf(profileLess)))
      .expect(403);
    expect(res.body.error.code).toBe("SELLER_PROFILE_REQUIRED");
    await User.deleteOne({ _id: profileLess._id });
  });

  it("is manager+owner — plain staff cannot open the stream", async () => {
    await request(app)
      .get("/api/seller/events/live")
      .set("Authorization", AUTH(staffToken))
      .expect(403);
  });
});

describe("seller live events — streaming", () => {
  it("emits an initial frame, then an activity event from a real seller route", async () => {
    const stream = await openLiveStream(sellerToken);
    try {
      await waitFor(() => stream.text().includes("event: initial"));
      expect(stream.res.headers["content-type"]).toContain("text/event-stream");

      // Driven through the real HTTP route on purpose: the seller controllers
      // never spell out the store id, so the event must be derived from the
      // authenticated seller context (req.seller) instead of metadata.
      await request(app)
        .patch(`/api/seller/inventory/${productId}`)
        .set("Authorization", AUTH(sellerToken))
        .send({ delta: 5, reason: "شارژ اولیه" })
        .expect(200);

      await waitFor(
        () =>
          stream.text().includes("event: activity") &&
          stream.text().includes('"action":"STOCK_ADJUSTED"'),
      );

      const text = stream.text();
      expect(text).toContain('"riskLevel":"MEDIUM"');
      expect(text).toContain(`"resourceId":"${String(productId)}"`);
    } finally {
      stream.streamReq.destroy();
    }
  });

  it("pushes order transitions to the owning store", async () => {
    const stream = await openLiveStream(sellerToken);
    try {
      await waitFor(() => stream.text().includes("event: initial"));

      const order = await Order.create({
        sellerId: profileId,
        sellerUserId: sellerUser._id,
        origin: "seller",
        orderNumber: 7001,
        customer: { name: "خریدار زنده", phone: "09120000000" },
        items: [
          {
            productId,
            title: "کالای زنده",
            sku: "LIVE-1",
            price: 300000,
            currency: "IRR",
            qty: 1,
          },
        ],
        subtotal: 300000,
        shippingFee: 0,
        discount: 0,
        total: 300000,
        currency: "IRR",
        status: "pending",
        payment: { status: "unpaid" },
        itemCount: 1,
        timeline: [{ status: "pending", at: new Date(), by: null }],
      });

      const res = await request(app)
        .patch(`/api/seller/orders/${order._id}/status`)
        .set("Authorization", AUTH(sellerToken))
        .send({ status: "confirmed" })
        .expect(200);
      expect(res.body.order.status).toBe("confirmed");

      await waitFor(
        () => stream.text().includes("event: order") && stream.text().includes("7001"),
      );

      const text = stream.text();
      expect(text).toContain('"from":"pending"');
      expect(text).toContain('"status":"confirmed"');
      expect(text).toContain('"total":300000');
    } finally {
      stream.streamReq.destroy();
    }
  });

  it("pushes a brand-new order (from=null) to the owning store", async () => {
    const stream = await openLiveStream(sellerToken);
    try {
      await waitFor(() => stream.text().includes("event: initial"));

      const order = await OrderService.createOrder({
        sellerId: String(profileId),
        sellerUserId: String(sellerUser._id),
        origin: "storefront",
        customer: { name: "خریدار تازه", phone: "09120000011" },
        items: [{ productId: String(productId), qty: 1 }],
      });

      await waitFor(
        () =>
          stream.text().includes("event: order") &&
          stream.text().includes(`"orderNumber":${order.orderNumber}`),
      );

      const text = stream.text();
      expect(text).toContain('"from":null');
      expect(text).toContain('"status":"pending"');
    } finally {
      stream.streamReq.destroy();
    }
  });

  it("refuses a new stream with a JSON 503 once the store is at its cap", async () => {
    const streams = [];
    try {
      for (let i = 0; i < 10; i += 1) {
        streams.push(await openLiveStream(sellerToken));
      }
      await waitFor(() => sellerEventHub.connectionCount === 10);
      expect(sellerEventHub.canAccept(profileId)).toBe(false);

      const res = await request(app)
        .get("/api/seller/events/live")
        .set("Authorization", AUTH(sellerToken))
        .expect(503);

      // A refusal must be plain JSON, not a half-open event stream.
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.error.code).toBe("TOO_MANY_CONNECTIONS");
      expect(sellerEventHub.connectionCount).toBe(10);
    } finally {
      for (const s of streams) s.streamReq.destroy();
      sellerEventHub.reset();
    }
  });

  it("tells a staff member their roster role so the client can hide the bell", async () => {
    const res = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", AUTH(staffToken))
      .expect(200);
    expect(res.body.profile.myRole).toBe("staff");

    const ownerRes = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(ownerRes.body.profile.myRole).toBe("owner");
  });

  it("pushes settlement changes to the owning store", async () => {
    const stream = await openLiveStream(sellerToken);
    try {
      await waitFor(() => stream.text().includes("event: initial"));

      const payout = await Payout.create({
        sellerId: profileId,
        sellerUserId: sellerUser._id,
        amount: 250000,
        currency: "IRR",
        status: "requested",
        method: "bank_transfer",
        timeline: [{ status: "requested", at: new Date(), by: sellerUser._id }],
      });

      // The settlement matrix requires requested -> processing -> paid.
      await request(app)
        .patch(`/api/admin/payouts/${payout._id}/status`)
        .set("Authorization", AUTH(saToken))
        .send({ status: "processing" })
        .expect(200);
      await request(app)
        .patch(`/api/admin/payouts/${payout._id}/status`)
        .set("Authorization", AUTH(saToken))
        .send({ status: "paid", reference: "SHEET-1" })
        .expect(200);

      await waitFor(
        () => stream.text().includes("event: payout") && stream.text().includes("250000"),
      );

      const text = stream.text();
      expect(text).toContain('"from":"requested"');
      expect(text).toContain('"status":"paid"');
    } finally {
      stream.streamReq.destroy();
    }
  });
});

describe("seller live events — store isolation", () => {
  it("never delivers another store's events", async () => {
    const a = await openLiveStream(sellerToken);
    const b = await openLiveStream(seller2Token);
    try {
      await waitFor(() => a.text().includes("event: initial"));
      await waitFor(() => b.text().includes("event: initial"));

      await AuditService.log({
        userId: String(sellerUser._id),
        action: "PAYOUT_REQUESTED",
        resource: { type: "TRANSACTION", id: String(profileId) },
        requestContext: { endpoint: "/api/seller/payouts" },
        riskLevel: "HIGH",
        metadata: { sellerProfileId: String(profileId) },
      });

      await waitFor(() => a.text().includes("PAYOUT_REQUESTED"));
      // Give a stray cross-store delivery a chance to show up before asserting.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(b.text()).not.toContain("PAYOUT_REQUESTED");
    } finally {
      a.streamReq.destroy();
      b.streamReq.destroy();
    }
  });

  it("drops the client when the connection closes", async () => {
    const stream = await openLiveStream(sellerToken);
    await waitFor(() => stream.text().includes("event: initial"));
    expect(sellerEventHub.connectionCount).toBeGreaterThan(0);

    stream.streamReq.destroy();
    await waitFor(() => sellerEventHub.connectionCount === 0, 4000, 50);
    expect(sellerEventHub.connectionCount).toBe(0);
  });
});
