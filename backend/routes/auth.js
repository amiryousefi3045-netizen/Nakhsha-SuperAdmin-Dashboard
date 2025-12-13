const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OtpCode = require("../models/OtpCode");
const { generateCode, hashCode, verifyHash } = require("../utils/otp");
const { normalizePhone, isValidIranianPhone } = require("../utils/phone");
const { sendOtpSms } = require("../services/sms/melipayamakSms");
const logger = require("../utils/logger");
const {
  otpRateLimit,
  detectSuspiciousActivity,
} = require("../utils/rateLimiter");
const otpMetrics = require("../utils/otpMetrics");
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
router.post("/otp/start", otpRateLimit, async (req, res) => {
  const startTime = Date.now();

  try {
    logger.info("otp/start: begin", { ip: req.ip, ua: req.get("User-Agent") });
    // Record OTP request
    otpMetrics.recordOtpRequest(req.body?.phone, req.ip, req.get("User-Agent"));
    // DB readiness guard
    if (!req.app?.locals?.dbReady) {
      logger.warn("POST /auth/otp/start - DB not ready");
      return res.status(503).json({ message: "Database unavailable" });
    }

    const { phone } = req.body || {};

    // Input sanitization and validation
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({
        message: "شماره تلفن الزامی است",
        field: "phone",
      });
    }

    // Trim and normalize
    const trimmedPhone = phone.trim();
    if (trimmedPhone.length > 20) {
      return res.status(400).json({
        message: "شماره تلفن خیلی طولانی است",
        field: "phone",
      });
    }

    const normPhone = normalizePhone(trimmedPhone);

    // Validate phone number
    if (!normPhone || !isValidIranianPhone(normPhone)) {
      return res.status(400).json({
        message: "فرمت شماره تلفن نادرست است",
        field: "phone",
      });
    }

    // Detect suspicious activity
    const suspiciousIndicators = detectSuspiciousActivity(req, normPhone);
    if (suspiciousIndicators.length > 2) {
      otpMetrics.recordSuspiciousActivity(
        suspiciousIndicators,
        normPhone,
        req.ip,
        req.get("User-Agent")
      );

      logger.warn("Blocked suspicious OTP request", {
        phone: normPhone,
        clientIP: req.ip,
        indicators: suspiciousIndicators,
      });
      return res.status(429).json({
        message: "درخواست مشکوک تشخیص داده شد. لطفاً بعداً تلاش کنید",
      });
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
    logger.info("otp/start: saved", { phone: normPhone, expiresAt });
    // Respond immediately without awaiting SMS send
    const response = {
      success: true,
      message: "کد ارسال شد",
      retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };

    if (process.env.NODE_ENV !== "production") {
      response.devCode = code;
    }

    logger.info("otp/start: responded", { phone: normPhone });
    res.status(200).json(response);

    // Send SMS in background with timeout handled inside service
    const smsStartTime = Date.now();
    Promise.resolve()
      .then(() => sendOtpSms(normPhone, code))
      .then(() => {
        const smsDuration = Date.now() - smsStartTime;
        otpMetrics.recordSmsAttempt(normPhone, true, null, smsDuration);
        logger.info("otp/start: sms sent", {
          phone: normPhone,
          duration: smsDuration,
        });
      })
      .catch((smsError) => {
        const smsDuration = Date.now() - smsStartTime;
        otpMetrics.recordSmsAttempt(normPhone, false, smsError, smsDuration);
        logger.error("otp/start: sms failed", {
          phone: normPhone,
          error: smsError?.message,
          duration: smsDuration,
        });
      });
    return; // Ensure no further processing
  } catch (e) {
    otpMetrics.recordError("otp_start", e, {
      phone: req.body?.phone,
      clientIP: req.ip,
      duration: Date.now() - startTime,
    });

    logger.error("POST /auth/otp/start error", {
      error: e.message,
      stack: e.stack,
      duration: Date.now() - startTime,
    });
    return res.status(500).json({ message: "Server error" });
  }
});

