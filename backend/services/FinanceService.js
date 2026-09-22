/**
 * FinanceService — the seller Finance & Payout domain.
 *
 * Money model (all integer Rial):
 *   - Revenue is EARNED when an order is `delivered` (the customer has the
 *     goods). `shipped` revenue is in transit; `confirmed`/`processing` is
 *     awaiting action. Neither counts toward the balance.
 *   - Delivered orders inside the profile's `finance.holdDays` return window
 *     are HELD (still reversible) and excluded from the balance.
 *   - Commission applies to the eligible (held-excluded) delivered revenue at
 *     `finance.commissionPercent`; `netEarned = eligible - commission`.
 *   - A payout moves money OUT of the balance. Only non-terminal documents
 *     (`requested` + `processing` + `paid`) count as outlaid.
 *     `available = netEarned - outlaid`.
 *   - `requested` can be cancelled by the seller, releasing its amount back.
 *
 * Concurrency safety: a payout request is created first and then re-validated
 * against a freshly computed balance. Under simultaneous requests the second
 * post-commit check observes the first request's document and rolls the new
 * one back (`PAYOUT_BALANCE_EXCEEDED`), so the ledger can never go negative.
 */
const Payout = require("../models/Payout");
const Order = require("../models/Order");
const SellerProfile = require("../models/SellerProfile");

// ── Custom domain errors (controller maps these to HTTP) ────────────────────

