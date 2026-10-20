const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const InventoryLocation = require("../models/InventoryLocation");
const StockAdjustment = require("../models/StockAdjustment");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const { createOrder, transitionOrder } = require("../services/OrderService");
const InventoryService = require("../services/InventoryService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

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
  sellerA: "09146500001",
  sellerB: "09146500002",
  regular: "09146500003",
};

let sellerAUser;
let sellerAToken;
let sellerAProfile;
let sellerBUser;
let sellerBToken;
let sellerBProfile;
let regularUser;
let regularToken;

/**
 * Assert the two invariants that make the per-location breakdown trustworthy:
 * the aggregate is the sum of its levels. Called after every mutation that is
 * supposed to preserve them, so a drift fails the test that caused it rather
 * than some later unrelated one.
 */
async function assertInvariant(productId) {
  const fresh = await Product.findById(productId).lean();
  const levels = fresh.stock?.locations || [];
  if (levels.length === 0) return { levels, sumOnHand: 0, sumReserved: 0 };
  const sumOnHand = levels.reduce((a, l) => a + (l.onHand || 0), 0);
  const sumReserved = levels.reduce((a, l) => a + (l.reserved || 0), 0);
  expect(fresh.stock.onHand).toBe(sumOnHand);
  expect(fresh.stock.reserved).toBe(sumReserved);
  return { levels, sumOnHand, sumReserved };
}

async function makeProduct(sellerProfile, sellerUser, overrides = {}) {
  return Product.create({
    sellerId: sellerProfile._id,
    sellerUserId: sellerUser._id,
    title: overrides.title || "محصول انبارداری",
    price: 120000,
    stock: overrides.stock || { onHand: 10, reserved: 0 },
    stockPolicy: overrides.stockPolicy || "tracked",
    status: "active",
  });
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
  await Product.deleteMany({});
  await InventoryLocation.deleteMany({});
  await StockAdjustment.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({ action: /^INVENTORY_/ });

  sellerAUser = await User.create({
    name: "فروشنده الف",
    phone: PHONES.sellerA,
    handle: "inv_seller_a",
    role: "seller",
    isVerified: true,
  });
  sellerAToken = TOKEN_OF(sellerAUser);
  sellerAProfile = await SellerProfile.create({
    userId: sellerAUser._id,
    storeName: "انبار الف",
    status: "active",
    verification: { status: "verified" },
  });

  sellerBUser = await User.create({
    name: "فروشنده ب",
    phone: PHONES.sellerB,
    handle: "inv_seller_b",
    role: "seller",
    isVerified: true,
  });
  sellerBToken = TOKEN_OF(sellerBUser);
  sellerBProfile = await SellerProfile.create({
    userId: sellerBUser._id,
    storeName: "انبار ب",
    status: "active",
    verification: { status: "verified" },
  });

  regularUser = await User.create({
    name: "کاربر عادی",
    phone: PHONES.regular,
    handle: "inv_regular",
    role: "user",
    isVerified: true,
  });
  regularToken = TOKEN_OF(regularUser);
});

afterAll(async () => {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await InventoryLocation.deleteMany({});
  await StockAdjustment.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({ action: /^INVENTORY_/ });
  await mongoose.connection.close();
});

// ── Opt-in: a seller with no locations behaves exactly as before ────────────

describe("Stage 38 - opt-in by default", () => {
  it("keeps the breakdown empty and the lifecycle unchanged for a seller with no locations", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 6, reserved: 0 } });

    const order = await createOrder({
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      customer: { name: "خریدار بدون انبار", phone: "09129990001", address: "تهران، خیابان اول" },
      items: [{ productId: product._id, qty: 2 }],
    });

    let fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.onHand).toBe(4);
    expect(fresh.stock.reserved).toBe(2);
    expect(fresh.stock.locations || []).toEqual([]);
    // A line still records the level it was drawn from — null here, because
    // there was no location, and the aggregate is all there is.
    expect(order.items[0].stockLocationId).toBeFalsy();

    await transitionOrder({
      orderId: order._id,
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      nextStatus: "cancelled",
    });

    fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.onHand).toBe(6);
    expect(fresh.stock.reserved).toBe(0);
    expect(fresh.stock.locations || []).toEqual([]);
  });

  it("exposes an empty locations array on the product DTO", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser);
    const res = await request(app)
      .get("/api/seller/inventory")
      .set("Authorization", AUTH(sellerAToken))
      .expect(200);
    const row = res.body.items.find((p) => p.id === String(product._id));
    expect(row.stock.locations).toEqual([]);
  });
});

