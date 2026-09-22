const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payout = require("../models/Payout");
const SellerProfile = require("../models/SellerProfile");
const {
  adminOverview,
  listAllPayouts,
  getPayoutDetail,
  updatePayoutStatus,
  computeBalance,
  adminPayoutToDTO,
  PayoutDomainError,
} = require("../services/FinanceService");
const { createOrder, transitionOrder } = require("../services/OrderService");

/**
 * Payout settlement queue — unit tests for the ADMIN side of FinanceService.
 * The admin HTTP surface is covered by payouts-admin.test.js; the seller side
 * by finance-unit.test.js.
 */

let adminUserId;
let sellerUserId;

beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  adminUserId = new mongoose.Types.ObjectId();
  sellerUserId = new mongoose.Types.ObjectId();
});

let profileA;
let profileB;

async function makeProfile(storeName, slug) {
  return SellerProfile.create({
    userId: new mongoose.Types.ObjectId(),
    storeName,
    slug,
    status: "active",
    finance: { commissionPercent: 0, payoutMinimum: 0, holdDays: 0 },
  });
}

async function seedPayout(profile, over = {}) {
  return Payout.create({
    sellerId: profile._id,
    sellerUserId,
    amount: 400000,
    status: "requested",
    timeline: [{ status: "requested", at: new Date(), by: sellerUserId }],
    ...over,
  });
}

async function deliverAnOrder(profile, price = 1000000) {
  const product = await Product.create({
    sellerId: profile._id,
    sellerUserId,
    title: "سفال ادمین",
    price,
    stock: { onHand: 10, reserved: 0 },
    stockPolicy: "tracked",
    status: "active",
  });
  const order = await createOrder({
    sellerId: profile._id,
    sellerUserId,
    customer: { name: "ادمین تست", phone: "09120000099" },
    items: [{ productId: String(product._id), qty: 1 }],
  });
  for (const step of ["confirmed", "processing", "shipped", "delivered"]) {
    await transitionOrder({
      orderId: String(order._id),
      sellerId: profile._id,
      nextStatus: step,
      sellerUserId,
    });
  }
  return order;
}

const decodeError = async (promise) => {
  try {
    await promise;
    throw new Error("expected a PayoutDomainError");
  } catch (e) {
    if (e instanceof PayoutDomainError) return e;
    throw e;
  }
};

beforeEach(async () => {
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await SellerProfile.deleteMany({});
  profileA = await makeProfile("فروشگاه نخشا", "nakhsha-store");
  profileB = await makeProfile("فروشگاه سفال", "sofal-store");
});

afterAll(async () => {
  await Payout.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});
  await SellerProfile.deleteMany({});
  await mongoose.connection.collection("atomiccounters").deleteMany({});
  await mongoose.connection.close();
});

