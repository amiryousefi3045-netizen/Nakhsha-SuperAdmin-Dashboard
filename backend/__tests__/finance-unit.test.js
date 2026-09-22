const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Payout = require("../models/Payout");
const SellerProfile = require("../models/SellerProfile");
const {
  computeBalance,
  enforceBudgetLimit,
  summary,
  listPayouts,
  requestPayout,
  cancelPayout,
  PayoutDomainError,
} = require("../services/FinanceService");
const { createOrder, transitionOrder } = require("../services/OrderService");

/**
 * Finance & Payout domain — unit tests (money math + business rules).
 * The seller HTTP surface is covered by finance-payouts.test.js.
 */

let userIdA;

beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  userIdA = new mongoose.Types.ObjectId();
});

let profileA;
let profileB;

const FINANCE_TERMS = { commissionPercent: 10, payoutMinimum: 0, holdDays: 0 };

async function makeProfile(terms = FINANCE_TERMS) {
  const profile = await SellerProfile.create({
    userId: new mongoose.Types.ObjectId(),
    storeName: `فروشگاه ${Date.now()}`,
    status: "active",
    finance: { ...FINANCE_TERMS, ...terms },
  });
  return profile;
}

async function setTerms(profile, over = {}) {
  await SellerProfile.findByIdAndUpdate(profile._id, {
    $set: { finance: { ...FINANCE_TERMS, ...over } },
  });
}

async function makeProduct(profile) {
  return Product.create({
    sellerId: profile._id,
    sellerUserId: userIdA,
    title: "سفال دستساز",
    price: 200000,
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
}

async function deliverOrder(profile, price) {
  const product = await makeProduct(profile);
  await Product.updateOne({ _id: product._id }, { $set: { price } });
  const order = await createOrder({
    sellerId: profile._id,
    sellerUserId: userIdA,
    customer: { name: "علی", phone: "09120000001" },
    items: [{ productId: String(product._id), qty: 1 }],
  });
  for (const step of ["confirmed", "processing", "shipped", "delivered"]) {
    await transitionOrder({
      orderId: String(order._id),
      sellerId: profile._id,
      nextStatus: step,
      sellerUserId: userIdA,
    });
  }
  return order;
}

beforeEach(async () => {
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await SellerProfile.deleteMany({});
  profileA = await makeProfile();
  profileB = await makeProfile();
});

afterAll(async () => {
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await SellerProfile.deleteMany({});
  await mongoose.connection.collection("atomiccounters").deleteMany({});
  await mongoose.connection.close();
});

// ── Balance math ────────────────────────────────────────────────────────────

describe("FinanceService.computeBalance", () => {
  it("returns an all-zero snapshot for an empty seller", async () => {
    const b = await computeBalance(profileA._id);
    expect(b.currency).toBe("IRR");
    expect(b.gross.delivered).toBe(0);
    expect(b.gross.shipped).toBe(0);
    expect(b.gross.held).toBe(0);
    expect(b.commission.amount).toBe(0);
    expect(b.net.earned).toBe(0);
    expect(b.net.available).toBe(0);
    expect(b.outlaid.total).toBe(0);
  });

  it("counts a delivered order as earned, with commission excluded", async () => {
    await deliverOrder(profileA, 1000000);

    const b = await computeBalance(profileA._id);
    expect(b.gross.delivered).toBe(1000000);
    expect(b.gross.awaiting).toBe(0);
    expect(b.commission.percent).toBe(10);
    expect(b.commission.amount).toBe(100000);
    expect(b.net.earned).toBe(900000);
    expect(b.net.available).toBe(900000);
  });

  it("treats shipped revenue as in-transit, not earned", async () => {
    const product = await makeProduct(profileA);
    const order = await createOrder({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      customer: { name: "علی", phone: "09120000001" },
      items: [{ productId: String(product._id), qty: 1 }],
    });
    for (const step of ["confirmed", "processing", "shipped"]) {
      await transitionOrder({
        orderId: String(order._id),
        sellerId: profileA._id,
        nextStatus: step,
        sellerUserId: userIdA,
      });
    }
    await setTerms(profileA, { commissionPercent: 0 });

    const b = await computeBalance(profileA._id);
    expect(b.gross.shipped).toBe(200000);
    expect(b.gross.delivered).toBe(0);
    expect(b.net.earned).toBe(0);
    expect(b.net.available).toBe(0);
  });

  it("holds delivered revenue inside the return window out of the balance", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0, holdDays: 7 });

    const b = await computeBalance(profileA._id);
    expect(b.gross.delivered).toBe(1000000);
    expect(b.gross.held).toBe(1000000);
    expect(b.hold.days).toBe(7);
    expect(b.net.earned).toBe(0);
    expect(b.net.available).toBe(0);
  });

  it("deducts in-flight and paid payouts from the available balance", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });

    await Payout.create({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      amount: 400000,
      status: "requested",
    });
    await Payout.create({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      amount: 200000,
      status: "paid",
    });
    await Payout.create({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      amount: 90000,
      status: "cancelled",
    });

    const b = await computeBalance(profileA._id);
    expect(b.outlaid.requested).toBe(400000);
    expect(b.outlaid.paid).toBe(200000);
    expect(b.outlaid.total).toBe(600000);
    expect(b.cancelledPayouts).toBe(90000);
    expect(b.net.available).toBe(400000);
  });

  it("is scoped per seller", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });
    const bB = await computeBalance(profileB._id);
    expect(bB.gross.delivered).toBe(0);
    expect(bB.net.available).toBe(0);
  });
});

