const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { nextSequence } = require("../models/AtomicCounter");
const {
  createOrder,
  transitionOrder,
  listOrders,
  getOrder,
  countsByStatus,
} = require("../services/OrderService");

/**
 * Order domain — unit tests (model invariants + OrderService business rules).
 * The seller HTTP surface is covered by orders.test.js.
 */

let sellerA;
let sellerB;
let userIdA;

beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  sellerA = new mongoose.Types.ObjectId();
  sellerB = new mongoose.Types.ObjectId();
  userIdA = new mongoose.Types.ObjectId();
});

const trackedA = () => ({
  sellerId: sellerA,
  sellerUserId: userIdA,
  title: "سفال دستساز",
  price: 200000,
  stock: { onHand: 10, reserved: 0 },
  stockPolicy: "tracked",
  status: "active",
});

async function makeProduct(over = {}) {
  return Product.create({ ...trackedA(), ...over });
}

beforeEach(async () => {
  await Order.deleteMany({});
  await Product.deleteMany({});
});

afterAll(async () => {
  await Order.deleteMany({});
  await Product.deleteMany({});
  await mongoose.connection.collection("atomiccounters").deleteMany({});
  await mongoose.connection.close();
});

// ── Model invariants ────────────────────────────────────────────────────────

describe("Order model", () => {
  it("defaults to status pending and builds timeline + itemCount virtual", async () => {
    const product = await makeProduct();
    const order = await Order.create({
      sellerId: sellerA,
      sellerUserId: userIdA,
      orderNumber: 1,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: product._id, title: product.title, price: 200000, qty: 2 }],
      subtotal: 400000,
      total: 400000,
    });
    expect(order.status).toBe("pending");
    const json = order.toJSON();
    expect(json.itemCount).toBe(2);
  });

  it("rejects an invalid status value", async () => {
    const product = await makeProduct();
    await expect(
      Order.create({
        sellerId: sellerA,
        sellerUserId: userIdA,
        orderNumber: 2,
        customer: { name: "علی", phone: "09120000001" },
        items: [{ productId: product._id, title: "x", price: 1, qty: 1 }],
        subtotal: 1,
        total: 1,
        status: "invalid",
      }),
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("rejects an order without items", async () => {
    await expect(
      Order.create({
        sellerId: sellerA,
        sellerUserId: userIdA,
        orderNumber: 3,
        customer: { name: "علی", phone: "09120000001" },
        items: [],
        subtotal: 0,
        total: 0,
      }),
    ).rejects.toBeTruthy();
  });
});

// ── createOrder ─────────────────────────────────────────────────────────────

describe("OrderService.createOrder", () => {
  it("creates a pending order with price snapshots and integer totals", async () => {
    const p1 = await makeProduct({ title: "قلم", price: 1500 });
    const p2 = await makeProduct({ title: "کاسه", price: 2500 });

    const order = await createOrder({
      sellerId: sellerA,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001", address: "تهران" },
      items: [
        { productId: String(p1._id), qty: 3 },
        { productId: String(p2._id), qty: 2 },
      ],
      shippingFee: 500,
      discount: 200,
      customerNote: "لطفا روز تحویل تماس بگیرید",
    });

    expect(order.status).toBe("pending");
    expect(order.subtotal).toBe(3 * 1500 + 2 * 2500); // 9500
    expect(order.total).toBe(9500 + 500 - 200); // 9800
    expect(order.itemCount).toBe(5);
    expect(order.timeline.length).toBe(1);
    expect(order.timeline[0].status).toBe("pending");
    expect(order.orderNumber).toBeGreaterThan(0);
    for (const item of order.items) {
      expect(typeof item.price).toBe("number");
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it("reserves tracked stock atomically (onHand down, reserved up)", async () => {
    const product = await makeProduct({ stock: { onHand: 10, reserved: 0 } });

    await createOrder({
      sellerId: sellerA,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: String(product._id), qty: 4 }],
    });

    const after = await Product.findById(product._id).lean();
    expect(after.stock.onHand).toBe(6);
    expect(after.stock.reserved).toBe(4);
  });

  it("rejects qty above available stock with INSUFFICIENT_STOCK", async () => {
    const product = await makeProduct({ stock: { onHand: 3, reserved: 0 } });

    await expect(
      createOrder({
        sellerId: sellerA,
        sellerUserId: userIdA,
        customer: { name: "علی", phone: "09120000001" },
        items: [{ productId: String(product._id), qty: 5 }],
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    const after = await Product.findById(product._id).lean();
    expect(after.stock.onHand).toBe(3);
    expect(after.stock.reserved).toBe(0);
  });

  it("does not move stock for untracked products", async () => {
    const product = await makeProduct({
      stock: { onHand: 7, reserved: 0 },
      stockPolicy: "untracked",
    });

    const order = await createOrder({
      sellerId: sellerA,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: String(product._id), qty: 2 }],
    });
    expect(order.items[0].qty).toBe(2);

    const after = await Product.findById(product._id).lean();
    expect(after.stock.onHand).toBe(7);
    expect(after.stock.reserved).toBe(0);
  });

  it("rejects a product owned by another seller (PRODUCT_NOT_FOUND)", async () => {
    const foreign = await Product.create({
      sellerId: sellerB,
      sellerUserId: new mongoose.Types.ObjectId(),
      title: "محصول فروشنده دیگر",
      price: 100,
      stock: { onHand: 10, reserved: 0 },
      stockPolicy: "tracked",
      status: "active",
    });

    await expect(
      createOrder({
        sellerId: sellerA,
        sellerUserId: userIdA,
        customer: { name: "علی", phone: "09120000001" },
        items: [{ productId: String(foreign._id), qty: 1 }],
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("assigns distinct race-safe order numbers under concurrency", async () => {
    const product = await makeProduct({ stock: { onHand: 100, reserved: 0 } });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        createOrder({
          sellerId: sellerA,
          sellerUserId: userIdA,
          customer: { name: "علی", phone: "09120000001" },
          items: [{ productId: String(product._id), qty: 1 }],
        }),
      ),
    );

    const numbers = results.map((o) => o.orderNumber);
    expect(new Set(numbers).size).toBe(5);
  });
});

// ── Concurrency: stock can never go negative ────────────────────────────────

describe("OrderService concurrency", () => {
  it("parallel orders never drive onHand below zero", async () => {
    const product = await makeProduct({ stock: { onHand: 10, reserved: 0 } });

    const mk = () =>
      createOrder({
        sellerId: sellerA,
        sellerUserId: userIdA,
        customer: { name: "علی", phone: "09120000001" },
        items: [{ productId: String(product._id), qty: 6 }],
      });
    const settled = await Promise.allSettled([mk(), mk()]);

    const fulfilled = settled.filter((s) => s.status === "fulfilled");
    const rejected = settled.filter(
      (s) => s.status === "rejected" && s.reason?.code === "INSUFFICIENT_STOCK",
    );

    // On onHand=10, two parallel qty=6 reservations: exactly one wins the
    // atomic guard, the other must fail. Stock never dips below zero.
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const after = await Product.findById(product._id).lean();
    expect(after.stock.onHand).toBe(4);
    expect(after.stock.onHand).toBeGreaterThanOrEqual(0);
    expect(after.stock.reserved).toBe(6);
  });
});

// ── transitionOrder (state machine + stock side-effects) ───────────────────

describe("OrderService.transitionOrder", () => {
  it("follows the valid matrix and rejects invalid moves", async () => {
    const product = await makeProduct();
    const order = await createOrder({
      sellerId: sellerA,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: String(product._id), qty: 2 }],
    });

    await expect(
      transitionOrder({
        orderId: String(order._id),
        sellerId: sellerA,
        nextStatus: "shipped",
        sellerUserId: userIdA,
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    await transitionOrder({
      orderId: String(order._id),
      sellerId: sellerA,
      nextStatus: "confirmed",
      sellerUserId: userIdA,
      reason: "تایید شد",
    });
    const confirmed = await Order.findById(order._id);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.timeline[1].status).toBe("confirmed");
    expect(confirmed.timeline[1].reason).toBe("تایید شد");
    expect(String(confirmed.timeline[1].by)).toBe(String(userIdA));
  });

  it("restores stock when cancelled (reserved → back to onHand)", async () => {
    const product = await makeProduct({ stock: { onHand: 10, reserved: 0 } });
    const order = await createOrder({
      sellerId: sellerA,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: String(product._id), qty: 4 }],
    });

    await transitionOrder({
      orderId: String(order._id),
      sellerId: sellerA,
      nextStatus: "cancelled",
      sellerUserId: userIdA,
      reason: "لغو از سمت مشتری",
    });

    const after = await Product.findById(product._id).lean();
    expect(after.stock.onHand).toBe(10);
    expect(after.stock.reserved).toBe(0);

    const doc = await Order.findById(order._id);
    expect(doc.status).toBe("cancelled");
    expect(doc.timeline.length).toBe(2);
  });

  it("shipped releases the reservation and doesn't touch onHand", async () => {
    const product = await makeProduct({ stock: { onHand: 10, reserved: 0 } });
    const order = await createOrder({
      sellerId: sellerA,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: String(product._id), qty: 4 }],
    });
    for (const s of ["confirmed", "processing"]) {
      await transitionOrder({
        orderId: String(order._id),
        sellerId: sellerA,
        nextStatus: s,
        sellerUserId: userIdA,
      });
    }
    await transitionOrder({
      orderId: String(order._id),
      sellerId: sellerA,
      nextStatus: "shipped",
      sellerUserId: userIdA,
    });

    const after = await Product.findById(product._id).lean();
    expect(after.stock.onHand).toBe(6);
    expect(after.stock.reserved).toBe(0);
  });

  it("returned (from delivered) restores stock", async () => {
    const product = await makeProduct({ stock: { onHand: 10, reserved: 0 } });
    const order = await createOrder({
      sellerId: sellerA,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: String(product._id), qty: 2 }],
    });
    for (const s of ["confirmed", "processing", "shipped", "delivered"]) {
      await transitionOrder({
        orderId: String(order._id),
        sellerId: sellerA,
        nextStatus: s,
        sellerUserId: userIdA,
      });
    }

    await transitionOrder({
      orderId: String(order._id),
      sellerId: sellerA,
      nextStatus: "returned",
      sellerUserId: userIdA,
      reason: "مرجوعی",
    });

    const after = await Product.findById(product._id).lean();
    expect(after.stock.onHand).toBe(10);
    expect(after.stock.reserved).toBe(0);
  });

  it("is exclusive to the owning seller (returns null for others)", async () => {
    const product = await makeProduct();
    const order = await createOrder({
      sellerId: sellerA,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: String(product._id), qty: 1 }],
    });

    const fromOtherSeller = await transitionOrder({
      orderId: String(order._id),
      sellerId: sellerB,
      nextStatus: "cancelled",
      sellerUserId: userIdA,
    });
    expect(fromOtherSeller).toBeNull();

    const doc = await Order.findById(order._id);
    expect(doc.status).toBe("pending");
  });
});

