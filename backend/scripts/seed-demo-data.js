/**
 * Seed realistic demo data into the main `nakhsha` database so every Super
 * Admin dashboard section (Providers, Listings, Crafts, Comments, Audit Logs)
 * has real-looking records that are fully manageable through the admin API.
 *
 * Idempotent & non-destructive:
 *  - Users are upserted by unique phone (never duplicates, never overwrites).
 *  - Listings/crafts are skipped when the collection already has documents.
 *  - Audit logs are only appended while the collection has fewer than 100 rows.
 *
 * Usage:
 *   node scripts/seed-demo-data.js            # seed data only
 *   node scripts/seed-demo-data.js --sync     # also ensure schema indexes
 */
require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const { Listing, PostListing, TourListing, TrainingListing, AcademyListing } = require("../models/Listing");
const Craft = require("../models/Craft");
const AuditLog = require("../models/AuditLog");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha";
const SYNC = process.argv.includes("--sync");

function daysAgo(d) {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date;
}

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600_000);
}

// ── Demo users (upserted by unique phone) ──────────────────────────────────
const demoUsers = [
  { name: "علی رضایی", phone: "09191234567", handle: "demo-ali-rezaei", role: "tour_leader", creatorType: "tour_leader", isVerified: true, isBlocked: false, bio: "تورلیدر اصفهان و کویر مرنجاب", permissions: [], location: { city: "اصفهان" } },
  { name: "مریم احمدی", phone: "09351234568", handle: "demo-maryam-ahmadi", role: "tour_leader", creatorType: "tour_leader", isVerified: true, isBlocked: false, bio: "راهنمای تورهای فرهنگی شیراز", permissions: [], location: { city: "شیراز" } },
  { name: "حسین کریمی", phone: "09194561234", handle: "demo-hossein-karimi", role: "tour_leader", creatorType: "tour_leader", isVerified: false, isBlocked: false, bio: "راهنمای تورهای کویری", permissions: [], location: { city: "کاشان" } },
  { name: "زهرا موسوی", phone: "09122334455", handle: "demo-zahra-mousavi", role: "tour_leader", creatorType: "tour_leader", isVerified: true, isBlocked: false, bio: "تورلیدر یزد و بافت تاریخی", permissions: [], location: { city: "یزد" } },
  { name: "محمد نجفی", phone: "09123456789", handle: "demo-mohammad-najafi", role: "admin", creatorType: "artisan", isVerified: true, isBlocked: false, bio: "ادمین محتوایی", permissions: ["APPROVE_CONTENT", "VIEW_AUDIT_LOGS"], location: { city: "تهران" } },
  { name: "سارا شریفی", phone: "09356677889", handle: "demo-sara-sharifi", role: "admin", creatorType: "artisan", isVerified: true, isBlocked: false, bio: "ادمین پشتیبانی کاربران", permissions: ["DELETE_USERS", "APPROVE_CONTENT"], location: { city: "تهران" } },
  { name: "رضا قاسمی", phone: "09198887766", handle: "demo-reza-ghasemi", role: "user", creatorType: "artisan", isVerified: true, isBlocked: false, bio: "مینیاتوریست و مس‌گر", permissions: [], location: { city: "اصفهان" } },
  { name: "فاطمه حسینی", phone: "09127778899", handle: "demo-fatemeh-hosseini", role: "user", creatorType: "artisan", isVerified: true, isBlocked: false, bio: "گلیم‌باف کردستان", permissions: [], location: { city: "سنندج" } },
  { name: "امیر محمدی", phone: "09193334455", handle: "demo-amir-mohammadi", role: "user", creatorType: "artisan", isVerified: false, isBlocked: false, bio: "سفالگر", permissions: [], location: { city: "نیشابور" } },
  { name: "نرگس ترابی", phone: "09354253647", handle: "demo-narges-torabi", role: "user", creatorType: "artisan", isVerified: true, isBlocked: true, bio: "عکاس صنایع دستی", permissions: [], location: { city: "تهران" }, moderatorNote: "حساب به‌دلیل تخلف در فروش بررسی شد" },
  { name: "سعید عابدینی", phone: "09191234569", handle: "demo-saeed-abedini", role: "user", creatorType: "artisan", isVerified: false, isBlocked: false, bio: "", permissions: [], location: { city: "تبریز" } },
  { name: "لیلا رستمی", phone: "09121112233", handle: "demo-leila-rostami", role: "user", creatorType: "artisan", isVerified: true, isBlocked: false, bio: "ترمه‌دوز", permissions: [], location: { city: "یزد" } },
];