// Verify OTP and issue JWT (auto-register if needed)
router.post("/otp/verify", otpRateLimit, async (req, res) => {
  const startTime = Date.now();

  try {
    logger.info("otp/verify: begin", { ip: req.ip, ua: req.get("User-Agent") });
    // DB readiness guard
    if (!req.app?.locals?.dbReady) {
      logger.warn("POST /auth/otp/verify - DB not ready");
      return res.status(503).json({ message: "Database unavailable" });
    }

    const { phone, code } = req.body || {};

    // Input sanitization and validation
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({
        message: "شماره تلفن الزامی است",
        field: "phone",
      });
    }

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        message: "کد تایید الزامی است",
        field: "code",
      });
    }

    // Validate code format (should be 6 digits)
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      return res.status(400).json({
        message: "کد تایید باید ۶ رقم باشد",
        field: "code",
      });
    }

    const normPhone = normalizePhone(phone.trim());

    // Validate input
    if (!normPhone || !isValidIranianPhone(normPhone)) {
      return res.status(400).json({
        message: "فرمت شماره تلفن نادرست است",
        field: "phone",
      });
    }

    // Find OTP record
    const record = await OtpCode.findOne({ phone: normPhone });
    if (!record) {
      logger.warn("OTP verification failed - no record found", {
        phone: normPhone,
        clientIP: req.ip,
        userAgent: req.get("User-Agent"),
      });
      return res.status(400).json({
        message: "کد نادرست است",
        field: "code",
      });
    }

    // Check expiration
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      logger.warn("OTP verification failed - code expired", {
        phone: normPhone,
        expiredAt: record.expiresAt,
        clientIP: req.ip,
      });
      // Clean up expired record
      await OtpCode.deleteOne({ _id: record._id });
      return res.status(400).json({
        message: "کد منقضی شده است. لطفاً کد جدید درخواست کنید",
        expired: true,
        field: "code",
      });
    }

    // Verify the code using timing-safe comparison
    const isValid = verifyHash(trimmedCode, normPhone, record.codeHash);
    if (!isValid) {
      // Increment attempts and persist
      record.attempts = (record.attempts || 0) + 1;
      await record.save();

      logger.warn("OTP verification failed - invalid code", {
        phone: normPhone,
        attempts: record.attempts,
        clientIP: req.ip,
        userAgent: req.get("User-Agent"),
        maxAttempts: OTP_MAX_ATTEMPTS,
      });

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

          logger.warn("OTP attempts exceeded limit", {
            phone: normPhone,
            attempts: record.attempts,
            remainingMinutes,
            clientIP: req.ip,
          });

          return res.status(429).json({
            message: `تعداد تلاش‌ها بیش از حد. لطفاً ${remainingMinutes} دقیقه صبر کنید.`,
            retryAfterSeconds: Math.ceil(
              (resetTimeMinutes * 60 * 1000 - timeSinceLastAttempt) / 1000
            ),
            field: "code",
            tooManyAttempts: true,
          });
        } else {
          // Reset attempts if enough time has passed
          record.attempts = 1;
          await record.save();
        }
      }
      return res.status(400).json({
        message: "کد نادرست است",
        field: "code",
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - record.attempts),
      });
    }

    // Successful verification: delete OTP record to prevent reuse
    await OtpCode.deleteOne({ _id: record._id });

    const duration = Date.now() - startTime;
    otpMetrics.recordVerificationAttempt(
      normPhone,
      true,
      duration,
      req.ip,
      record.attempts || 1
    );

    logger.info("OTP verification successful", {
      phone: normPhone,
      attempts: record.attempts,
      clientIP: req.ip,
      duration,
    });

    // Find or create user (optimized)
    let user = await User.findOne({ phone: normPhone }).lean();
    if (!user) {
      // Create new user with minimal fields for speed
      try {
        user = await User.create({
          name: "کاربر نخشا",
          phone: normPhone,
          isVerified: true,
          phoneVerifiedAt: new Date(),
        });

        logger.info("New user auto-registered via OTP", {
          userId: user._id,
          phone: normPhone,
        });
      } catch (createError) {
        logger.error("Failed to create user", {
          error: createError.message,
          phone: normPhone,
        });
        // Still continue with authentication if user creation fails
        user = {
          _id: null,
          name: "کاربر موقت",
          phone: normPhone,
          role: "user",
        };
      }
    }

    // Generate JWT token
    const token = sign(user);

    logger.info("otp/verify: responded", { phone: normPhone });
    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role || "user",
      },
      message: "تایید موفق",
    });
  } catch (e) {
    const errorDuration = Date.now() - startTime;
    otpMetrics.recordError("otp_verify", e, {
      phone: req.body?.phone,
      clientIP: req.ip,
      duration: errorDuration,
    });

    logger.error("POST /auth/otp/verify error", {
      error: e.message,
      stack: e.stack,
      duration: errorDuration,
    });
    return res.status(500).json({ message: "Server error" });
  }
});

// OTP metrics endpoint (for monitoring)
router.get("/otp/metrics", async (req, res) => {
  try {
    const metrics = otpMetrics.getMetrics();
    res.json(metrics);
  } catch (e) {
    logger.error("GET /auth/otp/metrics error", {
      error: e.message,
      stack: e.stack,
    });
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
