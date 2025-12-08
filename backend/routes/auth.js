const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OtpCode = require("../models/OtpCode");
const { generateCode, hashCode, verifyHash } = require("../utils/otp");
const logger = require("../utils/logger");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const TOKEN_TTL = process.env.JWT_TTL || "7d";
const OTP_TTL_SECONDS = parseInt(process.env.OTP_TTL_SECONDS || "120", 10);
const OTP_RESEND_SECONDS = parseInt(process.env.OTP_RESEND_SECONDS || "60", 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);

function normalizePhone(phone) {
  if (typeof phone !== "string") return phone;
  return phone.trim();
}

const iranPhoneRegex = /^09\d{9}$/;

function sign(user) {
  return jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

router.post("/register", async (req, res) => {
  try {
    // If DB is not ready, return a clear 503 so client doesn't get a generic 500
    if (!req.app?.locals?.dbReady) {
      logger.warn("POST /auth/register - DB not ready");
      return res.status(503).json({ message: "Database unavailable" });
    }
    logger.debug("Register request received", { body: req.body });
    const { name, email, phone, password, role } = req.body || {};
    const normEmail =
      typeof email === "string" ? email.toLowerCase().trim() : email;
    const normPhone = typeof phone === "string" ? phone.trim() : phone;
    if (!name || !email || !phone || !password) {
      logger.warn("Missing required fields", {
        name: !!name,
        email: !!email,
        phone: !!phone,
        password: !!password,
      });
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (typeof password === "string" && password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }
    const exists = await User.findOne({
      $or: [{ email: normEmail }, { phone: normPhone }],
    });
    if (exists) {
      logger.warn("User already exists", { email, phone });
      return res.status(409).json({ message: "Email or phone already exists" });
    }
    logger.info("Creating new user", { name, email, phone });
    const user = await User.create({
      name: String(name).trim(),
      email: normEmail,
      phone: normPhone,
      password,
      role,
    });
    logger.info("User created successfully", { userId: user._id });
    const token = sign(user);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    // Handle validation and duplicate key errors with proper status codes
    if (e?.name === "ValidationError") {
      const details = Object.values(e.errors || {}).map((er) => er.message);
      return res.status(400).json({ message: "Validation error", details });
    }
    if (e?.code === 11000) {
      const field = Object.keys(e.keyPattern || e.keyValue || {})[0] || "field";
      return res.status(409).json({ message: `${field} already exists` });
    }
    logger.error("POST /auth/register error", {
      error: e.message,
      stack: e.stack,
    });
    res.status(500).json({ message: "Server error", error: e.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    // If DB is not ready, return 503 to signal service unavailable
    if (!req.app?.locals?.dbReady) {
      logger.warn("POST /auth/login - DB not ready");
      return res.status(503).json({ message: "Database unavailable" });
    }
    const { email, phone, password } = req.body || {};
    const normEmail =
      typeof email === "string" ? email.toLowerCase().trim() : email;
    const normPhone = typeof phone === "string" ? phone.trim() : phone;
    if ((!email && !phone) || !password)
      return res.status(400).json({ message: "Missing credentials" });
    const user = await User.findOne(
      email ? { email: normEmail } : { phone: normPhone }
    ).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });
    const token = sign(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    logger.error("POST /auth/login error", {
      error: e.message,
      stack: e.stack,
    });
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email role avatar"
    );
    if (!user) return res.status(404).json({ message: "Not found" });
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

// Start OTP flow: generate and store (hashed) code, enforce resend rate-limit
router.post("/otp/start", async (req, res) => {
  try {
    // DB readiness guard
    if (!req.app?.locals?.dbReady) {
      logger.warn("POST /auth/otp/start - DB not ready");
      return res.status(503).json({ message: "Database unavailable" });
    }
    const { phone } = req.body || {};
    const normPhone = normalizePhone(phone);
    if (!normPhone || !iranPhoneRegex.test(normPhone))
      return res.status(400).json({ message: "Invalid phone format" });

    // Rate-limit: check lastSentAt
    const existing = await OtpCode.findOne({ phone: normPhone });
    if (existing && existing.lastSentAt) {
      const delta = Date.now() - new Date(existing.lastSentAt).getTime();
      if (delta < OTP_RESEND_SECONDS * 1000)
        return res.status(429).json({
          message: "Try again later",
          retryAfterSeconds: Math.ceil(
            (OTP_RESEND_SECONDS * 1000 - delta) / 1000
          ),
        });
    }

    // Generate code (5 or 6 digits). Use 6 by default.
    const code = generateCode(6);
    const codeHash = hashCode(code, normPhone);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    // Upsert the OTP record for the phone
    await OtpCode.findOneAndUpdate(
      { phone: normPhone },
      { codeHash, expiresAt, attempts: 0, lastSentAt: new Date() },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // TODO: Integrate with SMS provider here. Keep it separate for testability.

    const response = { success: true, message: "OTP sent" };
    if ((process.env.NODE_ENV || "development") !== "production") {
      // In non-production include the dev code to speed testing — do NOT enable in production
      response.devCode = code;
    }

    res.json(response);
  } catch (e) {
    logger.error("POST /auth/otp/start error", {
      error: e.message,
      stack: e.stack,
    });
    res.status(500).json({ message: "Server error" });
  }
});

// Verify OTP and issue JWT (auto-register if needed)
router.post("/otp/verify", async (req, res) => {
  try {
    // DB readiness guard
    if (!req.app?.locals?.dbReady) {
      logger.warn("POST /auth/otp/verify - DB not ready");
      return res.status(503).json({ message: "Database unavailable" });
    }
    const { phone, code } = req.body || {};
    const normPhone = normalizePhone(phone);
    if (!normPhone || !iranPhoneRegex.test(normPhone) || !code)
      return res.status(400).json({ message: "Invalid input" });

    const record = await OtpCode.findOne({ phone: normPhone });
    if (!record)
      return res.status(400).json({ message: "OTP not found or expired" });
    if (record.expiresAt && record.expiresAt.getTime() < Date.now())
      return res.status(400).json({ message: "OTP expired" });

    // Verify the code first using timing-safe compare
    const ok = verifyHash(code, normPhone, record.codeHash);
    if (!ok) {
      // On mismatch, increment attempts and persist
      record.attempts = (record.attempts || 0) + 1;
      await record.save();
      if (record.attempts >= OTP_MAX_ATTEMPTS)
        return res
          .status(429)
          .json({ message: "تعداد تلاش‌ها بیش از حد مجاز است." });
      return res.status(400).json({ message: "کد وارد شده صحیح نیست." });
    }

    // Successful verification: delete OTP record to prevent reuse
    await OtpCode.deleteOne({ _id: record._id });

    // Find or create user. Current User model requires email & password, so create
    // a minimal stub account with a placeholder email and random password.
    let user = await User.findOne({ phone: normPhone });
    if (!user) {
      // Create a user without placeholder email/password for OTP-only signup
      user = await User.create({
        name: "کاربر نخشا",
        phone: normPhone,
      });
      // Mark verified if schema supports it
      try {
        if (typeof user.isVerified !== "undefined") user.isVerified = true;
        // If schema has phoneVerifiedAt, set it as well
        if (
          User.schema &&
          User.schema.path &&
          User.schema.path("phoneVerifiedAt")
        ) {
          user.phoneVerifiedAt = new Date();
        }
        if (user.save) await user.save();
      } catch (e) {
        logger.warn("Failed to mark new user as verified", {
          error: e.message,
        });
      }
    }

    const token = sign(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    logger.error("POST /auth/otp/verify error", {
      error: e.message,
      stack: e.stack,
    });
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
