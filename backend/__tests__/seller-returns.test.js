const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Product = require("../models/Product");
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const AuditLog = require("../models/AuditLog");
const OrderService = require("../services/OrderService");
const ReturnService = require("../services/ReturnService");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 33 — returns, RMA and refunds (P1-04).
 *
 * The gap this closes: an order could flip `delivered → returned` by fiat, but
 * nothing recorded *why*, who asked, what the seller decided, or how much
 * money went back — and a buyer could not open a return at all. These tests
 * pin the four things that must never be wrong: the window, the one-open-
 * request rule, the state machine, and the money.
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
  seller: "09146900061",
  manager: "09146900062",
  staff: "09146900063",
  seller2: "09146900064",
  buyer: "09146900065",
  buyer2: "09146900066",
};

let ownerToken;
let managerToken;
let staffToken;
let seller2Token;
let buyerToken;
let buyer2Token;
let profileId;
let profile2Id;
let sellerUserId;
let productId;
let buyerOrderId;
let foreignOrderId;
let buyerOrderNumber;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await TeamMember.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await ReturnRequest.deleteMany({});
  await AuditLog.deleteMany({});
}

async function makeProduct({ sellerId, sellerUserId, sku }) {
  return Product.create({
    sellerId,
    sellerUserId,
    title: `کالای ${sku}`,
    description: "",
    sku,
    price: 100000,
    currency: "IRR",
    category: "pottery",
    status: "active",
    stockPolicy: "tracked",
    // Every test files a fresh delivered order and each one permanently
    // consumes a unit, so the shelf has to outlast the whole suite.
    stock: { onHand: 500, reserved: 0, incoming: 0 },
    lowStockThreshold: 2,
  });
}

