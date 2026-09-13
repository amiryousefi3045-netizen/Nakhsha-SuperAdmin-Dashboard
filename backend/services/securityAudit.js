/**
 * Security & Database health audit for the Super Admin dashboard.
 *
 * Runs on-demand (never on page load without an explicit action) and returns
 * a grouped list of checks against the live MongoDB database plus the running
 * process configuration. Every check is wrapped so a single failure never
 * crashes the whole audit.
 */
const mongoose = require("mongoose");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const { Listing } = require("../models/Listing");
const Craft = require("../models/Craft");
const AuditLog = require("../models/AuditLog");

const DB_COLLECTIONS = [
  { name: "users", model: User },
  { name: "user_listings", model: Listing },
  { name: "listings", model: Craft },
  { name: "auditLogs", model: AuditLog },
  { name: "refreshtokens", model: RefreshToken },
];

const REQUIRED_USER_INDEXES = [
  { name: "phone_1", hint: "unique index on phone (auth de-dup)" },
  { name: "handle_1", hint: "unique sparse index on handle" },
  { name: "unique_super_admin_count", hint: "partial unique index enforcing single super_admin" },
  { name: "role_1_isVerified_1", hint: "compound index on role + isVerified" },
];

const REQUIRED_LISTING_INDEXES = [
  { name: "status_1_createdAt_-1", hint: "admin filtering by status" },
  { name: "type_1_status_1_createdAt_-1", hint: "admin filtering by type + status" },
  { name: "location_geo_idx", hint: "2dsphere for nearby queries" },
  { name: "listings_text_idx", hint: "full-text search" },
];

const REQUIRED_CRAFT_INDEXES = [
  { name: "craft_text_search", hint: "full-text search" },
  { name: "location.geometry_2dsphere", hint: "2dsphere for nearby queries" },
];

const REQUIRED_AUDIT_INDEXES = [
  { name: "createdAt_-1", hint: "timeline queries" },
  { name: "riskLevel_1_createdAt_-1", hint: "risk screens" },
  { name: "compliance.retentionUntil_1", hint: "TTL retention" },
];

const REQUIRED_REFRESH_INDEXES = [
  { name: "userId_1", hint: "lookup tokens by user" },
  { name: "tokenHash_1", hint: "token lookup by hash" },
  { name: "revokedAt_-1", hint: "revocation filtering" },
];

function connState() {
  switch (mongoose.connection.readyState) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    case 0:
      return "disconnected";
    default:
      return "unknown";
  }
}

async function safe(fn) {
  try {
    return await fn();
  } catch (e) {
    return { __error: e.message };
  }
}

function indexNames(indexes) {
  return new Set(Object.keys(indexes));
}

async function missingIndexes(collection, required) {
  const names = indexNames(await collection.getIndexes());
  return required.filter((r) => !names.has(r.name));
}

async function orphans(model, refField) {
  const rows = await model.aggregate([
    { $match: { [refField]: { $ne: null } } },
    {
      $lookup: {
        from: "users",
        localField: refField,
        foreignField: "_id",
        as: "refs",
      },
    },
    { $match: { refs: { $size: 0 } } },
    { $limit: 10 },
    { $project: { id: "$_id" } },
  ]);
  return rows.map((r) => String(r.id));
}

