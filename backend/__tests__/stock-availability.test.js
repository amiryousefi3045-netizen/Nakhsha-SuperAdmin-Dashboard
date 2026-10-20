const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const ShippingProfile = require("../models/ShippingProfile");
const { publicProductToDTO } = require("../services/StorefrontService");
const { createOrder, transitionOrder } = require("../services/OrderService");

/**
 * What "available" means, pinned end to end through the real order lifecycle.
 *
 * `stock.onHand` is the FREE balance and `stock.reserved` is the COMMITTED
 * balance; the physical total is their sum. `reserveStock` moves a unit from
 * one to the other in a single update, so the unit has already left `onHand`
 * by the time anything reads availability.
 *
 * Everything here exists because three separate readers used to compute
 * `onHand - reserved`, which counts the same commitment twice: a product with
 * 6 units and 3 in flight was advertised as out of stock while 3 were still
 * sellable. The DOM-facing consequences were a hidden buy button and a
 * "low stock" tile that agreed with neither the product flag nor the reserve
 * guard.
 */

let sellerId;
let userId;

beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  sellerId = new mongoose.Types.ObjectId();
  userId = new mongoose.Types.ObjectId();
});

async function makeProduct(over = {}) {
  return Product.create({
    sellerId,
    sellerUserId: userId,
    title: "ظرف سفالی",
    price: 200000,
    stock: { onHand: 6, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
    lowStockThreshold: 2,
    ...over,
  });
}

const CUSTOMER = {
  name: "علی",
  phone: "09120000001",
  address: "تهران، خیابان آزادی، پلاک ۱۲",
};

async function orderQty(product, qty) {
  return createOrder({
    sellerId,
    sellerUserId: userId,
    customer: CUSTOMER,
    items: [{ productId: String(product._id), qty }],
  });
}

beforeEach(async () => {
  await Order.deleteMany({});
  await Product.deleteMany({});
  await ShippingProfile.deleteMany({});
});

afterAll(async () => {
  await Order.deleteMany({});
  await Product.deleteMany({});
  await ShippingProfile.deleteMany({});
  await mongoose.connection.collection("atomiccounters").deleteMany({});
  await mongoose.connection.close();
});

describe("availability is the free balance, not free minus committed", () => {
  it("keeps in-flight units sellable instead of reporting them as gone", async () => {
    const product = await makeProduct({ stock: { onHand: 6, reserved: 0 } });
    await orderQty(product, 3);

    const after = await Product.findById(product._id);
    expect(after.stock.onHand).toBe(3);
    expect(after.stock.reserved).toBe(3);

    // 3 units are committed to an order and 3 are still free. The store must
    // offer those 3; the old formula returned 0 and hid the buy button.
    expect(after.availableStock).toBe(3);
    expect(after.isOutOfStock).toBe(false);
    expect(after.isLowStock).toBe(false); // threshold is 2
  });

  it("reports out of stock only once the free balance is genuinely empty", async () => {
    const product = await makeProduct({ stock: { onHand: 4, reserved: 0 } });
    await orderQty(product, 4);

    const after = await Product.findById(product._id);
    expect(after.stock.onHand).toBe(0);
    expect(after.stock.reserved).toBe(4);
    expect(after.availableStock).toBe(0);
    expect(after.isOutOfStock).toBe(true);
    // Empty is "out", not also "low": the same product must not be listed in
    // both dashboard tiles at once.
    expect(after.isLowStock).toBe(false);
  });

  it("agrees with the public storefront DTO", async () => {
    const product = await makeProduct({ stock: { onHand: 6, reserved: 0 } });
    await orderQty(product, 5);

    const fresh = await Product.findById(product._id);
    const dto = publicProductToDTO(fresh.toObject({ virtuals: true }));

    expect(dto.availableStock).toBe(fresh.availableStock);
    expect(dto.availableStock).toBe(1);
    expect(dto.isOutOfStock).toBe(fresh.isOutOfStock);
  });

  it("does not subtract reservations for an untracked product either", async () => {
    const product = await makeProduct({
      stock: { onHand: 7, reserved: 2 },
      stockPolicy: "untracked",
    });

    expect(product.availableStock).toBe(7);
    expect(product.isOutOfStock).toBe(false);
    expect(product.isLowStock).toBe(false);
  });
});

describe("physical total is onHand + reserved across the lifecycle", () => {
  it("holds after a reservation, a shipment and a return", async () => {
    const product = await makeProduct({ stock: { onHand: 10, reserved: 0 } });
    const physical = () => Product.findById(product._id);

    let order = await orderQty(product, 4);
    let after = await physical();
    expect(after.stock.onHand).toBe(6);
    expect(after.stock.reserved).toBe(4);
    expect(after.stock.onHand + after.stock.reserved).toBe(10);

    for (const s of ["confirmed", "processing", "shipped", "delivered"]) {
      await transitionOrder({
        orderId: String(order._id),
        sellerId,
        nextStatus: s,
        sellerUserId: userId,
      });
    }
    // Shipped: the 4 units left the building, so only 6 remain on the shelf.
    after = await physical();
    expect(after.stock.onHand).toBe(6);
    expect(after.stock.reserved).toBe(0);
    expect(after.stock.onHand + after.stock.reserved).toBe(6);

    await transitionOrder({
      orderId: String(order._id),
      sellerId,
      nextStatus: "returned",
      sellerUserId: userId,
      reason: "مرجوعی",
    });
    // Returned: the units are physically back, so 10 again.
    after = await physical();
    expect(after.stock.onHand).toBe(10);
    expect(after.stock.reserved).toBe(0);
    expect(after.stock.onHand + after.stock.reserved).toBe(10);
  });

  it("returns committed units to the free balance on cancellation", async () => {
    const product = await makeProduct({ stock: { onHand: 6, reserved: 0 } });
    const order = await orderQty(product, 2);
    expect((await Product.findById(product._id)).availableStock).toBe(4);

    await transitionOrder({
      orderId: String(order._id),
      sellerId,
      nextStatus: "cancelled",
      sellerUserId: userId,
      reason: "لغو از سمت مشتری",
    });

    const after = await Product.findById(product._id);
    expect(after.stock.onHand).toBe(6);
    expect(after.stock.reserved).toBe(0);
    expect(after.availableStock).toBe(6);
  });

  it("refuses to oversell: the guard reads onHand, not free-minus-committed", async () => {
    const product = await makeProduct({ stock: { onHand: 5, reserved: 0 } });
    await orderQty(product, 3);

    // 2 remain, so 3 more must be refused — the guard and the advertised
    // number come from the same field and cannot disagree.
    const after = await Product.findById(product._id);
    expect(after.availableStock).toBe(2);
    await expect(orderQty(product, 3)).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });

    const unchanged = await Product.findById(product._id);
    expect(unchanged.stock.onHand).toBe(2);
    expect(unchanged.stock.reserved).toBe(3);
  });
});