// ── Location lifecycle ──────────────────────────────────────────────────────

describe("Stage 38 - location CRUD", () => {
  let firstLocationId;

  afterEach(async () => {
    // Reset the locations (and any materialised levels) between cases so each
    // one starts from the untracked state unless it says otherwise.
    await InventoryLocation.deleteMany({ sellerId: sellerAProfile._id });
    await Product.updateMany({ sellerId: sellerAProfile._id }, { $set: { "stock.locations": [] } });
  });

  it("creates the first location, makes it the default and materialises existing stock", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 7, reserved: 1 } });

    const res = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار مرکزی", code: "WH-1" })
      .expect(201);

    expect(res.body.location.isDefault).toBe(true);
    expect(res.body.location.code).toBe("WH-1");
    firstLocationId = res.body.location.id;

    const fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.locations).toHaveLength(1);
    expect(String(fresh.stock.locations[0].locationId)).toBe(firstLocationId);
    expect(fresh.stock.locations[0].onHand).toBe(7);
    expect(fresh.stock.locations[0].reserved).toBe(1);
    await assertInvariant(product._id);
  });

  it("lists only the caller's own locations", async () => {
    await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار الف", code: "A-1" })
      .expect(201);
    await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerBToken))
      .send({ name: "انبار ب", code: "B-1" })
      .expect(201);

    const res = await request(app)
      .get("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].code).toBe("A-1");
  });

  it("rejects an invalid code and an unknown kind", async () => {
    await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "بدون کد", code: "!!" })
      .expect(400);
    await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "نوع غلط", code: "OK-1", kind: "moon" })
      .expect(400);
  });

  it("rejects a duplicate code for the same seller with 409", async () => {
    await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار یک", code: "DUP-1" })
      .expect(201);
    const dup = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار دو", code: "DUP-1" })
      .expect(409);
    expect(dup.body.error.code).toBe("DUPLICATE_CODE");
  });

  it("caps the number of locations per seller", async () => {
    for (let i = 0; i < InventoryService.MAX_LOCATIONS; i += 1) {
      await request(app)
        .post("/api/seller/inventory/locations")
        .set("Authorization", AUTH(sellerAToken))
        .send({ name: `انبار ${i}`, code: `MAX-${i}` })
        .expect(201);
    }
    const res = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "یکی زیاد", code: "MAX-X" })
      .expect(400);
    expect(res.body.error.code).toBe("LOCATION_LIMIT");
  });

  it("answers 404 for another seller's location on update and delete", async () => {
    const created = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار الف", code: "OWN-1" })
      .expect(201);

    await request(app)
      .patch(`/api/seller/inventory/locations/${created.body.location.id}`)
      .set("Authorization", AUTH(sellerBToken))
      .send({ name: "دزدیده شده" })
      .expect(404);

    await request(app)
      .delete(`/api/seller/inventory/locations/${created.body.location.id}`)
      .set("Authorization", AUTH(sellerBToken))
      .expect(404);
  });

  it("denies a non-seller with 403", async () => {
    await request(app)
      .get("/api/seller/inventory/locations")
      .set("Authorization", AUTH(regularToken))
      .expect(403);
    await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(regularToken))
      .send({ name: "انبار", code: "X-1" })
      .expect(403);
  });

  it("writes an audit row for a created location", async () => {
    const created = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار حسابرسی", code: "AUD-1" })
      .expect(201);

    // Asserted in the database: AuditService swallows its own failures, so
    // "the function was called" proves nothing about whether the row exists.
    const row = await AuditLog.findOne({
      action: "INVENTORY_LOCATION_CREATED",
      "resource.type": "INVENTORY_LOCATION",
      "resource.id": new mongoose.Types.ObjectId(created.body.location.id),
    }).lean();
    expect(row).not.toBeNull();
    expect(String(row.userId)).toBe(String(sellerAUser._id));
  });

  it("folds a deleted location's units onto the survivor instead of losing them", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 0, reserved: 0 } });
    const a = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "الف", code: "FOLD-A" })
      .expect(201);
    const b = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار ب", code: "FOLD-B" })
      .expect(201);

    // Put 4 free at A and 6 free at B through the public adjustment surface.
    await request(app)
      .patch(`/api/seller/inventory/${product._id}`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ delta: 4, locationId: a.body.location.id })
      .expect(200);
    await request(app)
      .patch(`/api/seller/inventory/${product._id}`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ delta: 6, locationId: b.body.location.id })
      .expect(200);

    let fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.onHand).toBe(10);
    await assertInvariant(product._id);

    await request(app)
      .delete(`/api/seller/inventory/locations/${a.body.location.id}`)
      .set("Authorization", AUTH(sellerAToken))
      .expect(200);

    fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.onHand).toBe(10);
    expect(fresh.stock.locations).toHaveLength(1);
    expect(String(fresh.stock.locations[0].locationId)).toBe(b.body.location.id);
    expect(fresh.stock.locations[0].onHand).toBe(10);
    await assertInvariant(product._id);
  });
});