async function runAudit() {
  const checks = [];
  const push = (check) => checks.push(check);

  const db = mongoose.connection.db;

  // ── DB group ──
  {
    const state = connState();
    push({
      key: "db.connection",
      group: "db",
      status: state === "connected" ? "ok" : "fail",
      label: "اتصال به دیتابیس",
      detail: `Mongoose readyState = ${state} (${mongoose.connection.readyState})`,
      fix: state === "connected" ? null : "اتصال سرور به MongoDB را بررسی کنید.",
    });
  }

  {
    const info = await safe(() =>
      db.admin().command({ buildInfo: 1 }).then((b) => b.version),
    );
    push({
      key: "db.server",
      group: "db",
      status: typeof info === "string" ? "ok" : "warn",
      label: "نسخه سرور MongoDB",
      detail:
        typeof info === "string"
          ? `MongoDB ${info}`
          : info && info.__error
            ? `قابل دریافت نبود: ${info.__error}`
            : "قابل دریافت نبود",
      fix: null,
    });
  }

  {
    const dbName = db ? db.databaseName : "nakhsha";
    const counts = {};
    const present = {};
    for (const { name } of DB_COLLECTIONS) {
      const collections = await safe(async () => {
        const names = await db.listCollections().toArray();
        return new Set(names.map((c) => c.name));
      });
      const has = collections && collections.has ? collections.has(name) : false;
      present[name] = has;
      if (has) {
        counts[name] = await safe(() => db.collection(name).countDocuments());
      }
    }
    const missing = DB_COLLECTIONS.filter((c) => !present[c.name]).map((c) => c.name);
    push({
      key: "db.collections",
      group: "db",
      status: missing.length === 0 ? "ok" : "warn",
      label: "جمع‌آوری‌های موردنیاز دیتابیس",
      detail:
        missing.length === 0
          ? `هر ${DB_COLLECTIONS.length} collection موجود است (db: ${dbName}).`
          : `collection‌های جا‌افتاده: ${missing.join("، ")}`,
      fix: missing.length === 0 ? null : "collection ناقص است؛ با سرویس اصلی یا اسکریپت seed ساخته شود.",
    });
    push({
      key: "db.counts",
      group: "db",
      status: "ok",
      label: "شمارش اسناد",
      detail: Object.entries(counts)
        .filter(([k]) => counts[k] !== undefined)
        .map(([k, v]) => `${k}=${typeof v === "number" ? v : "?"}`)
        .join("، "),
      fix: null,
    });
  }

  // ── Config group ──
  {
    const secret = process.env.JWT_SECRET || "";
    let status = secret.length >= 32 ? "ok" : "fail";
    let detail = `طول کلید: ${secret.length} کاراکتر`;
    if (secret && secret.length >= 32 && /(please|change|change-me|secret|default)/i.test(secret)) {
      status = "warn";
      detail += " — مقدار پیش‌فرض/ضعیف به‌نظر می‌رسد.";
    }
    push({
      key: "config.jwt.secret",
      group: "config",
      status,
      label: "کلید امضای JWT",
      detail,
      fix: status === "ok" ? null : "یک JWT_SECRET تصادفی حداقل ۳۲ کاراکتری در .env تنظیم کنید.",
    });
  }

  {
    const ttl = process.env.JWT_LIFETIME || process.env.JWT_TTL || "15m";
    const isLong = /^\s*\d+\s*d/i.test(ttl);
    push({
      key: "config.jwt.lifetime",
      group: "config",
      status: isLong || ttl === "0" ? "warn" : "ok",
      label: "عمر توکن دسترسی",
      detail: isLong
        ? `مدت توکن دسترسی ${ttl} است — بیشتر از ۲۴ ساعت باعث افزایش ریسک می‌شود.`
        : `مدت توکن دسترسی ${ttl} (ترجیحاً ≤ ۳۰ دقیقه).`,
      fix: isLong ? "توکن دسترسی را به مدت کوتاه (مثلاً 15 دقیقه) تنظیم کنید." : null,
    });
  }

  {
    const ttl = Number(process.env.OTP_TTL_SECONDS ?? 120);
    const resend = Number(process.env.OTP_RESEND_SECONDS ?? 60);
    const attempts = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);
    const bad = [];
    if (!(ttl >= 30 && ttl <= 300)) bad.push(`TTL=${ttl}`);
    if (!(resend >= 30)) bad.push(`resend=${resend}`);
    if (!(attempts <= 5)) bad.push(`attempts=${attempts}`);
    push({
      key: "config.otp",
      group: "config",
      status: bad.length === 0 ? "ok" : "warn",
      label: "تنظیمات OTP",
      detail: `TTL=${ttl}s، ارسال مجدد=${resend}s، حداکثر تلاش=${attempts}`,
      fix: bad.length === 0 ? null : `مقادیر نامناسب: ${bad.join("، ")} — TTL≤۳۰۰، تلاش ≤۵ تنظیم شود.`,
    });
  }

  {
    const origins = process.env.ALLOWED_ORIGINS || "";
    const wildcard = origins.split(",").some((o) => o.trim() === "*");
    push({
      key: "config.cors",
      group: "config",
      status: origins && !wildcard ? "ok" : "fail",
      label: "دامنه‌های مجاز CORS",
      detail: wildcard
        ? "ALLOWED_ORIGINS شامل * (wildcard) است."
        : origins
          ? `مجاز: ${origins}`
          : "ALLOWED_ORIGINS تنظیم نشده است.",
      fix: origins && !wildcard ? null : "ALLOWED_ORIGINS را به دامنه‌های واقعی بدون * تنظیم کنید.",
    });
  }

  {
    const env = process.env.NODE_ENV || "development";
    push({
      key: "config.env",
      group: "config",
      status: env === "production" ? "ok" : "warn",
      label: "محیط اجرا",
      detail: `NODE_ENV=${env}`,
      fix: env === "production" ? null : "برای استقرار واقعی NODE_ENV=production ست کنید.",
    });
  }

  {
    const phone = process.env.SUPER_ADMIN_PHONE || "";
    push({
      key: "config.super_admin_phone",
      group: "config",
      status: phone ? "ok" : "warn",
      label: "شماره بوت‌استرپ سوپر ادمین",
      detail: phone
        ? "SUPER_ADMIN_PHONE تنظیم است."
        : "تنظیم نشده — فقط مسیر OTP می‌تواند نقش super_admin را تخصیص دهد.",
      fix: null,
    });
  }

  // ── Auth invariants ──
  {
    const superAdminCount = await safe(async () =>
      User.countDocuments({ role: "super_admin" }),
    );
    const n = typeof superAdminCount === "number" ? superAdminCount : -1;
    push({
      key: "auth.super_admin_count",
      group: "integrity",
      status: n === 1 ? "ok" : "fail",
      label: "یکتایی سوپر ادمین",
      detail: `تعداد کاربران با نقش super_admin: ${n} (باید دقیقاً ۱ باشد)`,
      fix: n === 1 ? null : "بایستی دقیقاً یک super_admin وجود داشته باشد.",
    });
  }

  // ── Integrity group ──
  {
    const list = await safe(() => orphans(Craft, "author"));
    push({
      key: "integrity.crafts_orphans",
      group: "integrity",
      status: list && list.length === 0 ? "ok" : "fail",
      label: "صنایع‌دستی با نویسنده ناموجود",
      detail: list && list.length ? `${list.length} مورد: ${list.join("، ")}` : "موردی یافت نشد",
      fix: list && list.length ? "نویسنده این صنایع‌دستی حذف شده؛ رکورد را حذف یا به نویسنده معتبر وصل کنید." : null,
    });

    const list2 = await safe(() => orphans(Listing, "owner"));
    push({
      key: "integrity.listings_orphans",
      group: "integrity",
      status: list2 && list2.length === 0 ? "ok" : "fail",
      label: "محتواها با مالک ناموجود",
      detail: list2 && list2.length ? `${list2.length} مورد: ${list2.join("، ")}` : "موردی یافت نشد",
      fix: list2 && list2.length ? "مالک این محتواها حذف شده؛ به مالک معتبر وصل یا حذف کنید." : null,
    });

    const list3 = await safe(() => orphans(RefreshToken, "userId"));
    push({
      key: "integrity.refresh_orphans",
      group: "integrity",
      status: list3 && list3.length === 0 ? "ok" : "fail",
      label: "توکن‌های رفرش یتیم",
      detail: list3 && list3.length ? `${list3.length} مورد یافت شد` : "موردی یافت نشد",
      fix: list3 && list3.length ? "توکن‌های rفرش بدون کاربر را حذف کنید." : null,
    });

    const list4 = await safe(() => orphans(AuditLog, "userId"));
    push({
      key: "integrity.audit_orphans",
      group: "integrity",
      status: list4 && list4.length === 0 ? "ok" : "fail",
      label: "لاگ‌های عملیات بدون کاربر",
      detail: list4 && list4.length ? `${list4.length} مورد یافت شد` : "موردی یافت نشد",
      fix: list4 && list4.length ? "لاگ‌های فاقد کاربر معتبر را بررسی کنید." : null,
    });

    {
      const blockedWithSessions = await safe(async () => {
        const blocked = await User.find({ isBlocked: true }).select("_id").lean();
        if (blocked.length === 0) return [];
        return RefreshToken.aggregate([
          { $match: { userId: { $in: blocked.map((u) => u._id) }, revokedAt: null, expiresAt: { $gt: new Date() } } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ]);
      });
      const count = blockedWithSessions && blockedWithSessions.length ? blockedWithSessions[0].count : 0;
      push({
        key: "integrity.blocked_sessions",
        group: "integrity",
        status: count === 0 ? "ok" : "warn",
        label: "نشست‌های فعال کاربران مسدود",
        detail: count === 0 ? "هیچ نشست فعالی برای کاربران مسدود نیست" : `${count} نشست فعال برای کاربران مسدود یافت شد`,
        fix: count === 0 ? null : "نشست‌های کاربران مسدود را ببندید (revokeAllTokens).",
      });
    }

    {
      const verifiedWithoutContent = await safe(async () => {
        const verified = await User.find({ isVerified: true }).select("_id").lean();
        if (verified.length === 0) return 0;
        const ids = verified.map((u) => u._id);
        const [lCnt, cCnt] = await Promise.all([
          Listing.countDocuments({ owner: { $in: ids } }),
          Craft.countDocuments({ author: { $in: ids } }),
        ]);
        return { verifiedTotal: ids.length, withContent: lCnt + cCnt };
      });
      const v = verifiedWithoutContent || {};
      push({
        key: "integrity.verified_without_content",
        group: "integrity",
        status: "ok",
        label: "احراز هویت بدون محتوا",
        detail: `${v.verifiedTotal ?? "?"} کاربر تأییدشده — ${v.withContent ?? "?"} دارای محتوا`,
        fix: null,
      });
    }
  }

  // ── Indexes group ──
  const indexGroups = [
    { key: "index.users", label: "ایندکس‌های کاربران", required: REQUIRED_USER_INDEXES, collection: User.collection },
    { key: "index.listings", label: "ایندکس‌های محتوا", required: REQUIRED_LISTING_INDEXES, collection: Listing.collection },
    { key: "index.crafts", label: "ایندکس‌های صنایع‌دستی", required: REQUIRED_CRAFT_INDEXES, collection: Craft.collection },
    { key: "index.audit", label: "ایندکس‌های لاگ عملیات", required: REQUIRED_AUDIT_INDEXES, collection: AuditLog.collection },
    { key: "index.refreshtoken", label: "ایندکس‌های توکن رفرش", required: REQUIRED_REFRESH_INDEXES, collection: RefreshToken.collection },
  ];
  for (const grp of indexGroups) {
    const missing = await safe(() => missingIndexes(grp.collection, grp.required));
    const list = Array.isArray(missing) ? missing : [];
    push({
      key: grp.key,
      group: "index",
      status: list.length === 0 ? "ok" : "warn",
      label: grp.label,
      detail: list.length === 0 ? "همه ایندکس‌های لازم موجود است." : `جا‌افتاده: ${list.map((m) => m.name).join("، ")}`,
      fix: list.length === 0 ? null : `ایندکس‌های زیر ساخته شوند: ${list.map((m) => m.name).join("، ")} (${list.map((m) => m.hint).join("؛ ")})`,
    });
  }

  // ── Summary ──
  const summary = { ok: 0, warn: 0, fail: 0 };
  for (const c of checks) {
    if (c.status === "ok") summary.ok += 1;
    else if (c.status === "warn") summary.warn += 1;
    else if (c.status === "fail") summary.fail += 1;
  }
  const score = Math.max(0, 100 - summary.fail * 15 - summary.warn * 4);

  return {
    generatedAt: new Date().toISOString(),
    dbName: db ? db.databaseName : "nakhsha",
    connState: connState(),
    score,
    summary,
    checks,
  };
}

module.exports = { runAudit };