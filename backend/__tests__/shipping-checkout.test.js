const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const ShippingProfile = require("../models/ShippingProfile");
const AuditLog = require("../models/AuditLog");
const ShippingService = require("../services/ShippingService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 36 (P1-08) — shipping guard + server-priced checkout.
 *
 * Two things are being defended here, and they are the reason this file exists:
 *
 * 1. An order must not be able to become `shipped` with nowhere to go. Before
 *    the guard, that released the stock reservation, told the buyer the parcel
 *    was on its way, and then let the order reach `delivered` and earn real
 *    money in the payout ledger — an undeliverable order could be paid out.
 *
 * 2. The shipping price is decided by the SELLER'S rate card, on the server.
 *    The buyer sends a method key. These tests send hostile bodies (a method
 *    that does not exist, a key from another store, a fee smuggled in) and
 *    assert the money is unaffected.
 *
 * The pricing matrix itself is covered by shipping-unit.test.js.
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
const SLUG = "ship-store";
const PHONES = { owner: "09148010001", buyer: "09148010002", other: "09148010003" };

const ADDRESS = {
  receiverName: "مریم",
  receiverPhone: "09148010002",
  province: "تهران",
  city: "تهران",
  postalCode: "1658953711",
  line1: "خیابان آزادی، کوچه بهار، پلاک ۸",
  lat: 35.7448,
  lng: 51.4033,
};

let ownerToken;
let buyerToken;
let productId;
let storeId;
let otherStore;
let otherOwnerToken;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await ShippingProfile.deleteMany({});
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  _resetRateLimitStoreForTests();
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(
      process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test",
    );
  }
  app.locals.dbReady = true;
  await wipe();

  const owner = await User.create({
    name: "فروشندهٔ ارسال",
    phone: PHONES.owner,
    handle: "ship_owner",
    role: "seller",
    isVerified: true,
  });
  ownerToken = accessTokenOf(owner);

  const store = await SellerProfile.create({
    userId: owner._id,
    storeName: "فروشگاه ارسال نخشا",
    slug: SLUG,
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, notificationEmail: false, notificationSms: false },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  storeId = store._id;

  const product = await Product.create({
    sellerId: store._id,
    sellerUserId: owner._id,
    title: "گلدان سفالی",
    price: 500000,
    category: "pottery",
    stock: { onHand: 20, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  productId = String(product._id);

  // A second store, so cross-store method keys can be attempted.
  const otherOwner = await User.create({
    name: "فروشندهٔ دیگر",
    phone: PHONES.other,
    handle: "ship_other",
    role: "seller",
    isVerified: true,
  });
  otherOwnerToken = accessTokenOf(otherOwner);
  otherStore = await SellerProfile.create({
    userId: otherOwner._id,
    storeName: "فروشگاه دیگر",
    slug: "other-ship-store",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  await ShippingService.saveProfile({
    sellerId: otherStore._id,
    payload: {
      isEnabled: true,
      methods: [
        { key: "secret-cheap", title: "ارسال ارزان", kind: "delivery", pricing: { mode: "flat", flatFee: 1 } },
      ],
    },
  });
  const otherProduct = await Product.create({
    sellerId: otherStore._id,
    sellerUserId: otherOwner._id,
    title: "محصول دیگر",
    price: 100000,
    category: "pottery",
    stock: { onHand: 5, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  // Kept so the other store has real stock behind its cheap method; the tests
  // only need the method key, never this product id.
  void otherProduct;

  const buyer = await User.create({
    name: "خریدار ارسال",
    phone: PHONES.buyer,
    handle: "ship_buyer",
    role: "user",
    isVerified: true,
  });
  buyerToken = accessTokenOf(buyer);
});

beforeEach(async () => {
  await Order.deleteMany({});
  await AuditLog.deleteMany({ action: "ORDER_SHIPPING_COST_SET" });
  // Reset the weight too: a per-kilogram method priced in an earlier test would
  // otherwise leak into this one and hide the "weight not declared" case.
  await Product.updateMany({}, { $set: { "stock.onHand": 20, "stock.reserved": 0, "shipping.weight": 0 } });
  await ShippingProfile.deleteMany({ sellerId: storeId });
  _resetRateLimitStoreForTests();
});

afterAll(async () => {
  await wipe();
  await mongoose.connection.close();
});

/** A store with pickup, a flat-rate courier and a weight-based one. */
async function configureProfile(over = {}) {
  return ShippingService.saveProfile({
    sellerId: storeId,
    payload: {
      isEnabled: true,
      methods: [
        {
          key: "pickup",
          title: "دریافت حضوری",
          kind: "pickup",
          pricing: { mode: "free" },
          pickup: { address: "تهران، خیابان ولیعصر، پلاک ۱۲", city: "تهران", province: "تهران" },
        },
        {
          key: "post",
          title: "پست پیشتاز",
          kind: "delivery",
          carrier: "پست",
          pricing: { mode: "flat", flatFee: 45000 },
        },
        {
          key: "tipax",
          title: "تیپاکس",
          kind: "delivery",
          carrier: "تیپاکس",
          pricing: { mode: "weight", perKgFee: 30000 },
          zones: [
            {
              label: "تا ۲۰ کیلومتر",
              type: "radius",
              center: { lat: 35.6892, lng: 51.389 },
              radiusKm: 20,
              feeOverride: 0,
            },
            { label: "پیش‌فرض", type: "all" },
          ],
        },
      ],
      ...over,
    },
  });
}

function checkout(body = {}) {
  return request(app)
    .post(`/api/storefront/${SLUG}/checkout`)
    .set("Authorization", AUTH(buyerToken))
    .send({
      customer: { name: "مریم", phone: "09148010002" },
      items: [{ productId, qty: 1 }],
      paymentMethod: "card",
      ...body,
    });
}

describe("Phase 36: what a seller can actually save", () => {
  it("keeps a short postal prefix instead of discarding the zone", async () => {
    // A zone scoped to "16" is how an Iranian seller targets Isfahan. Routing
    // the prefix through the 10-digit postal validator silently emptied the
    // list, so the zone could never be saved and the seller lost the rate.
    await ShippingService.saveProfile({
      sellerId: storeId,
      payload: {
        isEnabled: true,
        methods: [
          {
            key: "post",
            title: "پست",
            kind: "delivery",
            pricing: { mode: "flat", flatFee: 40000 },
            zones: [{ label: "اصفهان", type: "postal_code", postalPrefixes: ["16", "۸۶"] }],
          },
        ],
      },
    });
    const saved = await ShippingProfile.findOne({ sellerId: storeId });
    expect(saved.methods[0].zones[0].postalPrefixes).toEqual(["16", "86"]);
  });

  it("quotes the prefix zone for an address that starts with it", async () => {
    await ShippingService.saveProfile({
      sellerId: storeId,
      payload: {
        isEnabled: true,
        methods: [
          {
            key: "post",
            title: "پست",
            kind: "delivery",
            pricing: { mode: "flat", flatFee: 40000 },
            zones: [
              { label: "اصفهان ارزان", type: "postal_code", postalPrefixes: ["81"], feeOverride: 20000 },
              { label: "پیش‌فرض", type: "all" },
            ],
          },
        ],
      },
    });
    const res = await checkout({
      shippingAddress: { ...ADDRESS, province: "اصفهان", city: "اصفهان", postalCode: "8165813478" },
      shippingMethodId: "post",
    });
    expect(res.status).toBe(200);
    expect(res.body.order.shipping.zoneLabel).toBe("اصفهان ارزان");
    expect(res.body.order.shippingFee).toBe(20000);
  });

  it("refuses to create a free order by simply omitting the method", async () => {
    // The seller configured a delivery rate, but it covers only Isfahan. A buyer
    // in Tehran who leaves `shippingMethodId` out must not get free delivery.
    await ShippingService.saveProfile({
      sellerId: storeId,
      payload: {
        isEnabled: true,
        methods: [
          {
            key: "post",
            title: "پست",
            kind: "delivery",
            pricing: { mode: "flat", flatFee: 40000 },
            zones: [{ label: "اصفهان", type: "province", provinces: ["اصفهان"] }],
          },
        ],
      },
    });
    const res = await checkout({ shippingAddress: ADDRESS });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SHIPPING_NOT_AVAILABLE");
  });

  it("still leaves an unconfigured store open to free shipping", async () => {
    // The counterpart to the guard above: "not configured" stays a decision of
    // record, so a seller who never set rates is not locked out of selling.
    const res = await checkout({ shippingAddress: ADDRESS });
    expect(res.status).toBe(200);
    expect(res.body.order.shippingFee).toBe(0);
    expect(res.body.order.shipping).toBeNull();
  });

  it("accepts a pickup order whose address object is blank", async () => {
    // The checkout form always posts the field; a pickup buyer fills in nothing.
    await configureProfile();
    const res = await checkout({ shippingAddress: {}, shippingMethodId: "pickup" });
    expect(res.status).toBe(200);
    expect(res.body.order.shippingFee).toBe(0);
    expect(res.body.order.shipping.kind).toBe("pickup");
    expect(res.body.order.shipping.pickup.address).toContain("ولیعصر");
  });
});

function setStatus(orderId, status) {
  return request(app)
    .patch(`/api/seller/orders/${orderId}/status`)
    .set("Authorization", AUTH(ownerToken))
    .send({ status });
}

/** Drive an order up to `processing`, ready to be shipped. */
async function advanceToProcessing() {
  const res = await checkout({ shippingAddress: ADDRESS, shippingMethodId: "post" });
  expect(res.status).toBe(200);
  const id = res.body.order.id;
  for (const status of ["confirmed", "processing"]) {
    const step = await setStatus(id, status);
    expect(step.status).toBe(200);
  }
  return id;
}

describe("Phase 36: the shipped guard", () => {
  it("refuses to ship an order that has no destination at all", async () => {
    // The regression this whole stage opened with: no address, no method, and
    // the order still went to `shipped`.
    const res = await checkout();
    expect(res.status).toBe(200);
    const order = res.body.order;
    expect(order.shipping).toBeNull();

    for (const status of ["confirmed", "processing"]) {
      expect((await setStatus(order.id, status)).status).toBe(200);
    }
    const ship = await setStatus(order.id, "shipped");
    expect(ship.status).toBe(409);
    expect(ship.body.error.code).toBe("SHIPPING_DESTINATION_REQUIRED");
  });

  it("leaves the stock reservation intact when the shipment is refused", async () => {
    // The refusal must happen BEFORE the release, or a refused shipment would
    // silently return the units to the shelf and let them be sold twice.
    const res = await checkout();
    const order = res.body.order;
    for (const status of ["confirmed", "processing"]) await setStatus(order.id, status);
    await setStatus(order.id, "shipped");

    const product = await Product.findById(productId);
    // The unit is still held: reserved 1, sellable pool 19, total still 20. The
    // refusal happened before the release, so nothing went back on the shelf.
    expect(product.stock.reserved).toBe(1);
    expect(product.stock.onHand).toBe(19);
    expect(product.stock.onHand + product.stock.reserved).toBe(20);

    const stored = await Order.findById(order.id);
    expect(stored.status).toBe("processing");
  });

  it("ships a delivery order that has a full structured destination", async () => {
    await configureProfile();
    const id = await advanceToProcessing();
    const ship = await setStatus(id, "shipped");
    expect(ship.status).toBe(200);

    const product = await Product.findById(productId);
    expect(product.stock.reserved).toBe(0);
  });

  it("ships a pickup order with no buyer address at all", async () => {
    // Pickup is first-class: it has no destination by definition, so requiring
    // one would make in-store collection impossible.
    await configureProfile();
    const res = await checkout({ shippingMethodId: "pickup" });
    expect(res.status).toBe(200);
    const id = res.body.order.id;
    for (const status of ["confirmed", "processing", "shipped"]) {
      const step = await setStatus(id, status);
      expect(step.status).toBe(200);
    }
  });

  it("refuses a pickup shipment when the store never recorded its own address", async () => {
    // A pickup method with no address is a promise the seller cannot keep, so
    // it is never offered and never shippable.
    await ShippingService.saveProfile({
      sellerId: storeId,
      payload: {
        isEnabled: true,
        methods: [{ key: "pickup", title: "دریافت حضوری", kind: "pickup", pricing: { mode: "free" } }],
      },
    });
    const quote = await checkout({ shippingMethodId: "pickup" });
    expect(quote.status).toBe(400);
    expect(quote.body.error.code).toBe("SHIPPING_METHOD_UNAVAILABLE");
  });
});

describe("Phase 36: the shipping price is the seller's, not the buyer's", () => {
  it("prices the order from the seller's rate card", async () => {
    await configureProfile();
    const res = await checkout({ shippingAddress: ADDRESS, shippingMethodId: "post" });
    expect(res.status).toBe(200);
    expect(res.body.order.shippingFee).toBe(45000);
    expect(res.body.order.total).toBe(500000 + 45000);
    expect(res.body.order.shipping.methodKey).toBe("post");
    expect(res.body.order.shipping.carrier).toBe("پست");
  });

  it("ignores a shippingFee smuggled into the checkout body", async () => {
    await configureProfile();
    const res = await checkout({
      shippingAddress: ADDRESS,
      shippingMethodId: "post",
      shippingFee: 0,
    });
    expect(res.status).toBe(200);
    expect(res.body.order.shippingFee).toBe(45000);
  });

  it("cannot borrow another store's cheap method key", async () => {
    // The other store has a 1-Rial method. Guessing its key here must change
    // nothing: the quote is built from THIS seller's profile only.
    await configureProfile();
    const res = await checkout({
      shippingAddress: ADDRESS,
      shippingMethodId: "secret-cheap",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SHIPPING_METHOD_UNAVAILABLE");
  });

  it("prices a weight-based method from the seller's own rate card", async () => {
    // 2.4 kg rounds up to 3 started kilograms × 30,000.
    await Product.updateOne({ _id: productId }, { $set: { "shipping.weight": 2.4 } });
    await configureProfile();
    const res = await checkout({ shippingAddress: ADDRESS, shippingMethodId: "tipax" });
    expect(res.status).toBe(200);
    expect(res.body.order.shipping.zoneLabel).toBe("تا ۲۰ کیلومتر");
    // The address is ~7 km from the zone centre, inside the 20 km radius, whose
    // override makes it free.
    expect(res.body.order.shippingFee).toBe(0);
  });

  it("hides a per-kilogram method when no product declares a weight", async () => {
    // The revenue hole this prevents: 0 kg × per-kg fee = free shipping the
    // seller never agreed to. The method is hidden with a reason instead.
    await configureProfile();
    const res = await checkout({ shippingAddress: ADDRESS, shippingMethodId: "tipax" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SHIPPING_METHOD_UNAVAILABLE");
  });

  it("charges the base price outside the radius zone", async () => {
    await Product.updateOne({ _id: productId }, { $set: { "shipping.weight": 2.4 } });
    await configureProfile();
    const far = { ...ADDRESS, province: "خراسان رضوی", city: "مشهد", postalCode: "9188765431", lat: 36.2605, lng: 59.6168 };
    const res = await checkout({ shippingAddress: far, shippingMethodId: "tipax" });
    expect(res.status).toBe(200);
    expect(res.body.order.shipping.zoneLabel).toBe("پیش‌فرض");
    // Catch-all zone has no override → back to the method's own per-kg price.
    expect(res.body.order.shippingFee).toBe(90000);
  });

  it("applies a free-shipping threshold from the seller's profile", async () => {
    await ShippingService.saveProfile({
      sellerId: storeId,
      payload: {
        isEnabled: true,
        freeShippingThreshold: 400000,
        methods: [
          { key: "post", title: "پست", kind: "delivery", pricing: { mode: "flat", flatFee: 45000 } },
        ],
      },
    });
    const res = await checkout({ shippingAddress: ADDRESS, shippingMethodId: "post" });
    expect(res.status).toBe(200);
    expect(res.body.order.shippingFee).toBe(0);
    expect(res.body.order.total).toBe(500000);
  });

  it("leaves an unconfigured store open and free, with a warning", async () => {
    // Decision of record: no profile must not close the store.
    const res = await checkout({ shippingAddress: ADDRESS });
    expect(res.status).toBe(200);
    expect(res.body.order.shippingFee).toBe(0);
    expect(res.body.order.shipping).toBeNull();
  });

  it("snapshots the quote so a later rate change cannot rewrite the order", async () => {
    await configureProfile();
    const res = await checkout({ shippingAddress: ADDRESS, shippingMethodId: "post" });
    const orderId = res.body.order.id;

    // The seller re-prices pickup/delivery right after the sale.
    await ShippingService.saveProfile({
      sellerId: storeId,
      payload: {
        isEnabled: true,
        methods: [
          { key: "post", title: "پست پیشتاز", kind: "delivery", pricing: { mode: "flat", flatFee: 999000 } },
        ],
      },
    });

    const stored = await Order.findById(orderId);
    expect(stored.shippingFee).toBe(45000);
    expect(stored.shipping.fee).toBe(45000);
    expect(stored.shipping.methodTitle).toBe("پست پیشتاز");
  });
});

describe("Phase 36: address validation at checkout", () => {
  it("rejects an unknown province rather than storing a typo", async () => {
    await configureProfile();
    const res = await checkout({
      shippingAddress: { ...ADDRESS, province: "استان ناموجود" },
      shippingMethodId: "post",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_SHIPPING_ADDRESS");
  });

  it("rejects a malformed postal code", async () => {
    await configureProfile();
    const res = await checkout({
      shippingAddress: { ...ADDRESS, postalCode: "123" },
      shippingMethodId: "post",
    });
    expect(res.status).toBe(400);
  });

  it("requires a street line", async () => {
    await configureProfile();
    const res = await checkout({
      shippingAddress: { ...ADDRESS, line1: "" },
      shippingMethodId: "post",
    });
    expect(res.status).toBe(400);
  });

  it("refuses a delivery method for a destination it does not cover", async () => {
    await ShippingService.saveProfile({
      sellerId: storeId,
      payload: {
        isEnabled: true,
        methods: [
          {
            key: "mashhad",
            title: "ارسال مشهد",
            kind: "delivery",
            pricing: { mode: "flat", flatFee: 20000 },
            zones: [
              { label: "مشهد", type: "province", provinces: ["خراسان رضوی"] },
            ],
          },
        ],
      },
    });
    const res = await checkout({ shippingAddress: ADDRESS, shippingMethodId: "mashhad" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SHIPPING_METHOD_UNAVAILABLE");
  });
});

describe("Phase 36: the buyer's receipt", () => {
  it("shows the delivery detail but never the seller's cost", async () => {
    await configureProfile();
    const res = await checkout({ shippingAddress: ADDRESS, shippingMethodId: "post" });
    const orderId = res.body.order.id;

    // Give the shipment a real courier cost, as the seller would.
    await Order.updateOne(
      { _id: orderId },
      { $set: { "shipping.cost": 38000 } },
    );

    const receipt = await request(app)
      .get(`/api/storefront/orders/${orderId}`)
      .set("Authorization", AUTH(buyerToken));
    expect(receipt.status).toBe(200);
    const shipping = receipt.body.order.shipping;
    expect(shipping.methodKey).toBe("post");
    expect(shipping.fee).toBe(45000);
    expect(shipping.address.province).toBe("تهران");
    // The seller's margin is not the buyer's business.
    expect(shipping.cost).toBeUndefined();
    expect(JSON.stringify(receipt.body)).not.toContain("38000");
  });

  it("carries the pickup address so the buyer knows where to come", async () => {
    await configureProfile();
    const res = await checkout({ shippingMethodId: "pickup" });
    const orderId = res.body.order.id;
    const receipt = await request(app)
      .get(`/api/storefront/orders/${orderId}`)
      .set("Authorization", AUTH(buyerToken));
    expect(receipt.status).toBe(200);
    expect(receipt.body.order.shipping.kind).toBe("pickup");
    expect(receipt.body.order.shipping.pickup.address).toContain("ولیعصر");
    expect(receipt.body.order.shippingFee).toBe(0);
  });
});

describe("Phase 36: the buyer can see the cost before committing", () => {
  function quote(body) {
    return request(app)
      .post(`/api/storefront/${SLUG}/shipping/quote`)
      .set("Authorization", AUTH(buyerToken))
      .send(body);
  }

  it("prices the basket without creating an order or touching stock", async () => {
    await configureProfile();
    const before = await Product.findById(productId).select("stock").lean();
    const res = await quote({ items: [{ productId, qty: 1 }], shippingAddress: ADDRESS });
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    const post = res.body.methods.find((m) => m.key === "post");
    expect(post.fee).toBe(45000);
    // A preview is a read. No order, and the basket is exactly as it was.
    expect(await Order.countDocuments({})).toBe(0);
    const after = await Product.findById(productId).select("stock").lean();
    expect(after.stock.onHand).toBe(before.stock.onHand);
    expect(after.stock.reserved).toBe(0);
  });

  it("quotes the same number the checkout then charges", async () => {
    // The preview is only worth having if it cannot disagree with the real thing.
    await configureProfile();
    const preview = await quote({ items: [{ productId, qty: 1 }], shippingAddress: ADDRESS });
    const previewFee = preview.body.methods.find((m) => m.key === "post").fee;
    const order = await checkout({ shippingAddress: ADDRESS, shippingMethodId: "post" });
    expect(order.status).toBe(200);
    expect(order.body.order.shippingFee).toBe(previewFee);
  });

  it("prices a per-kilogram method from the basket it is given", async () => {
    await Product.updateOne({ _id: productId }, { $set: { "shipping.weight": 2.4 } });
    await configureProfile();
    const res = await quote({ items: [{ productId, qty: 2 }], shippingAddress: ADDRESS });
    // 2 × 2.4 kg = 4.8 → 5 started kg, inside the free radius override.
    expect(res.status).toBe(200);
    const tipax = res.body.methods.find((m) => m.key === "tipax");
    expect(tipax.fee).toBe(0);
  });

  it("hides a per-kilogram method when the basket declares no weight", async () => {
    await configureProfile();
    const res = await quote({ items: [{ productId, qty: 1 }], shippingAddress: ADDRESS });
    expect(res.status).toBe(200);
    expect(res.body.methods.map((m) => m.key)).not.toContain("tipax");
    expect(res.body.unavailable.map((u) => u.key)).toContain("tipax");
  });

  it("offers pickup to a buyer who has not typed an address yet", async () => {
    await configureProfile();
    const res = await quote({ items: [{ productId, qty: 1 }], shippingAddress: {} });
    expect(res.status).toBe(200);
    expect(res.body.methods.map((m) => m.key)).toEqual(
      expect.arrayContaining(["pickup"]),
    );
  });

  it("rejects a malformed address instead of quoting a guess", async () => {
    await configureProfile();
    const res = await quote({
      items: [{ productId, qty: 1 }],
      shippingAddress: { ...ADDRESS, postalCode: "123" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_SHIPPING_ADDRESS");
  });

  it("does not reveal a store that is not published", async () => {
    const res = await request(app)
      .post("/api/storefront/no-such-store-here/shipping/quote")
      .set("Authorization", AUTH(buyerToken))
      .send({ items: [{ productId, qty: 1 }] });
    expect(res.status).toBe(404);
  });

  it("refuses another store's product in the basket", async () => {
    // The basket is priced against the seller's own catalogue, so a buyer
    // cannot price a parcel using somebody else's cheap product.
    await configureProfile();
    const foreign = await Product.findOne({ sellerId: otherStore._id });
    const res = await quote({ items: [{ productId: foreign._id, qty: 1 }], shippingAddress: ADDRESS });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PRODUCT_NOT_AVAILABLE");
  });
});

describe("Phase 36: the buyer form needs the server's province list", () => {
  it("serves the canonical provinces without authentication", async () => {
    const res = await request(app).get(`/api/storefront/${SLUG}/shipping/provinces`);
    expect(res.status).toBe(200);
    expect(res.body.provinces).toContain("تهران");
    expect(res.body.provinces).toHaveLength(31);
  });

  it("answers the same for an unknown slug, so it cannot probe for a store", async () => {
    // A free-text province box would let a buyer type something the server
    // rejects; a dropdown has to come from the same table the server validates
    // against, which is exactly why this list is served rather than shipped in
    // the frontend bundle.
    const res = await request(app).get("/api/storefront/no-such-store-here/shipping/provinces");
    expect(res.status).toBe(200);
    expect(res.body.provinces).toContain("تهران");
  });

  it("offers only provinces the shipping engine actually accepts", async () => {
    const res = await request(app).get(`/api/storefront/${SLUG}/shipping/provinces`);
    const { IRAN_PROVINCES } = require("../utils/iranGeo");
    expect(res.body.provinces).toEqual(IRAN_PROVINCES);
  });
});

describe("Phase 36: the seller records what the courier really cost", () => {
  const setCost = (orderId, body, token = ownerToken) =>
    request(app)
      .patch(`/api/seller/orders/${orderId}/shipping-cost`)
      .set("Authorization", AUTH(token))
      .send(body);

  async function shippedOrder() {
    await configureProfile();
    return advanceToProcessing();
  }

  it("records the cost and reports the margin it left", async () => {
    const orderId = await shippedOrder();
    expect((await setStatus(orderId, "shipped")).status).toBe(200);

    const res = await setCost(orderId, { cost: 38000 });
    expect(res.status).toBe(200);
    expect(res.body.shipping.cost).toBe(38000);
    // The buyer paid 45,000 for delivery; the courier took 38,000 of it.
    expect(res.body.shipping.fee).toBe(45000);
    expect(res.body.shipping.margin).toBe(7000);
  });

  it("shows the cost to the seller and never to the buyer", async () => {
    const orderId = await shippedOrder();
    await setStatus(orderId, "shipped");
    await setCost(orderId, { cost: 38000 });

    const sellerView = await request(app)
      .get(`/api/seller/orders/${orderId}`)
      .set("Authorization", AUTH(ownerToken));
    expect(sellerView.status).toBe(200);
    expect(sellerView.body.order.shipping.cost).toBe(38000);
    expect(sellerView.body.order.shipping.shippingMargin).toBe(7000);

    const buyerView = await request(app)
      .get(`/api/storefront/orders/${orderId}`)
      .set("Authorization", AUTH(buyerToken));
    expect(buyerView.status).toBe(200);
    expect(buyerView.body.order.shipping.cost).toBeUndefined();
    expect(JSON.stringify(buyerView.body)).not.toContain("38000");
  });

  it("lets the seller correct a typo while the parcel is in transit", async () => {
    const orderId = await shippedOrder();
    await setStatus(orderId, "shipped");
    await setCost(orderId, { cost: 3500 });
    const fixed = await setCost(orderId, { cost: 35000 });
    expect(fixed.status).toBe(200);
    expect(fixed.body.shipping.cost).toBe(35000);
  });

  it("locks the cost once the order is delivered", async () => {
    // A closed order's expense is history. Rewriting it after delivery is how a
    // margin report becomes fiction, so the window closes for good.
    const orderId = await shippedOrder();
    await setStatus(orderId, "shipped");
    await setCost(orderId, { cost: 38000 });
    expect((await setStatus(orderId, "delivered")).status).toBe(200);

    const res = await setCost(orderId, { cost: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SHIPPING_COST_LOCKED");

    const check = await request(app)
      .get(`/api/seller/orders/${orderId}`)
      .set("Authorization", AUTH(ownerToken));
    expect(check.body.order.shipping.cost).toBe(38000);
  });

  it("refuses a cost before the parcel is packed", async () => {
    // Settable from `processing` onward: an Iranian COD courier usually settles
    // after collection, so a seller cannot be asked to know the figure at
    // handover. Before that there is nothing to attach an expense to.
    await configureProfile();
    const res = await request(app)
      .post(`/api/storefront/${SLUG}/checkout`)
      .set("Authorization", AUTH(buyerToken))
      .send({
        customer: { name: "مریم", phone: "09148010002" },
        items: [{ productId, qty: 1 }],
        paymentMethod: "card",
        shippingAddress: ADDRESS,
        shippingMethodId: "post",
      });
    const orderId = res.body.order.id;
    await setStatus(orderId, "confirmed");

    const refused = await setCost(orderId, { cost: 38000 });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("SHIPPING_COST_LOCKED");
  });

  it("refuses a cost that is not a sane amount", async () => {
    const orderId = await shippedOrder();
    await setStatus(orderId, "shipped");
    for (const cost of [-1, 1.5, 999999999, "abc", null]) {
      const res = await setCost(orderId, { cost });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_SHIPPING_COST");
    }
  });

  it("refuses a courier cost on a pickup order", async () => {
    // Pickup has no courier. Accepting a number here would subtract an expense
    // from margin forever, for a parcel that was never dispatched.
    await configureProfile();
    const res = await request(app)
      .post(`/api/storefront/${SLUG}/checkout`)
      .set("Authorization", AUTH(buyerToken))
      .send({
        customer: { name: "مریم", phone: "09148010002" },
        items: [{ productId, qty: 1 }],
        paymentMethod: "card",
        shippingMethodId: "pickup",
      });
    const orderId = res.body.order.id;
    await setStatus(orderId, "confirmed");
    await setStatus(orderId, "processing");
    await setStatus(orderId, "shipped");

    const refused = await setCost(orderId, { cost: 20000 });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("SHIPPING_NOT_DISPATCHED");
  });

  it("leaves another store's order alone", async () => {
    const orderId = await shippedOrder();
    await setStatus(orderId, "shipped");
    const other = await request(app)
      .patch(`/api/seller/orders/${orderId}/shipping-cost`)
      .set("Authorization", AUTH(otherOwnerToken))
      .send({ cost: 1 });
    expect(other.status).toBe(404);
  });

  it("is not writable by an anonymous caller", async () => {
    const orderId = await shippedOrder();
    const res = await request(app)
      .patch(`/api/seller/orders/${orderId}/shipping-cost`)
      .send({ cost: 1 });
    expect(res.status).toBe(401);
  });

  it("leaves an audit trail of every change", async () => {
    const orderId = await shippedOrder();
    await setStatus(orderId, "shipped");
    await setCost(orderId, { cost: 3500 });
    await setCost(orderId, { cost: 35000 });

    const order = await Order.findById(orderId);
    // The order's own timeline is buyer-visible, so it records that a cost was
    // set but never how much — the seller's margin is not the buyer's business.
    const notes = order.timeline.filter((t) => t.reason.includes("هزینهٔ ارسال"));
    expect(notes).toHaveLength(2);
    expect(notes[0].reason).not.toContain("3500");
    expect(notes[0].reason).not.toContain("35000");
    expect(String(order.shipping.costRecordedBy)).toBeTruthy();
    expect(order.shipping.costRecordedAt).toBeTruthy();

    // The figures live in the seller-only audit log instead.
    const audit = await AuditLog.find({ action: "ORDER_SHIPPING_COST_SET" }).lean();
    expect(audit.length).toBeGreaterThanOrEqual(2);
    const amounts = audit.map((a) => a.metadata?.current);
    expect(amounts).toEqual(expect.arrayContaining([3500, 35000]));
  });
});

describe("Phase 36: the seller owns the rate card", () => {
  const RATE_CARD = {
    isEnabled: true,
    freeShippingThreshold: 5_000_000,
    methods: [
      {
        key: "post",
        title: "پست پیشتاز",
        kind: "delivery",
        carrier: "پست",
        pricing: { mode: "flat", flatFee: 45000 },
        zones: [{ label: "تهران", type: "province", provinces: ["تهران"] }],
      },
      { key: "pickup", title: "دریافت حضوری", kind: "pickup", pricing: { mode: "free" } },
    ],
  };

  const sellerApi = (method, path, token = ownerToken) =>
    request(app)[method](`/api/seller${path}`).set("Authorization", AUTH(token));

  it("reports an unconfigured store as a state, not a 404", async () => {
    const res = await sellerApi("get", "/shipping");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.methods).toEqual([]);
  });

  it("saves and reads back the seller's rate card", async () => {
    const saved = await sellerApi("put", "/shipping").send(RATE_CARD);
    expect(saved.status).toBe(200);
    expect(saved.body.methods).toHaveLength(2);

    const read = await sellerApi("get", "/shipping");
    expect(read.status).toBe(200);
    expect(read.body.configured).toBe(true);
    expect(read.body.freeShippingThreshold).toBe(5_000_000);
    expect(read.body.methods[0].key).toBe("post");
  });

  it("replaces the rate card instead of merging into it", async () => {
    await sellerApi("put", "/shipping").send(RATE_CARD);
    // A leftover method from a previous card must not survive the save, or the
    // seller keeps charging for a courier they retired.
    const second = await sellerApi("put", "/shipping").send({
      isEnabled: true,
      methods: [{ key: "tipax", title: "تیپاکس", kind: "delivery", pricing: { mode: "flat", flatFee: 70000 } }],
    });
    expect(second.status).toBe(200);
    const read = await sellerApi("get", "/shipping");
    expect(read.body.methods.map((m) => m.key)).toEqual(["tipax"]);
  });

  it("refuses a rate card with an invalid zone rather than saving half of it", async () => {
    const res = await sellerApi("put", "/shipping").send({
      isEnabled: true,
      methods: [
        {
          key: "post",
          title: "پست",
          kind: "delivery",
          pricing: { mode: "flat", flatFee: 45000 },
          zones: [{ label: "نامعلوم", type: "province", provinces: ["استان ناموجود"] }],
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(await ShippingProfile.countDocuments({ sellerId: storeId })).toBe(0);
  });

  it("refuses a duplicate method key", async () => {
    const res = await sellerApi("put", "/shipping").send({
      isEnabled: true,
      methods: [
        { key: "post", title: "یک", kind: "delivery", pricing: { mode: "flat", flatFee: 1000 } },
        { key: "post", title: "دو", kind: "delivery", pricing: { mode: "flat", flatFee: 2000 } },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("refuses a runaway rate card", async () => {
    const methods = Array.from({ length: 40 }, (_, i) => ({
      key: `m${i}`,
      title: `روش ${i}`,
      kind: "delivery",
      pricing: { mode: "flat", flatFee: 1000 },
    }));
    const res = await sellerApi("put", "/shipping").send({ isEnabled: true, methods });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOO_MANY_METHODS");
  });

  it("previews a zone against a real address before it goes live", async () => {
    await sellerApi("put", "/shipping").send(RATE_CARD);
    const hit = await sellerApi("post", "/shipping/preview").send({
      shippingAddress: { ...ADDRESS, province: "تهران" },
      subtotal: 100000,
    });
    expect(hit.status).toBe(200);
    const post = hit.body.methods.find((m) => m.key === "post");
    expect(post.zoneLabel).toBe("تهران");

    // The same card, a province it does not list: the seller sees the gap here
    // instead of a buyer discovering it at checkout.
    const miss = await sellerApi("post", "/shipping/preview").send({
      shippingAddress: { ...ADDRESS, province: "اصفهان", city: "اصفهان" },
      subtotal: 100000,
    });
    expect(miss.status).toBe(200);
    expect(miss.body.methods.map((m) => m.key)).not.toContain("post");
  });

  it("is not readable by a buyer who is not a seller", async () => {
    const res = await sellerApi("get", "/shipping", buyerToken);
    expect(res.status).toBe(403);
  });

  it("is not writable by an anonymous caller", async () => {
    const res = await request(app).put("/api/seller/shipping").send(RATE_CARD);
    expect(res.status).toBe(401);
  });
});
