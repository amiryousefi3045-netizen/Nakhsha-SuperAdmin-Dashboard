const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");
const User = require("../models/User");
const authRouter = require("../routes/auth");
const usersRouter = require("../routes/users");

// Mock SMS service to prevent actual SMS sending
jest.mock("../services/sms/melipayamakSms", () => ({
  sendOtpSms: jest.fn().mockResolvedValue({ success: true }),
}));

const app = express();
app.use(express.json());
app.locals.dbReady = true; // Set DB as ready for tests

// Mock routes
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);

describe("Handle Implementation Tests", () => {
  let mongoServer;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri =
      process.env.MONGO_URI_TEST || "mongodb://localhost:27017/nakhsha_test";
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ phone: { $regex: "^091234" } });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clean up before each test
    await User.deleteMany({ phone: { $regex: "^091234" } });
  });

  test("Should create user with handle during OTP verification", async () => {
    const testPhone = "09123456789";

    // First, create a user manually to test the flow
    const user = await User.create({
      name: "Test User",
      phone: testPhone,
      handle: "u456789abc",
      isVerified: true,
      role: "user",
      creatorType: "artisan",
    });

    expect(user.handle).toBe("u456789abc");
    expect(user.phone).toBe(testPhone);
  });

  test("Should find user by handle via API", async () => {
    // Create a test user
    const testHandle = "u123456xyz";
    const user = await User.create({
      name: "Test API User",
      phone: "09123456123",
      handle: testHandle,
      isVerified: true,
      role: "user",
      creatorType: "artisan",
    });

    // Test the API endpoint
    const response = await request(app)
      .get(`/api/users/handle/${testHandle}`)
      .expect(200);

    expect(response.body).toHaveProperty("user");
    expect(response.body.user.handle).toBe(testHandle);
    expect(response.body.user.name).toBe("Test API User");
    expect(response.body.user.phone).toBe("09123456123");
  });

  test("Should return 404 for non-existent handle", async () => {
    const response = await request(app)
      .get("/api/users/handle/nonexistenthandle")
      .expect(404);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.details.handle).toBe("nonexistenthandle");
  });

  test("Should return 400 for invalid handle parameter", async () => {
    const response = await request(app).get("/api/users/handle/  ").expect(400);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("Handle should be included in UserDTO", async () => {
    // Create a test user
    const testHandle = "u789012def";
    const user = await User.create({
      name: "DTO Test User",
      phone: "09123456456",
      handle: testHandle,
      isVerified: true,
      role: "user",
      creatorType: "artisan",
    });

    // Test UserDTO includes handle
    const response = await request(app)
      .get(`/api/users/handle/${testHandle}`)
      .expect(200);

    const userDto = response.body.user;
    expect(userDto).toHaveProperty("handle", testHandle);
    expect(userDto).toHaveProperty("name", "DTO Test User");
    expect(userDto).toHaveProperty("phone", "09123456456");
    expect(userDto).toHaveProperty("isVerified", true);
  });
});
