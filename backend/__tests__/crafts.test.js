const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");
const Craft = require("../models/Craft");
const User = require("../models/User");
const Artisan = require("../models/Artisan");

let authToken;
let testUser;
let testArtisan;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-key";

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await Craft.deleteMany({});
  await User.deleteMany({});
  await Artisan.deleteMany({});
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Craft.deleteMany({});
  await User.deleteMany({});
  await Artisan.deleteMany({});
  app.locals.dbReady = true;

  // Create a test user and artisan
  // Note: Since register endpoint is deprecated, we'll create user directly
  testUser = await User.create({
    name: "هنرمند تست",
    phone: "09123456789",
    role: "user",
    isVerified: true,
  });

  // Generate auth token manually for testing — JWT_SECRET is set by jest.setup.js
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set in test environment");
  authToken = jwt.sign({ id: testUser._id, role: testUser.role }, secret);

  // Create artisan profile
  testArtisan = await Artisan.create({
    userId: testUser.id,
    name: "کارگاه صنایع دستی",
    bio: "تولید کننده صنایع دستی ایرانی",
    craftType: "قالی و گلیم",
    location: {
      city: "اصفهان",
      geometry: {
        type: "Point",
        coordinates: [51.6746, 32.6546], // [lng, lat]
      },
    },
    verified: true,
  });
});

