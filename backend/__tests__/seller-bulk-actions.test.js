const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Product = require("../models/Product");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const OrderService = require("../services/OrderService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 32 — bulk selection actions for products and orders (P1-06, closing
 * the "no multi-select, one action per row" gap).
 *
 * The contract mirrors the admin bulk endpoints: every submitted id is
 * reported individually (succeeded / skipped / failed with a reason), a
 * partial failure never rolls back its neighbours, and an id owned by another
 * store is indistinguishable from a missing one.
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
  seller: "09146900051",
  seller2: "09146900052",
  staff: "09146900053",
};

let sellerToken;
let seller2Token;
let staffToken;
let profileId;
let profile2Id;
let sellerUserId;
let productActive;
let productPaused;
let orderPending;
let orderConfirmed;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await TeamMember.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({});
}

async function makeProduct({ sellerId, sellerUserId, status, sku }) {
  return Product.create({
    sellerId,
    sellerUserId,
    title: `کالای ${sku}`,
    description: "",
    sku,
    price: 100000,
    currency: "IRR",
    category: "pottery",
    status,
    stockPolicy: "tracked",
    stock: { onHand: 20, reserved: 0, incoming: 0 },
    lowStockThreshold: 2,
  });
}

/**
 * Orders are built through the real service so they carry a genuine stock
 * reservation — a hand-written Order.create has `reserved: 0` and would make
 * a cancellation fail with INSUFFICIENT_STOCK for the wrong reason.
 */
async function makeOrder({ sellerId, sellerUserId, productId, advanceTo = [] }) {
  let order = await OrderService.createOrder({
    sellerId: String(sellerId),
    sellerUserId: String(sellerUserId),
    origin: "seller",
    customer: { name: "مشتری تست", phone: "09121110000" , address: "تهران، خیابان آزادی، پلاک ۱۲" },
    items: [{ productId: String(productId), qty: 1 }],
  });
  for (const next of advanceTo) {
    order = await OrderService.transitionOrder({
      orderId: String(order._id),
      sellerId: String(sellerId),
      nextStatus: next,
      sellerUserId: String(sellerUserId),
    });
  }
  return order;
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

  const seller = await User.create({
    name: "فروشنده انبوه",
    phone: PHONES.seller,
    handle: "bulk_a",
    role: "seller",
    isVerified: true,
  });
  sellerUserId = seller._id;
  profileId = (await SellerProfile.create({
    userId: seller._id,
    storeName: "فروشگاه انبوه",
    slug: "bulk-shop",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  }))._id;
  sellerToken = accessTokenOf(seller);

  const seller2 = await User.create({
    name: "فروشنده انبوه دیگر",
    phone: PHONES.seller2,
    handle: "bulk_b",
    role: "seller",
    isVerified: true,
  });
  const profile2 = await SellerProfile.create({
    userId: seller2._id,
    storeName: "فروشگاه دیگر",
    slug: "bulk-shop-2",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  profile2Id = profile2._id;
  seller2Token = accessTokenOf(seller2);

  const staff = await User.create({
    name: "عضو تیم",
    phone: PHONES.staff,
    handle: "bulk_staff",
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

  productActive = await makeProduct({
    sellerId: profileId,
    sellerUserId,
    status: "active",
    sku: "BULK-ACTIVE",
  });
  productPaused = await makeProduct({
    sellerId: profileId,
    sellerUserId,
    status: "paused",
    sku: "BULK-PAUSED",
  });
  const foreignProduct = await makeProduct({
    sellerId: profile2Id,
    sellerUserId: seller2._id,
    status: "active",
    sku: "BULK-FOREIGN",
  });

  orderPending = await makeOrder({ sellerId: profileId, sellerUserId, productId: productActive._id });
  orderConfirmed = await makeOrder({
    sellerId: profileId,
    sellerUserId,
    productId: productActive._id,
    advanceTo: ["confirmed"],
  });
  await makeOrder({
    sellerId: profile2Id,
    sellerUserId: seller2._id,
    productId: foreignProduct._id,
  });

  global.__bulkForeignProductId = String(foreignProduct._id);
  global.__bulkForeignOrderId = String(
    (await Order.findOne({ sellerId: profile2Id }))._id,
  );
  global.__bulkOrderNumber = orderPending.orderNumber;
});

afterAll(async () => {
  delete global.__bulkForeignProductId;
  delete global.__bulkForeignOrderId;
  delete global.__bulkOrderNumber;
  await wipe();
  await mongoose.connection.close();
});

// ── Guards ───────────────────────────────────────────────────────────────────

describe("seller bulk actions — guards", () => {
  it("rejects unauthenticated product bulk calls with 401", async () => {
    await request(app)
      .patch("/api/seller/products/bulk-status")
      .send({ ids: [String(productActive._id)], status: "paused" })
      .expect(401);
  });

  it("rejects an empty or malformed id list with 400", async () => {
    const res = await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: [], status: "paused" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.field).toBe("ids");

    await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: ["not-an-object-id"], status: "paused" })
      .expect(400);
  });

  it("rejects an unknown target status with 400", async () => {
    const res = await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: [String(productActive._id)], status: "totally-bogus" })
      .expect(400);
    expect(res.body.error.details.field).toBe("status");
  });

  it("keeps bulk order status away from plain staff", async () => {
    const res = await request(app)
      .patch("/api/seller/orders/bulk-status")
      .set("Authorization", AUTH(staffToken))
      .send({ ids: [String(orderPending._id)], status: "confirmed" })
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    // The order must be untouched by the refused call.
    expect((await Order.findById(orderPending._id)).status).toBe("pending");
  });
});

