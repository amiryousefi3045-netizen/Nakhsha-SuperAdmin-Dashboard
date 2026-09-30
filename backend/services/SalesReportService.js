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
const {
  ReportRangeError,
  MAX_RANGE_DAYS,
  resolveRange,
  addDaysUtc,
  dayKey,
} = require("../utils/reportRange");

// Backwards-compatible alias: existing controllers/tests import this class
// from SalesReportService; it is now the shared ReportRangeError.
const SalesReportDomainError = ReportRangeError;

const MAX_TOP_PRODUCTS = 20;

function parseLimit(value, fallback = 5) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, 1), MAX_TOP_PRODUCTS);
}

/**
 * @param {import("mongoose").Types.ObjectId|string} sellerId
 * @param {object} [opts]
 * @param {string|Date} [opts.from] inclusive lower bound (ISO)
 * @param {string|Date} [opts.to] inclusive upper bound (ISO)
 * @param {number|string} [opts.top] top-N products by units (default 5, max 20)
 */
async function salesReport(sellerId, { from, to, top } = {}) {
  const { start, end } = resolveRange({ from, to });
  const topN = parseLimit(top);

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
              // Seller's real courier expense. Null on pre-Phase-36 orders and on
              // pickup, so `$ifNull` keeps the sum an integer rather than letting
              // one missing field poison the whole report.
              shippingCost: { $sum: { $ifNull: ["$shipping.cost", 0] } },
              shippingCostRecorded: {
                $sum: { $cond: [{ $gt: [{ $ifNull: ["$shipping.cost", 0] }, 0] }, 1, 0] },
              },
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

  const ordersRow = faceted.orders[0] || {
    count: 0,
    subtotal: 0,
    shippingFee: 0,
    discount: 0,
    total: 0,
    shippingCost: 0,
    shippingCostRecorded: 0,
  };

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
      /**
       * Delivery economics (Phase 36, P1-08). Three numbers, kept apart on
       * purpose:
       *   shippingFee      — collected from buyers
       *   shippingCost     — actually paid to couriers, and only for orders
       *                      where the seller has actually recorded it
       *   shippingMargin   — the difference, which is what the delivery part of
       *                      a sale really earned
       *
       * `shippingCostUnrecorded` is the honest part: a cost the seller has not
       * entered yet is not zero, and a report that summed the recorded ones
       * without saying so would overstate margin for every seller still in the
       * habit of not filling this in.
       */
      shippingCost: ordersRow.shippingCost,
      shippingMargin: ordersRow.shippingFee - ordersRow.shippingCost,
      shippingCostUnrecorded: Math.max(0, ordersRow.count - ordersRow.shippingCostRecorded),
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

/**
 * Row-level CSV export of the same period: one line per order, no aggregates.
 * RFC-4180 escaping (comma/quote/newline) with BOM handled by the controller.
 */
async function salesReportCsv(sellerId, { from, to } = {}) {
  const { start, end } = resolveRange({ from, to });

  const orders = await Order.find({
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
    "orderNumber",
    "orderStatus",
    "createdAt",
    "customerName",
    "customerPhone",
    "items",
    "units",
    "subtotal",
    "shippingFee",
    "discount",
    "total",
    "currency",
    // Phase 36, P1-08. Appended rather than inserted so an existing importer
    // that reads by position still lines up.
    "shippingMethod",
    "shippingKind",
    "shippingZone",
    "shippingCost",
    "shippingMargin",
    "shippingCostRecorded",
  ];

  const rows = orders.map((o) => {
    const fee = o.shipping?.fee || 0;
    const cost = o.shipping?.cost || 0;
    const recorded = cost > 0;
    return [
      o.orderNumber,
      o.status,
      o.createdAt.toISOString(),
      o.customer?.name,
      o.customer?.phone,
      o.items?.map((i) => `${i.title} x${i.qty}`).join(" | "),
      o.items?.reduce((sum, i) => sum + (i.qty || 0), 0),
      o.subtotal,
      o.shippingFee,
      o.discount,
      o.total,
      o.currency,
      o.shipping?.methodTitle || "",
      o.shipping?.kind || "",
      o.shipping?.zoneLabel || "",
      cost,
      fee - cost,
      // "no" rather than blank, so a spreadsheet formula can tell "not entered"
      // from "entered as zero" instead of reading an empty cell as free freight.
      recorded ? "yes" : "no",
    ]
      .map(csvCell)
      .join(",");
  });

  return header.map(csvCell).join(",") + "\r\n" + rows.join("\r\n");
}

module.exports = {
  SalesReportDomainError,
  MAX_RANGE_DAYS,
  salesReport,
  salesReportCsv,
};