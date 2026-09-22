const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const TotpCredential = require("../models/TotpCredential");
const TotpService = require("../services/TotpService");

// ── Helpers ────────────────────────────────────────────────────────────────

function challengeOf(userId) {
  return jwt.sign(
    { id: String(userId), type: "totp-challenge" },
    process.env.JWT_SECRET,
    { expiresIn: "5m", algorithm: "HS256" },
  );
}

let saUser;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";

  const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;

  await User.deleteMany({ phone: "09210000201" });
  await TotpCredential.deleteMany({});

  saUser = await User.create({
    name: "سوپرادمین تاپ‌آپ",
    phone: "09210000201",
    handle: "sa_totp",
    role: "super_admin",
    isVerified: true,
  });
});

afterAll(async () => {
  await TotpCredential.deleteMany({});
  await User.deleteMany({ phone: "09210000201" });
});

// ── POST /api/auth/otp/totp ────────────────────────────────────────────────

describe("POST /api/auth/otp/totp", () => {
  it("rejects missing challenge", async () => {
    const res = await request(app)
      .post("/api/auth/otp/totp")
      .send({ totpCode: "123456" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TOTP_CHALLENGE_INVALID");
  });

  it("rejects invalid totpCode format", async () => {
    const challenge = challengeOf(saUser._id);

    const res = await request(app)
      .post("/api/auth/otp/totp")
      .send({ challenge, totpCode: "123" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects expired challenge JWT", async () => {
    const expired = jwt.sign(
      { id: String(saUser._id), type: "totp-challenge" },
      process.env.JWT_SECRET,
      { expiresIn: "-1s", algorithm: "HS256" },
    );

    const res = await request(app)
      .post("/api/auth/otp/totp")
      .send({ challenge: expired, totpCode: "123456" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TOTP_CHALLENGE_INVALID");
  });

  it("rejects challenge with wrong type claim", async () => {
    const wrongType = jwt.sign(
      { id: String(saUser._id), type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "5m", algorithm: "HS256" },
    );

    const res = await request(app)
      .post("/api/auth/otp/totp")
      .send({ challenge: wrongType, totpCode: "123456" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TOTP_CHALLENGE_INVALID");
  });

  it("rejects when TOTP is not enabled for the account", async () => {
    const challenge = challengeOf(saUser._id);

    const res = await request(app)
      .post("/api/auth/otp/totp")
      .send({ challenge, totpCode: "123456" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TOTP_NOT_ENABLED");
  });

  it("rejects invalid TOTP code", async () => {
    const secret = TotpService.generateSecret();
    await TotpCredential.create({ userId: saUser._id, secret, enabled: true, verifiedAt: new Date() });
    const challenge = challengeOf(saUser._id);

    const res = await request(app)
      .post("/api/auth/otp/totp")
      .send({ challenge, totpCode: "000000" })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TOTP_REQUIRED");
  });

  it("issues session tokens on valid TOTP code", async () => {
    const cred = await TotpCredential.findOne({ userId: saUser._id, enabled: true });
    const validCode = TotpService.generateCode(cred.secret);
    const challenge = challengeOf(saUser._id);

    const res = await request(app)
      .post("/api/auth/otp/totp")
      .send({ challenge, totpCode: validCode })
      .expect(200);

    // Response shape matches the plain OTP login (no `success` envelope):
    // { accessToken, refreshToken, refreshExpiresAt, user, token }
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.token).toBe(res.body.accessToken);
    expect(typeof res.body.refreshToken).toBe("string");
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe("super_admin");
  });
});

// ── OTP verify returns 202 requiresTotp when 2FA is enabled ────────────────

describe("OTP verify → TOTP challenge gate", () => {
  const totpPhone = "09210000210";

  beforeAll(async () => {
    await User.deleteMany({ phone: totpPhone });
    await TotpCredential.deleteMany({});

    const user = await User.create({
      name: "کاربر تاپ‌آپ",
      phone: totpPhone,
      handle: "u_totp",
      role: "user",
      isVerified: true,
    });

    const secret = TotpService.generateSecret();
    await TotpCredential.create({ userId: user._id, secret, enabled: true, verifiedAt: new Date() });
  });

  afterAll(async () => {
    await TotpCredential.deleteMany({});
    await User.deleteMany({ phone: totpPhone });
  });

  it("returns 202 with requiresTotp when 2FA is enabled", async () => {
    // Step 1: request OTP
    const startRes = await request(app)
      .post("/api/auth/otp/start")
      .send({ phone: totpPhone })
      .expect(200);

    const devCode = startRes.body.devCode;
    expect(devCode).toMatch(/^\d{6}$/);

    // Step 2: verify OTP — should get 202 requiresTotp
    const verifyRes = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone: totpPhone, code: devCode })
      .expect(202);

    expect(verifyRes.body.requiresTotp).toBe(true);
    expect(typeof verifyRes.body.challenge).toBe("string");
    expect(verifyRes.body.phone).toBe(totpPhone);
    // No session tokens returned at this stage
    expect(verifyRes.body.accessToken).toBeUndefined();
    expect(verifyRes.body.user).toBeUndefined();
  });
});