class PayoutDomainError extends Error {
  /**
   * @param {string} code machine-readable error code
   * @param {string} message Persian user-facing message
   * @param {object} [details]
   */
  constructor(code, message, details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// ── DTO ─────────────────────────────────────────────────────────────────────

function payoutToDTO(payout) {
  const p = payout.toObject ? payout.toObject({ virtuals: true }) : payout;
  return {
    id: String(p._id),
    sellerId: String(p.sellerId),
    amount: p.amount,
    currency: p.currency || "IRR",
    status: p.status,
    method: p.method || "bank_transfer",
    note: p.note || "",
    reference: p.reference || "",
    timeline: (p.timeline || []).map((entry) => ({
      status: entry.status,
      at: entry.at,
      by: entry.by ? String(entry.by) : null,
      note: entry.note || "",
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ── Balance computation (single source of truth) ────────────────────────────

const HOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the seller's financial snapshot from the order ledger + payouts.
 *
 * @param {import("mongoose").Types.ObjectId|string} sellerId
 * @param {object} [profile] preloaded SellerProfile (skips an extra read)
 */
async function computeBalance(sellerId, profile) {
  const prof =
    profile ||
    (await SellerProfile.findById(sellerId).select("finance").lean()) ||
    { finance: {} };

  const terms = prof.finance || {};
  const commissionPercent = Number(terms.commissionPercent) || 0;
  const holdDays = Number(terms.holdDays) || 0;

  const [revenueRows, payoutRows] = await Promise.all([
    Order.aggregate([
      { $match: { sellerId } },
      { $group: { _id: "$status", total: { $sum: "$total" } } },
    ]),
    Payout.aggregate([
      { $match: { sellerId } },
      { $group: { _id: "$status", total: { $sum: "$amount" } } },
    ]),
  ]);

  const byStatus = {};
  for (const row of revenueRows) byStatus[row._id] = row.total;
  const byPayout = {};
  for (const row of payoutRows) byPayout[row._id] = row.total;

  const delivered = byStatus.delivered || 0;

  // Held = delivered inside the return/refund window, still reversible.
  let heldAmount = 0;
  if (holdDays > 0 && delivered > 0) {
    const cutoff = new Date(Date.now() - holdDays * HOLD_MS);
    const heldRows = await Order.aggregate([
      {
        $match: {
          sellerId,
          status: "delivered",
          createdAt: { $gte: cutoff },
        },
      },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]);
    heldAmount = heldRows[0]?.total || 0;
  }

  const eligibleGross = Math.max(0, delivered - heldAmount);
  const commissionAmount = Math.round((eligibleGross * commissionPercent) / 100);
  const netEarned = Math.max(0, eligibleGross - commissionAmount);

  const requested = byPayout.requested || 0;
  const processing = byPayout.processing || 0;
  const paid = byPayout.paid || 0;
  const outlaid = requested + processing + paid;
  const available = netEarned - outlaid;

  return {
    currency: "IRR",
    gross: {
      delivered,
      shipped: byStatus.shipped || 0,
      awaiting: (byStatus.confirmed || 0) + (byStatus.processing || 0),
      held: heldAmount,
    },
    commission: {
      percent: commissionPercent,
      amount: commissionAmount,
    },
    net: {
      earned: netEarned,
      available,
    },
    outlaid: {
      requested,
      processing,
      paid,
      total: outlaid,
    },
    cancelledPayouts: byPayout.cancelled || 0,
    hold: {
      days: holdDays,
      amount: heldAmount,
    },
  };
}

/**
 * Post-commit budget guard. After a payout document exists, the ledger is
 * recomputed; if outlaid has exceeded netEarned (a concurrent race), the new
 * document is rolled back and `PAYOUT_BALANCE_EXCEEDED` is thrown.
 */
async function enforceBudgetLimit(sellerId, payoutId) {
  const balance = await computeBalance(sellerId);
  if (balance.outlaid.total > balance.net.earned) {
    await Payout.deleteOne({ _id: payoutId, sellerId });
    throw new PayoutDomainError(
      "PAYOUT_BALANCE_EXCEEDED",
      "تسویه درخواستی از سقف موجودی رد شده است؛ لطفاً دوباره تلاش کنید",
      {
        available: balance.net.available,
        outlaid: balance.outlaid.total,
        netEarned: balance.net.earned,
      },
    );
  }
  return balance;
}

// ── Service ─────────────────────────────────────────────────────────────────

async function summary(sellerId) {
  const profile = await SellerProfile.findById(sellerId).select("finance").lean();
  const balance = await computeBalance(sellerId, profile);
  return { ...balance, asOf: new Date() };
}

async function listPayouts(sellerId, { page = 1, limit = 25, status } = {}) {
  const filter = { sellerId };
  if (status && Payout.PAYOUT_STATUSES.includes(status)) {
    filter.status = status;
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Payout.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Payout.countDocuments(filter),
  ]);
  return { items: items.map(payoutToDTO), total, page, limit };
}

/**
 * Request a settlement payout up to the seller's available balance.
 *
 * Flow: validate amount → pre-check against balance → create the document →
 * post-commit budget re-validation (concurrency safety net).
 */
async function requestPayout({ sellerId, sellerUserId, amount, method, note }) {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new PayoutDomainError("VALIDATION_ERROR", "مبلغ تسویه باید عدد صحیح و بزرگ‌تر از صفر باشد", {
      field: "amount",
    });
  }

  const profile = await SellerProfile.findById(sellerId).select("finance").lean();
  const terms = profile?.finance || {};
  const balance = await computeBalance(sellerId, profile);

  if (amount > balance.net.available) {
    throw new PayoutDomainError(
      "INSUFFICIENT_PAYOUT_BALANCE",
      "موجودی قابل تسویه کافی نیست",
      { available: balance.net.available, requested: amount },
    );
  }
  if (Number(terms.payoutMinimum) > 0 && amount < Number(terms.payoutMinimum)) {
    throw new PayoutDomainError(
      "PAYOUT_BELOW_MINIMUM",
      `حداقل مبلغ تسویه ${Number(terms.payoutMinimum).toLocaleString("en-US")} ریال است`,
      { minimum: Number(terms.payoutMinimum) },
    );
  }

  const payout = await Payout.create({
    sellerId,
    sellerUserId,
    amount,
    currency: balance.currency,
    status: "requested",
    method: Payout.PAYOUT_METHODS.includes(method) ? method : "bank_transfer",
    note: note || "",
    timeline: [{ status: "requested", at: new Date(), by: sellerUserId }],
  });

  await enforceBudgetLimit(sellerId, payout._id);
  return payout;
}

/**
 * Seller retracts an in-flight request. Only possible while the payout is
 * still `requested` (admin has not engaged it yet). Releases the balance back.
 */
async function cancelPayout({ sellerId, payoutId, sellerUserId, note }) {
  const payout = await Payout.findOne({ _id: payoutId, sellerId });
  if (!payout) {
    throw new PayoutDomainError("PAYOUT_NOT_FOUND", "درخواست تسویه یافت نشد", {
      field: "id",
    });
  }
  if (payout.status !== "requested") {
    throw new PayoutDomainError(
      "INVALID_PAYOUT_TRANSITION",
      `درخواست تسویه در وضعیت «${payout.status}» قابل لغو نیست`,
      { from: payout.status },
    );
  }

  payout.status = "cancelled";
  payout.timeline.push({
    status: "cancelled",
    at: new Date(),
    by: sellerUserId || null,
    note: note || "",
  });
  await payout.save();
  return payout;
}

module.exports = {
  PayoutDomainError,
  PAYOUT_STATUSES: Payout.PAYOUT_STATUSES,
  PAYOUT_METHODS: Payout.PAYOUT_METHODS,
  payoutToDTO,
  computeBalance,
  enforceBudgetLimit,
  summary,
  listPayouts,
  requestPayout,
  cancelPayout,
};