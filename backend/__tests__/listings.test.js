/**
 * listings.test.js — Integration tests for POST /api/listings
 *
 * Tests cover:
 *   • Creating a listing for each of the four types (post / tour / training / academy)
 *   • schedule validation requirements for training
 *   • images stored as relative paths; imagesAbs contains absolute URLs
 *   • 401 when unauthenticated
 *   • 400 for missing required fields
 */
const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../server");
const User = require("../models/User");
const {
  Listing,
  PostListing,
  TourListing,
  TrainingListing,
  AcademyListing,
} = require("../models/Listing");

// ── Shared state ──────────────────────────────────────────────────────────────

let authToken;
let testUser;

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-key";

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }
});

afterAll(async () => {
  await Listing.deleteMany({});
  await User.deleteMany({});
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
});

beforeEach(async () => {
  await Listing.deleteMany({});
  await User.deleteMany({});
  app.locals.dbReady = true;

  testUser = await User.create({
    name: "هنرمند آزمایشی",
    phone: "09100000001",
    role: "user",
    isVerified: true,
  });

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  authToken = jwt.sign({ id: testUser._id, role: testUser.role }, secret);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = {
  title: "عنوان آزمایشی برای تست",
  description: "توضیحات آزمایشی برای بررسی عملکرد API",
  tags: ["هنر", "صنایع‌دستی"],
};

function authPost(path) {
  return request(app)
    .post(path)
    .set("Authorization", `Bearer ${authToken}`)
    .set("Content-Type", "application/json");
}

// ── Auth guard ────────────────────────────────────────────────────────────────

describe("POST /api/listings — auth guard", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await request(app)
      .post("/api/listings")
      .send({ ...BASE, type: "post" })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toMatch(/UNAUTHORIZED/i);
  });
});

// ── Post listing ──────────────────────────────────────────────────────────────

describe("POST /api/listings — type: post", () => {
  it("creates a post listing with optional post-specific details", async () => {
    const body = {
      ...BASE,
      type: "post",
      status: "published",
      details: {
        price: 150000,
        forSale: true,
        category: "سفالگری",
        attributes: { جنس: "گِل", اندازه: "۳۰ سانتیمتر" },
      },
    };

    const res = await authPost("/api/listings").send(body).expect(201);

    expect(res.body.success).toBe(true);
    const item = res.body.item;
    expect(item.type).toBe("post");
    expect(item.title).toBe(BASE.title);
    expect(item.status).toBe("published");
    expect(item.price).toBe(150000);
    expect(item.forSale).toBe(true);
    expect(item.category).toBe("سفالگری");
    // Discriminator must NOT leak training-specific fields
    expect(item.schedule).toBeUndefined();
    // DB document should not have imagesAbs; response should
    expect(item.images).toEqual([]);
    expect(item.imagesAbs).toEqual([]);

    // Verify DB record: images stored as relative, not absolute
    const dbDoc = await PostListing.findById(item.id).lean();
    expect(dbDoc).not.toBeNull();
    expect(dbDoc.type).toBe("post");
    expect(dbDoc.price).toBe(150000);
    expect((dbDoc.images ?? []).every((p) => !p.startsWith("http"))).toBe(true);
  });

  it("creates a post listing even without optional details", async () => {
    const res = await authPost("/api/listings")
      .send({ ...BASE, type: "post" })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.item.type).toBe("post");
  });
});

// ── Tour listing ──────────────────────────────────────────────────────────────

describe("POST /api/listings — type: tour", () => {
  it("creates a tour listing with tour-specific details", async () => {
    const body = {
      ...BASE,
      type: "tour",
      location: { type: "Point", coordinates: [59.6067, 36.2972] },
      details: {
        startDate: "2026-05-15",
        durationDays: 3,
        capacity: 12,
        itinerary: "روز اول: بازدید از بازار، روز دوم: کارگاه سفالگری",
      },
    };

    const res = await authPost("/api/listings").send(body).expect(201);

    expect(res.body.success).toBe(true);
    const item = res.body.item;
    expect(item.type).toBe("tour");
    expect(item.durationDays).toBe(3);
    expect(item.capacity).toBe(12);
    expect(item.itinerary).toContain("بازار");
    expect(item.location).toMatchObject({ type: "Point" });
    expect(item.location.coordinates).toEqual([59.6067, 36.2972]);
    // No training-specific fields
    expect(item.schedule).toBeUndefined();

    const dbDoc = await TourListing.findById(item.id).lean();
    expect(dbDoc.durationDays).toBe(3);
  });

  it("creates a tour listing without any details (all optional)", async () => {
    const res = await authPost("/api/listings")
      .send({ ...BASE, type: "tour" })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.item.type).toBe("tour");
  });
});