// ── Draining order, transfers, reconcile ────────────────────────────────────

describe("Stage 38 - draining, transfer and reconcile", () => {
  let locA;
  let locB;

  beforeAll(async () => {
    await InventoryLocation.deleteMany({ sellerId: sellerAProfile._id });
    const a = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار اصلی", code: "DR-A" })
      .expect(201);
    locA = a.body.location.id;
    const b = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار دوم", code: "DR-B", sortOrder: 2 })
      .expect(201);
    locB = b.body.location.id;
  });

  afterAll(async () => {
    await InventoryLocation.deleteMany({ sellerId: sellerAProfile._id });
  });

  it("draws a sale from the default location first, then spills", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 0, reserved: 0 } });
    // 2 at the default, 5 at the second.
    await InventoryService.adjustStock(sellerAProfile._id, product._id, 2, locA);
    await InventoryService.adjustStock(sellerAProfile._id, product._id, 5, locB);

    const order = await createOrder({
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      customer: { name: "خریدار انبار", phone: "09129990002", address: "تهران" },
      items: [{ productId: product._id, qty: 4 }],
    });

    const fresh = await Product.findById(product._id).lean();
    const byLoc = Object.fromEntries(fresh.stock.locations.map((l) => [String(l.locationId), l]));
    expect(byLoc[locA].onHand).toBe(0);
    expect(byLoc[locA].reserved).toBe(2);
    expect(byLoc[locB].onHand).toBe(3);
    expect(byLoc[locB].reserved).toBe(2);
    expect(fresh.stock.onHand).toBe(3);
    expect(fresh.stock.reserved).toBe(4);
    expect(String(order.items[0].stockLocationId)).toBe(locA);
    await assertInvariant(product._id);
  });

  it("returns cancelled units to the level they were taken from, not today's default", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 0, reserved: 0 } });
    await InventoryService.adjustStock(sellerAProfile._id, product._id, 2, locA);
    await InventoryService.adjustStock(sellerAProfile._id, product._id, 5, locB);

    const order = await createOrder({
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      customer: { name: "خریدار لغو", phone: "09129990003", address: "تهران" },
      items: [{ productId: product._id, qty: 4 }],
    });
    expect(String(order.items[0].stockLocationId)).toBe(locA);

    // The seller changes which location is primary AFTER the order was taken.
    await InventoryService.updateLocation(sellerAProfile._id, locB, { isDefault: true });

    await transitionOrder({
      orderId: order._id,
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      nextStatus: "cancelled",
    });

    const fresh = await Product.findById(product._id).lean();
    const byLoc = Object.fromEntries(fresh.stock.locations.map((l) => [String(l.locationId), l]));
    // Exactly the 2 the order took out of A came back to A.
    expect(byLoc[locA].onHand).toBe(2);
    expect(byLoc[locA].reserved).toBe(0);
    expect(byLoc[locB].onHand).toBe(5);
    expect(fresh.stock.onHand).toBe(7);
    expect(fresh.stock.reserved).toBe(0);
    await assertInvariant(product._id);

    // Restore A as the default so later cases are not surprised.
    await InventoryService.updateLocation(sellerAProfile._id, locA, { isDefault: true });
  });

  it("moves free units between locations without changing the aggregate", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 0, reserved: 0 } });
    await InventoryService.adjustStock(sellerAProfile._id, product._id, 8, locA);

    const res = await request(app)
      .post(`/api/seller/inventory/${product._id}/transfer`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ fromLocationId: locA, toLocationId: locB, qty: 3 })
      .expect(200);

    const levels = res.body.product.stock.locations;
    const byLoc = Object.fromEntries(levels.map((l) => [l.locationId, l]));
    expect(byLoc[locA].onHand).toBe(5);
    expect(byLoc[locB].onHand).toBe(3);
    expect(res.body.product.stock.onHand).toBe(8);
    await assertInvariant(product._id);

    const audit = await AuditLog.findOne({
      action: "INVENTORY_TRANSFERRED",
      "resource.id": new mongoose.Types.ObjectId(product._id),
    }).lean();
    expect(audit).not.toBeNull();
  });

  it("refuses a transfer larger than the source holds", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 2, reserved: 0 } });
    // Materialise onto A with 2 units.
    await InventoryService.reserveStock(product._id, sellerAProfile._id, 0, locA).catch(() => {});
    await Product.updateOne(
      { _id: product._id },
      {
        $set: {
          "stock.locations": [{ locationId: new mongoose.Types.ObjectId(locA), onHand: 2, reserved: 0 }],
        },
      },
    );

    const res = await request(app)
      .post(`/api/seller/inventory/${product._id}/transfer`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ fromLocationId: locA, toLocationId: locB, qty: 5 })
      .expect(400);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    await assertInvariant(product._id);
  });

  it("refuses a transfer to the same location", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser);
    await request(app)
      .post(`/api/seller/inventory/${product._id}/transfer`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ fromLocationId: locA, toLocationId: locA, qty: 1 })
      .expect(400);
  });

  it("answers 404 when either end of a transfer is another seller's location", async () => {
    const foreign = await InventoryLocation.create({
      sellerId: sellerBProfile._id,
      name: "انبار بیگانه",
      code: "FGN-1",
    });
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 5, reserved: 0 } });
    await Product.updateOne(
      { _id: product._id },
      { $set: { "stock.locations": [{ locationId: new mongoose.Types.ObjectId(locA), onHand: 5, reserved: 0 }] } },
    );

    await request(app)
      .post(`/api/seller/inventory/${product._id}/transfer`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ fromLocationId: locA, toLocationId: String(foreign._id), qty: 1 })
      .expect(404);

    // Nothing leaked into the foreign location.
    const fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.locations).toHaveLength(1);
  });

  it("reconciles a physical count, keeping free = counted - reserved", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 0, reserved: 0 } });
    await InventoryService.adjustStock(sellerAProfile._id, product._id, 10, locA);
    // Commit 2 so the location holds 8 free + 2 committed = 10 physical.
    await InventoryService.reserveStock(product._id, sellerAProfile._id, 2, locA);

    const res = await request(app)
      .post(`/api/seller/inventory/${product._id}/reconcile`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ locationId: locA, counted: 7, reason: "شمارش دورهای" })
      .expect(200);

    const level = res.body.product.stock.locations.find((l) => l.locationId === locA);
    expect(level.reserved).toBe(2);
    expect(level.onHand).toBe(5);
    expect(res.body.product.stock.onHand).toBe(5);
    expect(res.body.product.stock.reserved).toBe(2);
    await assertInvariant(product._id);

    // The count is recorded in the ledger.
    const ledger = await StockAdjustment.findOne({ productId: product._id, type: "count" }).lean();
    expect(ledger).not.toBeNull();
    expect(ledger.after.onHand).toBe(5);

    const audit = await AuditLog.findOne({
      action: "INVENTORY_RECONCILED",
      "resource.id": new mongoose.Types.ObjectId(product._id),
    }).lean();
    expect(audit).not.toBeNull();
    expect(audit.metadata.locationId).toBe(locA);
  });

  it("rejects a reconcile count that is not a non-negative integer", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser);
    await request(app)
      .post(`/api/seller/inventory/${product._id}/reconcile`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ locationId: locA, counted: -1 })
      .expect(400);
    await request(app)
      .post(`/api/seller/inventory/${product._id}/reconcile`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ locationId: locA, counted: 1.5 })
      .expect(400);
  });

  it("reports per-location levels with names on the product levels endpoint", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 0, reserved: 0 } });
    await InventoryService.adjustStock(sellerAProfile._id, product._id, 4, locB);

    const res = await request(app)
      .get(`/api/seller/inventory/${product._id}/levels`)
      .set("Authorization", AUTH(sellerAToken))
      .expect(200);

    expect(res.body.stock.levels).toHaveLength(1);
    expect(res.body.stock.levels[0].name).toBe("انبار دوم");
    expect(res.body.stock.levelsOnHand).toBe(4);
    expect(res.body.locations.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Location-aware adjustStock ──────────────────────────────────────────────

describe("Stage 38 - location-aware stock adjustment", () => {
  let loc;

  beforeAll(async () => {
    await InventoryLocation.deleteMany({ sellerId: sellerAProfile._id });
    const created = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار تعدیل", code: "ADJ-1" })
      .expect(201);
    loc = created.body.location.id;
  });

  afterAll(async () => {
    await InventoryLocation.deleteMany({ sellerId: sellerAProfile._id });
  });

  it("adds and removes units on the named level and keeps the aggregate equal to the sum", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 0, reserved: 0 } });

    await request(app)
      .patch(`/api/seller/inventory/${product._id}`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ delta: 9, locationId: loc })
      .expect(200);
    await request(app)
      .patch(`/api/seller/inventory/${product._id}`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ delta: -4, locationId: loc })
      .expect(200);

    const fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.onHand).toBe(5);
    expect(fresh.stock.locations[0].onHand).toBe(5);
    await assertInvariant(product._id);
  });

  it("refuses to remove more than the named level holds even when the aggregate is large enough", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 0, reserved: 0 } });
    const second = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "انبار دوم تعدیل", code: "ADJ-2" })
      .expect(201);

    await request(app)
      .patch(`/api/seller/inventory/${product._id}`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ delta: 10, locationId: loc })
      .expect(200);

    // The aggregate holds 10, but the second location holds none.
    const res = await request(app)
      .patch(`/api/seller/inventory/${product._id}`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ delta: -3, locationId: second.body.location.id })
      .expect(400);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    await assertInvariant(product._id);

    await InventoryService.deleteLocation(sellerAProfile._id, second.body.location.id);
  });

  it("answers 404 for a location belonging to another seller", async () => {
    const foreign = await InventoryLocation.create({
      sellerId: sellerBProfile._id,
      name: "انبار بیگانه تعدیل",
      code: "FGN-2",
    });
    const product = await makeProduct(sellerAProfile, sellerAUser);

    await request(app)
      .patch(`/api/seller/inventory/${product._id}`)
      .set("Authorization", AUTH(sellerAToken))
      .send({ delta: 5, locationId: String(foreign._id) })
      .expect(404);

    const fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.onHand).toBe(10);
    expect(fresh.stock.locations || []).toEqual([]);
  });
});

