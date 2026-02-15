const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");
const Craft = require("../models/Craft");
const User = require("../models/User");

/**
 * Integration Tests for /api/listings/near endpoint
 * Tests geospatial search functionality, validation, and error handling
 */

describe("GET /api/listings/near - Geospatial Search", () => {
  let testUser;
  let craftsInTehran = [];
  let craftsInShiraz = [];

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha_test",
        {
          serverSelectionTimeoutMS: 5000,
        },
      );
    }

    // Create test user
    testUser = await User.create({
      name: "Test Artisan",
      phone: "09123456789",
      role: "user",
    });

    // Create test crafts in Tehran (35.6892°N, 51.3890°E)
    const tehranCoords = [51.389, 35.6892]; // [lng, lat]

    craftsInTehran = await Craft.create([
      {
        title: "سفال تهرانی",
        description: "سفال دست‌ساز زیبا",
        kind: "artwork",
        price: 500000,
        author: testUser._id,
        isPublished: true,
        location: {
          city: "تهران",
          neighborhood: "ونک",
          geometry: {
            type: "Point",
            coordinates: tehranCoords,
          },
        },
      },
      {
        title: "کارگاه سفالگری",
        description: "آموزش سفالگری در تهران",
        kind: "class",
        price: 1000000,
        author: testUser._id,
        isPublished: true,
        location: {
          city: "تهران",
          neighborhood: "نیاوران",
          geometry: {
            type: "Point",
            coordinates: [51.4, 35.7], // Slightly north of Tehran center
          },
        },
      },
    ]);

    // Create test crafts in Shiraz (29.5918°N, 52.5836°E) - far from Tehran
    craftsInShiraz = await Craft.create([
      {
        title: "فرش شیرازی",
        description: "فرش دست‌باف شیراز",
        kind: "artwork",
        price: 5000000,
        author: testUser._id,
        isPublished: true,
        location: {
          city: "شیراز",
          neighborhood: "زند",
          geometry: {
            type: "Point",
            coordinates: [52.5836, 29.5918],
          },
        },
      },
    ]);

    // Ensure 2dsphere index exists
    await Craft.collection.createIndex({ "location.geometry": "2dsphere" });
  });

  afterAll(async () => {
    // Cleanup
    await Craft.deleteMany({ author: testUser._id });
    await User.deleteMany({ phone: "09123456789" });
    await mongoose.connection.close();
  });

  // ============================================================================
  // SUCCESSFUL GEOSPATIAL QUERIES
  // ============================================================================

  describe("Successful Queries", () => {
    test("should find crafts near Tehran center", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          radiusKm: 10,
        })
        .expect(200);

      expect(response.body.items).toBeDefined();
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.items[0].distanceKm).toBeDefined();
      expect(response.body.search.method).toBe("geospatial");
      expect(response.body.search.center).toEqual({
        lng: 51.389,
        lat: 35.6892,
      });
    });

    test("should return crafts sorted by distance", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          radiusKm: 20,
        })
        .expect(200);

      const distances = response.body.items.map((item) =>
        parseFloat(item.distanceKm),
      );

      // Verify sorting (each distance should be >= previous)
      for (let i = 1; i < distances.length; i++) {
        expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
      }
    });

    test("should not find Shiraz crafts when searching in Tehran", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          radiusKm: 10,
        })
        .expect(200);

      const shirazCraft = response.body.items.find(
        (item) => item.city === "شیراز",
      );
      expect(shirazCraft).toBeUndefined();
    });

    test("should filter by kind parameter", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          radiusKm: 20,
          kind: "class",
        })
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
      response.body.items.forEach((item) => {
        expect(item.kind).toBe("class");
      });
    });

    test("should filter by price range", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          radiusKm: 20,
          minPrice: 900000,
          maxPrice: 1500000,
        })
        .expect(200);

      response.body.items.forEach((item) => {
        expect(item.price).toBeGreaterThanOrEqual(900000);
        expect(item.price).toBeLessThanOrEqual(1500000);
      });
    });

    test("should cap radius to maximum (50km)", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          radiusKm: 1000, // Request 1000km
        })
        .expect(200);

      expect(response.body.search.radiusKm).toBe(50); // Capped to 50km
      expect(response.body.search.requestedRadiusKm).toBe(1000);
      expect(response.body.search.note).toContain("capped");
    });

    test("should use default radius when not specified", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
        })
        .expect(200);

      expect(response.body.search.radiusKm).toBe(10); // Default
    });
  });

  // ============================================================================
  // VALIDATION & ERROR HANDLING
  // ============================================================================

  describe("Validation & Error Handling", () => {
    test("should reject invalid longitude", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 200, // Invalid: > 180
          lat: 35.6892,
        })
        .expect(400);

      expect(response.body.message).toContain("نامعتبر");
      expect(response.body.error).toBeDefined();
    });

    test("should reject invalid latitude", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 100, // Invalid: > 90
        })
        .expect(400);

      expect(response.body.message).toContain("نامعتبر");
      expect(response.body.error).toBeDefined();
    });

    test("should detect reversed coordinates", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 35.6892, // This is actually a latitude value
          lat: 151.389, // This is out of latitude range but valid for longitude
        })
        .expect(400);

      expect(response.body.message).toContain("جابجا");
      expect(response.body.hint).toContain("reverse");
    });

    test("should reject non-numeric longitude", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: "invalid",
          lat: 35.6892,
        })
        .expect(400);

      expect(response.body.message).toContain("lng");
      expect(response.body.error).toContain("number");
    });

    test("should reject non-numeric latitude", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: "invalid",
        })
        .expect(400);

      expect(response.body.message).toContain("lat");
      expect(response.body.error).toContain("number");
    });

    test("should reject invalid kind filter", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          kind: "invalid_kind",
        })
        .expect(400);

      expect(response.body.error).toContain("kind must be one of");
    });

    test("should reject negative radius", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          radiusKm: -10,
        })
        .expect(400);

      expect(response.body.message).toContain("شعاع");
      expect(response.body.error).toContain("positive");
    });

    test("should reject negative minPrice", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          minPrice: -100,
        })
        .expect(400);

      expect(response.body.message).toContain("قیمت");
      expect(response.body.error).toContain("non-negative");
    });
  });

  // ============================================================================
  // FALLBACK BEHAVIOR
  // ============================================================================

  describe("Fallback to Standard Search", () => {
    test("should fall back to standard search when no coordinates provided", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          kind: "artwork",
        })
        .expect(200);

      expect(response.body.items).toBeDefined();
      expect(response.body.search.method).toBe("standard");
      expect(response.body.search.center).toBeUndefined();
    });
  });

  // ============================================================================
  // PAGINATION
  // ============================================================================

  describe("Pagination", () => {
    test("should paginate results", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          radiusKm: 50,
          limit: 1,
          page: 1,
        })
        .expect(200);

      expect(response.body.items.length).toBeLessThanOrEqual(1);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.hasMore).toBeDefined();
    });

    test("should cap limit to maximum per page", async () => {
      const response = await request(app)
        .get("/api/listings/near")
        .query({
          lng: 51.389,
          lat: 35.6892,
          limit: 1000, // Request 1000 items
        })
        .expect(200);

      expect(response.body.limit).toBe(100); // Capped to MAX_RESULTS_PER_PAGE
    });
  });
});
