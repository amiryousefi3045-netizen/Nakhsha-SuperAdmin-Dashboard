/**
 * listings-near.test.js — Integration tests for GET /api/listings/near
 *
 * Tests the Listing model geospatial endpoint in routes/listings.near.js.
 *
 * Coverage:
 *   • Distance ordering (closest first)
 *   • Radius filtering (items outside radius not returned)
 *   • type filter (post | tour | training | academy)
 *   • radiusKm max cap (>50 km is silently capped)
 *   • limit cap (>500 is silently capped)
 *   • Validation errors (missing lat/lng, out-of-range, bad type)
 *   • Response envelope shape  { success, data: { items, meta }, reqId }
 *   • Each item has distanceMeters
 */
"use strict";

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const { PostListing, TourListing } = require("../models/Listing");

// ── Coordinates ──────────────────────────────────────────────────────────────
// Tehran city centre  [lng, lat]
const TEHRAN_CENTER = [51.389, 35.6892];
// ~2 km north of centre
const TEHRAN_NORTH = [51.389, 35.7072];
// Shiraz — ~900 km away
const SHIRAZ = [52.5836, 29.5918];

describe("GET /api/listings/near — Listing model geospatial search", () => {
  let testUser;
  let tehranClose; // PostListing at TEHRAN_CENTER
  let tehranFar; // TourListing at TEHRAN_NORTH (~2 km away)
  let shirazListing; // PostListing in Shiraz (~900 km away)

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function makeLocation(coords) {
    return { type: "Point", coordinates: coords };
  }

  // ── Setup ────────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";

    const mongoUri =
      process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    }

    app.locals.dbReady = true;

    // A minimal owner (listings require an owner)
    testUser = await User.create({
      name: "هنرمند تست نزدیک",
      phone: "09120000099",
      role: "user",
    });

    // Seed three listings at different distances
    tehranClose = await PostListing.create({
      title: "سفال نزدیک مرکز تهران",
      description: "سفال دست‌ساز در مرکز تهران برای آزمایش نزدیکی",
      owner: testUser._id,
      status: "published",
      location: makeLocation(TEHRAN_CENTER),
    });

    tehranFar = await TourListing.create({
      title: "تور شمال تهران",
      description: "تور گردشگری در شمال تهران برای آزمایش فاصله",
      owner: testUser._id,
      status: "published",
      location: makeLocation(TEHRAN_NORTH),
    });

    shirazListing = await PostListing.create({
      title: "قالی شیراز",
      description: "قالی دست‌باف اصیل شیرازی در فاصله زیاد",
      owner: testUser._id,
      status: "published",
      location: makeLocation(SHIRAZ),
    });

    // Ensure the 2dsphere index exists (no-op if already present)
    await mongoose.connection
      .collection("user_listings")
      .createIndex({ location: "2dsphere" }, { sparse: true });
  });

  afterAll(async () => {
    // Cleanup only the records we created
    const ownerId = testUser?._id;
    if (ownerId) {
      await mongoose.connection
        .collection("user_listings")
        .deleteMany({ owner: ownerId });
      await User.deleteMany({ phone: "09120000099" });
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  });

  // ── Successful geospatial queries ─────────────────────────────────────────

  describe("Successful queries", () => {
    it("returns listings within radius sorted by distance (closest first)", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 10 })
        .expect(200);

      expect(res.body.success).toBe(true);

      const { items, meta } = res.body.data;
      // Both Tehran listings should be within 10 km; Shiraz must not appear
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(
        items.find((i) => String(i.id) === String(shirazListing._id)),
      ).toBeUndefined();

      // Sorted by distance ascending
      for (let i = 1; i < items.length; i++) {
        expect(items[i].distanceMeters).toBeGreaterThanOrEqual(
          items[i - 1].distanceMeters,
        );
      }

      // Meta fields present
      expect(meta.radiusKm).toBe(10);
      expect(meta.count).toBe(items.length);
      expect(typeof meta.limit).toBe("number");
    });

    it("closest listing (TEHRAN_CENTER) is first in the result", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 10 })
        .expect(200);

      const { items } = res.body.data;
      expect(items.length).toBeGreaterThanOrEqual(2);
      // First item id must be tehranClose (distance ≈ 0 m)
      expect(String(items[0].id)).toBe(String(tehranClose._id));
      // Second item must be tehranFar (~2 km away)
      expect(String(items[1].id)).toBe(String(tehranFar._id));
    });

    it("Shiraz listing does NOT appear when searching near Tehran with 5 km radius", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 5 })
        .expect(200);

      const ids = res.body.data.items.map((i) => String(i.id));
      expect(ids).not.toContain(String(shirazListing._id));
    });

    it("filters by type=post — only PostListings returned", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 10, type: "post" })
        .expect(200);

      const { items } = res.body.data;
      // tehranClose is a post; tehranFar is a tour → only tehranClose expected
      expect(items.length).toBeGreaterThanOrEqual(1);
      items.forEach((item) => expect(item.type).toBe("post"));
      expect(
        items.find((i) => String(i.id) === String(tehranFar._id)),
      ).toBeUndefined();
    });

    it("filters by type=tour — only TourListings returned", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 10, type: "tour" })
        .expect(200);

      const { items } = res.body.data;
      expect(items.length).toBeGreaterThanOrEqual(1);
      items.forEach((item) => expect(item.type).toBe("tour"));
    });

    it("returns empty items array when nothing is in range", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        // Centre of the ocean far from any seeded listings
        .query({ lat: 0.0, lng: 0.0, radiusKm: 1 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.meta.count).toBe(0);
    });

    it("silently caps radiusKm > 50 to 50", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 999 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.meta.radiusKm).toBe(50);
    });

    it("silently caps limit > 500 to 500", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 10, limit: 9999 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.meta.limit).toBe(500);
    });

    it("uses default radiusKm (5) and limit (100) when omitted", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389 })
        .expect(200);

      expect(res.body.data.meta.radiusKm).toBe(5);
      expect(res.body.data.meta.limit).toBe(100);
    });

    it("each item has required fields: id, type, title, images, location, distanceMeters", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 10 })
        .expect(200);

      for (const item of res.body.data.items) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("type");
        expect(item).toHaveProperty("title");
        expect(Array.isArray(item.images)).toBe(true);
        expect(Array.isArray(item.imagesAbs)).toBe(true);
        expect(item).toHaveProperty("location");
        expect(typeof item.distanceMeters).toBe("number");
      }
    });
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  describe("Validation errors", () => {
    it("returns 400 when lat is missing", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lng: 51.389 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when lng is missing", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when lat is out of range (> 90)", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 95, lng: 51.389 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when lng is out of range (< -180)", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: -200 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when type is not a valid enum value", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, type: "artwork" })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when radiusKm is below minimum (0.1)", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 0.05 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when limit is below minimum (1)", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, limit: 0 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when lat is not a number", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: "abc", lng: 51.389 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── Response envelope ─────────────────────────────────────────────────────

  describe("Response envelope", () => {
    it("success response has shape { success:true, data, reqId }", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: 35.6892, lng: 51.389, radiusKm: 10 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("reqId");
      expect(res.body.data).toHaveProperty("items");
      expect(res.body.data).toHaveProperty("meta");
      const { meta } = res.body.data;
      expect(meta).toHaveProperty("radiusKm");
      expect(meta).toHaveProperty("limit");
      expect(meta).toHaveProperty("count");
    });
  });
});
