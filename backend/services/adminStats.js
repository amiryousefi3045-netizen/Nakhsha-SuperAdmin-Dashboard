/**
 * Admin Statistics Service
 *
 * Aggregated, index-friendly statistics for the Super Admin dashboard.
 * Every function uses MongoDB Aggregation with early $match stages so the
 * database can leverage indexes instead of shipping whole collections into
 * Node.js memory. All functions are async and return predictable shapes.
 */

const mongoose = require("mongoose");
const User = require("../models/User");
const Craft = require("../models/Craft");
const { Listing } = require("../models/Listing");
const AuditLog = require("../models/AuditLog");
const RefreshToken = require("../models/RefreshToken");

const DAY_MS = 24 * 60 * 60 * 1000;

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

/**
 * ISO date key in the server's local timezone (YYYY-MM-DD).
 */
function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Build a contiguous list of day keys for the last `days` days (including today).
 */
function buildDayRange(days) {
  const keys = [];
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(dayKey(new Date(start.getTime() - i * DAY_MS)));
  }
  return keys;
}

/**
 * Overview card numbers for the dashboard.
 * @returns {Promise<{
 *   totalUsers: number,
 *   activeContent: number,
 *   pendingContent: number,
 *   blockedUsers: number
 * }>}
 */
async function getOverviewStats() {
  const [totalUsers, blockedUsers, publishedListings, pendingListings, publishedCrafts] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isBlocked: true }),
      Listing.countDocuments({ status: "published" }),
      Listing.countDocuments({ status: "pending" }),
      Craft.countDocuments({ isPublished: true }),
    ]);

  return {
    totalUsers,
    activeContent: publishedListings + publishedCrafts,
    pendingContent: pendingListings,
    blockedUsers,
  };
}

/**
 * Daily growth of users and content over the last `days` days.
 * @param {number} [days=30]
 * @returns {Promise<Array<{ date: string, users: number, content: number }>>}
 */
async function getGrowthTrend(days = 30) {
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), 365);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const start = new Date(startOfToday.getTime() - (safeDays - 1) * DAY_MS);

  const [userRows, listingRows, craftRows] = await Promise.all([
    User.aggregate([
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Tehran" } },
          count: { $sum: 1 },
        },
      },
    ]),
    Listing.aggregate([
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Tehran" } },
          count: { $sum: 1 },
        },
      },
    ]),
    Craft.aggregate([
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Tehran" } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const userMap = new Map(userRows.map((r) => [r._id, r.count]));
  const contentMap = new Map(listingRows.map((r) => [r._id, r.count]));
  craftRows.forEach((r) => {
    contentMap.set(r._id, (contentMap.get(r._id) || 0) + r.count);
  });

  return buildDayRange(safeDays).map((date) => ({
    date,
    users: userMap.get(date) || 0,
    content: contentMap.get(date) || 0,
  }));
}

/**
 * Distribution of content by type (listing discriminators + crafts).
 * @returns {Promise<Array<{ type: string, count: number }>>}
 */
async function getContentDistribution() {
  const LISTING_TYPES = ["post", "tour", "training", "academy"];

  const [listingRows, craftCount] = await Promise.all([
    Listing.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Craft.countDocuments(),
  ]);

  const byType = new Map(listingRows.map((r) => [r._id, r.count]));
  const items = LISTING_TYPES.filter((t) => byType.has(t)).map((t) => ({
    type: t,
    count: byType.get(t),
  }));

  if (craftCount > 0) {
    items.push({ type: "craft", count: craftCount });
  }

  return items.sort((a, b) => b.count - a.count);
}

/**
 * Top cities by aggregated content count (listings + crafts).
 * @param {number} [limit=10]
 * @returns {Promise<Array<{ city: string, count: number }>>}
 */
async function getTopCities(limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const [listingRows, craftRows] = await Promise.all([
    Listing.aggregate([
      { $match: { "location.city": { $exists: true, $ne: null, $nin: ["", " "] } } },
      { $group: { _id: "$location.city", count: { $sum: 1 } } },
    ]),
    Craft.aggregate([
      { $match: { "location.city": { $exists: true, $ne: null, $nin: ["", " "] } } },
      { $group: { _id: "$location.city", count: { $sum: 1 } } },
    ]),
  ]);

  const byCity = new Map();
  listingRows.forEach((r) => byCity.set(r._id, (byCity.get(r._id) || 0) + r.count));
  craftRows.forEach((r) => byCity.set(r._id, (byCity.get(r._id) || 0) + r.count));

  return Array.from(byCity.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, safeLimit);
}

/**
 * Raw collection totals for the "database" dashboard card.
 * Uses estimated counts (O(1) via collection metadata) for speed.
 * @returns {Promise<{ users: number, listings: number, crafts: number, auditLogs: number, refreshTokens: number }>}
 */
async function getDbTotals() {
  const [users, listings, crafts, auditLogs, refreshTokens] = await Promise.all([
    User.estimatedDocumentCount(),
    Listing.estimatedDocumentCount(),
    Craft.estimatedDocumentCount(),
    AuditLog.estimatedDocumentCount(),
    RefreshToken.estimatedDocumentCount(),
  ]);

  return { users, listings, crafts, auditLogs, refreshTokens };
}

/**
 * Latest admin/sensitive activity from the audit log.
 * @param {number} [limit=20]
 * @returns {Promise<Array<{
 *   id: string,
 *   action: string,
 *   actorId: string,
 *   actorName: string,
 *   resource: { type?: string, id?: string } | null,
 *   changes: { before?: unknown, after?: unknown } | null,
 *   result: string,
 *   riskLevel: string,
 *   ip: string,
 *   createdAt: string
 * }>>}
 */
async function getRecentActivity(limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const logs = await AuditLog.find({})
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .populate({ path: "userId", select: "name handle" })
    .lean();

  return logs.map((log) => ({
    id: String(log._id),
    action: log.action,
    actorId: log.userId ? String(log.userId._id) : null,
    actorName:
      (log.userId && (log.userId.name || log.userId.handle)) || "سیستم",
    resource: log.resource
      ? {
          type: log.resource.type || null,
          id: log.resource.id ? String(log.resource.id) : null,
        }
      : null,
    changes: log.changes || null,
    result: log.result || "SUCCESS",
    riskLevel: log.riskLevel || "LOW",
    ip: log.requestContext?.ip || null,
    createdAt: log.createdAt,
  }));
}

/**
 * True when an id string is a valid MongoDB ObjectId (used before $match).
 * Exported for the controller's query validation.
 */
module.exports = {
  getOverviewStats,
  getGrowthTrend,
  getContentDistribution,
  getTopCities,
  getRecentActivity,
  getDbTotals,
  isValidObjectId,
};