// ── Training listing ──────────────────────────────────────────────────────────

describe("POST /api/listings — type: training", () => {
  it("creates a training listing with a valid schedule", async () => {
    const body = {
      ...BASE,
      type: "training",
      details: {
        schedule: [
          { dayOfWeek: 6, startTime: "09:00", endTime: "12:00" },
          { dayOfWeek: 1, startTime: "15:00", endTime: "18:00" },
        ],
        level: "beginner",
        instructor: "استاد کریمی",
      },
    };

    const res = await authPost("/api/listings").send(body).expect(201);

    expect(res.body.success).toBe(true);
    const item = res.body.item;
    expect(item.type).toBe("training");
    expect(Array.isArray(item.schedule)).toBe(true);
    expect(item.schedule.length).toBe(2);
    expect(item.schedule[0].dayOfWeek).toBe(6);
    expect(item.level).toBe("beginner");
    expect(item.instructor).toBe("استاد کریمی");

    const dbDoc = await TrainingListing.findById(item.id).lean();
    expect(dbDoc.schedule.length).toBe(2);
  });

  it("returns 400 when schedule is missing for training", async () => {
    const res = await authPost("/api/listings")
      .send({ ...BASE, type: "training", details: { level: "beginner" } })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    // Should mention schedule
    expect(JSON.stringify(res.body.error)).toMatch(/schedule|زمان‌بندی/);
  });

  it("returns 400 when schedule has invalid time format", async () => {
    const res = await authPost("/api/listings")
      .send({
        ...BASE,
        type: "training",
        details: {
          schedule: [{ dayOfWeek: 1, startTime: "9:00", endTime: "noon" }],
        },
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when schedule dayOfWeek is out of range", async () => {
    const res = await authPost("/api/listings")
      .send({
        ...BASE,
        type: "training",
        details: {
          schedule: [{ dayOfWeek: 7, startTime: "09:00", endTime: "12:00" }],
        },
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ── Academy listing ───────────────────────────────────────────────────────────

describe("POST /api/listings — type: academy", () => {
  it("creates an academy listing with contact details", async () => {
    const body = {
      ...BASE,
      type: "academy",
      details: {
        phone: "02112345678",
        website: "https://academy.example.ir",
        workingHours: "شنبه تا چهارشنبه ۹–۱۷",
        addressDetails: "پاساژ هنر، طبقه دوم، واحد ۱۲",
      },
    };

    const res = await authPost("/api/listings").send(body).expect(201);

    expect(res.body.success).toBe(true);
    const item = res.body.item;
    expect(item.type).toBe("academy");
    expect(item.phone).toBe("02112345678");
    expect(item.website).toBe("https://academy.example.ir");
    expect(item.workingHours).toContain("شنبه");
    expect(item.schedule).toBeUndefined();

    const dbDoc = await AcademyListing.findById(item.id).lean();
    expect(dbDoc.phone).toBe("02112345678");
  });
});

// ── Base validation ────────────────────────────────────────────────────────────

describe("POST /api/listings — base validation", () => {
  it("returns 400 when type is missing", async () => {
    const res = await authPost("/api/listings")
      .send({ ...BASE })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when title is too short", async () => {
    const res = await authPost("/api/listings")
      .send({ type: "post", title: "کوت", description: "توضیحات کافی" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when type is invalid", async () => {
    const res = await authPost("/api/listings")
      .send({ ...BASE, type: "recipe" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ── Images: relative in DB, absolute in response ──────────────────────────────

describe("POST /api/listings — image URL handling", () => {
  it("stores images as relative paths but returns imagesAbs with full URLs", async () => {
    const body = {
      ...BASE,
      type: "post",
      images: ["/uploads/craft-abc123.webp", "/uploads/craft-def456.webp"],
    };

    const res = await authPost("/api/listings").send(body).expect(201);

    const item = res.body.item;
    // Stored values stay relative in the `images` field
    expect(item.images).toEqual([
      "/uploads/craft-abc123.webp",
      "/uploads/craft-def456.webp",
    ]);
    // imagesAbs should be absolute (starts with http in test)
    expect(item.imagesAbs.length).toBe(2);
    expect(item.imagesAbs[0]).toMatch(/^https?:\/\//);
    expect(item.imagesAbs[0]).toContain("/uploads/craft-abc123.webp");

    // DB record must NOT store absolute URLs
    const dbDoc = await PostListing.findById(item.id).lean();
    expect(dbDoc.images[0]).toBe("/uploads/craft-abc123.webp");
    expect(dbDoc.images[0]).not.toMatch(/^https?:\/\//);
  });
});
