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
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

/**
 * Phase 30 — CSV row-level export coverage for Orders, Inventory and the
 * Store Activity feed (P1-02, closing the "CSV only for sales" gap).
 * Every export mirrors its list endpoint's filters and ownership scoping,
 * ships a BOM and an attachment header, and never leaks another seller.
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
  seller: "09146900031",
  seller2: "09146900032",
};

let sellerToken;
let seller2Token;
let sellerProfileId;
let seller2ProfileId;
let sellerUserId;
let seller2UserId;
let productA;
let orderA;

async function wipe() {
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await TeamMember.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({});
}

const DAY = 86400000;

async function makeOrder({ sellerId, sellerUserId, status, total, createdAt, customerName = "مشتری تست" }) {
  return Order.create({
    sellerId,
    sellerUserId,
    origin: "seller",
    orderNumber: 900 + Math.floor(Math.random() * 1000),
    customer: { name: customerName, phone: "0912" + String(Math.floor(Math.random() * 90000000) + 10000000) , address: "تهران، خیابان آزادی، پلاک ۱۲" },
    items: [{ productId: productA?._id, title: "کالای سفارش", sku: "SKU-ORD", price: total, currency: "IRR", qty: 1 }],
    subtotal: total,
    shippingFee: 0,
    discount: 0,
    total,
    currency: "IRR",
    status,
    payment: { status: "paid", method: "mock", paidAt: createdAt, reference: "ref-" + Math.random() },
    itemCount: 1,
    timeline: [{ status, at: createdAt, by: null }],
    createdAt,
    updatedAt: createdAt,
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
  await wipe();

  const seller = await User.create({
    name: "فروشنده CSV",
    phone: PHONES.seller,
    handle: "csv_export_a",
    role: "seller",
    isVerified: true,
  });
  sellerUserId = seller._id;
  sellerProfileId = (await SellerProfile.create({
    userId: seller._id,
    storeName: "فروشگاه CSV",
    slug: "csv-export-shop",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  }))._id;
  sellerToken = TOKEN_OF(seller);

  const seller2 = await User.create({
    name: "فروشنده CSV دیگر",
    phone: PHONES.seller2,
    handle: "csv_export_b",
    role: "seller",
    isVerified: true,
  });
  seller2UserId = seller2._id;
  seller2ProfileId = (await SellerProfile.create({
    userId: seller2._id,
    storeName: "فروشگاه دیگر",
    slug: "csv-export-shop-2",
    status: "active",
    verification: { status: "verified" },
    settings: { storefrontPublished: true, defaultPayoutMethod: "bank_transfer" },
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  }))._id;
  seller2Token = TOKEN_OF(seller2);

  productA = await Product.create({
    sellerId: sellerProfileId,
    sellerUserId,
    title: "کالای A",
    description: "",
    sku: "CSV-A",
    price: 120000,
    currency: "IRR",
    category: "pottery",
    status: "active",
    stockPolicy: "tracked",
    stock: { onHand: 10, reserved: 2, incoming: 1 },
    lowStockThreshold: 3,
  });
  await Product.create({
    sellerId: sellerProfileId,
    sellerUserId,
    title: "کالای B",
    description: "",
    sku: "CSV-B",
    price: 80000,
    currency: "IRR",
    category: "pottery",
    status: "active",
    stockPolicy: "tracked",
    stock: { onHand: 1, reserved: 0, incoming: 0 },
    lowStockThreshold: 5,
  });
  await Product.create({
    sellerId: sellerProfileId,
    sellerUserId,
    title: "کالای C",
    description: "",
    sku: "CSV-C",
    price: 0,
    currency: "IRR",
    category: "pottery",
    status: "draft",
    stockPolicy: "untracked",
    stock: { onHand: 0, reserved: 0, incoming: 0 },
    lowStockThreshold: 0,
  });
  await Product.create({
    sellerId: seller2ProfileId,
    sellerUserId: seller2UserId,
    title: "کالای خارجی",
    description: "",
    sku: "CSV-X",
    price: 999999,
    currency: "IRR",
    category: "pottery",
    status: "active",
    stockPolicy: "tracked",
    stock: { onHand: 7, reserved: 0, incoming: 0 },
    lowStockThreshold: 1,
  });

  const now = Date.now();
  orderA = await makeOrder({
    sellerId: sellerProfileId,
    sellerUserId,
    status: "delivered",
    total: 450000,
    createdAt: new Date(now - 2 * DAY),
    customerName: "مشتری با کاما، خاص",
  });
  await makeOrder({
    sellerId: sellerProfileId,
    sellerUserId,
    status: "pending",
    total: 250000,
    createdAt: new Date(now - 1 * DAY),
    customerName: "مشتری دوم",
  });
  await makeOrder({
    sellerId: seller2ProfileId,
    sellerUserId: seller2UserId,
    status: "shipped",
    total: 88888888,
    createdAt: new Date(now - 1 * DAY),
    customerName: "مشتری خارجی",
  });

  await AuditLog.create({
    userId: seller._id,
    action: "PRODUCT_CREATED",
    resource: { type: "SELLER_PROFILE", id: String(sellerProfileId) },
    result: "SUCCESS",
    riskLevel: "LOW",
    requestContext: { endpoint: "/api/seller/products/:id", ip: "127.0.0.1" },
    changes: { after: { title: "کالای A" }, before: { title: "قبلی" } },
    createdAt: new Date(now - 3 * DAY),
  });
  await AuditLog.create({
    userId: seller2._id,
    action: "PAYOUT_REQUESTED",
    resource: { type: "TRANSACTION", id: String(seller2ProfileId) },
    result: "SUCCESS",
    riskLevel: "HIGH",
    requestContext: { endpoint: "/api/seller/private" },
    changes: { after: { secret: "LEAK-ME" } },
    createdAt: new Date(now - 3 * DAY),
  });
});

afterAll(async () => {
  await wipe();
  await mongoose.connection.close();
});

function get(url, token = sellerToken) {
  return request(app)
    .get(url)
    .set("Authorization", AUTH(token));
}

describe("orders CSV export — filters and scoping", () => {
  it("returns a BOM-prefixed attachment CSV with every matching order row", async () => {
    const res = await get("/api/seller/orders/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");

    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe(
      '"id","orderNumber","status","payment","currency","subtotal","shippingFee","discount","total","itemCount","customerName","customerPhone","createdAt","items"',
    );
    expect(lines).toHaveLength(3); // header + seller's 2 orders, seller B's excluded
    expect(lines.join("\n")).not.toContain("88888888");
    // sorted newest-first: orderB pending (day -1) is line 1, delivered (day -2) is line 2
    expect(lines[1]).toContain("pending");
    expect(lines[2]).toContain("delivered");
    expect(lines[2]).toContain('"450000"');
  });

  it("quotes embedded commas in customer names", async () => {
    const res = await get("/api/seller/orders/export");
    const text = res.text.replace(/^\uFEFF/, "");
    expect(text).toContain('"مشتری با کاما، خاص"');
  });

  it("honors the same list filters (status + total range)", async () => {
    const res = await get(
      `/api/seller/orders/export?status=delivered&minTotal=100000&maxTotal=99999999`,
    );
    const lines = res.text.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines).toHaveLength(2); // header + 1
    expect(lines.join("\n")).toContain(String(orderA.orderNumber));
    expect(lines.join("\n")).not.toContain("250000");
  });
});

describe("inventory CSV export", () => {
  it("exports tracked products with stock columns, untracked excluded", async () => {
    const res = await get("/api/seller/inventory/export");
    expect(res.status).toBe(200);
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe(
      '"sku","title","price","currency","status","stockPolicy","onHand","reserved","incoming","available","lowStockThreshold","createdAt","updatedAt"',
    );
    expect(lines).toHaveLength(3); // header + A + B; draft/untracked C and seller B's SKU excluded
    expect(lines.join("\n")).toContain("CSV-A");
    expect(lines.join("\n")).not.toContain("CSV-X");
    expect(lines.join("\n")).not.toContain("CSV-C");
    expect(lines[1]).toContain('"1","0","0","1"');
    expect(lines[2]).toContain('"10","2","1","8"');
  });

  it("filters by low-stock status like the list endpoint", async () => {
    const res = await get("/api/seller/inventory/export?status=low");
    const lines = res.text.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines).toHaveLength(2); // header + B only
    expect(lines.join("\n")).toContain("CSV-B");
    expect(lines.join("\n")).not.toContain("CSV-A");
  });
});

describe("activity CSV export", () => {
  it("exports the seller's own audit rows and strips other sellers", async () => {
    const res = await get("/api/seller/activity/export");
    expect(res.status).toBe(200);
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe(
      '"id","createdAt","action","riskLevel","result","resourceType","resourceId","endpoint","after"',
    );
    expect(lines).toHaveLength(2); // header + seller's 1 row
    expect(lines[1]).toContain("PRODUCT_CREATED");
    expect(lines[1]).toContain(String(sellerProfileId));
    expect(lines.join("\n")).not.toContain("LEAK-ME");
    expect(lines.join("\n")).not.toContain("PAYOUT_REQUESTED");
  });
});

describe("CSV exports — auth guards", () => {
  it("rejects anonymous requests with 401 on all three", async () => {
    await request(app).get("/api/seller/orders/export").expect(401);
    await request(app).get("/api/seller/inventory/export").expect(401);
    await request(app).get("/api/seller/activity/export").expect(401);
  });

  it("scopes each export to the requesting seller", async () => {
    const orders = await get("/api/seller/orders/export", seller2Token);
    expect(orders.text.replace(/^\uFEFF/, "")).not.toContain(String(orderA.orderNumber));
    expect(orders.text.replace(/^\uFEFF/, "")).toContain("88888888");

    const inventory = await get("/api/seller/inventory/export", seller2Token);
    expect(inventory.text.replace(/^\uFEFF/, "")).not.toContain("CSV-A");
    expect(inventory.text.replace(/^\uFEFF/, "")).toContain("CSV-X");
  });
});