describe("Craft Routes", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/crafts
  // ─────────────────────────────────────────────────────────────────────────
  describe("POST /api/crafts", () => {
    const validCraft = {
      title: "قالی دستباف کاشان",
      description: "قالی دستباف با نقوش سنتی کاشانی، ابعاد ۲×۳ متر",
      kind: "artwork",
      craftType: "carpet",
      price: 50000000,
      forSale: true,
      location: {
        city: "اصفهان",
        neighborhood: "نقش جهان",
        geometry: {
          type: "Point",
          coordinates: [51.6746, 32.6546],
        },
      },
      tags: ["قالی", "دستباف", "کاشان"],
    };

    it("creates a new craft when authenticated as artisan", async () => {
      const response = await request(app)
        .post("/api/crafts")
        .set("Authorization", `Bearer ${authToken}`)
        .send(validCraft)
        .expect(201);

      // Actual API returns { id }
      expect(response.body).toHaveProperty("id");
    });

    it("returns 401 with UNAUTHORIZED code when no token is sent", async () => {
      const response = await request(app)
        .post("/api/crafts")
        .send(validCraft)
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 with UNAUTHORIZED code when token is malformed", async () => {
      const response = await request(app)
        .post("/api/crafts")
        .set("Authorization", "Bearer not-a-real-token")
        .send(validCraft)
        .expect(401);

      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 when Authorization header has wrong scheme", async () => {
      const response = await request(app)
        .post("/api/crafts")
        .set("Authorization", `Basic ${authToken}`)
        .send(validCraft)
        .expect(401);

      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects craft with invalid coordinates", async () => {
      const response = await request(app)
        .post("/api/crafts")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          ...validCraft,
          location: {
            city: "یزد",
            geometry: { type: "Point", coordinates: [999, 999] },
          },
        })
        .expect(400);

      // Route uses createErrorResponse → { error: { code, message } }
      // or Mongoose ValidationError → { message, details }
      expect(response.body.error?.code || response.body.message).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/crafts
  // ─────────────────────────────────────────────────────────────────────────
  describe("GET /api/crafts", () => {
    beforeEach(async () => {
      await Craft.create([
        {
          title: "قالی تبریز",
          description: "قالی دستباف تبریز",
          kind: "artwork",
          craftType: "carpet",
          price: 30000000,
          forSale: true,
          author: testUser.id,
          artisanId: testArtisan._id,
          location: {
            city: "تبریز",
            geometry: { type: "Point", coordinates: [46.2919, 38.0809] },
          },
          isPublished: true,
        },
        {
          title: "سفال اصفهان",
          description: "سفال با نقوش سنتی",
          kind: "artwork",
          craftType: "pottery",
          price: 5000000,
          forSale: true,
          author: testUser.id,
          artisanId: testArtisan._id,
          location: {
            city: "اصفهان",
            geometry: { type: "Point", coordinates: [51.6746, 32.6546] },
          },
          isPublished: true,
        },
      ]);
    });

    it("returns list of published crafts (no auth required)", async () => {
      const response = await request(app).get("/api/crafts").expect(200);

      // Actual API shape: { items, total, page, limit }
      expect(response.body).toHaveProperty("items");
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty("total");
    });

    it("filters crafts by city", async () => {
      const response = await request(app)
        .get("/api/crafts")
        .query({ "filters[city]": "اصفهان" })
        .expect(200);

      expect(response.body.items.length).toBeGreaterThanOrEqual(1);
      const nonMatch = response.body.items.filter(
        (c) => !c.location.includes("اصفهان"),
      );
      expect(nonMatch).toHaveLength(0);
    });

    it("filters crafts by craftType", async () => {
      const response = await request(app)
        .get("/api/crafts")
        .query({ "filters[craftType]": "carpet" })
        .expect(200);

      expect(response.body.items.length).toBeGreaterThanOrEqual(1);
      response.body.items.forEach((c) => expect(c.craftType).toBe("carpet"));
    });

    it("respects pagination (limit param)", async () => {
      const response = await request(app)
        .get("/api/crafts")
        .query({ page: 1, limit: 1 })
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body).toHaveProperty("page");
      expect(response.body).toHaveProperty("limit");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/crafts/:id
  // ─────────────────────────────────────────────────────────────────────────
  describe("GET /api/crafts/:id", () => {
    let testCraft;

    beforeEach(async () => {
      testCraft = await Craft.create({
        title: "منبت کاری روی چوب",
        description: "صنایع دستی منبت کاری اصفهان",
        kind: "artwork",
        craftType: "woodwork",
        price: 15000000,
        forSale: true,
        author: testUser.id,
        artisanId: testArtisan._id,
        location: {
          city: "اصفهان",
          geometry: { type: "Point", coordinates: [51.6746, 32.6546] },
        },
        isPublished: true,
      });
    });

    it("returns craft details without authentication (public route)", async () => {
      const response = await request(app)
        .get(`/api/crafts/${testCraft._id}`)
        .expect(200);

      // Actual API shape: flat object with id, title, etc.
      expect(response.body).toHaveProperty("id");
      expect(response.body.title).toBe(testCraft.title);
      expect(response.body).toHaveProperty("liked", false);
      expect(response.body).toHaveProperty("disliked", false);
    });

    it("returns 404 for non-existent craft", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/crafts/${fakeId}`)
        .expect(404);

      expect(response.body.message).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/crafts/:id
  // ─────────────────────────────────────────────────────────────────────────
  describe("PUT /api/crafts/:id", () => {
    let testCraft;
    let otherUserToken;

    beforeEach(async () => {
      testCraft = await Craft.create({
        title: "خاتم کاری",
        description: "صنایع دستی خاتم کاری شیراز",
        kind: "artwork",
        craftType: "woodwork",
        price: 8000000,
        forSale: true,
        author: testUser.id,
        artisanId: testArtisan._id,
        location: {
          city: "شیراز",
          geometry: { type: "Point", coordinates: [52.5389, 29.6031] },
        },
        isPublished: true,
      });

      // Create a second user not linked to this artisan
      const otherUser = await User.create({
        name: "کاربر دیگر",
        phone: "09199999999",
        role: "user",
        isVerified: true,
      });
      const jwt = require("jsonwebtoken");
      otherUserToken = jwt.sign(
        { id: otherUser._id, role: otherUser.role },
        process.env.JWT_SECRET,
      );
    });

    it("updates craft when owner is authenticated", async () => {
      const response = await request(app)
        .put(`/api/crafts/${testCraft._id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ title: "خاتم کاری ویژه", price: 10000000 })
        .expect(200);

      // Actual API shape: { id, ok: true }
      expect(response.body.ok).toBe(true);
    });

    it("returns 401 with UNAUTHORIZED code when no token is sent", async () => {
      const response = await request(app)
        .put(`/api/crafts/${testCraft._id}`)
        .send({ title: "عنوان جدید" })
        .expect(401);

      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 with UNAUTHORIZED code when token is malformed", async () => {
      const response = await request(app)
        .put(`/api/crafts/${testCraft._id}`)
        .set("Authorization", "Bearer bad.token.here")
        .send({ title: "عنوان جدید" })
        .expect(401);

      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 with FORBIDDEN code when non-owner tries to update", async () => {
      const response = await request(app)
        .put(`/api/crafts/${testCraft._id}`)
        .set("Authorization", `Bearer ${otherUserToken}`)
        .send({ title: "تلاش غیرمجاز" })
        .expect(403);

      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/crafts/:id
  // ─────────────────────────────────────────────────────────────────────────
  describe("DELETE /api/crafts/:id", () => {
    let testCraft;
    let otherUserToken;

    beforeEach(async () => {
      testCraft = await Craft.create({
        title: "فرش دستباف",
        description: "فرش دستباف یزد",
        kind: "artwork",
        craftType: "carpet",
        price: 20000000,
        forSale: true,
        author: testUser.id,
        artisanId: testArtisan._id,
        location: {
          city: "یزد",
          geometry: { type: "Point", coordinates: [54.3673, 31.8974] },
        },
        isPublished: true,
      });

      const otherUser = await User.create({
        name: "کاربر دیگر ۲",
        phone: "09188888888",
        role: "user",
        isVerified: true,
      });
      const jwt = require("jsonwebtoken");
      otherUserToken = jwt.sign(
        { id: otherUser._id, role: otherUser.role },
        process.env.JWT_SECRET,
      );
    });

    it("deletes craft when owner is authenticated", async () => {
      await request(app)
        .delete(`/api/crafts/${testCraft._id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      const deleted = await Craft.findById(testCraft._id);
      expect(deleted).toBeNull();
    });

    it("returns 401 with UNAUTHORIZED code when no token is sent", async () => {
      const response = await request(app)
        .delete(`/api/crafts/${testCraft._id}`)
        .expect(401);

      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 with FORBIDDEN code when non-owner tries to delete", async () => {
      const response = await request(app)
        .delete(`/api/crafts/${testCraft._id}`)
        .set("Authorization", `Bearer ${otherUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/crafts/:id/like
  // ─────────────────────────────────────────────────────────────────────────
  describe("POST /api/crafts/:id/like", () => {
    let testCraft;

    beforeEach(async () => {
      testCraft = await Craft.create({
        title: "نقاشی روی چرم",
        description: "اثر هنری",
        kind: "artwork",
        craftType: "leather",
        price: 3000000,
        author: testUser.id,
        artisanId: testArtisan._id,
        location: { city: "تهران" },
        isPublished: true,
      });
    });

    it("toggles like when authenticated", async () => {
      const response = await request(app)
        .post(`/api/crafts/${testCraft._id}/like`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("liked", true);
      expect(response.body).toHaveProperty("totalLikes");
    });

    it("returns 401 with UNAUTHORIZED code when no token is sent", async () => {
      const response = await request(app)
        .post(`/api/crafts/${testCraft._id}/like`)
        .expect(401);

      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Image URL – absolute URL formatting
  // ─────────────────────────────────────────────────────────────────────────
  describe("Image URL absolute formatting", () => {
    const BASE = "https://cdn.nakhsha.test";
    let craftWithImage;

    beforeEach(async () => {
      craftWithImage = await Craft.create({
        title: "سفال با تصویر",
        description: "آزمایش URL تصویر",
        kind: "artwork",
        craftType: "pottery",
        price: 1000000,
        forSale: true,
        author: testUser.id,
        artisanId: testArtisan._id,
        images: ["/uploads/test-craft.webp"],
        location: {
          city: "اصفهان",
          geometry: { type: "Point", coordinates: [51.6746, 32.6546] },
        },
        isPublished: true,
      });
    });

    it("returns absolute image URLs in GET /api/crafts list when PUBLIC_BASE_URL is set", async () => {
      process.env.PUBLIC_BASE_URL = BASE;
      try {
        const response = await request(app).get("/api/crafts").expect(200);

        const item = response.body.items.find(
          (c) => String(c.id) === String(craftWithImage._id),
        );
        expect(item).toBeDefined();
        expect(item.images).toHaveLength(1);
        expect(item.images[0]).toBe(`${BASE}/uploads/test-craft.webp`);
      } finally {
        delete process.env.PUBLIC_BASE_URL;
      }
    });

    it("returns absolute image URLs in GET /api/crafts/:id when PUBLIC_BASE_URL is set", async () => {
      process.env.PUBLIC_BASE_URL = BASE;
      try {
        const response = await request(app)
          .get(`/api/crafts/${craftWithImage._id}`)
          .expect(200);

        expect(response.body.images).toHaveLength(1);
        expect(response.body.images[0]).toBe(`${BASE}/uploads/test-craft.webp`);
      } finally {
        delete process.env.PUBLIC_BASE_URL;
      }
    });

    it("passes through already-absolute image URLs unchanged", async () => {
      const absoluteUrl = "https://source.unsplash.com/800x600?sig=1";
      await Craft.findByIdAndUpdate(craftWithImage._id, {
        images: [absoluteUrl],
      });

      process.env.PUBLIC_BASE_URL = BASE;
      try {
        const response = await request(app)
          .get(`/api/crafts/${craftWithImage._id}`)
          .expect(200);

        expect(response.body.images[0]).toBe(absoluteUrl);
      } finally {
        delete process.env.PUBLIC_BASE_URL;
      }
    });
  });
});