/** Orders are built through the real service so stock movements are genuine. */
async function makeOrder({
  sellerId,
  sellerUserId,
  advanceTo = [],
  buyerUserId = null,
  product = null,
}) {
  let order = await OrderService.createOrder({
    sellerId: String(sellerId),
    sellerUserId: String(sellerUserId),
    origin: buyerUserId ? "storefront" : "seller",
    buyerUserId,
    customer: { name: "مشتری تست", phone: "09121110000" },
    // Must be a product of THIS seller: the service refuses to order another
    // store's goods, which is exactly what a cross-store leak would need.
    items: [{ productId: String(product || productId), qty: 1 }],
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

/** Move the recorded delivery date back so the window can be tested. */
async function backdateDelivery(orderId, daysAgo) {
  const order = await Order.findById(orderId);
  for (let i = order.timeline.length - 1; i >= 0; i -= 1) {
    if (order.timeline[i].status === "delivered") {
      order.timeline[i].at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      break;
    }
  }
  await order.save();
  return order;
}

/** A fresh delivered storefront order for the primary buyer. */
async function newDeliveredBuyerOrder() {
  return makeOrder({
    sellerId: profileId,
    sellerUserId,
    buyerUserId: global.__returnsBuyerId,
    advanceTo: ["confirmed", "processing", "shipped", "delivered"],
  });
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
    name: "فروشنده مرجوعی",
    phone: PHONES.seller,
    handle: "rma_owner",
    role: "seller",
    isVerified: true,
  });
  sellerUserId = seller._id;
  profileId = (await SellerProfile.create({
    userId: seller._id,
    storeName: "فروشگاه مرجوعی",
    slug: "rma-shop",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  }))._id;
  ownerToken = accessTokenOf(seller);

  const manager = await User.create({
    name: "مدیر فروشگاه",
    phone: PHONES.manager,
    handle: "rma_manager",
    role: "seller",
    isVerified: true,
  });
  await TeamMember.create({
    sellerProfileId: profileId,
    userId: manager._id,
    name: manager.name,
    phone: manager.phone,
    role: "manager",
    status: "active",
  });
  managerToken = accessTokenOf(manager);

  const staff = await User.create({
    name: "عضو تیم",
    phone: PHONES.staff,
    handle: "rma_staff",
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

  const seller2 = await User.create({
    name: "فروشنده دیگر",
    phone: PHONES.seller2,
    handle: "rma_other",
    role: "seller",
    isVerified: true,
  });
  const profile2 = await SellerProfile.create({
    userId: seller2._id,
    storeName: "فروشگاه دیگر",
    slug: "rma-shop-2",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
  profile2Id = profile2._id;
  seller2Token = accessTokenOf(seller2);

  const buyer = await User.create({
    name: "خریدار تست",
    phone: PHONES.buyer,
    handle: "rma_buyer",
    role: "user",
    isVerified: true,
  });
  global.__returnsBuyerId = buyer._id;
  buyerToken = accessTokenOf(buyer);

  const buyer2 = await User.create({
    name: "خریدار دیگر",
    phone: PHONES.buyer2,
    handle: "rma_buyer2",
    role: "user",
    isVerified: true,
  });
  buyer2Token = accessTokenOf(buyer2);

  const product = await makeProduct({ sellerId: profileId, sellerUserId, sku: "RMA-1" });
  productId = product._id;

  const buyerOrder = await makeOrder({
    sellerId: profileId,
    sellerUserId,
    buyerUserId: buyer._id,
    advanceTo: ["confirmed", "processing", "shipped", "delivered"],
  });
  buyerOrderId = String(buyerOrder._id);
  buyerOrderNumber = buyerOrder.orderNumber;

  // A delivered order of another store: nothing about it may be reachable.
  const foreignProduct = await makeProduct({ sellerId: profile2Id, sellerUserId: seller2._id, sku: "RMA-2" });
  const foreignOrder = await makeOrder({
    sellerId: profile2Id,
    sellerUserId: seller2._id,
    product: foreignProduct._id,
    advanceTo: ["confirmed", "processing", "shipped", "delivered"],
  });
  foreignOrderId = String(foreignOrder._id);
  global.__returnsForeignProductId = String(foreignProduct._id);
});

afterAll(async () => {
  await wipe();
  delete global.__returnsBuyerId;
  delete global.__returnsForeignProductId;
  delete process.env.SUPER_ADMIN_PHONE;
});

describe("returns: buyer opens a request (P1-04)", () => {
  it("creates a request against a delivered storefront order with an RMA number", async () => {
    const order = await newDeliveredBuyerOrder();
    const res = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "کالا با مشخصات درج‌شده مطابقت ندارد" });

    expect(res.status).toBe(201);
    const ret = res.body.return;
    expect(ret.status).toBe("requested");
    expect(ret.rmaNumber).toEqual(expect.any(Number));
    expect(ret.orderNumber).toBe(order.orderNumber);
    expect(ret.reason).toContain("مطابقت");
    expect(ret.items).toHaveLength(1);
    expect(ret.items[0].qty).toBe(1);
    expect(ret.timeline[0].status).toBe("requested");
  });

  it("refuses a second open request on the same order", async () => {
    const order = await newDeliveredBuyerOrder();
    await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "موقع اولین دلیل مرجوعی" })
      .expect(201);

    const res = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "تلاش دوم برای همان سفارش" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RETURN_ALREADY_OPEN");
  });

  it("rejects a return on an order that is not delivered", async () => {
    const order = await makeOrder({
      sellerId: profileId,
      sellerUserId,
      buyerUserId: global.__returnsBuyerId,
      advanceTo: ["confirmed"],
    });
    const res = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "درخواست مرجوعی زودهنگام" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ORDER_NOT_RETURNABLE");
  });

  it("does not let a buyer touch another buyer's order", async () => {
    const res = await request(app)
      .post(`/api/storefront/orders/${buyerOrderId}/returns`)
      .set("Authorization", AUTH(buyer2Token))
      .send({ reason: "ادعای نادرست روی سفارش دیگری" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("closes the window after 7 days from delivery", async () => {
    const order = await newDeliveredBuyerOrder();
    await backdateDelivery(order._id, 8);

    const res = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "درخواست پس از پایان مهلت قانونی" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("RETURN_WINDOW_CLOSED");
  });

  it("still accepts a request on day 6 of the window", async () => {
    const order = await newDeliveredBuyerOrder();
    await backdateDelivery(order._id, 6);

    const res = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "درخواست در روز ششم مهلت" });

    expect(res.status).toBe(201);
  });

  it("requires a reason", async () => {
    const order = await newDeliveredBuyerOrder();
    const res = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "   " });

    expect(res.status).toBe(400);
  });

  it("lists only the buyer's own requests", async () => {
    await newDeliveredBuyerOrder();
    const mine = await request(app)
      .get("/api/storefront/returns")
      .set("Authorization", AUTH(buyerToken))
      .expect(200);
    const others = await request(app)
      .get("/api/storefront/returns")
      .set("Authorization", AUTH(buyer2Token))
      .expect(200);

    expect(mine.body.total).toBeGreaterThan(0);
    expect(others.body.total).toBe(0);
  });

  it("exposes the return affordance on the buyer's own receipt", async () => {
    const res = await request(app)
      .get(`/api/storefront/orders/${buyerOrderId}`)
      .set("Authorization", AUTH(buyerToken))
      .expect(200);

    expect(res.body.order.status).toBe("delivered");
    expect(res.body.returnEligible).toBe(true);
    expect(res.body.returnDeadline).toEqual(expect.any(String));
    expect(Array.isArray(res.body.returns)).toBe(true);
  });
});

