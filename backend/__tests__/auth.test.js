const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const OtpCode = require("../models/OtpCode");

// Mock MongoDB connection for tests
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-key";

  // Connect to test database
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  // Cleanup
  await User.deleteMany({});
  await OtpCode.deleteMany({});
  await mongoose.connection.close();
});

beforeEach(async () => {
  // Clear collections before each test
  await User.deleteMany({});
  await OtpCode.deleteMany({});
  app.locals.dbReady = true;
});

describe("Auth Routes - Registration", () => {
  describe("POST /api/auth/register", () => {
    it("should register a new user with valid credentials", async () => {
      const userData = {
        name: "علی احمدی",
        phone: "09123456789",
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user.name).toBe(userData.name);
      expect(response.body.user.phone).toBe(userData.phone);
    });

    it("should reject registration with missing required fields", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ name: "علی احمدی" })
        .expect(400);

      expect(response.body).toHaveProperty("message");
    });

    it("should reject registration with invalid phone number", async () => {
      const userData = {
        name: "علی احمدی",
        phone: "123", // Invalid Iranian phone
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData)
        .expect(400);

      expect(response.body.message).toContain("شماره موبایل");
    });

    it("should reject registration with duplicate phone", async () => {
      const userData = {
        name: "علی احمدی",
        phone: "09123456789",
        password: "password123",
      };

      // Register first user
      await request(app).post("/api/auth/register").send(userData).expect(201);

      // Try to register again with same phone
      const response = await request(app)
        .post("/api/auth/register")
        .send(userData)
        .expect(400);

      expect(response.body.message).toContain("قبلاً ثبت شده");
    });
  });
});

describe("Auth Routes - Login", () => {
  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      // Create a test user
      await request(app).post("/api/auth/register").send({
        name: "حسین رضایی",
        phone: "09123456789",
        password: "password123",
      });
    });

    it("should login with valid credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          phone: "09123456789",
          password: "password123",
        })
        .expect(200);

      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user.phone).toBe("09123456789");
    });

    it("should reject login with wrong password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          phone: "09123456789",
          password: "wrongpassword",
        })
        .expect(401);

      expect(response.body.message).toContain("نام‌کاربری یا رمز عبور");
    });

    it("should reject login with non-existent phone", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          phone: "09999999999",
          password: "password123",
        })
        .expect(401);

      expect(response.body.message).toBeDefined();
    });

    it("should reject login with missing credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          phone: "09123456789",
        })
        .expect(400);

      expect(response.body).toHaveProperty("message");
    });
  });
});

describe("Auth Routes - OTP", () => {
  describe("POST /api/auth/otp/request", () => {
    it("should send OTP to valid phone number", async () => {
      const response = await request(app)
        .post("/api/auth/otp/request")
        .send({ phone: "09123456789" })
        .expect(200);

      expect(response.body.message).toContain("کد تایید ارسال شد");

      // Verify OTP was created in database
      const otp = await OtpCode.findOne({ phone: "09123456789" });
      expect(otp).toBeTruthy();
    });

    it("should reject invalid phone number", async () => {
      const response = await request(app)
        .post("/api/auth/otp/request")
        .send({ phone: "123" })
        .expect(400);

      expect(response.body.message).toContain("شماره موبایل");
    });
  });

  describe("POST /api/auth/otp/verify", () => {
    let validCode;
    const testPhone = "09123456789";

    beforeEach(async () => {
      // Request OTP first
      const response = await request(app)
        .post("/api/auth/otp/request")
        .send({ phone: testPhone });

      // Get the code from database (in production, user receives via SMS)
      const otpDoc = await OtpCode.findOne({ phone: testPhone });
      validCode = otpDoc.code;
    });

    it("should verify valid OTP and create/login user", async () => {
      const response = await request(app)
        .post("/api/auth/otp/verify")
        .send({
          phone: testPhone,
          code: validCode,
        })
        .expect(200);

      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("user");
    });

    it("should reject invalid OTP code", async () => {
      const response = await request(app)
        .post("/api/auth/otp/verify")
        .send({
          phone: testPhone,
          code: "000000",
        })
        .expect(401);

      expect(response.body.message).toContain("نامعتبر");
    });

    it("should reject expired OTP", async () => {
      // Manually expire the OTP
      await OtpCode.updateOne(
        { phone: testPhone },
        { expiresAt: new Date(Date.now() - 1000) }
      );

      const response = await request(app)
        .post("/api/auth/otp/verify")
        .send({
          phone: testPhone,
          code: validCode,
        })
        .expect(401);

      expect(response.body.message).toContain("منقضی");
    });
  });
});

describe("Auth Routes - Profile", () => {
  let authToken;
  let testUser;

  beforeEach(async () => {
    // Register and login to get token
    const response = await request(app).post("/api/auth/register").send({
      name: "مهدی محمدی",
      phone: "09123456789",
      password: "password123",
    });

    authToken = response.body.token;
    testUser = response.body.user;
  });

  describe("GET /api/auth/me", () => {
    it("should return current user profile with valid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("user");
      expect(response.body.user.phone).toBe(testUser.phone);
    });

    it("should reject request without token", async () => {
      const response = await request(app).get("/api/auth/me").expect(401);

      expect(response.body.message).toContain("Unauthorized");
    });

    it("should reject request with invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      expect(response.body.message).toContain("Unauthorized");
    });
  });
});
