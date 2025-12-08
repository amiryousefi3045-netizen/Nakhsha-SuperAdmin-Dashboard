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
  const response = await request(app).post("/api/auth/register").send({
    name: "هنرمند تست",
    email: "artisan@test.com",
    phone: "09123456789",
    password: "password123",
    role: "artisan",
  });

  authToken = response.body.token;
  testUser = response.body.user;

  // Create artisan profile
  testArtisan = await Artisan.create({
    userId: testUser.id,
    name: "کارگاه صنایع دستی",
    bio: "تولید کننده صنایع دستی ایرانی",
    craftType: "قالی و گلیم",
    location: {
      city: "اصفهان",
      coordinates: [51.6746, 32.6546], // [lng, lat]
    },
    verified: true,
  });
});

describe("Craft Routes", () => {
  describe("POST /api/crafts", () => {
    it("should create a new craft with valid data", async () => {
      const craftData = {
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

      const response = await request(app)
        .post("/api/crafts")
        .set("Authorization", `Bearer ${authToken}`)
        .send(craftData)
        .expect(201);

      expect(response.body).toHaveProperty("craft");
      expect(response.body.craft.title).toBe(craftData.title);
      expect(response.body.craft.craftType).toBe(craftData.craftType);
    });

    it("should reject craft creation without authentication", async () => {
      const craftData = {
        title: "قالی دستباف",
        description: "توضیحات",
        kind: "artwork",
      };

      const response = await request(app)
        .post("/api/crafts")
        .send(craftData)
        .expect(401);

      expect(response.body.message).toContain("Unauthorized");
    });

    it("should reject craft with invalid coordinates", async () => {
      const craftData = {
        title: "سفال سنتی",
        description: "سفال با نقوش قدیمی",
        kind: "artwork",
        location: {
          city: "یزد",
          geometry: {
            type: "Point",
            coordinates: [999, 999], // Invalid coordinates
          },
        },
      };

      const response = await request(app)
        .post("/api/crafts")
        .set("Authorization", `Bearer ${authToken}`)
        .send(craftData)
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe("GET /api/crafts", () => {
    beforeEach(async () => {
      // Create multiple test crafts
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
            geometry: {
              type: "Point",
              coordinates: [46.2919, 38.0809],
            },
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
            geometry: {
              type: "Point",
              coordinates: [51.6746, 32.6546],
            },
          },
          isPublished: true,
        },
      ]);
    });

    it("should return list of published crafts", async () => {
      const response = await request(app).get("/api/crafts").expect(200);

      expect(response.body).toHaveProperty("crafts");
      expect(Array.isArray(response.body.crafts)).toBe(true);
      expect(response.body.crafts.length).toBeGreaterThan(0);
    });

    it("should filter crafts by city", async () => {
      const response = await request(app)
        .get("/api/crafts")
        .query({ "filters[city]": "اصفهان" })
        .expect(200);

      expect(response.body.crafts).toHaveLength(1);
      expect(response.body.crafts[0].location.city).toBe("اصفهان");
    });

    it("should filter crafts by craftType", async () => {
      const response = await request(app)
        .get("/api/crafts")
        .query({ "filters[craftType]": "carpet" })
        .expect(200);

      expect(response.body.crafts).toHaveLength(1);
      expect(response.body.crafts[0].craftType).toBe("carpet");
    });

    it("should paginate results", async () => {
      const response = await request(app)
        .get("/api/crafts")
        .query({ page: 1, limit: 1 })
        .expect(200);

      expect(response.body.crafts).toHaveLength(1);
      expect(response.body).toHaveProperty("pagination");
    });
  });

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
          geometry: {
            type: "Point",
            coordinates: [51.6746, 32.6546],
          },
        },
        isPublished: true,
      });
    });

    it("should return craft details by id", async () => {
      const response = await request(app)
        .get(`/api/crafts/${testCraft._id}`)
        .expect(200);

      expect(response.body).toHaveProperty("craft");
      expect(response.body.craft.title).toBe(testCraft.title);
    });

    it("should return 404 for non-existent craft", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/crafts/${fakeId}`)
        .expect(404);

      expect(response.body.message).toContain("Not found");
    });
  });

  describe("PUT /api/crafts/:id", () => {
    let testCraft;

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
          geometry: {
            type: "Point",
            coordinates: [52.5389, 29.6031],
          },
        },
        isPublished: true,
      });
    });

    it("should update craft by owner", async () => {
      const updateData = {
        title: "خاتم کاری ویژه",
        price: 10000000,
      };

      const response = await request(app)
        .put(`/api/crafts/${testCraft._id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.craft.title).toBe(updateData.title);
      expect(response.body.craft.price).toBe(updateData.price);
    });

    it("should reject update without authentication", async () => {
      const updateData = { title: "عنوان جدید" };

      await request(app)
        .put(`/api/crafts/${testCraft._id}`)
        .send(updateData)
        .expect(401);
    });
  });

  describe("DELETE /api/crafts/:id", () => {
    let testCraft;

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
          geometry: {
            type: "Point",
            coordinates: [54.3673, 31.8974],
          },
        },
        isPublished: true,
      });
    });

    it("should delete craft by owner", async () => {
      await request(app)
        .delete(`/api/crafts/${testCraft._id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      // Verify deletion
      const deleted = await Craft.findById(testCraft._id);
      expect(deleted).toBeNull();
    });

    it("should reject deletion without authentication", async () => {
      await request(app).delete(`/api/crafts/${testCraft._id}`).expect(401);
    });
  });
});