describe("listAllPayouts (admin queue)", () => {
  it("returns an empty page before any payouts exist", async () => {
    const page = await listAllPayouts({});
    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(0);
  });

  it("returns every seller's payouts with seller context attached", async () => {
    await seedPayout(profileA);
    await seedPayout(profileB, { status: "processing", amount: 700000 });

    const page = await listAllPayouts({});
    expect(page.total).toBe(2);
    const stores = page.items.map((p) => p.seller?.storeName).sort();
    expect(stores).toEqual(["فروشگاه سفال", "فروشگاه نخشا"]);
    const forA = page.items.find((p) => String(p.sellerId) === String(profileA._id));
    expect(forA.seller.slug).toBe("nakhsha-store");
    expect(forA.amount).toBe(400000);
  });

  it("filters by status", async () => {
    await seedPayout(profileA);
    await seedPayout(profileB, { status: "processing", amount: 700000 });

    const page = await listAllPayouts({ status: "processing" });
    expect(page.total).toBe(1);
    expect(page.items[0].status).toBe("processing");
  });

  it("filters by method", async () => {
    await seedPayout(profileA, { method: "card" });

    const page = await listAllPayouts({ method: "card" });
    expect(page.total).toBe(1);
    expect(page.items[0].method).toBe("card");
  });

  it("filters by seller store-name (case-insensitive substring)", async () => {
    await seedPayout(profileA);
    await seedPayout(profileB);

    const page = await listAllPayouts({ seller: "سفال" });
    expect(page.total).toBe(1);
    expect(page.items[0].seller.storeName).toBe("فروشگاه سفال");
  });

  it("filters by seller slug", async () => {
    await seedPayout(profileA);
    await seedPayout(profileB);

    const page = await listAllPayouts({ seller: "nakhsha-store" });
    expect(page.total).toBe(1);
    expect(page.items[0].seller.slug).toBe("nakhsha-store");
  });

  it("returns an empty page for an unknown seller query", async () => {
    await seedPayout(profileA);

    const page = await listAllPayouts({ seller: "ناموجود کامل" });
    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(0);
  });

  it("paginates the queue", async () => {
    await seedPayout(profileA);
    await seedPayout(profileB, { status: "processing", amount: 700000 });

    const page = await listAllPayouts({ page: 1, limit: 1 });
    const page2 = await listAllPayouts({ page: 2, limit: 1 });
    expect([...page.items, ...page2.items]).toHaveLength(2);
    expect(page.total).toBe(2);
  });

  it("adminPayoutToDTO flattens seller context onto the base DTO", () => {
    const dto = adminPayoutToDTO(
      { _id: "a", sellerId: "s", amount: 1, currency: "IRR", status: "requested", method: "bank_transfer", note: "", decisionNote: "", reference: "", timeline: [], createdAt: new Date(), updatedAt: new Date() },
      { _id: "s", storeName: "فروشگاه نخشا", slug: "nakhsha-store" },
    );
    expect(dto.seller.storeName).toBe("فروشگاه نخشا");
    expect(dto.status).toBe("requested");
  });
});

describe("adminOverview", () => {
  it("aggregates counts and amounts per status", async () => {
    await seedPayout(profileA);
    await seedPayout(profileB, { status: "paid", amount: 900000 });

    const overview = await adminOverview();
    const requested = overview.items.find((i) => i.status === "requested");
    expect(requested.count).toBe(1);
    expect(requested.amount).toBe(400000);
    const paid = overview.items.find((i) => i.status === "paid");
    expect(paid.count).toBe(1);
    expect(paid.amount).toBe(900000);
    expect(overview.items).toHaveLength(Payout.PAYOUT_STATUSES.length);
    expect(overview.totalCount).toBe(2);
    expect(overview.totalAmount).toBe(1300000);
  });
});

describe("getPayoutDetail", () => {
  it("returns the payout, its seller and the seller's balance snapshot", async () => {
    await deliverAnOrder(profileA);
    const payout = await seedPayout(profileA, { amount: 500000 });

    const { payout: detail, balance } = await getPayoutDetail(String(payout._id));
    expect(detail.id).toBe(String(payout._id));
    expect(detail.seller.storeName).toBe("فروشگاه نخشا");
    // 1,000,000 delivered - 500,000 outlaid = 500,000 available
    expect(balance.net.available).toBe(500000);
  });

  it("throws PAYOUT_NOT_FOUND for an unknown id", async () => {
    const err = await decodeError(getPayoutDetail(new mongoose.Types.ObjectId().toString()));
    expect(err.code).toBe("PAYOUT_NOT_FOUND");
  });
});

