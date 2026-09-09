const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const OtpCode = require("../models/OtpCode");
const { _resetRateLimitStoreForTests } = require("../utils/rateLimiter");

// Rate-limit budget notes (per-jest-worker, in-memory store in utils/rateLimiter.js):
//   - IP:  max 10 otp/start + otp/verify requests per 15 min
//   - Phone: max 5 otp requests per phone per 2 min
//   - Suspicious detector: blocks when > 2 indicators; supertest UA contains "node"
//     so exactly 1 indicator (bot_user_agent) is always present; keep <= 5 distinct
//     phones and <= 20 requests/min to stay under the threshold.
// This file issues exactly 9 OTP requests across 5 distinct phones.
const COOLDOWN_SECONDS = parseInt(process.env.OTP_RESEND_SECONDS || "60", 10);

const PS = {
  cooldown: "09132220001",
  cooldownPassed: "09132220002",
  login: "09132220003",
  invalid: "09132220004",
};

// Populated by the "logs in (auto-registers)" test and reused by the Profile
// block — avoids a second OTP login (rate-limit budget: 9 requests/file).
let verifiedAccessToken;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  _resetRateLimitStoreForTests();

  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  await mongoose.connect(mongoUri);

  // Clean slate exactly once; tests below use dedicated phones so no further
  // cross-test cleanup is required.
  await User.deleteMany({});
  await OtpCode.deleteMany({});
  app.locals.dbReady = true;
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe("Auth Routes - Deprecated legacy endpoints", () => {
  it("POST /api/auth/register returns 410 and points to OTP", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "علی احمدی", phone: "09123456789", password: "x" })
      .expect(410);

    expect(response.body.deprecated).toBe(true);
    expect(response.body.useOtpInstead).toBe(true);
    expect(response.body.message).toContain("غیرفعال");
  });

  it("POST /api/auth/login returns 410 and points to OTP", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ phone: "09123456789", password: "x" })
      .expect(410);

    expect(response.body.deprecated).toBe(true);
    expect(response.body.useOtpInstead).toBe(true);
    expect(response.body.message).toContain("غیرفعال");
  });
});

describe("Auth Routes - OTP start", () => {
  it("rejects an invalid phone number with VALIDATION_ERROR", async () => {
    const response = await request(app)
      .post("/api/auth/otp/start")
      .send({ phone: "123" })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.field).toBe("phone");
    expect(response.body.reqId).toBeDefined();
  });

  it("enforces resend cooldown for a second request sent too early", async () => {
    const first = await request(app)
      .post("/api/auth/otp/start")
      .send({ phone: PS.cooldown })
      .expect(200);

    expect(first.body.ok).toBe(true);
    expect(first.body.cooldownSeconds).toBe(COOLDOWN_SECONDS);
    expect(typeof first.body.devCode).toBe("string");
    expect(first.body.devCode).toMatch(/^\d{6}$/);

    // The OTP record must be persisted (hashed) in MongoDB
    const otp = await OtpCode.findOne({ phone: PS.cooldown });
    expect(otp).toBeTruthy();
    expect(otp.codeHash).toBeTruthy();
    expect(otp.codeHash).not.toBe(first.body.devCode);

    const second = await request(app)
      .post("/api/auth/otp/start")
      .send({ phone: PS.cooldown })
      .expect(429);

    expect(second.body.success).toBe(false);
    expect(second.body.error.code).toBe("RATE_LIMITED");
    expect(second.body.error.details.cooldown).toBe(true);
    expect(second.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(second.body.error.details.retryAfterSeconds).toBeLessThanOrEqual(
      COOLDOWN_SECONDS,
    );
  });

  it("allows a request after the cooldown window has passed", async () => {
    // Seed an OTP record whose lastSentAt is older than the cooldown
    await OtpCode.create({
      phone: PS.cooldownPassed,
      codeHash: "irrelevant",
      expiresAt: new Date(Date.now() + 120_000),
      lastSentAt: new Date(Date.now() - (COOLDOWN_SECONDS + 5) * 1000),
      resendCount: 1,
    });

    const response = await request(app)
      .post("/api/auth/otp/start")
      .send({ phone: PS.cooldownPassed })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.cooldownSeconds).toBe(COOLDOWN_SECONDS);
  });
});

describe("Auth Routes - OTP verify", () => {
  it("logs in (auto-registers) a user and issues access + refresh tokens", async () => {
    const start = await request(app)
      .post("/api/auth/otp/start")
      .send({ phone: PS.login })
      .expect(200);

    const verify = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone: PS.login, code: start.body.devCode })
      .expect(200);

    expect(verify.body.accessToken).toBeDefined();
    expect(verify.body.refreshToken).toBeDefined();
    expect(verify.body.refreshExpiresAt).toBeDefined();
    // Backward-compat alias kept by the API
    expect(verify.body.token).toBe(verify.body.accessToken);
    expect(verify.body.user).toBeDefined();
    expect(verify.body.user.phone).toBe(PS.login);

    // Populate the token for the downstream Profile block
    verifiedAccessToken = verify.body.accessToken;

    // The OTP record is consumed after a successful verification
    const consumed = await OtpCode.findOne({ phone: PS.login });
    expect(consumed).toBeFalsy();

    // New user is created in DB
    const created = await User.findOne({ phone: PS.login });
    expect(created).toBeTruthy();
  });

  it("rejects an invalid code with OTP_INVALID then an expired code with OTP_EXPIRED", async () => {
    const start = await request(app)
      .post("/api/auth/otp/start")
      .send({ phone: PS.invalid })
      .expect(200);

    const wrongCode = start.body.devCode === "000000" ? "000001" : "000000";

    const invalid = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone: PS.invalid, code: wrongCode })
      .expect(400);

    expect(invalid.body.success).toBe(false);
    expect(invalid.body.error.code).toBe("OTP_INVALID");
    expect(invalid.body.error.details.field).toBe("code");
    expect(invalid.body.error.details.attemptsRemaining).toBeGreaterThan(0);

    // Force expiration then retry with the valid code
    await OtpCode.updateOne(
      { phone: PS.invalid },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const expired = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone: PS.invalid, code: start.body.devCode })
      .expect(400);

    expect(expired.body.success).toBe(false);
    expect(expired.body.error.code).toBe("OTP_EXPIRED");
    expect(expired.body.error.details.expired).toBe(true);
  });
});

describe("Auth Routes - Profile", () => {
  it("GET /api/auth/me returns the current user profile with a valid token", async () => {
    expect(verifiedAccessToken).toBeDefined();

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${verifiedAccessToken}`)
      .expect(200);

    expect(response.body.user).toBeDefined();
    expect(response.body.user.phone).toBe(PS.login);
  });

  it("GET /api/auth/me rejects a request without a token", async () => {
    const response = await request(app).get("/api/auth/me").expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(response.body.error.message).toContain(
      "Missing or invalid authorization token",
    );
  });

  it("GET /api/auth/me rejects a request with an invalid token", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid-token")
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(response.body.error.message).toContain("Invalid or expired token");
  });
});