describe("returns: seller adjudication (P1-04)", () => {
  async function freshRequest() {
    const order = await newDeliveredBuyerOrder();
    const res = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "کالای معیوب تحویل داده شده است" })
      .expect(201);
    return { order, ret: res.body.return };
  }

  it("shows the request in the seller queue and mints per-seller RMA numbers", async () => {
    const { order, ret } = await freshRequest();
    const res = await request(app)
      .get("/api/seller/returns")
      .set("Authorization", AUTH(ownerToken))
      .expect(200);

    const row = res.body.items.find((r) => r.id === ret.id);
    expect(row).toBeDefined();
    expect(row.rmaNumber).toBe(ret.rmaNumber);
    // The refund input is bounded by what was charged, which the row must
    // carry — the item lines alone would ignore a discount.
    expect(row.orderTotal).toBe(100000);
    expect(row.orderCurrency).toBe("IRR");
    expect(res.body.counts.requested).toBeGreaterThan(0);
    expect(order.orderNumber).toBe(ret.orderNumber);
    // Every RMA in the store is distinct.
    const numbers = res.body.items.map((r) => r.rmaNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("keeps another store's request invisible", async () => {
    const res = await request(app)
      .get("/api/seller/returns")
      .set("Authorization", AUTH(seller2Token))
      .expect(200);

    expect(res.body.total).toBe(0);
  });

  it("404s on a request id belonging to another store", async () => {
    const { ret } = await freshRequest();
    const res = await request(app)
      .get(`/api/seller/returns/${ret.id}`)
      .set("Authorization", AUTH(seller2Token))
      .expect(404);

    expect(res.body.error.code).toBe("RETURN_NOT_FOUND");
  });

  it("lets a manager approve", async () => {
    const { ret } = await freshRequest();
    const res = await request(app)
      .patch(`/api/seller/returns/${ret.id}/status`)
      .set("Authorization", AUTH(managerToken))
      .send({ status: "approved", note: "پذیرفته شد، کالا ارسال شود" })
      .expect(200);

    expect(res.body.return.status).toBe("approved");
    expect(res.body.return.resolutionNote).toContain("ارسال شود");
  });

  it("refuses a staff member deciding the claim", async () => {
    const { ret } = await freshRequest();
    const res = await request(app)
      .patch(`/api/seller/returns/${ret.id}/status`)
      .set("Authorization", AUTH(staffToken))
      .send({ status: "approved" });

    expect(res.status).toBe(403);
  });

  it("requires a justification when rejecting", async () => {
    const { ret } = await freshRequest();
    const bare = await request(app)
      .patch(`/api/seller/returns/${ret.id}/status`)
      .set("Authorization", AUTH(ownerToken))
      .send({ status: "rejected" });
    expect(bare.status).toBe(400);

    const withNote = await request(app)
      .patch(`/api/seller/returns/${ret.id}/status`)
      .set("Authorization", AUTH(ownerToken))
      .send({ status: "rejected", note: "خارج از مهلت و بدون ایراد کالا" })
      .expect(200);
    expect(withNote.body.return.status).toBe("rejected");
  });

  it("refuses to skip a step in the RMA machine", async () => {
    const { ret } = await freshRequest();
    // requested → received is not a legal jump; goods cannot be marked in
    // before the seller has agreed to take them back.
    const res = await request(app)
      .patch(`/api/seller/returns/${ret.id}/status`)
      .set("Authorization", AUTH(ownerToken))
      .send({ status: "received" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_RETURN_TRANSITION");
  });

  it("will not refund before the goods are received", async () => {
    const { ret } = await freshRequest();
    await request(app)
      .patch(`/api/seller/returns/${ret.id}/status`)
      .set("Authorization", AUTH(ownerToken))
      .send({ status: "approved" })
      .expect(200);

    const res = await request(app)
      .post(`/api/seller/returns/${ret.id}/refund`)
      .set("Authorization", AUTH(ownerToken))
      .send({ refundAmount: 100000 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_RETURN_TRANSITION");
  });

  it("reserves the refund itself for the account owner", async () => {
    const { ret } = await freshRequest();
    for (const status of ["approved", "received"]) {
      await request(app)
        .patch(`/api/seller/returns/${ret.id}/status`)
        .set("Authorization", AUTH(ownerToken))
        .send({ status })
        .expect(200);
    }

    const asManager = await request(app)
      .post(`/api/seller/returns/${ret.id}/refund`)
      .set("Authorization", AUTH(managerToken))
      .send({ refundAmount: 100000 });
    expect(asManager.status).toBe(403);

    const asStaff = await request(app)
      .post(`/api/seller/returns/${ret.id}/refund`)
      .set("Authorization", AUTH(staffToken))
      .send({ refundAmount: 100000 });
    expect(asStaff.status).toBe(403);
  });

  it("rejects a refund larger than the order total", async () => {
    const { ret } = await freshRequest();
    for (const status of ["approved", "received"]) {
      await request(app)
        .patch(`/api/seller/returns/${ret.id}/status`)
        .set("Authorization", AUTH(ownerToken))
        .send({ status })
        .expect(200);
    }

    const res = await request(app)
      .post(`/api/seller/returns/${ret.id}/refund`)
      .set("Authorization", AUTH(ownerToken))
      .send({ refundAmount: 999999999 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("REFUND_AMOUNT_INVALID");
  });

  it("rejects a non-integer or zero refund", async () => {
    const { ret } = await freshRequest();
    for (const status of ["approved", "received"]) {
      await request(app)
        .patch(`/api/seller/returns/${ret.id}/status`)
        .set("Authorization", AUTH(ownerToken))
        .send({ status })
        .expect(200);
    }

    for (const amount of [0, -5, 10.5]) {
      const res = await request(app)
        .post(`/api/seller/returns/${ret.id}/refund`)
        .set("Authorization", AUTH(ownerToken))
        .send({ refundAmount: amount });
      expect(res.status).toBe(400);
    }
  });
});

describe("returns: the money (P1-04)", () => {
  it("refunds, returns the order and restores stock in one audited step", async () => {
    const order = await newDeliveredBuyerOrder();
    const onHandBefore = (await Product.findById(productId)).stock.onHand;

    const created = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "مغایرت کالا با سفارش" })
      .expect(201);
    const retId = created.body.return.id;

    for (const status of ["approved", "received"]) {
      await request(app)
        .patch(`/api/seller/returns/${retId}/status`)
        .set("Authorization", AUTH(ownerToken))
        .send({ status, note: "مرحله " + status })
        .expect(200);
    }

    const res = await request(app)
      .post(`/api/seller/returns/${retId}/refund`)
      .set("Authorization", AUTH(ownerToken))
      .send({ refundAmount: 100000, note: "استرداد کامل مبلغ سفارش" })
      .expect(200);

    expect(res.body.return.status).toBe("refunded");
    expect(res.body.return.refundAmount).toBe(100000);
    expect(res.body.return.refundedAt).toEqual(expect.any(String));
    expect(res.body.order.status).toBe("returned");
    expect(res.body.order.payment.status).toBe("refunded");
    expect(res.body.order.payment.refundedAmount).toBe(100000);

    // The unit physically came back: onHand grows by the ordered qty.
    const product = await Product.findById(productId);
    expect(product.stock.onHand).toBe(onHandBefore + 1);

    // Money left the store, so the audit is HIGH and carries the amount.
    const audit = await AuditLog.findOne({ action: "REFUND_ISSUED", "metadata.orderId": String(order._id) });
    expect(audit).not.toBeNull();
    expect(audit.riskLevel).toBe("HIGH");
    expect(audit.metadata.amount).toBe(100000);
  });

  it("records a partial refund as a partial amount, not as the order total", async () => {
    const order = await newDeliveredBuyerOrder();
    const created = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "یک قلم از سفارش آسیب دیده بود" })
      .expect(201);
    const retId = created.body.return.id;

    for (const status of ["approved", "received"]) {
      await request(app)
        .patch(`/api/seller/returns/${retId}/status`)
        .set("Authorization", AUTH(ownerToken))
        .send({ status })
        .expect(200);
    }

    const res = await request(app)
      .post(`/api/seller/returns/${retId}/refund`)
      .set("Authorization", AUTH(ownerToken))
      .send({ refundAmount: 60000 })
      .expect(200);

    expect(res.body.return.refundAmount).toBe(60000);
    expect(res.body.order.payment.refundedAmount).toBe(60000);
    expect(res.body.order.payment.status).toBe("refunded");
  });

  it("frees the order for a new claim only after the refund closes it", async () => {
    const order = await newDeliveredBuyerOrder();
    const created = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "اولین ادعا" })
      .expect(201);
    const retId = created.body.return.id;

    expect((await ReturnRequest.findById(retId)).openKey).toBe(String(order._id));

    for (const status of ["approved", "received"]) {
      await request(app)
        .patch(`/api/seller/returns/${retId}/status`)
        .set("Authorization", AUTH(ownerToken))
        .send({ status })
        .expect(200);
    }
    await request(app)
      .post(`/api/seller/returns/${retId}/refund`)
      .set("Authorization", AUTH(ownerToken))
      .send({ refundAmount: 100000 })
      .expect(200);

    // Terminal: `openKey` released, so the index no longer counts this order.
    expect((await ReturnRequest.findById(retId)).openKey).toBeUndefined();

    // And the order itself is no longer returnable — it already went back.
    const again = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "ادعای دوم پس از تسویه" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("ORDER_NOT_RETURNABLE");
  });

  it("keeps a rejected claim out of the way of the order's money", async () => {
    const order = await newDeliveredBuyerOrder();
    const created = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "ادعای ناموجه" })
      .expect(201);
    const retId = created.body.return.id;

    await request(app)
      .patch(`/api/seller/returns/${retId}/status`)
      .set("Authorization", AUTH(ownerToken))
      .send({ status: "rejected", note: "ایرادی احراز نشد" })
      .expect(200);

    const reRequest = await request(app)
      .post(`/api/storefront/orders/${order._id}/returns`)
      .set("Authorization", AUTH(buyerToken))
      .send({ reason: "تلاش دوباره پس از رد" });
    expect(reRequest.status).toBe(201);

    const freshOrder = await Order.findById(order._id);
    expect(freshOrder.status).toBe("delivered");
    expect(freshOrder.payment.status).not.toBe("refunded");
  });
});