describe("updatePayoutStatus (admin settlement matrix)", () => {
  it("moves requested -> processing", async () => {
    const profile = await makeProfile("فروشگاه تسویه", "settlement-store");
    const payout = await seedPayout(profile, { amount: 300000 });

    const { payout: updated, from } = await updatePayoutStatus({
      payoutId: String(payout._id),
      adminUserId,
      to: "processing",
    });
    expect(from).toBe("requested");
    expect(updated.status).toBe("processing");
    expect(updated.timeline).toHaveLength(2);
    expect(String(updated.timeline[1].by)).toBe(String(adminUserId));
    expect(updated.timeline[1].status).toBe("processing");
  });

  it("moves processing -> paid and stores the reference", async () => {
    const profile = await makeProfile("فروشگاه تسویه", "settlement-store");
    const payout = await seedPayout(profile, { amount: 300000, status: "processing" });

    const { payout: updated, from } = await updatePayoutStatus({
      payoutId: String(payout._id),
      adminUserId,
      to: "paid",
      note: "واریز انجام شد",
      reference: "PAY-2026-0001",
    });
    expect(from).toBe("processing");
    expect(updated.status).toBe("paid");
    expect(updated.reference).toBe("PAY-2026-0001");
    expect(updated.decisionNote).toBe("واریز انجام شد");
  });

  it("keeps paid terminal (no further transition)", async () => {
    const profile = await makeProfile("فروشگاه تسویه", "settlement-store");
    const payout = await seedPayout(profile, { amount: 300000, status: "paid", reference: "R1" });

    const err = await decodeError(
      updatePayoutStatus({ payoutId: String(payout._id), adminUserId, to: "rejected" }),
    );
    expect(err.code).toBe("INVALID_PAYOUT_TRANSITION");
  });

  it("rejects a requested payout and restores the seller's balance", async () => {
    const profile = await makeProfile("فروشگاه تسویه", "settlement-store");
    await deliverAnOrder(profile, 1000000);
    const balanceBefore = await computeBalance(profile._id);
    const req = await seedPayout(profile, { amount: 400000 });

    const balanceHeld = await computeBalance(profile._id);
    expect(balanceHeld.net.available).toBe(balanceBefore.net.earned - 400000);

    const { payout: updated } = await updatePayoutStatus({
      payoutId: String(req._id),
      adminUserId,
      to: "rejected",
      note: "اطلاعات بانکی ناقص است",
    });
    expect(updated.status).toBe("rejected");
    expect(updated.decisionNote).toBe("اطلاعات بانکی ناقص است");

    const balanceAfter = await computeBalance(profile._id);
    expect(balanceAfter.net.available).toBe(balanceBefore.net.earned);
  });

  it("rejects a processing payout (releasing the held amount)", async () => {
    const profile = await makeProfile("فروشگاه تسویه", "settlement-store");
    const req = await seedPayout(profile, { amount: 200000, status: "processing" });

    const before = await computeBalance(profile._id);
    expect(before.outlaid.total).toBe(200000);

    await updatePayoutStatus({
      payoutId: String(req._id),
      adminUserId,
      to: "rejected",
    });
    const after = await computeBalance(profile._id);
    expect(after.outlaid.total).toBe(0);
    expect(after.net.available).toBe(before.net.available + 200000);
  });

  it("blocks requested -> paid (must pass through processing)", async () => {
    const profile = await makeProfile("فروشگاه تسویه", "settlement-store");
    const payout = await seedPayout(profile, { amount: 100000 });

    const err = await decodeError(
      updatePayoutStatus({ payoutId: String(payout._id), adminUserId, to: "paid", reference: "X" }),
    );
    expect(err.code).toBe("INVALID_PAYOUT_TRANSITION");
  });

  it("rejects unknown target statuses with VALIDATION_ERROR", async () => {
    const profile = await makeProfile("فروشگاه تسویه", "settlement-store");
    const payout = await seedPayout(profile, { amount: 100000 });

    const err = await decodeError(
      updatePayoutStatus({ payoutId: String(payout._id), adminUserId, to: "cancelled" }),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("requires a reference to mark an amount paid", async () => {
    const profile = await makeProfile("فروشگاه تسویه", "settlement-store");
    const payout = await seedPayout(profile, { amount: 100000, status: "processing" });

    const err = await decodeError(
      updatePayoutStatus({ payoutId: String(payout._id), adminUserId, to: "paid" }),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("throws PAYOUT_NOT_FOUND for an unknown payout", async () => {
    const err = await decodeError(
      updatePayoutStatus({ payoutId: new mongoose.Types.ObjectId().toString(), adminUserId, to: "rejected" }),
    );
    expect(err.code).toBe("PAYOUT_NOT_FOUND");
  });
});