// ── Request payout ──────────────────────────────────────────────────────────

describe("FinanceService.requestPayout", () => {
  it("creates a requested payout up to the available balance", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });

    const payout = await requestPayout({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      amount: 900000,
      method: "card",
      note: "تسویه خرداد",
    });

    expect(payout.status).toBe("requested");
    expect(payout.method).toBe("card");
    expect(payout.note).toBe("تسویه خرداد");
    expect(payout.timeline[0].status).toBe("requested");

    const b = await computeBalance(profileA._id);
    expect(b.outlaid.requested).toBe(900000);
    expect(b.net.available).toBe(100000);
  });

  it("normalizes an unknown method to bank_transfer", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });

    const payout = await requestPayout({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      amount: 100000,
      method: "nope",
    });
    expect(payout.method).toBe("bank_transfer");
  });

  it("rejects an amount beyond the available balance", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 50 });

    await expect(
      requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 600000 }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PAYOUT_BALANCE" });
  });

  it("rejects non-integer, zero and negative amounts", async () => {
    await deliverOrder(profileA, 1000000);
    for (const amount of [0, -500, 100.5, "500"]) {
      await expect(
        requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });

  it("enforces the payout minimum when set", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0, payoutMinimum: 500000 });

    await expect(
      requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 200000 }),
    ).rejects.toMatchObject({ code: "PAYOUT_BELOW_MINIMUM", details: { minimum: 500000 } });

    const ok = await requestPayout({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      amount: 500000,
    });
    expect(ok.status).toBe("requested");
  });

  it("remains impossible once the balance is exhausted", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });

    await requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 1000000 });
    await expect(
      requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 1 }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PAYOUT_BALANCE" });
  });

  it("rolls back when the post-commit budget guard fires", async () => {
    // Earned 1,000,000 (commission 0). One in-flight payout for the full amount.
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });
    const first = await requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 1000000 });

    // The customer's order is now reversed outside the normal flow (e.g. admin
    // recovery): netEarned drops to 0 while the payout is still in flight.
    const delivered = await Order.findOne({ sellerId: profileA._id, status: "delivered" });
    delivered.status = "returned";
    await delivered.save();

    const second = await Payout.create({
      sellerId: profileA._id,
      sellerUserId: userIdA,
      amount: 100000,
      status: "requested",
    });

    await expect(enforceBudgetLimit(profileA._id, second._id)).rejects.toMatchObject({
      code: "PAYOUT_BALANCE_EXCEEDED",
    });
    // The runaway payout document has been rolled back.
    expect(await Payout.findById(second._id)).toBeNull();
    expect(await Payout.findById(first._id)).not.toBeNull();
  });
});

