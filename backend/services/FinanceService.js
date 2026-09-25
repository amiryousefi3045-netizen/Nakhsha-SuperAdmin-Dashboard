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
const { resolveRange } = require("../utils/reportRange");

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
    decisionNote: p.decisionNote || "",
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

/** Admin-facing payout row: base DTO + the owning seller's public context. */
function adminPayoutToDTO(payout, seller = null) {
  return {
    ...payoutToDTO(payout),
    seller: seller
      ? { id: String(seller._id), storeName: seller.storeName, slug: seller.slug }
      : null,
  };
}

/** Regex-escape user input before embedding in a query (re DOS). */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  const profile = await SellerProfile.findById(sellerId).select("finance settings").lean();
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

  // Fall back to the store's configured default method when the seller omits
  // (or sends an unsupported) method on this request.
  const defaultMethod =
    profile?.settings?.defaultPayoutMethod &&
    Payout.PAYOUT_METHODS.includes(profile.settings.defaultPayoutMethod)
      ? profile.settings.defaultPayoutMethod
      : "bank_transfer";

  const payout = await Payout.create({
    sellerId,
    sellerUserId,
    amount,
    currency: balance.currency,
    status: "requested",
    method: Payout.PAYOUT_METHODS.includes(method) ? method : defaultMethod,
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

/**
 * Period settlement report for a seller (Phase 28).
 *
 * Scoped strictly to `{ sellerId, createdAt: [start, end] }` — never
 * client-supplied sellerId. Returns per-status/per-method aggregates plus a
 * continuous daily series, mirroring the sales report shape so the front-end
 * can render the same patterns.
 *
 * @param {import("mongoose").Types.ObjectId|string} sellerId
 * @param {object} [opts] `from`/`to` ISO bounds (inclusive UTC days)
 * @throws {ReportRangeError} on invalid/inverted/oversized windows
 */
function emptyStatusAgg() {
  const agg = {};
  for (const s of Payout.PAYOUT_STATUSES) agg[s] = { count: 0, amount: 0 };
  return agg;
}

async function payoutReport(sellerId, { from, to } = {}) {
  const { start, end } = resolveRange({ from, to });

  const match = { sellerId, createdAt: { $gte: start, $lte: end } };

  const [faceted] = await Payout.aggregate([
    { $match: match },
    {
      $facet: {
        byStatus: [
          { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
        ],
        byMethod: [
          { $group: { _id: "$method", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
        ],
        daily: [
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" },
              },
              count: { $sum: 1 },
              amount: { $sum: "$amount" },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const byStatusMap = {};
  for (const row of faceted.byStatus) byStatusMap[row._id] = row;

  const summary = { total: { count: 0, amount: 0 }, ...emptyStatusAgg() };
  for (const s of Payout.PAYOUT_STATUSES) {
    const row = byStatusMap[s];
    summary[s] = { count: row?.count || 0, amount: row?.amount || 0 };
    summary.total.count += summary[s].count;
    summary.total.amount += summary[s].amount;
  }

  const byMethodMap = {};
  for (const row of faceted.byMethod) byMethodMap[row._id] = row;
  const byMethod = Payout.PAYOUT_METHODS.map((method) => ({
    method,
    count: byMethodMap[method]?.count || 0,
    amount: byMethodMap[method]?.amount || 0,
  }));

  const dailyMap = {};
  for (const row of faceted.daily) dailyMap[row._id] = row;
  const daily = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    daily.push({
      day: key,
      count: dailyMap[key]?.count || 0,
      amount: dailyMap[key]?.amount || 0,
    });
  }

  return {
    period: { from: start, to: end },
    summary,
    byMethod,
    daily,
    currency: "IRR",
  };
}

/**
 * Row-level CSV export of the same settlement window: one line per payout,
 * sorted by creation date ascending. RFC-4180 escaping; the controller adds
 * the UTF-8 BOM so Excel/Persian text renders correctly.
 */
async function payoutReportCsv(sellerId, { from, to } = {}) {
  const { start, end } = resolveRange({ from, to });

  const payouts = await Payout.find({
    sellerId,
    createdAt: { $gte: start, $lte: end },
  })
    .sort({ createdAt: 1 })
    .lean();

  const csvCell = (value) => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    "id",
    "status",
    "method",
    "amount",
    "currency",
    "note",
    "decisionNote",
    "reference",
    "createdAt",
    "updatedAt",
  ];

  const rows = payouts.map((p) =>
    [
      String(p._id),
      p.status,
      p.method,
      p.amount,
      p.currency,
      p.note,
      p.decisionNote,
      p.reference,
      p.createdAt.toISOString(),
      p.updatedAt.toISOString(),
    ]
      .map(csvCell)
      .join(","),
  );

  return header.map(csvCell).join(",") + "\r\n" + rows.join("\r\n");
}

// ── Admin / settlement-queue service ────────────────────────────────────────

/**
 * Admin view over every seller's payouts. Optional filter by status, method or
 * seller store-name/slug/id. Attaches each row's seller context. Throws nothing:
 * an unknown seller just yields an empty page.
 */
async function listAllPayouts({ page = 1, limit = 25, status, method, seller } = {}) {
  const filter = {};
  if (status && Payout.PAYOUT_STATUSES.includes(status)) {
    filter.status = status;
  }
  if (method && Payout.PAYOUT_METHODS.includes(method)) {
    filter.method = method;
  }

  if (seller && String(seller).trim()) {
    const query = String(seller).trim();
    const profileMatch = {
      $or: [
        { storeName: { $regex: escapeRegex(query), $options: "i" } },
        { slug: { $regex: escapeRegex(query), $options: "i" } },
      ],
    };
    if (query.match(/^[a-fA-F0-9]{24}$/)) {
      profileMatch.$or.push({ _id: query });
    }
    const profiles = await SellerProfile.find(profileMatch).select("_id").lean();
    if (profiles.length === 0) {
      return { items: [], total: 0, page, limit };
    }
    filter.sellerId = { $in: profiles.map((p) => p._id) };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Payout.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Payout.countDocuments(filter),
  ]);

  const sellerIdsOnPage = [...new Set(items.map((p) => String(p.sellerId)))];
  const sellers = sellerIdsOnPage.length
    ? await SellerProfile.find({ _id: { $in: sellerIdsOnPage } }).select("storeName slug").lean()
    : [];
  const sellersById = new Map(sellers.map((s) => [String(s._id), s]));

  return {
    items: items.map((p) => adminPayoutToDTO(p, sellersById.get(String(p.sellerId)) || null)),
    total,
    page,
    limit,
  };
}

/** Per-status counts and totals across the whole settlement queue. */
async function adminOverview() {
  const rows = await Payout.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ]);
  const byStatus = {};
  for (const row of rows) {
    byStatus[row._id] = { count: row.count, amount: row.amount };
  }
  const items = Payout.PAYOUT_STATUSES.map((status) => ({
    status,
    count: byStatus[status]?.count || 0,
    amount: byStatus[status]?.amount || 0,
  }));
  return {
    items,
    totalCount: rows.reduce((sum, r) => sum + r.count, 0),
    totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
  };
}

/**
 * Admin detail view: the payout + its seller + the seller's financial snapshot
 * (useful as a sanity check before authorizing payment).
 */
async function getPayoutDetail(payoutId) {
  const payout = await Payout.findById(payoutId).catch(() => null);
  if (!payout) {
    throw new PayoutDomainError("PAYOUT_NOT_FOUND", "درخواست تسویه یافت نشد", { field: "id" });
  }
  const seller = await SellerProfile.findById(payout.sellerId).select("storeName slug").lean();
  const balance = await computeBalance(payout.sellerId);
  return { payout: adminPayoutToDTO(payout, seller || null), balance };
}

/**
 * Admin advances the settlement queue. Returns `{ payout, from }` so the
 * controller can audit the exact transition.
 *
 * Matrix:
 *   requested  -> processing | rejected   (start settlement / decline)
 *   processing -> paid (reference req.) | rejected
 *   paid/cancelled/rejected are terminal.
 */
async function updatePayoutStatus({ payoutId, adminUserId, to, note, reference }) {
  const payout = await Payout.findById(payoutId).catch(() => null);
  if (!payout) {
    throw new PayoutDomainError("PAYOUT_NOT_FOUND", "درخواست تسویه یافت نشد", { field: "id" });
  }

  const allowedTargets = ["processing", "paid", "rejected"];
  if (!allowedTargets.includes(to)) {
    throw new PayoutDomainError("VALIDATION_ERROR", "وضعیت مقصد نامعتبر است", { field: "status" });
  }

  const from = payout.status;
  const transitions = {
    requested: ["processing", "rejected"],
    processing: ["paid", "rejected"],
  };
  if (!(transitions[from] || []).includes(to)) {
    throw new PayoutDomainError(
      "INVALID_PAYOUT_TRANSITION",
      `تغییر وضعیت تسویه از «${from}» به «${to}» مجاز نیست`,
      { from, to },
    );
  }

  if (to === "paid" && !(reference && String(reference).trim())) {
    throw new PayoutDomainError(
      "VALIDATION_ERROR",
      "برای ثبت پرداخت، کد مرجع (رسید پرداخت) الزامی است",
      { field: "reference" },
    );
  }

  const trimmedNote = typeof note === "string" ? note.trim() : "";

  payout.status = to;
  if (trimmedNote) {
    payout.decisionNote = trimmedNote;
  }
  if (to === "paid" && String(reference).trim()) {
    payout.reference = String(reference).trim();
  }
  payout.timeline.push({
    status: to,
    at: new Date(),
    by: adminUserId || null,
    note: trimmedNote,
  });
  await payout.save();

  return { payout, from };
}

module.exports = {
  PayoutDomainError,
  PAYOUT_STATUSES: Payout.PAYOUT_STATUSES,
  PAYOUT_METHODS: Payout.PAYOUT_METHODS,
  payoutToDTO,
  adminPayoutToDTO,
  computeBalance,
  enforceBudgetLimit,
  summary,
  listPayouts,
  requestPayout,
  cancelPayout,
  payoutReport,
  payoutReportCsv,
  listAllPayouts,
  adminOverview,
  getPayoutDetail,
  updatePayoutStatus,
};