describe("returns: seller-filed requests (P1-04)", () => {
  it("files a walk-in return straight into approved", async () => {
    const order = await newDeliveredBuyerOrder();
    const res = await request(app)
      .post("/api/seller/returns")
      .set("Authorization", AUTH(ownerToken))
      .send({ orderId: String(order._id), reason: "مرجوعی حضوری در فروشگاه" })
      .expect(201);

    expect(res.body.return.status).toBe("approved");
    expect(res.body.return.buyerUserId).toBeNull();
    expect(res.body.return.resolutionNote).toBe("ثبت توسط فروشنده");

    const audit = await AuditLog.findOne({ action: "RETURN_FILED" });
    expect(audit).not.toBeNull();
    expect(audit.metadata.filedBy).toBe("seller");
  });

  it("will not file against another store's order", async () => {
    // Store 2 pointing at store 1's delivered order must be indistinguishable
    // from an order that does not exist.
    const res = await request(app)
      .post("/api/seller/returns")
      .set("Authorization", AUTH(seller2Token))
      .send({ orderId: buyerOrderId, reason: "سفارش فروشگاه دیگر" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("can file against its own order", async () => {
    const res = await request(app)
      .post("/api/seller/returns")
      .set("Authorization", AUTH(seller2Token))
      .send({ orderId: foreignOrderId, reason: "مرجوعی حضوری در فروشگاه خودمان" })
      .expect(201);

    expect(res.body.return.sellerId).toBe(String(profile2Id));
  });

  it("refuses a walk-in return for an order outside the window", async () => {
    const order = await newDeliveredBuyerOrder();
    await backdateDelivery(order._id, 30);

    const res = await request(app)
      .post("/api/seller/returns")
      .set("Authorization", AUTH(ownerToken))
      .send({ orderId: String(order._id), reason: "خیلی دیر" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("RETURN_WINDOW_CLOSED");
  });
});

describe("returns: service-level guards (P1-04)", () => {
  it("rejects an unknown order id for the buyer without leaking it", async () => {
    await expect(
      ReturnService.createReturnRequest({
        buyerUserId: global.__returnsBuyerId,
        orderId: "0123456789abcdef01234567",
        reason: "سفارش ناموجود",
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("treats a seller-entered order as having no claimable buyer", async () => {
    const order = await makeOrder({
      sellerId: profileId,
      sellerUserId,
      advanceTo: ["confirmed", "processing", "shipped", "delivered"],
    });
    await expect(
      ReturnService.createReturnRequest({
        buyerUserId: global.__returnsBuyerId,
        orderId: String(order._id),
        reason: "ادعای خریدار روی سفارش فروشنده",
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("exposes the window as a constant other code can cite", () => {
    expect(ReturnService.RETURN_WINDOW_DAYS).toBe(7);
  });

  it("keeps the primary buyer's delivered order number stable for the report", () => {
    expect(buyerOrderNumber).toEqual(expect.any(Number));
  });
});
