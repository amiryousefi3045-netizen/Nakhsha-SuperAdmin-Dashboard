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
const { buildInvoiceText, buildInvoiceHtml } = require("../services/email/invoiceHtml");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 23 — the storefront buyer gets an itemised invoice over email once the
 * (mock) payment SUCCESS callback runs. The invoice is a `reason: "invoice"`
 * email record riding the same atomic queue; HTML is rendered at delivery time
 * from the order snapshot, while the plain-text version lands in the record.
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
  owner: "09146000021",
  buyer: "09146000022",
};

const FINANCE_TERMS = { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 };
const STORE_SETTINGS = {
  storefrontPublished: true,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "bank_transfer",
};

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
    name: "مالک فاکتور",
    phone: PHONES.owner,
    handle: "invoice_owner",
    role: "seller",
    isVerified: true,
  });
  ownerToken = TOKEN_OF(owner);

  const store = await SellerProfile.create({
    userId: owner._id,
    storeName: "فروشگاه فاکتور",
    slug: "invoice-store",
    description: "فروشگاه تست فاکتور",
    status: "active",
    verification: { status: "verified" },
    settings: { ...STORE_SETTINGS },
    finance: { ...FINANCE_TERMS },
  });

  const product = await Product.create({
    sellerId: store._id,
    sellerUserId: owner._id,
    title: "سفال فاکتور",
    price: 120000,
    category: "pottery",
    stock: { onHand: 100, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  productId = String(product._id);

  const buyer = await User.create({
    name: "خریدار فاکتور",
    phone: PHONES.buyer,
    handle: "invoice_buyer",
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

async function checkout({ email = "buyer@example.com" } = {}) {
  const res = await request(app)
    .post("/api/storefront/invoice-store/checkout")
    .set("Authorization", AUTH(buyerToken))
    .send({
      customer: {
        name: "مشتری فاکتور",
        phone: "09123456766",
        email,
      },
      items: [{ productId, qty: 2 }],
      paymentMethod: "card",
    });
  expect(res.status).toBe(200);
  return res.body.order;
}

async function payCallback(refId, result, reason = "") {
  return request(app)
    .post(`/api/storefront/payments/${refId}/callback`)
    .send({ result, reason });
}

describe("invoice builders", () => {
  it("builds a text invoice with Persian numbers and totals", () => {
    const order = {
      orderNumber: 7,
      sellerStoreName: "فروشگاه تست",
      customer: { name: "مشتری" },
      status: "pending",
      payment: { status: "paid" },
      items: [
        { title: "سفال", price: 120000, qty: 2 },
        { title: "لیوان", price: 30000, qty: 1 },
      ],
      subtotal: 270000,
      shippingFee: 25000,
      discount: 0,
      total: 295000,
    };
    const text = buildInvoiceText(order);
    expect(text).toContain("فاکتور سفارش");
    expect(text).toContain("فروشگاه تست");
    expect(text).toContain("سفال");
    expect(text).toContain("مبلغ نهایی");
    expect(text).toContain("۲۹۵٬۰۰۰");
  });

  it("builds RTL HTML with item rows and totals", () => {
    const order = {
      orderNumber: 7,
      sellerStoreName: "فروشگاه تست",
      customer: { name: "مشتری" },
      status: "pending",
      payment: { status: "paid" },
      items: [{ title: "سفال", price: 120000, qty: 1 }],
      subtotal: 120000,
      shippingFee: 0,
      discount: 0,
      total: 120000,
    };
    const html = buildInvoiceHtml(order);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("فاکتور سفارش نخشا");
    expect(html).toContain(order.sellerStoreName);
    expect(html).toContain("سفال");
    expect(html).toContain("مبلغ نهایی");
  });
});

describe("invoice email on payment SUCCESS", () => {
  it("emits a delivered invoice record after the SUCCESS callback", async () => {
    const order = await checkout();
    await payCallback(order.id, "SUCCESS");

    await NotificationService.deliverOrderNotifications(order.id);
    const stored = await Order.findById(order.id);
    const invoice = stored.notifications.find((n) => n.reason === "invoice");
    expect(invoice).toBeTruthy();
    expect(invoice.channel).toBe("email");
    expect(invoice.to).toBe(stored.customer.email);
    expect(invoice.status).toBe("pending");
    expect(invoice.delivered).toBe(true);
    expect(invoice.error).toBe("");
    expect(invoice.message).toContain("مبلغ نهایی");
    await Order.deleteMany({ _id: order.id });
  });

  it("does not emit an invoice for an order without an email address", async () => {
    const order = await checkout({ email: "" });
    await payCallback(order.id, "SUCCESS");

    const stored = await Order.findById(order.id);
    expect(stored.notifications.some((n) => n.reason === "invoice")).toBe(false);
    await Order.deleteMany({ _id: order.id });
  });

  it("does not emit an invoice for a FAILED payment", async () => {
    const order = await checkout();
    await payCallback(order.id, "FAIL", "کارت نامعتبر");

    const stored = await Order.findById(order.id);
    expect(stored.notifications.some((n) => n.reason === "invoice")).toBe(false);
    await Order.deleteMany({ _id: order.id });
  });

  it("retries the invoice record through the queue when email is flaky", async () => {
    const order = await checkout();
    process.env.EMAIL_MOCK = "true";
    process.env.EMAIL_MOCK_FAIL = "true";
    await payCallback(order.id, "SUCCESS");
    // The off-loop kick was burned on the simulated failure.
    await NotificationService.deliverOrderNotifications(order.id);
    delete process.env.EMAIL_MOCK_FAIL;
    process.env.EMAIL_MOCK = "true";

    const before = await Order.findById(order.id);
    const invoice = before.notifications.find((n) => n.reason === "invoice");
    expect(invoice.delivered).toBe(false);
    expect(invoice.error).toContain("simulated");

    const summary = await notificationQueueService.runOnce();
    expect(summary.attempted).toBeGreaterThanOrEqual(1);

    const after = await Order.findById(order.id);
    const afterInvoice = after.notifications.find((n) => n.reason === "invoice");
    expect(afterInvoice.delivered).toBe(true);
    await Order.deleteMany({ _id: order.id });
  });

  it("shows the invoice reason on the buyer receipt", async () => {
    const order = await checkout();
    await payCallback(order.id, "SUCCESS");
    await NotificationService.deliverOrderNotifications(order.id);

    const receipt = await request(app)
      .get(`/api/storefront/orders/${order.id}`)
      .set("Authorization", AUTH(buyerToken));
    expect(receipt.status).toBe(200);
    const invoice = receipt.body.order.notifications.find((n) => n.reason === "invoice");
    expect(invoice).toBeTruthy();
    expect(invoice.message).toContain("فاکتور");
    await Order.deleteMany({ _id: order.id });
  });
});