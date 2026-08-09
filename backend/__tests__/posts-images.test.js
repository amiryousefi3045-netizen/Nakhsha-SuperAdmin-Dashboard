const request = require("supertest");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const app = require("../server");
const User = require("../models/User");
const Post = require("../models/Post");

// Mock test data setup
let testUser;
let testPost;
let authToken;

// Create a 1x1 PNG test image buffer
const testImageBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-key";

  // Connect to test database only if not already connected
  if (mongoose.connection.readyState === 0) {
    const mongoUri =
      process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;
});

afterAll(async () => {
  // Cleanup
  await User.deleteMany({});
  await Post.deleteMany({});
  // Only close connection if it was created by this test
  if (process.env.NODE_ENV === "test" && mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
});

beforeEach(async () => {
  // Clear collections before each test
  await User.deleteMany({});
  await Post.deleteMany({});

  // Create test user
  testUser = await User.create({
    name: "علی احمدی",
    phone: "09123456789",
    password: "password123",
    verified: true,
  });

  // Create test post
  testPost = await Post.create({
    owner: testUser._id,
    title: "تست پست",
    description: "توضیحات تست",
    status: "published",
  });

  // Generate auth token (simulate login)
  const jwt = require("jsonwebtoken");
  authToken = jwt.sign(
    { id: testUser._id, role: "user" },
    process.env.JWT_SECRET,
    {
      expiresIn: "24h",
    },
  );
});

describe("Post Image Upload", () => {
  describe("POST /api/posts/:id/images", () => {
    it("should require authentication", async () => {
      const response = await request(app)
        .post(`/api/posts/${testPost._id}/images`)
        .attach("images", testImageBuffer, "test.png")
        .expect(401);

      expect(response.body).toHaveProperty("success", false);
    });

    it("should validate post ID format", async () => {
      const response = await request(app)
        .post(`/api/posts/invalid-id/images`)
        .set("Authorization", `Bearer ${authToken}`)
        .attach("images", testImageBuffer, "test.png")
        .expect(400);

      expect(response.body).toHaveProperty("success", false);
      expect(response.body.error.details.field).toBe("id");
    });

    it("should require post to exist", async () => {
      const fakePostId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/posts/${fakePostId}/images`)
        .set("Authorization", `Bearer ${authToken}`)
        .attach("images", testImageBuffer, "test.png")
        .expect(404);

      expect(response.body).toHaveProperty("success", false);
    });

    it("should require ownership of the post", async () => {
      // Create another user
      const otherUser = await User.create({
        name: "کاربر دیگر",
        phone: "09123456788",
        password: "password123",
      });

      // Create post owned by other user
      const otherPost = await Post.create({
        owner: otherUser._id,
        title: "پست کاربر دیگر",
        description: "توضیحات",
        status: "published",
      });

      const response = await request(app)
        .post(`/api/posts/${otherPost._id}/images`)
        .set("Authorization", `Bearer ${authToken}`)
        .attach("images", testImageBuffer, "test.png")
        .expect(403);

      expect(response.body).toHaveProperty("success", false);
    });

    it("should require at least one image", async () => {
      const response = await request(app)
        .post(`/api/posts/${testPost._id}/images`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty("success", false);
      expect(response.body.error.details.field).toBe("images");
    });

    it("should successfully upload valid images", async () => {
      const response = await request(app)
        .post(`/api/posts/${testPost._id}/images`)
        .set("Authorization", `Bearer ${authToken}`)
        .attach("images", testImageBuffer, "test1.png")
        .attach("images", testImageBuffer, "test2.png")
        .expect(200);

      expect(response.body).toHaveProperty("item");
      expect(response.body.item).toHaveProperty("images");
      expect(response.body.item.images).toHaveLength(2);

      // Check that images have absolute URLs
      response.body.item.images.forEach((imageUrl) => {
        expect(imageUrl).toMatch(/^https?:\/\//);
        expect(imageUrl).toContain("/uploads/posts/");
        expect(imageUrl).toContain(".webp");
      });
    });

    it("should reject too many files", async () => {
      const attachments = [];
      for (let i = 0; i < 7; i++) {
        attachments.push(["images", testImageBuffer, `test${i}.png`]);
      }

      let request_instance = request(app)
        .post(`/api/posts/${testPost._id}/images`)
        .set("Authorization", `Bearer ${authToken}`);

      // Attach all files
      attachments.forEach(([field, buffer, filename]) => {
        request_instance = request_instance.attach(field, buffer, filename);
      });

      const response = await request_instance.expect(400);
      expect(response.body).toHaveProperty("success", false);
    });

    it("should reject invalid file types", async () => {
      const textBuffer = Buffer.from("This is not an image");

      const response = await request(app)
        .post(`/api/posts/${testPost._id}/images`)
        .set("Authorization", `Bearer ${authToken}`)
        .attach("images", textBuffer, "test.txt")
        .expect(400);

      expect(response.body).toHaveProperty("success", false);
    });
  });
});

module.exports = { testImageBuffer };