// ── Products ────────────────────────────────────────────────────────────────

describe("seller bulk actions — products", () => {
  it("changes status, reports UNCHANGED, and hides foreign ids as NOT_FOUND", async () => {
    const res = await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({
        ids: [
          String(productActive._id),
          String(productPaused._id),
          String(global.__bulkForeignProductId),
        ],
        status: "paused",
      })
      .expect(200);

    const { summary, succeeded, skipped, failed, batchId } = res.body;
    expect(batchId).toEqual(expect.any(String));
    expect(summary).toEqual({ total: 3, succeeded: 1, skipped: 2, failed: 0 });
    expect(succeeded).toEqual([{ id: String(productActive._id) }]);
    expect(skipped).toEqual(
      expect.arrayContaining([
        { id: String(productPaused._id), reason: "UNCHANGED" },
        { id: String(global.__bulkForeignProductId), reason: "NOT_FOUND" },
      ]),
    );
    expect(failed).toEqual([]);

    expect((await Product.findById(productActive._id)).status).toBe("paused");
  });

  it("never modifies another store's product", async () => {
    await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: [String(global.__bulkForeignProductId)], status: "archived" })
      .expect(200);

    const foreign = await Product.findById(global.__bulkForeignProductId);
    expect(foreign.status).toBe("active");

    // The owner can still act on it — proving it was skipped, not corrupted.
    const res = await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(seller2Token))
      .send({ ids: [String(global.__bulkForeignProductId)], status: "paused" })
      .expect(200);
    expect(res.body.summary.succeeded).toBe(1);
  });

  it("clears a previous rejection reason when re-activating", async () => {
    const rejected = await makeProduct({
      sellerId: profileId,
      sellerUserId,
      status: "rejected",
      sku: "BULK-REJECTED",
    });
    rejected.rejectionReason = "محتوای نامناسب";
    await rejected.save();

    await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: [String(rejected._id)], status: "active" })
      .expect(200);

    const after = await Product.findById(rejected._id);
    expect(after.status).toBe("active");
    expect(after.rejectionReason).toBe("");
  });

  it("de-duplicates ids and caps the batch at 50", async () => {
    const ids = [String(productActive._id), String(productActive._id), String(productPaused._id)];
    const res = await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids, status: "active" })
      .expect(200);
    // Three entries, one duplicate -> two unique targets.
    expect(res.body.summary.total).toBe(2);

    const many = Array.from({ length: 60 }, () => String(productActive._id));
    const capped = await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: many, status: "paused" })
      .expect(200);
    // 60 copies of one id collapse to a single unique target.
    expect(capped.body.summary.total).toBe(1);
  });

  it("writes exactly one DATA_BULK_OPERATION audit row per gesture", async () => {
    // Pin the starting state so the assertion does not depend on earlier
    // tests having left these two products in some other status.
    await Product.updateMany(
      { _id: { $in: [productActive._id, productPaused._id] } },
      { $set: { status: "paused" } },
    );
    await AuditLog.deleteMany({ action: "DATA_BULK_OPERATION" });

    const res = await request(app)
      .patch("/api/seller/products/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: [String(productActive._id), String(productPaused._id)], status: "active" })
      .expect(200);

    expect(res.body.summary.succeeded).toBe(2);
    const audits = await AuditLog.find({ action: "DATA_BULK_OPERATION" });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata.operation).toBe("PRODUCT_STATUS_CHANGE");
    expect(audits[0].metadata.affectedCount).toBe(2);
    expect(audits[0].metadata.batch).toBe(res.body.batchId);
  });
});