// ── Demo listings (user_listings collection, only when empty) ──────────────
function buildListings(usersById) {
  return [
    { model: PostListing, doc: { title: "قالی دستباف کاشان", description: "قالی تمام‌ابریشم دستباف کاشان، ۱۲ رج، نقش شاه عباسی.", tags: ["قالی", "ابریشم"], status: "published", owner: usersById["demo-reza-ghasemi"], price: 8500000, forSale: true, category: "handwoven", location: { type: "Point", coordinates: [51.389, 33.985], city: "کاشان", province: "اصفهان", address: "خیابان امیرکبیر" }, createdAt: daysAgo(6) } },
    { model: PostListing, doc: { title: "ظرف مسی چکش‌کاری‌شده", description: "مینیاتور چکش‌کاری دستی روی مس، مناسب پذیرایی.", tags: ["مسی", "چکش‌کاری"], status: "pending", owner: usersById["demo-reza-ghasemi"], price: 1200000, forSale: true, category: "metalwork", location: { type: "Point", coordinates: [51.667, 32.653], city: "اصفهان", province: "اصفهان", address: "میدان نقش جهان" }, createdAt: daysAgo(2) } },
    { model: PostListing, doc: { title: "پارچه ترمه یزد", description: "ترمه‌ی اصیل یزدی، دستباف، در رنگ‌بندی‌های متنوع.", tags: ["ترمه", "یزد"], status: "published", owner: usersById["demo-leila-rostami"], price: 320000, forSale: true, category: "textile", location: { type: "Point", coordinates: [54.354, 31.897], city: "یزد", province: "یزد", address: "بافت تاریخی" }, createdAt: daysAgo(9) } },
    { model: PostListing, doc: { title: "سفال لعاب‌دار نیشابور", description: "کوزه‌های لعاب‌دار با طرح‌های سنتی نیشابور.", tags: ["سفال"], status: "published", owner: usersById["demo-amir-mohammadi"], price: 450000, forSale: true, category: "pottery", location: { type: "Point", coordinates: [58.795, 36.214], city: "نیشابور", province: "خراسان رضوی" }, createdAt: daysAgo(3) } },
    { model: PostListing, doc: { title: "پوست‌های چرمی دست‌دوز", description: "کیف و کمربند چرم طبیعی با دوخت دستی.", tags: ["چرم"], status: "archived", owner: usersById["demo-saeed-abedini"], price: 700000, forSale: true, category: "leather", location: { type: "Point", coordinates: [46.292, 38.08], city: "تبریز", province: "آذربایجان شرقی" }, createdAt: daysAgo(30) } },
    { model: TourListing, doc: { title: "تور سه‌روزه اصفهان گردشگری", description: "بازدید از میدان نقش جهان، سی‌وسه‌پل و کاخ چهلستون با راهنمای مجرب.", tags: ["اصفهان", "تور"], status: "published", owner: usersById["demo-ali-rezaei"], startDate: daysAgo(-5), endDate: daysAgo(-2), duration: "3 روز", durationDays: 3, capacity: 15, itinerary: "روز اول: نقش جهان، روز دوم: چهلستون و سی‌وسه‌پل، روز سوم: آتشگاه و منارجنبان", location: { type: "Point", coordinates: [51.667, 32.653], city: "اصفهان", province: "اصفهان" }, createdAt: daysAgo(12) } },
    { model: TourListing, doc: { title: "تور کویر مرنجاب", description: "ترک‌نوردی و ستاره‌شناسی در کویر مرنجاب با اقامت در کاروانسرای تاریخی.", tags: ["کویر", "مرنجاب"], status: "pending", owner: usersById["demo-hossein-karimi"], startDate: daysAgo(-20), endDate: daysAgo(-18), duration: "2 روز", durationDays: 2, capacity: 20, itinerary: "شب اول در کاروانسرای مرنجاب، صبح رصد کویر", location: { type: "Point", coordinates: [51.95, 34.266], city: "آران و بیدگل", province: "اصفهان" }, createdAt: daysAgo(1) } },
    { model: TourListing, doc: { title: "تور فرهنگی شیراز", description: "حافظیه، سعدیه و تخت جمشید در یک سفر فرهنگی سه‌روزه.", tags: ["شیراز", "فرهنگی"], status: "rejected", owner: usersById["demo-maryam-ahmadi"], startDate: daysAgo(-10), endDate: daysAgo(-7), duration: "3 روز", durationDays: 3, capacity: 12, itinerary: "روز اول: حافظیه و ارگ کریم‌خان", location: { type: "Point", coordinates: [52.531, 29.591], city: "شیراز", province: "فارس" }, createdAt: daysAgo(5) } },
    { model: TrainingListing, doc: { title: "کارگاه سفالگری مقدماتی", description: "آموزش ساخت ظروف سفالی از صفر تا پخت در کوره.", tags: ["سفالگری", "کارگاه"], status: "published", owner: usersById["demo-amir-mohammadi"], schedule: [{ dayOfWeek: 2, startTime: "10:00", endTime: "13:00" }], duration: "۸ جلسه", capacity: 10, level: "مبتدی", instructor: "امیر محمدی", location: { type: "Point", coordinates: [58.795, 36.214], city: "نیشابور", province: "خراسان رضوی" }, createdAt: daysAgo(8) } },
    { model: TrainingListing, doc: { title: "دوره میناکاری حرفه‌ای", description: "آموزش کامل میناکاری روی مس برای هنرجویان پیشرفته.", tags: ["میناکاری"], status: "pending", owner: usersById["demo-reza-ghasemi"], schedule: [{ dayOfWeek: 4, startTime: "16:00", endTime: "19:00" }], duration: "۶ جلسه", capacity: 8, level: "پیشرفته", instructor: "رضا قاسمی", location: { type: "Point", coordinates: [51.667, 32.653], city: "اصفهان", province: "اصفهان" }, createdAt: daysAgo(1) } },
    { model: AcademyListing, doc: { title: "آکادمی هنرهای سنتی اصفهان", description: "برگزاری دوره‌های رسمی معماری، نگارگری و خوشنویسی با اساتید برجسته.", tags: ["آکادمی", "هنر"], status: "published", owner: usersById["demo-ali-rezaei"], addressDetails: "طبقه سوم، جنب بازار بزرگ", phone: "031-32345678", workingHours: "شنبه تا پنجشنبه ۹ تا ۱۸", website: "https://academy.example.ir", location: { type: "Point", coordinates: [51.667, 32.653], city: "اصفهان", province: "اصفهان" }, createdAt: daysAgo(15) } },
    { model: AcademyListing, doc: { title: "مدرسه صنایع دستی تهران", description: "مرکز آموزش تخصصی صنایع دستی استان تهران.", tags: ["تهران", "آموزش"], status: "draft", owner: usersById["demo-sara-sharifi"], addressDetails: "خیابان آزادی", phone: "021-55667788", workingHours: "روزهای زوج ۱۰ تا ۱۵", location: { type: "Point", coordinates: [51.389, 35.689], city: "تهران", province: "تهران" }, createdAt: daysAgo(2) } },
  ];
}

