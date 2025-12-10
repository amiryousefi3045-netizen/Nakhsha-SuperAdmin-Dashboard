const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OtpCode = require("../models/OtpCode");
const { generateCode, hashCode, verifyHash } = require("../utils/otp");
const { normalizePhone, isValidIranianPhone } = require("../utils/phone");
const { sendOtpSms } = require("../services/sms/melipayamakSms");
const logger = require("../utils/logger");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const TOKEN_TTL = process.env.JWT_TTL || "7d";
const OTP_TTL_SECONDS = parseInt(process.env.OTP_TTL_SECONDS || "120", 10);
const OTP_RESEND_COOLDOWN_SECONDS = parseInt(
  process.env.OTP_RESEND_COOLDOWN_SECONDS || "120",
  10
);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "8", 10);

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

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: ثبت‌نام کاربر جدید
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: علی احمدی
 *               email:
 *                 type: string
 *                 format: email
 *                 example: ali@example.com
 *               phone:
 *                 type: string
 *                 pattern: '^09\d{9}$'
 *                 example: "09123456789"
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: password123
 *               role:
 *                 type: string
 *                 enum: [user, artisan, admin]
 *                 default: user
 *     responses:
 *       201:
 *         description: ثبت‌نام موفق
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: داده‌های نامعتبر
 *       409:
 *         description: ایمیل یا شماره تلفن تکراری
 *       503:
 *         description: دیتابیس در دسترس نیست
 */
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

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: ورود کاربر
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: ali@example.com
 *               phone:
 *                 type: string
 *                 example: "09123456789"
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: ورود موفق
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: اطلاعات ناقص
 *       401:
 *         description: نام کاربری یا رمز عبور اشتباه
 *       503:
 *         description: دیتابیس در دسترس نیست
 */
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

    // Validate phone number
    if (!normPhone || !isValidIranianPhone(normPhone)) {
      return res.status(400).json({ message: "فرمت شماره تلفن نادرست است" });
    }

    // Rate limiting disabled in development for easier testing
    if (process.env.NODE_ENV !== "development") {
      // Check resend cooldown - only in production
      const existing = await OtpCode.findOne({ phone: normPhone });
      if (existing && existing.lastSentAt) {
        const delta = Date.now() - new Date(existing.lastSentAt).getTime();
        const timeSinceLastSent = delta / 1000; // in seconds

        if (timeSinceLastSent < OTP_RESEND_COOLDOWN_SECONDS) {
          const retryAfterSeconds = Math.ceil(
            OTP_RESEND_COOLDOWN_SECONDS - timeSinceLastSent
          );
          return res.status(429).json({
            message: `لطفاً ${retryAfterSeconds} ثانیه صبر کنید`,
            retryAfterSeconds,
          });
        }
      }
    }

    // Generate 6-digit OTP code
    const code = generateCode(6);
    const codeHash = hashCode(code, normPhone);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    // Store hashed code with expiry
    await OtpCode.findOneAndUpdate(
      { phone: normPhone },
      { codeHash, expiresAt, attempts: 0, lastSentAt: new Date() },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // Send SMS via MeliPayamak
    try {
      await sendOtpSms(normPhone, code);
      logger.info("OTP SMS sent successfully", { phone: normPhone });
    } catch (smsError) {
      logger.error("Failed to send OTP SMS", {
        phone: normPhone,
        error: smsError.message,
      });
      // Don't expose SMS sending failures to client in production
      if (process.env.NODE_ENV === "production") {
        return res
          .status(500)
          .json({ message: "خطا در ارسال کد. لطفاً دوباره تلاش کنید" });
      } else {
        return res.status(500).json({
          message: "Failed to send SMS",
          error: smsError.message,
        });
      }
    }

    const response = {
      success: true,
      message: "کد ارسال شد",
      retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };

    // Include dev code in non-production environments
    if (process.env.NODE_ENV !== "production") {
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

    // Validate input
    if (!normPhone || !isValidIranianPhone(normPhone) || !code) {
      return res.status(400).json({ message: "Invalid input" });
    }

    // Find OTP record
    const record = await OtpCode.findOne({ phone: normPhone });
    if (!record) {
      return res.status(400).json({ message: "کد نادرست است" });
    }

    // Check expiration
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "کد منقضی شده" });
    }

    // Verify the code using timing-safe comparison
    const isValid = verifyHash(code, normPhone, record.codeHash);
    if (!isValid) {
      // Increment attempts and persist
      record.attempts = (record.attempts || 0) + 1;
      await record.save();

      // Rate limit after max attempts
      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        // Reset attempts after 10 minutes
        const timeSinceLastAttempt =
          Date.now() - new Date(record.lastSentAt).getTime();
        const resetTimeMinutes = 10;

        if (timeSinceLastAttempt < resetTimeMinutes * 60 * 1000) {
          const remainingMinutes = Math.ceil(
            (resetTimeMinutes * 60 * 1000 - timeSinceLastAttempt) / (60 * 1000)
          );
          return res.status(429).json({
            message: `تعداد تلاش‌ها بیش از حد. لطفاً ${remainingMinutes} دقیقه صبر کنید.`,
            retryAfterSeconds: Math.ceil(
              (resetTimeMinutes * 60 * 1000 - timeSinceLastAttempt) / 1000
            ),
          });
        } else {
          // Reset attempts if enough time has passed
          record.attempts = 1;
          await record.save();
        }
      }
      return res.status(400).json({ message: "کد نادرست است" });
    }

    // Successful verification: delete OTP record to prevent reuse
    await OtpCode.deleteOne({ _id: record._id });

    // Find or create user (auto-register)
    let user = await User.findOne({ phone: normPhone });
    if (!user) {
      // Create new user with phone-only registration
      user = await User.create({
        name: "کاربر نخشا",
        phone: normPhone,
        // Don't require email and password for OTP-only registration
      });

      // Mark as verified if schema supports it
      try {
        if (typeof user.isVerified !== "undefined") {
          user.isVerified = true;
        }
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

      logger.info("New user auto-registered via OTP", {
        userId: user._id,
        phone: normPhone,
      });
    }

    // Generate JWT token
    const token = sign(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
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
