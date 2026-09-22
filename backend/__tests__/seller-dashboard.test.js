const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");
const StockAdjustment = require("../models/StockAdjustment");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const OtpCode = require("../models/OtpCode");
const { createOrder, transitionOrder } = require("../services/OrderService");
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
  sa: "09146000001",
  seller: "09146000002",
  seller2: "09146000003",
  creator: "09146000004",
  regular: "09146000005",
  noProfileSeller: "09146000006",
};

let sellerUser;
let sellerToken;
let sellerProfile;
let seller2User;
let seller2Token;
let seller2Profile;
let creatorUser;
let creatorToken;
let regularUser;
let noProfileSeller;
let noProfileSellerToken;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  process.env.SUPER_ADMIN_PHONE = PHONES.sa;
  _resetRateLimitStoreForTests();

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;

  await User.deleteMany({ role: "super_admin" });
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await StockAdjustment.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({ action: { $in: ["PRODUCT_CREATED", "STOCK_ADJUSTED", "SELLER_PROFILE_UPDATE", "PRODUCT_ARCHIVED", "ORDER_STATUS_CHANGED"] } });

  await User.create({
    name: "سوپرادمین سیلر",
    phone: PHONES.sa,
    handle: "sa_seller",
    role: "super_admin",
    isVerified: true,
  });

  sellerUser = await User.create({
    name: "فروشنده اصلی",
    phone: PHONES.seller,
    handle: "seller_main",
    role: "seller",
    isVerified: true,
  });
  sellerToken = TOKEN_OF(sellerUser);

  sellerProfile = await SellerProfile.create({
    userId: sellerUser._id,
    storeName: "فروشگاه دستسازهای اصفهان",
    description: "محصولات صنایع دستی اصیل",
    status: "active",
    verification: { status: "verified" },
  });

  seller2User = await User.create({
    name: "فروشنده دوم",
    phone: PHONES.seller2,
    handle: "seller_second",
    role: "seller",
    isVerified: true,
  });
  seller2Token = TOKEN_OF(seller2User);

  seller2Profile = await SellerProfile.create({
    userId: seller2User._id,
    storeName: "فروشگاه دوم",
    status: "active",
    verification: { status: "verified" },
  });

  creatorUser = await User.create({
    name: "کریتور",
    phone: PHONES.creator,
    handle: "creator_only",
    role: "creator",
    creatorType: "artisan",
    isVerified: true,
  });
  creatorToken = TOKEN_OF(creatorUser);

  regularUser = await User.create({
    name: "کاربر عادی",
    phone: PHONES.regular,
    handle: "regular_user",
    role: "user",
    isVerified: true,
  });

  noProfileSeller = await User.create({
    name: "فروشنده بدون پروفایل",
    phone: PHONES.noProfileSeller,
    handle: "seller_noprofile",
    role: "seller",
    isVerified: true,
  });
  noProfileSellerToken = TOKEN_OF(noProfileSeller);
});

afterAll(async () => {
  await OtpCode.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await SellerProfile.deleteMany({});
  await Product.deleteMany({});
  await StockAdjustment.deleteMany({});
  await Order.deleteMany({});
  await AuditLog.deleteMany({ action: { $in: ["PRODUCT_CREATED", "STOCK_ADJUSTED", "SELLER_PROFILE_UPDATE", "PRODUCT_ARCHIVED", "ORDER_STATUS_CHANGED"] } });
  delete process.env.SUPER_ADMIN_PHONE;
  await mongoose.connection.close();
});

