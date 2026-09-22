const mongoose = require("mongoose");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const {
  createBuyerOrder,
  submitPaymentResult,
  listBuyerOrders,
  getBuyerOrder,
  PAYMENT_PROVIDER,
} = require("../services/StorefrontOrderService");

/**
 * Buyer checkout + simulated-payment unit tests. The HTTP contract lives in
 * buyer-order.test.js; here we pin the business rules of the service.
 */

let viewerUserId;

beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  viewerUserId = new mongoose.Types.ObjectId();
});

async function makeUser(over = {}) {
  return User.create({
    name: "کاربر تستی",
    phone: `09${String(Math.floor(100000000 + Math.random() * 899999999))}`,
    handle: `bo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    ...over,
  });
}

async function makeSeller(over = {}) {
  const user = await makeUser({ role: "seller" });
  return SellerProfile.create({
    userId: user._id,
    storeName: `فروشگاه خرید ${Date.now()}`,
    status: "active",
    settings: {
      storefrontPublished: true,
      notificationEmail: true,
      notificationSms: false,
      defaultPayoutMethod: "bank_transfer",
    },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
    ...over,
  });
}

async function makeProduct(profile, over = {}) {
  return Product.create({
    sellerId: profile._id,
    sellerUserId: profile.userId,
    title: "ظرف سفالی",
    price: 200000,
    category: "pottery",
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
    ...over,
  });
}

const CUSTOMER = { name: "خریدار تستی", phone: "09123456789" };

async function cleanAll() {
  await Order.deleteMany({});
  await Product.deleteMany({});
  await User.deleteMany({ handle: /^bo_/ });
  await SellerProfile.deleteMany({});
  await AuditLog.deleteMany({ action: /ORDER_CREATED|PAYMENT_RECEIVED|PAYMENT_FAILED/ });
}

beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await mongoose.connection.close();
});

function objectIdHex() {
  return new mongoose.Types.ObjectId().toHexString();
}

describe("Order model buyer fields", () => {
  it("defaults origin to seller and buyerUserId to null for existing callers", async () => {
    const order = await Order.create({
      sellerId: new mongoose.Types.ObjectId(),
      sellerUserId: new mongoose.Types.ObjectId(),
      orderNumber: 1,
      customer: CUSTOMER,
      items: [{ productId: new mongoose.Types.ObjectId(), title: "قلم", price: 1000, qty: 1 }],
      subtotal: 1000,
      total: 1000,
    });
    expect(order.origin).toBe("seller");
    expect(order.buyerUserId).toBeNull();
  });
});

describe("createBuyerOrder", () => {
  it("creates a pending unpaid storefront order and reserves stock atomically", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile, { price: 500000 });

    const { order, paymentIntent } = await createBuyerOrder({
      slug: profile.slug,
      buyerUserId: viewerUserId,
      customer: CUSTOMER,
      items: [{ productId: String(product._id), qty: 2 }],
    });

    expect(order.origin).toBe("storefront");
    expect(String(order.buyerUserId)).toBe(String(viewerUserId));
    expect(order.status).toBe("pending");
    expect(order.payment.status).toBe("unpaid");
    expect(order.payment.provider).toBe(PAYMENT_PROVIDER);
    expect(String(order.payment.refId)).toBe(String(order._id));
    expect(order.total).toBe(1000000);
    expect(order.subtotal).toBe(1000000);

    const after = await Product.findById(product._id);
    expect(after.stock.onHand).toBe(8);
    expect(after.stock.reserved).toBe(2);

    expect(String(paymentIntent.refId)).toBe(String(order._id));
    expect(paymentIntent.amount).toBe(1000000);
    expect(paymentIntent.provider).toBe("mock");
  });

  it("uses an explicit payment method when provided", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);

    const { order } = await createBuyerOrder({
      slug: profile.slug,
      buyerUserId: viewerUserId,
      customer: CUSTOMER,
      items: [{ productId: String(product._id), qty: 1 }],
      paymentMethod: "wallet",
    });

    expect(order.payment.method).toBe("wallet");
  });

  it("rejects an unpublished storefront", async () => {
    const profile = await makeSeller({ settings: {
      storefrontPublished: false,
      notificationEmail: true,
      notificationSms: false,
      defaultPayoutMethod: "bank_transfer",
    } });
    await expect(
      createBuyerOrder({
        slug: profile.slug,
        buyerUserId: viewerUserId,
        customer: CUSTOMER,
        items: [],
      }),
    ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" });
  });

  it("rejects an unknown slug", async () => {
    await expect(
      createBuyerOrder({
        slug: "no-such-store",
        buyerUserId: viewerUserId,
        customer: CUSTOMER,
        items: [],
      }),
    ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" });
  });

  it("rejects a suspended storefront without leaking it", async () => {
    const profile = await makeSeller({ status: "suspended" });
    await expect(
      createBuyerOrder({
        slug: profile.slug,
        buyerUserId: viewerUserId,
        customer: CUSTOMER,
        items: [],
      }),
    ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" });
  });

  it("blocks buying from your own store", async () => {
    const buyer = await makeUser();
    const profile = await SellerProfile.create({
      userId: buyer._id,
      storeName: "فروشگاه من",
      status: "active",
      settings: { storefrontPublished: true },
    });
    await expect(
      createBuyerOrder({
        slug: profile.slug,
        buyerUserId: buyer._id,
        customer: CUSTOMER,
        items: [],
      }),
    ).rejects.toMatchObject({ code: "SELF_PURCHASE" });
  });

  it("rejects a product that belongs to another store", async () => {
    const store = await makeSeller();
    const other = await makeSeller();
    const otherProduct = await makeProduct(other);

    await expect(
      createBuyerOrder({
        slug: store.slug,
        buyerUserId: viewerUserId,
        customer: CUSTOMER,
        items: [{ productId: String(otherProduct._id), qty: 1 }],
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_AVAILABLE" });
  });

  it("rejects a paused/draft product of the same store", async () => {
    const store = await makeSeller();
    const pausedProduct = await makeProduct(store, { status: "paused" });

    await expect(
      createBuyerOrder({
        slug: store.slug,
        buyerUserId: viewerUserId,
        customer: CUSTOMER,
        items: [{ productId: String(pausedProduct._id), qty: 1 }],
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_AVAILABLE" });
  });

  it("aborts with INSUFFICIENT_STOCK without creating an order", async () => {
    const store = await makeSeller();
    const product = await makeProduct(store, { stock: { onHand: 3, reserved: 0 } });

    await expect(
      createBuyerOrder({
        slug: store.slug,
        buyerUserId: viewerUserId,
        customer: CUSTOMER,
        items: [{ productId: String(product._id), qty: 5 }],
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(await Order.countDocuments({})).toBe(0);
    const after = await Product.findById(product._id);
    expect(after.stock.onHand).toBe(3);
  });

  it("rejects an empty items array", async () => {
    const profile = await makeSeller();
    await expect(
      createBuyerOrder({
        slug: profile.slug,
        buyerUserId: viewerUserId,
        customer: CUSTOMER,
        items: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("writes an ORDER_CREATED audit log for the storefront origin", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);

    await createBuyerOrder({
      slug: profile.slug,
      buyerUserId: viewerUserId,
      customer: CUSTOMER,
      items: [{ productId: String(product._id), qty: 1 }],
    });

    const audit = await AuditLog.findOne({ action: "ORDER_CREATED" }).lean();
    expect(audit).toBeTruthy();
    expect(audit.metadata.origin).toBe("storefront");
    expect(audit.metadata.total).toBe(200000);
  });
});

describe("submitPaymentResult", () => {
  async function makePaidOrder() {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    const { order } = await createBuyerOrder({
      slug: profile.slug,
      buyerUserId: viewerUserId,
      customer: CUSTOMER,
      items: [{ productId: String(product._id), qty: 1 }],
    });
    return { profile, product, order };
  }

  it("marks the order paid on SUCCESS and records the audit once", async () => {
    const { order } = await makePaidOrder();

    const first = await submitPaymentResult({ refId: String(order._id), result: "SUCCESS" });
    expect(first.applied).toBe(true);
    expect(first.order.payment.status).toBe("paid");
    expect(first.order.payment.paidAt).toBeInstanceOf(Date);
    expect(first.order.status).toBe("pending");

    const second = await submitPaymentResult({ refId: String(order._id), result: "SUCCESS" });
    expect(second.applied).toBe(false);

    const audits = await AuditLog.find({ action: "PAYMENT_RECEIVED" }).lean();
    expect(audits).toHaveLength(1);
  });

  it("cancels the pending order and restores stock on FAIL", async () => {
    const { order, product } = await makePaidOrder();

    const result = await submitPaymentResult({ refId: String(order._id), result: "FAIL" });
    expect(result.applied).toBe(true);
    expect(result.order.status).toBe("cancelled");
    expect(result.order.payment.status).toBe("unpaid");

    const after = await Product.findById(product._id);
    expect(after.stock.onHand).toBe(10);
    expect(after.stock.reserved).toBe(0);

    expect(await AuditLog.countDocuments({ action: "PAYMENT_FAILED" })).toBe(1);
  });

  it("is idempotent: a second FAIL on a cancelled order no-ops", async () => {
    const { order } = await makePaidOrder();
    await submitPaymentResult({ refId: String(order._id), result: "FAIL" });
    const again = await submitPaymentResult({ refId: String(order._id), result: "FAIL" });
    expect(again.applied).toBe(false);
    expect(await AuditLog.countDocuments({ action: "PAYMENT_FAILED" })).toBe(1);
  });

  it("rejects an unknown refId", async () => {
    await expect(
      submitPaymentResult({ refId: objectIdHex(), result: "SUCCESS" }),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_FOUND" });
  });

  it("rejects a seller-entered order that never went through the checkout", async () => {
    const store = await makeSeller();
    const order = await Order.create({
      sellerId: store._id,
      sellerUserId: store.userId,
      buyerUserId: null,
      orderNumber: 5,
      customer: CUSTOMER,
      items: [{ productId: new mongoose.Types.ObjectId(), title: "قلم", price: 1000, qty: 1 }],
      subtotal: 1000,
      total: 1000,
      payment: { status: "unpaid" },
    });
    await expect(
      submitPaymentResult({ refId: String(order._id), result: "SUCCESS" }),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_FOUND" });
  });
});

describe("getBuyerOrder", () => {
  it("returns the buyer's own storefront order", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    const { order } = await createBuyerOrder({
      slug: profile.slug,
      buyerUserId: viewerUserId,
      customer: CUSTOMER,
      items: [{ productId: String(product._id), qty: 1 }],
    });

    const dto = await getBuyerOrder({ buyerUserId: String(viewerUserId), orderId: String(order._id) });
    expect(dto).not.toBeNull();
    expect(dto.origin).toBe("storefront");
    expect(dto.buyerUserId).toBe(String(viewerUserId));
    expect(dto.payment.status).toBe("unpaid");
  });

  it("returns null for another buyer's order", async () => {
    const profile = await makeSeller();
    const product = await makeProduct(profile);
    const { order } = await createBuyerOrder({
      slug: profile.slug,
      buyerUserId: viewerUserId,
      customer: CUSTOMER,
      items: [{ productId: String(product._id), qty: 1 }],
    });

    const other = new mongoose.Types.ObjectId();
    expect(await getBuyerOrder({ buyerUserId: String(other), orderId: String(order._id) })).toBeNull();
  });

  it("returns null for a seller-entered order", async () => {
    const store = await makeSeller();
    const order = await Order.create({
      sellerId: store._id,
      sellerUserId: store.userId,
      buyerUserId: null,
      orderNumber: 2,
      customer: CUSTOMER,
      items: [{ productId: new mongoose.Types.ObjectId(), title: "قلم", price: 1000, qty: 1 }],
      subtotal: 1000,
      total: 1000,
      payment: { status: "unpaid" },
    });
    expect(await getBuyerOrder({ buyerUserId: String(viewerUserId), orderId: String(order._id) })).toBeNull();
  });
});

describe("listBuyerOrders", () => {
  async function makeStoreOrderFor(buyer, storeCount = 1) {
    const orders = [];
    for (let i = 0; i < storeCount; i += 1) {
      const profile = await makeSeller();
      const product = await makeProduct(profile);
      const { order } = await createBuyerOrder({
        slug: profile.slug,
        buyerUserId: buyer,
        customer: CUSTOMER,
        items: [{ productId: String(product._id), qty: 1 }],
      });
      orders.push(order);
    }
    return orders;
  }

  it("returns only the caller's own storefront orders, newest first", async () => {
    await makeStoreOrderFor(viewerUserId, 3);

    const { items, total } = await listBuyerOrders({
      buyerUserId: String(viewerUserId),
      page: 1,
      limit: 10,
    });

    expect(total).toBe(3);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.buyerUserId).toBe(String(viewerUserId));
      expect(item.origin).toBe("storefront");
    }
    const createdAts = items.map((o) => new Date(o.createdAt).getTime());
    expect([...createdAts].sort((a, b) => b - a)).toEqual(createdAts);
  });

  it("never lists another buyer's orders", async () => {
    const otherBuyer = new mongoose.Types.ObjectId();
    await makeStoreOrderFor(viewerUserId, 2);
    await makeStoreOrderFor(otherBuyer, 2);

    const result = await listBuyerOrders({ buyerUserId: String(otherBuyer), page: 1, limit: 10 });
    expect(result.total).toBe(2);
    for (const item of result.items) {
      expect(item.buyerUserId).toBe(String(otherBuyer));
    }
  });

  it("never lists seller-entered (origin seller) orders", async () => {
    const store = await makeSeller();
    await Order.create({
      sellerId: store._id,
      sellerUserId: store.userId,
      buyerUserId: null,
      orderNumber: 11,
      customer: CUSTOMER,
      items: [{ productId: new mongoose.Types.ObjectId(), title: "قلم", price: 1000, qty: 1 }],
      subtotal: 1000,
      total: 1000,
      payment: { status: "unpaid" },
    });
    await makeStoreOrderFor(viewerUserId, 1);

    const result = await listBuyerOrders({ buyerUserId: String(viewerUserId), page: 1, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0].origin).toBe("storefront");
  });

  it("filters by status", async () => {
    const orders = await makeStoreOrderFor(viewerUserId, 3);
    const cancelled = orders[0];
    await submitPaymentResult({ refId: String(cancelled._id), result: "FAIL" });

    const pendingList = await listBuyerOrders({
      buyerUserId: String(viewerUserId),
      page: 1,
      limit: 10,
      status: "pending",
    });
    expect(pendingList.total).toBe(2);

    const cancelledList = await listBuyerOrders({
      buyerUserId: String(viewerUserId),
      page: 1,
      limit: 10,
      status: "cancelled",
    });
    expect(cancelledList.total).toBe(1);
    expect(cancelledList.items[0].id).toBe(String(cancelled._id));
  });

  it("paginates with limit/page", async () => {
    await makeStoreOrderFor(viewerUserId, 5);

    const firstPage = await listBuyerOrders({ buyerUserId: String(viewerUserId), page: 1, limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBe(5);

    const secondPage = await listBuyerOrders({ buyerUserId: String(viewerUserId), page: 2, limit: 2 });
    expect(secondPage.items).toHaveLength(2);

    const firstIds = new Set(firstPage.items.map((o) => o.id));
    for (const item of secondPage.items) {
      expect(firstIds.has(item.id)).toBe(false);
    }
  });

  it("rejects an invalid status filter", async () => {
    await expect(
      listBuyerOrders({ buyerUserId: String(viewerUserId), page: 1, limit: 10, status: "bogus" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a missing buyer", async () => {
    await expect(
      listBuyerOrders({ buyerUserId: "", page: 1, limit: 10 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});