// ── Full order lifecycle across locations ───────────────────────────────────

describe("Stage 38 - order lifecycle keeps the breakdown exact", () => {
  let loc1;
  let loc2;

  beforeAll(async () => {
    await InventoryLocation.deleteMany({ sellerId: sellerAProfile._id });
    const a = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "چرخه یک", code: "LC-1" })
      .expect(201);
    loc1 = a.body.location.id;
    const b = await request(app)
      .post("/api/seller/inventory/locations")
      .set("Authorization", AUTH(sellerAToken))
      .send({ name: "چرخه دو", code: "LC-2", sortOrder: 2 })
      .expect(201);
    loc2 = b.body.location.id;
  });

  afterAll(async () => {
    await InventoryLocation.deleteMany({ sellerId: sellerAProfile._id });
  });

  it("reserve → ship → return leaves every unit accounted for", async () => {
    const product = await makeProduct(sellerAProfile, sellerAUser, { stock: { onHand: 0, reserved: 0 } });
    await InventoryService.adjustStock(sellerAProfile._id, product._id, 6, loc1);
    await InventoryService.adjustStock(sellerAProfile._id, product._id, 4, loc2);

    const order = await createOrder({
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      customer: { name: "خریدار چرخه", phone: "09129990004", address: "تهران، خیابان دوم" },
      items: [{ productId: product._id, qty: 3 }],
    });
    expect(String(order.items[0].stockLocationId)).toBe(loc1);

    await transitionOrder({
      orderId: order._id,
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      nextStatus: "confirmed",
    });
    await transitionOrder({
      orderId: order._id,
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      nextStatus: "processing",
    });
    await transitionOrder({
      orderId: order._id,
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      nextStatus: "shipped",
    });

    let fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.onHand).toBe(7);
    expect(fresh.stock.reserved).toBe(0);
    await assertInvariant(product._id);

    await transitionOrder({
      orderId: order._id,
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      nextStatus: "delivered",
    });
    await transitionOrder({
      orderId: order._id,
      sellerId: sellerAProfile._id,
      sellerUserId: sellerAUser._id,
      nextStatus: "returned",
    });

    fresh = await Product.findById(product._id).lean();
    expect(fresh.stock.onHand).toBe(10);
    expect(fresh.stock.reserved).toBe(0);
    await assertInvariant(product._id);
  });
});
