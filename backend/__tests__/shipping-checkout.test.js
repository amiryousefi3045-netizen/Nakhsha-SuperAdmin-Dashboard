const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const ShippingProfile = require("../models/ShippingProfile");
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
  const otherStore = await SellerProfile.create({
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