// ── Demo crafts (listings collection, only when empty) ─────────────────────
function buildCrafts(usersById) {
  const cities = { isfahan: { city: "اصفهان" }, sanandaj: { city: "سنندج" }, tehran: { city: "تهران" }, nishabur: { city: "نیشابور" }, yazd: { city: "یزد" } };
  const craftSeed = [
    { title: "مینیاتور قاجاری", description: "تابلوی مینیاتور با طرح گل و مرغ دوره قاجار، رنگ روغن روی بوم.", kind: "artwork", craftType: "other", price: 25000000, forSale: true, author: "demo-reza-ghasemi", city: cities.isfahan, isPublished: true, comments: [{ user: "demo-maryam-ahmadi", text: "کیفیت فوق‌العاده‌ای دارد، خریدم.", rating: 5 }, { user: "demo-zahra-mousavi", text: "ارسال سریع و بسته‌بندی عالی", rating: 4 }, { user: "demo-saeed-abedini", text: "قیمت کمی بالاست ولی ارزشش را دارد", rating: 5 }], views: 142 },
    { title: "گلیم محرمات کردی", description: "گلیم اصیل کردی از جنس پشم طبیعی با نقش محرمات.", kind: "artwork", craftType: "textile", price: 3800000, forSale: true, author: "demo-fatemeh-hosseini", city: cities.sanandaj, isPublished: true, comments: [{ user: "demo-leila-rostami", text: "نقش‌های آن بی‌نظیر است", rating: 5 }, { user: "demo-ali-rezaei", text: "پشم مرغوب", rating: 4 }], views: 88 },
    { title: "کاشی هفت‌رنگ اصفهان", description: "کاشی هفت‌رنگ با طرح اسلیمی، ساخته دست هنرمند اصفهانی.", kind: "artwork", craftType: "pottery", price: 650000, forSale: true, author: "demo-amir-mohammadi", city: cities.isfahan, isPublished: true, comments: [{ user: "demo-reza-ghasemi", text: "رنگ‌ها فوق‌العاده زنده است", rating: 4 }], views: 57 },
    { title: "کلاس نقاشی مینیاتور", description: "آموزش غیرحضوری مینیاتور در ۱۲ جلسه با تمرین پروژه‌محور.", kind: "class", craftType: "other", price: 2400000, forSale: true, author: "demo-reza-ghasemi", city: cities.isfahan, isPublished: true, schedule: { date: daysAgo(-30), durationMinutes: 90, seats: 8, locationNote: "آنلاین" }, comments: [{ user: "demo-fatemeh-hosseini", text: "اساتید بسیار مسلط بودند", rating: 5 }, { user: "demo-narges-torabi", text: "عالی بود", rating: 5 }], views: 210 },
    { title: "کارگاه بافت گلیم", description: "کارگاه حضوری بافت گلیم در سنندج، ویژه مبتدیان.", kind: "class", craftType: "textile", price: 1500000, forSale: true, author: "demo-fatemeh-hosseini", city: cities.sanandaj, isPublished: true, schedule: { date: daysAgo(-14), durationMinutes: 120, seats: 6, locationNote: "سنندج، مرکز بافت" }, comments: [], views: 34 },
    { title: "ترمیم و نوسازی ظروف مسی", description: "خدمات ترمیم مس‌اندود، قلع‌اندود و نوسازی ظروف قدیمی.", kind: "service", craftType: "metalwork", price: null, forSale: false, author: "demo-reza-ghasemi", city: cities.isfahan, isPublished: true, comments: [{ user: "demo-amir-mohammadi", text: "ظرف قدیمی خانواده را عالی مرمت کردند", rating: 5 }, { user: "demo-leila-rostami", text: "نتیجه عالی", rating: 5 }, { user: "demo-maryam-ahmadi", text: "کمی تأخیر داشتند", rating: 3 }], views: 96 },
    { title: "عکاسی صنایع دستی", description: "عکاسی حرفه‌ای محصولات صنایع دستی برای فروشگاه آنلاین.", kind: "service", craftType: "other", price: 800000, forSale: true, author: "demo-narges-torabi", city: cities.tehran, isPublished: false, comments: [{ user: "demo-sara-sharifi", text: "همکاری خوبی دارد", rating: 4 }], views: 21 },
    { title: "کوزه سفالی", description: "کوزه سفالی دست‌ساز با لعاب فیروزه‌ای.", kind: "artwork", craftType: "pottery", price: 380000, forSale: true, author: "demo-amir-mohammadi", city: cities.nishabur, isPublished: false, comments: [], views: 9 },
  ];
  return craftSeed.map((seed) => {
    const author = usersById[seed.author];
    return {
      title: seed.title,
      description: seed.description,
      kind: seed.kind,
      craftType: seed.craftType,
      price: seed.price,
      forSale: seed.forSale,
      author,
      location: seed.city,
      isPublished: seed.isPublished,
      views: seed.views,
      comments: seed.comments.map((c) => ({ user: usersById[c.user], text: c.text, rating: c.rating, createdAt: daysAgo(Math.floor(Math.random() * 10)) })),
      likes: [usersById["demo-maryam-ahmadi"], usersById["demo-zahra-mousavi"], usersById["demo-narges-torabi"]].filter(Boolean).map((user) => ({ user, createdAt: daysAgo(3) })),
      tags: [seed.kind === "class" ? "آموزش" : seed.craftType],
      createdAt: daysAgo(Math.floor(Math.random() * 20)),
    };
  });
}