describe("Seller Dashboard - authorization", () => {
  it("denies unauthenticated access with 401", async () => {
    const res = await request(app).get("/api/seller/dashboard").expect(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("denies a regular user with 403", async () => {
    const token = TOKEN_OF(regularUser);
    const res = await request(app)
      .get("/api/seller/dashboard")
      .set("Authorization", AUTH(token))
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("denies a creator (non-seller) with 403", async () => {
    const res = await request(app)
      .get("/api/seller/dashboard")
      .set("Authorization", AUTH(creatorToken))
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("denies an admin with 403", async () => {
    const admin = await User.create({
      phone: "09146000007",
      handle: "seller_test_admin",
      role: "admin",
      permissions: ["APPROVE_CONTENT"],
    });
    const adminToken = TOKEN_OF(admin);
    const res = await request(app)
      .get("/api/seller/dashboard")
      .set("Authorization", AUTH(adminToken))
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    await User.deleteOne({ _id: admin._id });
  });

  it("returns SELLER_PROFILE_REQUIRED when a seller has no profile", async () => {
    const res = await request(app)
      .get("/api/seller/dashboard")
      .set("Authorization", AUTH(noProfileSellerToken))
      .expect(403);
    expect(res.body.error.code).toBe("SELLER_PROFILE_REQUIRED");
  });

  it("lets an authenticated seller reach the dashboard", async () => {
    const res = await request(app)
      .get("/api/seller/dashboard")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.overview).toBeDefined();
    expect(res.body.profile.storeName).toBe("فروشگاه دستسازهای اصفهان");
  });

  it("derives real order KPIs and revenue from live order data", async () => {
    const product = await Product.create({
      sellerId: sellerProfile._id,
      sellerUserId: sellerUser._id,
      title: "کوزه KPI",
      price: 250000,
      stock: { onHand: 10, reserved: 0 },
      stockPolicy: "tracked",
      status: "active",
    });

    let pendingOrderId;
    let deliveredOrderId;
    try {
      const pendingOrder = await createOrder({
        sellerId: sellerProfile._id,
        sellerUserId: sellerUser._id,
        customer: { name: "KPI تست ۱", phone: "09129999991" },
        items: [{ productId: product._id, qty: 2 }],
      });
      pendingOrderId = pendingOrder._id;
      const deliveredOrder = await createOrder({
        sellerId: sellerProfile._id,
        sellerUserId: sellerUser._id,
        customer: { name: "KPI تست ۲", phone: "09129999992" },
        items: [{ productId: product._id, qty: 1 }],
      });
      deliveredOrderId = deliveredOrder._id;
      for (const nextStatus of ["confirmed", "processing", "shipped", "delivered"]) {
        await transitionOrder({
          orderId: deliveredOrder._id,
          sellerId: sellerProfile._id,
          sellerUserId: sellerUser._id,
          nextStatus,
        });
      }

      const res = await request(app)
        .get("/api/seller/dashboard")
        .set("Authorization", AUTH(sellerToken))
        .expect(200);

      expect(res.body.orders.byStatus.pending).toBe(1);
      expect(res.body.orders.byStatus.delivered).toBe(1);
      expect(res.body.orders.needAction).toBe(1);
      expect(res.body.orders.open).toBe(1);
      expect(res.body.orders.total).toBe(2);
      expect(res.body.revenue.delivered).toBe(250000);
      expect(res.body.revenue.shipped).toBe(0);
      expect(res.body.revenue.total).toBe(250000);
    } finally {
      if (pendingOrderId) await Order.deleteOne({ _id: pendingOrderId });
      if (deliveredOrderId) await Order.deleteOne({ _id: deliveredOrderId });
      await Product.deleteOne({ _id: product._id });
      await AuditLog.deleteMany({
        action: "ORDER_STATUS_CHANGED",
        "resource.id": { $in: [pendingOrderId, deliveredOrderId].filter(Boolean) },
      });
    }
  });
});

describe("Seller Dashboard - profile", () => {
  it("GET /api/seller/profile returns the profile", async () => {
    const res = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.profile.storeName).toBe("فروشگاه دستسازهای اصفهان");
    expect(res.body.profile.slug).toBeTruthy();
  });

  it("PATCH /api/seller/profile updates allowed fields only", async () => {
    const res = await request(app)
      .patch("/api/seller/profile")
      .set("Authorization", AUTH(sellerToken))
      .send({
        description: "توضیح به‌روز شده",
        userId: seller2User._id.toString(),
        verification: { status: "verified" },
        status: "suspended",
      })
      .expect(200);

    expect(res.body.profile.description).toBe("توضیح به‌روز شده");
    // Server-controlled fields must not be changed by the client.
    expect(res.body.profile.userId).toBe(String(sellerUser._id));
    expect(res.body.profile.status).toBe("active");
  });
});

describe("Seller Dashboard - products", () => {
  let createdProductId;

  it("POST /api/seller/products creates a product owned by the seller", async () => {
    const res = await request(app)
      .post("/api/seller/products")
      .set("Authorization", AUTH(sellerToken))
      .send({
        title: "گلدان سفالی دست‌ساز",
        description: "گلدان سفالی با لعاب فیروزه‌ای",
        price: 250000,
        category: "pottery",
        status: "active",
        stock: { onHand: 20, reserved: 2 },
        stockPolicy: "tracked",
        sellerId: seller2User._id.toString(),
        sellerUserId: seller2User._id.toString(),
      })
      .expect(201);

    createdProductId = res.body.product.id;
    // Customer-supplied sellerId is always overridden server-side.
    expect(res.body.product.sellerId).toBe(String(sellerProfile._id));
    expect(res.body.product.stock.available).toBe(18);
    expect(res.body.product.price).toBe(250000);
  });

  it("GET /api/seller/products lists only the seller's products", async () => {
    const res = await request(app)
      .get("/api/seller/products")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].sellerId).toBe(String(sellerProfile._id));
  });

  it("GET /api/seller/products/:id returns a single product", async () => {
    const res = await request(app)
      .get(`/api/seller/products/${createdProductId}`)
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.product.id).toBe(createdProductId);
    expect(res.body.product.title).toBe("گلدان سفالی دست‌ساز");
  });

  it("blocks IDOR: Seller A cannot read Seller B's product (404)", async () => {
    const res = await request(app)
      .get(`/api/seller/products/${createdProductId}`)
      .set("Authorization", AUTH(seller2Token))
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("PATCH /api/seller/products/:id updates the product", async () => {
    const res = await request(app)
      .patch(`/api/seller/products/${createdProductId}`)
      .set("Authorization", AUTH(sellerToken))
      .send({ price: 300000, sellerId: seller2Profile._id.toString() })
      .expect(200);
    expect(res.body.product.price).toBe(300000);
    // sellerId cannot be hijacked.
    expect(res.body.product.sellerId).toBe(String(sellerProfile._id));
  });

  it("rejects role escalation via product body (role field ignored)", async () => {
    const res = await request(app)
      .patch(`/api/seller/products/${createdProductId}`)
      .set("Authorization", AUTH(sellerToken))
      .send({ role: "super_admin", permissions: ["DELETE_USERS"], title: "عنوان بدون تسخیر" })
      .expect(200);
    expect(res.body.product.role).toBeUndefined();
    expect(res.body.product.title).toBe("عنوان بدون تسخیر");
    const fresh = await User.findById(sellerUser._id).lean();
    expect(fresh.role).toBe("seller");
  });

  it("PATCH /api/seller/products/:id/status changes status", async () => {
    const res = await request(app)
      .patch(`/api/seller/products/${createdProductId}/status`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "paused" })
      .expect(200);
    expect(res.body.product.status).toBe("paused");
  });

  it("rejects an invalid product status", async () => {
    const res = await request(app)
      .patch(`/api/seller/products/${createdProductId}/status`)
      .set("Authorization", AUTH(sellerToken))
      .send({ status: "hacked" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("DELETE /api/seller/products/:id archives the product", async () => {
    const res = await request(app)
      .delete(`/api/seller/products/${createdProductId}`)
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.message).toBeTruthy();

    const product = await Product.findById(createdProductId).lean();
    expect(product.status).toBe("archived");
  });
});

describe("Seller Dashboard - inventory", () => {
  let inventoryProductId;

  beforeEach(async () => {
    const product = await Product.create({
      sellerId: sellerProfile._id,
      sellerUserId: sellerUser._id,
      title: "محصول موجودی",
      price: 100000,
      stock: { onHand: 10, reserved: 0 },
      stockPolicy: "tracked",
      status: "active",
    });
    inventoryProductId = product._id.toString();
  });

  afterEach(async () => {
    await Product.deleteMany({ _id: inventoryProductId });
    await StockAdjustment.deleteMany({ productId: inventoryProductId });
  });

  it("GET /api/seller/inventory lists tracked products", async () => {
    const res = await request(app)
      .get("/api/seller/inventory")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].stock.available).toBeGreaterThanOrEqual(0);
  });

  it("PATCH /api/seller/inventory/:productId increases stock atomically", async () => {
    const res = await request(app)
      .patch(`/api/seller/inventory/${inventoryProductId}`)
      .set("Authorization", AUTH(sellerToken))
      .send({ delta: 5, reason: "رسید جدید", type: "receipt" })
      .expect(200);
    expect(res.body.product.stock.onHand).toBe(15);
    expect(res.body.product.stock.available).toBe(15);

    const history = await StockAdjustment.countDocuments({ productId: inventoryProductId });
    expect(history).toBe(1);
  });

  it("PATCH /api/seller/inventory/:productId blocks negative stock", async () => {
    const res = await request(app)
      .patch(`/api/seller/inventory/${inventoryProductId}`)
      .set("Authorization", AUTH(sellerToken))
      .send({ delta: -50, reason: "خطا" })
      .expect(400);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");

    const product = await Product.findById(inventoryProductId).lean();
    expect(product.stock.onHand).toBe(10);
  });

  it("handles concurrent decrements atomically — stock never goes below zero", async () => {
    const [r1, r2] = await Promise.all([
      request(app)
        .patch(`/api/seller/inventory/${inventoryProductId}`)
        .set("Authorization", AUTH(sellerToken))
        .send({ delta: -8, reason: "همزمان ۱" }),
      request(app)
        .patch(`/api/seller/inventory/${inventoryProductId}`)
        .set("Authorization", AUTH(sellerToken))
        .send({ delta: -8, reason: "همزمان ۲" }),
    ]);

    // Exactly one of the two parallel decrements may win the atomic guard;
    // the other must be rejected as INSUFFICIENT_STOCK.
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);
    const failed = r1.status === 400 ? r1 : r2;
    expect(failed.body.error.code).toBe("INSUFFICIENT_STOCK");

    const product = await Product.findById(inventoryProductId).lean();
    expect(product.stock.onHand).toBe(2);
    expect(product.stock.onHand).toBeGreaterThanOrEqual(0);

    const historyCount = await StockAdjustment.countDocuments({ productId: inventoryProductId });
    expect(historyCount).toBe(1);
  });

  it("blocks another seller from adjusting stock (404)", async () => {
    const res = await request(app)
      .patch(`/api/seller/inventory/${inventoryProductId}`)
      .set("Authorization", AUTH(seller2Token))
      .send({ delta: 100 })
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("GET /api/seller/inventory/:productId/history returns the adjustment trail", async () => {
    await request(app)
      .patch(`/api/seller/inventory/${inventoryProductId}`)
      .set("Authorization", AUTH(sellerToken))
      .send({ delta: 3, reason: "تست" })
      .expect(200);

    const res = await request(app)
      .get(`/api/seller/inventory/${inventoryProductId}/history`)
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].delta).toBe(3);
  });

  it("rejects a non-integer delta", async () => {
    const res = await request(app)
      .patch(`/api/seller/inventory/${inventoryProductId}`)
      .set("Authorization", AUTH(sellerToken))
      .send({ delta: 1.5 })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Seller Dashboard - analytics & planned domains", () => {
  it("GET /api/seller/analytics returns inventory aggregation", async () => {
    const res = await request(app)
      .get("/api/seller/analytics")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.inventory).toBeDefined();
    expect(typeof res.body.inventory.totalOnHand).toBe("number");
  });

  it("GET /api/seller/orders returns real order data (domain live)", async () => {
    const res = await request(app)
      .get("/api/seller/orders")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });

  it("GET /api/seller/finance is live and returns a real finance summary", async () => {
    const res = await request(app)
      .get("/api/seller/finance")
      .set("Authorization", AUTH(sellerToken))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.finance.gross).toBeDefined();
    expect(typeof res.body.finance.net.available).toBe("number");
    expect(res.body.finance.currency).toBe("IRR");
  });
});