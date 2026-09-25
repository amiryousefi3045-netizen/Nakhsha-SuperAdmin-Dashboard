/**
 * SalesReportService — period sales report for a seller (Phase 24).
 *
 * Everything is scoped to `{ sellerId, createdAt: [from, to] }`; the caller
 * (controller) derives sellerId from the authenticated seller, so a seller can
 * never read another store's numbers through the API.
 *
 * Time bucketing uses UTC days (parameterised in the aggregation and mirrored
 * in JS) so "today" and the chart buckets are unambiguous regardless of the
 * host timezone.
 */
const Order = require("../models/Order");

const DEFAULT_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const MAX_TOP_PRODUCTS = 20;

class SalesReportDomainError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function parseLimit(value, fallback = 5) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, 1), MAX_TOP_PRODUCTS);
}

function dayKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Midnight (UTC) of the given date — the inclusive lower edge of its day. */
function startOfDayUtc(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Last millisecond (UTC) of the given date — the inclusive upper edge. */
function endOfDayUtc(d) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );
}

function addDaysUtc(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/**
 * @param {import("mongoose").Types.ObjectId|string} sellerId
 * @param {object} [opts]
 * @param {string|Date} [opts.from] inclusive lower bound (ISO)
 * @param {string|Date} [opts.to] inclusive upper bound (ISO)
 * @param {number|string} [opts.top] top-N products by units (default 5, max 20)
 */
async function salesReport(sellerId, { from, to, top } = {}) {
  const now = new Date();
  let start = from ? new Date(from) : new Date(now.getTime() - DEFAULT_DAYS * 86400000);
  let end = to ? new Date(to) : new Date(now.getTime());

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new SalesReportDomainError("VALIDATION_ERROR", "بازه زمانی نامعتبر است", {
      field: "from/to",
    });
  }
  if (start > end) {
    throw new SalesReportDomainError(
      "VALIDATION_ERROR",
      "تاریخ شروع باید قبل از تاریخ پایان باشد",
      { field: "from" },
    );
  }
  const rangeDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new SalesReportDomainError(
      "VALIDATION_ERROR",
      `بازه زمانی نمی‌تواند بیش از ${MAX_RANGE_DAYS} روز باشد`,
      { field: "from/to" },
    );
  }
  const topN = parseLimit(top);

  // Normalise to whole UTC days so the aggregate window, the chart axis and
  // the "how many days" guard all agree on the same inclusive calendar range.
  start = startOfDayUtc(start);
  end = endOfDayUtc(end);

  const match = {
    sellerId,
    createdAt: { $gte: start, $lte: end },
  };

  const [faceted] = await Order.aggregate([
    { $match: match },
    {
      $facet: {
        orders: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              subtotal: { $sum: "$subtotal" },
              shippingFee: { $sum: "$shippingFee" },
              discount: { $sum: "$discount" },
              total: { $sum: "$total" },
            },
          },
        ],
        units: [
          { $unwind: "$items" },
          { $group: { _id: null, qty: { $sum: "$items.qty" } } },
        ],
        byStatus: [
          { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$total" } } },
        ],
        daily: [
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
              orders: { $sum: 1 },
              total: { $sum: "$total" },
            },
          },
          { $sort: { _id: 1 } },
        ],
        topProducts: [
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.productId",
              title: { $first: "$items.title" },
              orders: { $addToSet: "$_id" },
              units: { $sum: "$items.qty" },
              revenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } },
            },
          },
          {
            $project: {
              title: 1,
              units: 1,
              revenue: 1,
              orders: { $size: "$orders" },
            },
          },
          { $sort: { units: -1, revenue: -1 } },
          { $limit: topN },
        ],
      },
    },
  ]);

  const ordersRow = faceted.orders[0] || { count: 0, subtotal: 0, shippingFee: 0, discount: 0, total: 0 };

  const byStatusMap = {};
  for (const row of faceted.byStatus) byStatusMap[row._id] = row;
  const byStatus = (Order.ORDER_STATUSES || []).map((status) => ({
    status,
    count: byStatusMap[status]?.count || 0,
    total: byStatusMap[status]?.total || 0,
  }));

  // Continuous day series: aggregate rows, then fill zero-order days so the
  // chart axis is a solid timeline.
  const dailyMap = {};
  for (const row of faceted.daily) dailyMap[row._id] = row;
  const daily = [];
  for (let d = new Date(start); d <= end; d = addDaysUtc(d, 1)) {
    const key = dayKey(d);
    daily.push({
      day: key,
      orders: dailyMap[key]?.orders || 0,
      total: dailyMap[key]?.total || 0,
    });
  }

  return {
    period: { from: start, to: end },
    summary: {
      orders: ordersRow.count,
      units: faceted.units[0]?.qty || 0,
      subtotal: ordersRow.subtotal,
      shippingFee: ordersRow.shippingFee,
      discount: ordersRow.discount,
      total: ordersRow.total,
    },
    byStatus,
    topProducts: faceted.topProducts.map((p) => ({
      productId: String(p._id),
      title: p.title || "-",
      orders: p.orders,
      units: p.units,
      revenue: p.revenue,
    })),
    daily,
    currency: "IRR",
  };
}

module.exports = {
  SalesReportDomainError,
  MAX_RANGE_DAYS,
  salesReport,
};