// ── Cancel payout ───────────────────────────────────────────────────────────

describe("FinanceService.cancelPayout", () => {
  it("cancels a requested payout and restores the balance", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });
    const payout = await requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 600000 });

    const cancelled = await cancelPayout({
      sellerId: profileA._id,
      payoutId: String(payout._id),
      sellerUserId: userIdA,
      note: "اشتباه بود",
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.timeline[cancelled.timeline.length - 1].status).toBe("cancelled");

    const b = await computeBalance(profileA._id);
    expect(b.net.available).toBe(1000000);
  });

  it("rejects cancelling a payout that is no longer requested", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });
    const payout = await requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 100000 });
    payout.status = "processing";
    await payout.save();

    await expect(
      cancelPayout({ sellerId: profileA._id, payoutId: String(payout._id), sellerUserId: userIdA }),
    ).rejects.toMatchObject({ code: "INVALID_PAYOUT_TRANSITION" });
  });

  it("is ownership-blind: another seller gets PAYOUT_NOT_FOUND", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });
    const payout = await requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 100000 });

    await expect(
      cancelPayout({ sellerId: profileB._id, payoutId: String(payout._id), sellerUserId: userIdA }),
    ).rejects.toMatchObject({ code: "PAYOUT_NOT_FOUND" });
  });
});

// ── List payouts ────────────────────────────────────────────────────────────

describe("FinanceService.listPayouts", () => {
  it("paginates, filters by status and scopes to the seller", async () => {
    await deliverOrder(profileA, 1000000);
    await setTerms(profileA, { commissionPercent: 0 });
    for (let i = 0; i < 3; i += 1) {
      await requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 100000 });
    }
    const first = await requestPayout({ sellerId: profileA._id, sellerUserId: userIdA, amount: 100000 });
    await cancelPayout({ sellerId: profileA._id, payoutId: String(first._id), sellerUserId: userIdA });

    const all = await listPayouts(profileA._id, { page: 1, limit: 10 });
    expect(all.total).toBe(4);
    expect(all.items.length).toBe(4);

    const cancelledOnly = await listPayouts(profileA._id, { page: 1, limit: 10, status: "cancelled" });
    expect(cancelledOnly.total).toBe(1);

    const page2 = await listPayouts(profileA._id, { page: 2, limit: 3 });
    expect(page2.items.length).toBe(1);

    const other = await listPayouts(profileB._id, { page: 1, limit: 10 });
    expect(other.total).toBe(0);
  });
});

// ── Summary (public shape) ──────────────────────────────────────────────────

describe("FinanceService.summary", () => {
  it("returns the full summary envelope", async () => {
    await deliverOrder(profileA, 1000000);

    const s = await summary(profileA._id);
    expect(s.asOf).toBeInstanceOf(Date);
    expect(s.currency).toBe("IRR");
    expect(s.gross).toHaveProperty("delivered");
    expect(s.gross).toHaveProperty("shipped");
    expect(s.gross).toHaveProperty("awaiting");
    expect(s.gross).toHaveProperty("held");
    expect(s.commission).toHaveProperty("percent");
    expect(s.commission).toHaveProperty("amount");
    expect(s.net).toHaveProperty("earned");
    expect(s.net).toHaveProperty("available");
    expect(s.outlaid).toHaveProperty("requested");
    expect(s.outlaid).toHaveProperty("processing");
    expect(s.outlaid).toHaveProperty("paid");
    expect(s.outlaid).toHaveProperty("total");
    expect(s.hold).toHaveProperty("days");
    expect(s.hold).toHaveProperty("amount");
  });

  it("never fabricates data: PayoutDomainError has a machine-readable code", () => {
    const err = new PayoutDomainError("VALIDATION_ERROR", "پیام", { field: "x" });
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("پیام");
    expect(err.details).toEqual({ field: "x" });
  });
});