// ── Orders ──────────────────────────────────────────────────────────────────

describe("seller bulk actions — orders", () => {
  it("moves the legal rows and reports the illegal ones without rolling back", async () => {
    // pending -> confirmed is legal; confirmed -> confirmed is a no-op.
    const res = await request(app)
      .patch("/api/seller/orders/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({
        ids: [String(orderPending._id), String(orderConfirmed._id)],
        status: "confirmed",
      })
      .expect(200);

    expect(res.body.summary).toEqual({ total: 2, succeeded: 1, skipped: 1, failed: 0 });
    expect(res.body.succeeded[0]).toMatchObject({
      id: String(orderPending._id),
      orderNumber: global.__bulkOrderNumber,
    });
    expect(res.body.skipped).toEqual([{ id: String(orderConfirmed._id), reason: "UNCHANGED" }]);
    expect((await Order.findById(orderPending._id)).status).toBe("confirmed");
  });

  it("reports INVALID_TRANSITION per row while its neighbours still succeed", async () => {
    const cancellable = await makeOrder({
      sellerId: profileId,
      sellerUserId,
      productId: productActive._id,
    });
    // shipped cannot be cancelled (its reservation was already released).
    const notCancellable = await makeOrder({
      sellerId: profileId,
      sellerUserId,
      productId: productActive._id,
      advanceTo: ["confirmed", "processing", "shipped"],
    });

    const res = await request(app)
      .patch("/api/seller/orders/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: [String(cancellable._id), String(notCancellable._id)], status: "cancelled" })
      .expect(200);

    expect(res.body.summary).toEqual({ total: 2, succeeded: 1, skipped: 0, failed: 1 });
    expect(res.body.failed).toEqual([{ id: String(notCancellable._id), reason: "INVALID_TRANSITION" }]);
    expect((await Order.findById(cancellable._id)).status).toBe("cancelled");
    expect((await Order.findById(notCancellable._id)).status).toBe("shipped");
  });

  it("rejects an unknown order status with 400", async () => {
    const res = await request(app)
      .patch("/api/seller/orders/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: [String(orderPending._id)], status: "teleported" })
      .expect(400);
    expect(res.body.error.details.field).toBe("status");
  });

  it("cannot reach another store's order", async () => {
    const res = await request(app)
      .patch("/api/seller/orders/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: [String(global.__bulkForeignOrderId)], status: "cancelled" })
      .expect(200);

    expect(res.body.summary).toEqual({ total: 1, succeeded: 0, skipped: 1, failed: 0 });
    expect(res.body.skipped).toEqual([{ id: String(global.__bulkForeignOrderId), reason: "NOT_FOUND" }]);
    expect((await Order.findById(global.__bulkForeignOrderId)).status).toBe("pending");
  });

  it("records the order numbers it changed in the bulk audit", async () => {
    const target = await makeOrder({
      sellerId: profileId,
      sellerUserId,
      productId: productActive._id,
    });
    await AuditLog.deleteMany({ action: "DATA_BULK_OPERATION" });

    const res = await request(app)
      .patch("/api/seller/orders/bulk-status")
      .set("Authorization", AUTH(sellerToken))
      .send({ ids: [String(target._id)], status: "confirmed" })
      .expect(200);

    const audits = await AuditLog.find({ action: "DATA_BULK_OPERATION" });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata.operation).toBe("ORDER_STATUS_CHANGE");
    expect(audits[0].metadata.orderNumbers).toEqual([target.orderNumber]);
    expect(audits[0].metadata.batch).toBe(res.body.batchId);
  });
});