// ── Demo audit logs (appended only when collection is small) ───────────────
function buildAuditLogs(superAdminId, usersById) {
  const actorSuper = superAdminId;
  const admin1 = usersById["demo-mohammad-najafi"];
  const admin2 = usersById["demo-sara-sharifi"];
  const u1 = usersById["demo-reza-ghasemi"];
  const u2 = usersById["demo-fatemeh-hosseini"];
  const u3 = usersById["demo-narges-torabi"];
  const u4 = usersById["demo-ali-rezaei"];
  const u5 = usersById["demo-maryam-ahmadi"];
  const u6 = usersById["demo-amir-mohammadi"];

  const base = { result: "SUCCESS" };
  const templates = [
    { t: hoursAgo(2), userId: actorSuper, action: "LOGIN", riskLevel: "LOW", ctx: { ip: "127.0.0.1", method: "POST", endpoint: "/api/auth/verify-otp", statusCode: 200 }, meta: { source: "OTP" } },
    { t: hoursAgo(3), userId: u4, action: "LOGIN", riskLevel: "LOW", ctx: { ip: "5.119.32.101", method: "POST", endpoint: "/api/auth/verify-otp", statusCode: 200 }, meta: {} },
    { t: hoursAgo(5), userId: admin1, action: "ADMIN_USER_BANNED", resource: { type: "USER", id: u3 }, changes: { before: { isBlocked: false }, after: { isBlocked: true } }, riskLevel: "HIGH", ctx: { ip: "5.119.32.1", method: "PATCH", endpoint: "/api/admin/users/" + String(u3) + "/block", statusCode: 200 }, meta: { reason: "repeated rule violations" } },
    { t: hoursAgo(6), userId: u1, action: "LISTING_CREATED", resource: { type: "LISTING" }, changes: { before: null, after: { status: "pending" } }, riskLevel: "LOW", ctx: { ip: "10.0.0.4", method: "POST", endpoint: "/api/listings", statusCode: 201 }, meta: {} },
    { t: hoursAgo(7), userId: admin1, action: "LISTING_STATUS_CHANGED", resource: { type: "LISTING" }, changes: { before: { status: "pending" }, after: { status: "published" } }, riskLevel: "MEDIUM", ctx: { ip: "5.119.32.1", method: "PATCH", endpoint: "/api/admin/listings", statusCode: 200 }, meta: { reason: "approved" } },
    { t: hoursAgo(9), userId: u2, action: "CRAFT_CREATED", riskLevel: "LOW", ctx: { ip: "10.0.0.7", method: "POST", endpoint: "/api/crafts", statusCode: 201 }, meta: {} },
    { t: hoursAgo(11), userId: actorSuper, action: "PROVIDER_STATUS_CHANGE", resource: { type: "USER", id: u4 }, changes: { before: { status: "pending" }, after: { status: "active" } }, riskLevel: "MEDIUM", ctx: { ip: "127.0.0.1", method: "PATCH", endpoint: "/api/admin/providers", statusCode: 200 }, meta: { reason: "docs verified" } },
    { t: hoursAgo(12), userId: admin2, action: "TOKEN_REVOKED", resource: { type: "USER", id: u6 }, changes: { before: { sessionActive: true }, after: { revoked: true } }, riskLevel: "MEDIUM", ctx: { ip: "5.119.32.2", method: "DELETE", endpoint: "/api/admin/users/sessions", statusCode: 200 }, meta: {} },
    { t: hoursAgo(15), userId: actorSuper, action: "DATA_EXPORTED", riskLevel: "HIGH", ctx: { ip: "127.0.0.1", method: "GET", endpoint: "/api/admin/audit-logs/export", statusCode: 200 }, meta: { reason: "compliance review", affectedCount: 40 }, compliance: { gdprRelevant: true, dataCategories: ["PERSONAL_DATA"], retentionRequired: true } },
    { t: hoursAgo(18), userId: actorSuper, action: "DATA_BULK_OPERATION", riskLevel: "HIGH", ctx: { ip: "127.0.0.1", method: "POST", endpoint: "/api/admin/users/batch/block", statusCode: 200 }, meta: { batch: "seed", operation: "BLOCK_USERS", affectedCount: 1, ids: [String(u3)] } },
    { t: hoursAgo(20), userId: u5, action: "USER_CREATED", riskLevel: "LOW", ctx: { ip: "10.0.0.9", method: "POST", endpoint: "/api/auth/signup", statusCode: 201 }, meta: {} },
    { t: hoursAgo(22), userId: u3, action: "LOGIN", result: "FAILURE", riskLevel: "MEDIUM", ctx: { ip: "5.119.44.2", method: "POST", endpoint: "/api/auth/verify-otp", statusCode: 401 }, error: { code: "INVALID_OTP", message: "کد وارد شده صحیح نبود" }, meta: {} },
    { t: hoursAgo(24), userId: u1, action: "PASSWORD_CHANGED", riskLevel: "HIGH", ctx: { ip: "10.0.0.4", method: "PATCH", endpoint: "/api/users/me/password", statusCode: 200 }, meta: {} },
    { t: daysAgo(1), userId: actorSuper, action: "USER_ROLE_CHANGE", resource: { type: "USER", id: admin1 }, changes: { before: { role: "user" }, after: { role: "admin" } }, riskLevel: "HIGH", ctx: { ip: "127.0.0.1", method: "PATCH", endpoint: "/api/admin/users/role", statusCode: 200 }, meta: {} },
    { t: daysAgo(1), userId: u2, action: "CRAFT_CREATED", riskLevel: "LOW", ctx: { ip: "10.0.0.7", method: "POST", endpoint: "/api/crafts", statusCode: 201 }, meta: {} },
    { t: daysAgo(2), userId: actorSuper, action: "ADMIN_VERIFICATION_ISSUED", resource: { type: "USER", id: u1 }, riskLevel: "MEDIUM", ctx: { ip: "127.0.0.1", method: "PATCH", endpoint: "/api/admin/users/verify", statusCode: 200 }, meta: {} },
    { t: daysAgo(2), userId: u6, action: "LISTING_UPDATED", resource: { type: "LISTING" }, riskLevel: "LOW", ctx: { ip: "10.0.0.3", method: "PATCH", endpoint: "/api/listings", statusCode: 200 }, meta: {} },
    { t: daysAgo(3), userId: admin2, action: "USER_ROLE_CHANGE", resource: { type: "USER", id: u4 }, changes: { before: { role: "user" }, after: { role: "tour_leader" } }, riskLevel: "HIGH", ctx: { ip: "5.119.32.2", method: "PATCH", endpoint: "/api/admin/users/role", statusCode: 200 }, meta: {} },
    { t: daysAgo(3), userId: u1, action: "PAYMENT_RECEIVED", riskLevel: "LOW", ctx: { ip: "10.0.0.4", method: "POST", endpoint: "/api/payments", statusCode: 200 }, meta: { amount: 8500000, currency: "IRR" }, compliance: { gdprRelevant: true, dataCategories: ["FINANCIAL"], retentionRequired: true } },
    { t: daysAgo(4), userId: actorSuper, action: "ADMIN_CONTENT_REMOVED", resource: { type: "LISTING" }, riskLevel: "HIGH", ctx: { ip: "127.0.0.1", method: "DELETE", endpoint: "/api/admin/listings", statusCode: 200 }, meta: { reason: "inappropriate content" } },
    { t: daysAgo(4), userId: u2, action: "LISTING_PUBLISHED", riskLevel: "MEDIUM", ctx: { ip: "10.0.0.7", method: "PATCH", endpoint: "/api/listings/publish", statusCode: 200 }, meta: {} },
    { t: daysAgo(5), userId: admin1, action: "ADMIN_ROLE_ASSIGNED", resource: { type: "USER", id: admin2 }, changes: { before: { role: "user" }, after: { role: "admin" } }, riskLevel: "HIGH", ctx: { ip: "5.119.32.1", method: "PATCH", endpoint: "/api/admin/users/role", statusCode: 200 }, meta: {} },
    { t: daysAgo(5), userId: actorSuper, action: "BRUTE_FORCE_ATTEMPT", result: "FAILURE", riskLevel: "CRITICAL", ctx: { ip: "45.155.204.9", method: "POST", endpoint: "/api/auth/verify-otp", statusCode: 429 }, error: { code: "RATE_LIMITED", message: "تعداد تلاش‌ها از حد مجاز گذشت" }, meta: {}, compliance: { gdprRelevant: false } },
    { t: daysAgo(6), userId: actorSuper, action: "SUSPICIOUS_ACTIVITY_DETECTED", result: "PARTIAL", riskLevel: "CRITICAL", ctx: { ip: "185.220.101.5", method: "POST", endpoint: "/api/auth/request-otp", statusCode: 429 }, meta: { rule: "otp-burst" } },
    { t: daysAgo(6), userId: u3, action: "LOGOUT", riskLevel: "LOW", ctx: { ip: "5.119.44.2", method: "POST", endpoint: "/api/auth/logout", statusCode: 200 }, meta: {} },
    { t: daysAgo(7), userId: actorSuper, action: "IP_BLOCKED", riskLevel: "HIGH", ctx: { ip: "127.0.0.1", method: "POST", endpoint: "/api/admin/security", statusCode: 200 }, meta: { reason: "brute force pattern" } },
    { t: daysAgo(7), userId: admin1, action: "REPORT_ACCESSED", riskLevel: "MEDIUM", ctx: { ip: "5.119.32.1", method: "GET", endpoint: "/api/admin/stats", statusCode: 200 }, meta: {} },
    { t: daysAgo(8), userId: u5, action: "LISTING_CREATED", resource: { type: "LISTING" }, riskLevel: "LOW", ctx: { ip: "10.0.0.9", method: "POST", endpoint: "/api/listings", statusCode: 201 }, meta: {} },
    { t: daysAgo(9), userId: actorSuper, action: "TOKEN_REVOKED", resource: { type: "USER", id: u6 }, riskLevel: "MEDIUM", ctx: { ip: "127.0.0.1", method: "DELETE", endpoint: "/api/admin/users/sessions", statusCode: 200 }, meta: {} },
    { t: daysAgo(10), userId: u2, action: "CRAFT_UPDATED", riskLevel: "LOW", ctx: { ip: "10.0.0.7", method: "PATCH", endpoint: "/api/crafts", statusCode: 200 }, meta: {} },
    { t: daysAgo(11), userId: admin2, action: "ADMIN_USER_UNBANNED", resource: { type: "USER", id: u3 }, changes: { before: { isBlocked: true }, after: { isBlocked: false } }, riskLevel: "HIGH", ctx: { ip: "5.119.32.2", method: "PATCH", endpoint: "/api/admin/users/block", statusCode: 200 }, meta: { reason: "appeal accepted" } },
    { t: daysAgo(12), userId: actorSuper, action: "USER_BLOCK", resource: { type: "USER", id: u6 }, changes: { before: { isBlocked: false }, after: { isBlocked: true } }, riskLevel: "HIGH", ctx: { ip: "127.0.0.1", method: "PATCH", endpoint: "/api/admin/users/block", statusCode: 200 }, meta: {} },
    { t: daysAgo(13), userId: u1, action: "SESSION_CREATED", riskLevel: "LOW", ctx: { ip: "10.0.0.4", method: "POST", endpoint: "/api/auth/refresh", statusCode: 200 }, meta: {} },
    { t: daysAgo(14), userId: admin1, action: "LISTING_FLAGGED", resource: { type: "LISTING" }, riskLevel: "MEDIUM", ctx: { ip: "5.119.32.1", method: "PATCH", endpoint: "/api/admin/listings", statusCode: 200 }, meta: { reason: "duplicate content" } },
    { t: daysAgo(15), userId: actorSuper, action: "REFUND_ISSUED", riskLevel: "HIGH", ctx: { ip: "127.0.0.1", method: "POST", endpoint: "/api/payments/refund", statusCode: 200 }, meta: { amount: 1200000, currency: "IRR" }, compliance: { gdprRelevant: true, dataCategories: ["FINANCIAL"], retentionRequired: true } },
    { t: daysAgo(16), userId: u4, action: "USER_UPDATED", riskLevel: "LOW", ctx: { ip: "10.0.0.5", method: "PATCH", endpoint: "/api/users/me", statusCode: 200 }, meta: {} },
    { t: daysAgo(17), userId: actorSuper, action: "DATA_BULK_OPERATION", riskLevel: "MEDIUM", ctx: { ip: "127.0.0.1", method: "POST", endpoint: "/api/admin/listings/batch/status", statusCode: 200 }, meta: { batch: "seed", operation: "STATUS_CHANGE_LISTINGS", status: "published", affectedCount: 3 } },
    { t: daysAgo(18), userId: u6, action: "LOGOUT_ALL", riskLevel: "MEDIUM", ctx: { ip: "10.0.0.3", method: "POST", endpoint: "/api/auth/logout-all", statusCode: 200 }, meta: {} },
    { t: daysAgo(19), userId: admin2, action: "PROVIDER_STATUS_CHANGE", resource: { type: "USER", id: u5 }, changes: { before: { status: "active" }, after: { status: "suspended" } }, riskLevel: "HIGH", ctx: { ip: "5.119.32.2", method: "PATCH", endpoint: "/api/admin/providers", statusCode: 200 }, meta: { reason: "no response to warnings" } },
    { t: daysAgo(20), userId: actorSuper, action: "USER_PERMISSIONS_CHANGE", resource: { type: "USER", id: admin1 }, changes: { before: { permissions: [] }, after: { permissions: ["APPROVE_CONTENT"] } }, riskLevel: "HIGH", ctx: { ip: "127.0.0.1", method: "PATCH", endpoint: "/api/admin/users/permissions", statusCode: 200 }, meta: {} },
  ];

  return templates.map(({ t, ctx, meta, compliance, ...rest }) => {
    const log = {
      userId: rest.userId,
      action: rest.action,
      changes: rest.changes,
      requestContext: { ...ctx, userAgent: "Mozilla/5.0 (compatible; SuperAdminAuditSeed)" },
      result: rest.result || base.result,
      error: rest.error,
      riskLevel: rest.riskLevel,
      metadata: { approvedBy: admin1 ? String(admin1) : undefined, ...meta, source: "seed" },
      compliance:
        compliance ||
        {
          gdprRelevant: Boolean(rest.riskLevel === "HIGH" || rest.riskLevel === "CRITICAL"),
          dataCategories: [],
          retentionRequired: false,
        },
      createdAt: t,
    };
    if (rest.resource) log.resource = rest.resource;
    return log;
  });
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.log("MONGODB_URI not set — seeding into default db nakhsha");
  }
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log(`Connected to ${MONGODB_URI.replace(/\/\/[^@/]+@/, "//***@")}`);

  // ── Users ──
  const userOps = demoUsers.map((u) => User.updateOne({ phone: u.phone }, { $setOnInsert: { ...u, tokenVersion: 0 } }, { upsert: true }));
  await Promise.all(userOps);
  const upserted = await User.find({ handle: { $in: demoUsers.map((u) => u.handle) } }).select("_id handle role name phone");
  const usersById = {};
  for (const u of upserted) usersById[u.handle] = u._id;
  console.log(`[users] demo users ready: ${upserted.length}`);

  const superAdmin = await User.findOne({ role: "super_admin" }).select("_id");
  if (!superAdmin) throw new Error("No super_admin user found — seed the admin account via OTP login first.");

  // ── Listings ──
  const listingCount = await Listing.countDocuments();
  if (listingCount === 0) {
    const listings = buildListings(usersById);
    for (const { model, doc } of listings) {
      await model.create(doc);
    }
    console.log(`[listings] created ${listings.length}`);
  } else {
    console.log(`[listings] skipped (${listingCount} already present)`);
  }

  // ── Crafts ──
  const craftCount = await Craft.countDocuments();
  if (craftCount === 0) {
    const crafts = buildCrafts(usersById);
    await Craft.insertMany(crafts);
    console.log(`[crafts] created ${crafts.length}`);
  } else {
    console.log(`[crafts] skipped (${craftCount} already present)`);
  }

  // ── Audit logs ──
  const auditCount = await AuditLog.countDocuments();
  if (auditCount < 100) {
    const logs = buildAuditLogs(superAdmin._id, usersById);
    let inserted = 0;
    for (const log of logs) {
      try {
        await AuditLog.create(log);
        inserted += 1;
      } catch (err) {
        console.error("[audit] SKIPPED", log.action, "→", err.message);
      }
    }
    console.log(`[auditLogs] appended ${inserted}/${logs.length} (total ${auditCount + inserted})`);
  } else {
    console.log(`[auditLogs] skipped (${auditCount} rows present)`);
  }

  // ── Indexes (optional, non-destructive) ──
  if (SYNC) {
    await Promise.all([
      User.init(),
      Listing.init(),
      Craft.init(),
      AuditLog.init(),
      RefreshToken.init(),
    ]);
    console.log("[indexes] ensured");
  }

  const totals = {
    users: await User.countDocuments(),
    listings: await Listing.countDocuments(),
    crafts: await Craft.countDocuments(),
    auditLogs: await AuditLog.countDocuments(),
    refreshTokens: await RefreshToken.countDocuments(),
  };
  console.log("[done] db totals:", totals);

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed] FAILED:", e);
  process.exit(1);
});