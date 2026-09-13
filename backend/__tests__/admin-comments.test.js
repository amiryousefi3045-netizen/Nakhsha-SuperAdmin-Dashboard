const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const Craft = require("../models/Craft");
const AuditLog = require("../models/AuditLog");
const RefreshToken = require("../models/RefreshToken");

// ── Helpers ────────────────────────────────────────────────────────────────

function accessTokenOf(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role, type: "access", ver: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "15m", algorithm: "HS256" },
  );
}

const AUTH = (token) => `Bearer ${token}`;

const PHONES = {
  sa: "09146000001",
  userA: "09146000002",
  authorA: "09146000003",
};

let saUser;
let saToken;
let userAToken;
let authorA;
let craft;
let craftId;
let commentId;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  process.env.SUPER_ADMIN_PHONE = PHONES.sa;

  const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;

  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await Craft.deleteMany({});

  saUser = await User.create({
    name: "سوپرادمین کامنت",
    phone: PHONES.sa,
    handle: "sa_comments",
    role: "super_admin",
    isVerified: true,
  });
  saToken = accessTokenOf(saUser);

  const userA = await User.create({
    name: "کاربر نویسنده نظر",
    phone: PHONES.userA,
    handle: "u_commenter",
    role: "user",
    isVerified: true,
  });
  userAToken = accessTokenOf(userA);

  authorA = await User.create({
    name: "هنرمند کامنت‌گذار",
    phone: PHONES.authorA,
    handle: "art_commenter",
    role: "user",
    isVerified: true,
  });

  craft = await Craft.create({
    title: "گلیم مودار سنتی",
    description: "بافتی از کرک بز با پشم دست‌ریس",
    kind: "artwork",
    craftType: "textile",
    isPublished: true,
    author: authorA._id,
    comments: [
      { user: userA._id, text: "کیفیت عالی بود", rating: 5 },
      { user: authorA._id, text: "ممنون از خرید شما", rating: 4 },
    ],
  });
  craftId = craft._id.toString();
  commentId = craft.comments[0]._id.toString();
});

afterAll(async () => {
  await Craft.deleteMany({ _id: { $in: [craftId] } });
  await RefreshToken.deleteMany({ userId: { $in: [saUser._id, authorA._id] } });
  await AuditLog.deleteMany({
    $or: [{ "resource.id": { $in: [craftId] } }, { userId: saUser._id }],
  });
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  delete process.env.SUPER_ADMIN_PHONE;
  await mongoose.connection.close();
});

describe("Comment moderation — protection", () => {
  it("rejects unauthenticated requests with 401", async () => {
    await request(app).get("/api/admin/comments").expect(401);
    await request(app).delete(`/api/admin/comments/${craftId}/${commentId}`).expect(401);
  });

  it("rejects non-super_admin with 403", async () => {
    const denied = await request(app)
      .get("/api/admin/comments")
      .set("Authorization", AUTH(userAToken))
      .expect(403);

    expect(denied.body.success).toBe(false);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });
});

describe("Comment moderation — listing", () => {
  it("returns comments with author + craft context, paginated", async () => {
    const res = await request(app)
      .get("/api/admin/comments")
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.page).toBe(1);

    const first = res.body.items[0];
    expect(first.id).toBeTruthy();
    expect(first.craft.id).toBe(craftId);
    expect(first.craft.title).toBe("گلیم مودار سنتی");
    expect(first.craft.isPublished).toBe(true);
    expect(first.author).toBeTruthy();
    expect(first.author.name).toBeTruthy();
    expect(typeof first.text).toBe("string");
    expect([1, 2, 3, 4, 5]).toContain(first.rating);
  });

  it("filters by free-text search across craft title and comment text", async () => {
    const byTitle = await request(app)
      .get("/api/admin/comments")
      .query({ q: "گلیم" })
      .set("Authorization", AUTH(saToken))
      .expect(200);
    expect(byTitle.body.total).toBe(2);

    const byText = await request(app)
      .get("/api/admin/comments")
      .query({ q: "کیفیت" })
      .set("Authorization", AUTH(saToken))
      .expect(200);
    expect(byText.body.total).toBe(1);
    expect(byText.body.items[0].text).toBe("کیفیت عالی بود");
  });

  it("filters by rating", async () => {
    const res = await request(app)
      .get("/api/admin/comments")
      .query({ rating: 5 })
      .set("Authorization", AUTH(saToken))
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].rating).toBe(5);
  });

  it("rejects invalid pagination/rating query params", async () => {
    await request(app)
      .get("/api/admin/comments")
      .query({ rating: 99 })
      .set("Authorization", AUTH(saToken))
      .expect(400);
  });
});

describe("Comment moderation — deletion", () => {
  it("removes a comment and returns confirmation", async () => {
    const res = await request(app)
      .delete(`/api/admin/comments/${craftId}/${commentId}`)
      .set("Authorization", AUTH(saToken))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe(commentId);
    expect(res.body.craft.id).toBe(craftId);

    const fresh = await Craft.findById(craftId).lean();
    expect(fresh.comments).toHaveLength(1);
    expect(fresh.comments.some((c) => String(c._id) === commentId)).toBe(false);
  });

  it("writes a HIGH-risk ADMIN_CONTENT_REMOVED audit entry", async () => {
    const log = await AuditLog.findOne({
      action: "ADMIN_CONTENT_REMOVED",
      "resource.type": "CRAFT",
      "resource.id": new mongoose.Types.ObjectId(craftId),
    }).lean();

    expect(log).toBeTruthy();
    expect(log.riskLevel).toBe("HIGH");
    expect(log.result).toBe("SUCCESS");
    expect(log.userId.toString()).toBe(String(saUser._id));
    expect(log.changes.after).toBeNull();
    expect(log.changes.before.comment.text).toBe("کیفیت عالی بود");
  });

  it("returns 404 for a missing comment", async () => {
    const missing = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/admin/comments/${craftId}/${missing}`)
      .set("Authorization", AUTH(saToken))
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a missing craft", async () => {
    const missingCraft = new mongoose.Types.ObjectId();
    const missingComment = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/admin/comments/${missingCraft}/${missingComment}`)
      .set("Authorization", AUTH(saToken))
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for structurally invalid ids", async () => {
    await request(app)
      .delete("/api/admin/comments/not-an-id/also-not")
      .set("Authorization", AUTH(saToken))
      .expect(400);
  });
});