// ── Queries ─────────────────────────────────────────────────────────────────

describe("OrderService queries", () => {
  it("listOrders paginates and filters by status", async () => {
    for (let i = 0; i < 3; i++) {
      const product = await makeProduct({ title: `محصول ${i}` });
      await createOrder({
        sellerId: sellerA,
        sellerUserId: userIdA,
        customer: { name: "علی", phone: "09120000001" },
        items: [{ productId: String(product._id), qty: 1 }],
      });
    }
    const page1 = await listOrders(sellerA, { page: 1, limit: 2 });
    expect(page1.total).toBe(3);
    expect(page1.items.length).toBe(2);

    const page2 = await listOrders(sellerA, { page: 2, limit: 2 });
    expect(page2.items.length).toBe(1);

    const filtered = await listOrders(sellerA, { page: 1, limit: 10, status: "pending" });
    expect(filtered.total).toBe(3);
    expect(filtered.items.every((o) => o.status === "pending")).toBe(true);
  });

  it("getOrder is seller-scoped and countsByStatus aggregates", async () => {
    const product = await makeProduct();
    const order = await createOrder({
      sellerId: sellerA,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: String(product._id), qty: 1 }],
    });

    const dto = await getOrder(sellerA, String(order._id));
    expect(dto.orderNumber).toBeGreaterThan(0);
    expect(dto.customer.name).toBe("علی");

    expect(await getOrder(sellerB, String(order._id))).toBeNull();

    const counts = await countsByStatus(sellerA);
    expect(counts.pending).toBe(1);
    expect(counts.cancelled).toBe(0);
  });
});

// ── AtomicCounter unit ──────────────────────────────────────────────────────

describe("AtomicCounter.nextSequence", () => {
  it("increments monotonically and never repeats", async () => {
    const seqs = await Promise.all(Array.from({ length: 20 }, () => nextSequence("unit:test")));
    expect(seqs.length).toBe(20);
    expect(new Set(seqs).size).toBe(20);
    expect(Math.min(...seqs)).toBe(1);
  });
});