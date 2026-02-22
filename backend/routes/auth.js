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
const { createUserDTO, createErrorResponse } = require("../utils/userDto");
const { generateUniqueHandle } = require("../utils/handleGenerator");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

/**
 * Fail-fast secret accessor.
 * Throws at call time if JWT_SECRET is not set so a missing secret is caught
 * on the very first token operation rather than silently using a weak default.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is not set — " +
        "server cannot sign or verify tokens. " +
        "Set it in backend/.env (see backend/.env.example).",
    );
  }
  return secret;
}

const TOKEN_TTL = process.env.JWT_TTL || "7d";
const OTP_TTL_SECONDS = parseInt(process.env.OTP_TTL_SECONDS || "120", 10);
const OTP_RESEND_SECONDS = parseInt(process.env.OTP_RESEND_SECONDS || "60", 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "8", 10);

const iranPhoneRegex = /^09\d{9}$/;

function sign(user) {
  return jwt.sign({ id: user._id, role: user.role }, getJwtSecret(), {
    expiresIn: TOKEN_TTL,
  });
}

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     deprecated: true
 *     summary: ثبت‌نام قدیمی - غیرفعال شده (فقط OTP استفاده کنید)
 *     description: این endpoint غیرفعال شده است. لطفاً از OTP استفاده کنید.
 *     tags: [Auth]
 */
router.post("/register", async (req, res) => {
  return res.status(410).json({
    message: "این endpoint غیرفعال شده است. لطفاً از OTP استفاده کنید.",
    deprecated: true,
    useOtpInstead: true,
  });
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     deprecated: true
 *     summary: ورود قدیمی - غیرفعال شده (فقط OTP استفاده کنید)
 *     description: این endpoint غیرفعال شده است. لطفاً از OTP استفاده کنید.
 *     tags: [Auth]
 */
router.post("/login", async (req, res) => {
  return res.status(410).json({
    message: "این endpoint غیرفعال شده است. لطفاً از OTP استفاده کنید.",
    deprecated: true,
    useOtpInstead: true,
  });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name phone handle role avatar bio location creatorType isVerified createdAt updatedAt",
    );
    if (!user) {
      return res
        .status(404)
        .json(createErrorResponse("USER_NOT_FOUND", "User not found"));
    }

    const userDTO = createUserDTO(user, req);
    res.json({ user: userDTO });
  } catch (e) {
    logger.error("GET /auth/me error", {
      error: e.message,
      stack: e.stack,
      userId: req.user?.id,
    });
    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "Server error"));
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
      return res
        .status(503)
        .json(
          createErrorResponse("SERVICE_UNAVAILABLE", "Database unavailable"),
        );
    }

    const { phone } = req.body || {};

    // Input sanitization and validation
    if (!phone || typeof phone !== "string") {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "شماره تلفن الزامی است", {
          field: "phone",
        }),
      );
    }

    // Trim and normalize
    const trimmedPhone = phone.trim();
    if (trimmedPhone.length > 20) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "شماره تلفن خیلی طولانی است",
            { field: "phone" },
          ),
        );
    }

    const normPhone = normalizePhone(trimmedPhone);

    // Validate phone number
    if (!normPhone || !isValidIranianPhone(normPhone)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "فرمت شماره تلفن نادرست است",
            { field: "phone" },
          ),
        );
    }

    // Detect suspicious activity
    const suspiciousIndicators = detectSuspiciousActivity(req, normPhone);
    if (suspiciousIndicators.length > 2) {
      otpMetrics.recordSuspiciousActivity(
        suspiciousIndicators,
        normPhone,
        req.ip,
        req.get("User-Agent"),
      );

      logger.warn("Blocked suspicious OTP request", {
        phone: normPhone,
        clientIP: req.ip,
        indicators: suspiciousIndicators,
      });
      return res.status(429).json(
        createErrorResponse(
          "RATE_LIMITED",
          "درخواست مشکوک تشخیص داده شد. لطفاً بعداً تلاش کنید",
          {
            suspiciousActivity: true,
            indicators: suspiciousIndicators,
          },
        ),
      );
    }

    // Check for existing OTP record
    const existing = await OtpCode.findOne({ phone: normPhone });

    // Check if phone is temporarily blocked
    if (
      existing &&
      existing.blockedUntil &&
      existing.blockedUntil > new Date()
    ) {
      const retryAfterSeconds = Math.ceil(
        (existing.blockedUntil.getTime() - Date.now()) / 1000,
      );
      const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);

      logger.warn("Phone temporarily blocked due to abuse", {
        phone: normPhone,
        blockedUntil: existing.blockedUntil,
        clientIP: req.ip,
      });

      return res.status(429).json(
        createErrorResponse(
          "TEMPORARILY_BLOCKED",
          `به دلیل تلاش‌های مشکوک، این شماره موقتاً مسدود شده است. ${retryAfterMinutes} دقیقه صبر کنید`,
          {
            retryAfterSeconds,
            retryAfterMinutes,
            blocked: true,
          },
        ),
      );
    }

    // Check resend cooldown
    if (existing && existing.lastSentAt) {
      const delta = Date.now() - new Date(existing.lastSentAt).getTime();
      const timeSinceLastSent = delta / 1000; // in seconds

      if (timeSinceLastSent < OTP_RESEND_SECONDS) {
        const retryAfterSeconds = Math.ceil(
          OTP_RESEND_SECONDS - timeSinceLastSent,
        );

        logger.info("OTP resend blocked - cooldown active", {
          phone: normPhone,
          timeSinceLastSent,
          retryAfterSeconds,
          clientIP: req.ip,
        });

        return res.status(429).json(
          createErrorResponse(
            "RATE_LIMITED",
            `لطفاً ${retryAfterSeconds} ثانیه صبر کنید`,
            {
              retryAfterSeconds,
              cooldown: true,
            },
          ),
        );
      }
    }

    // Check resend attempt limit (max 10 resends per hour)
    const MAX_RESEND_PER_HOUR = 10;
    const RESEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour

    if (existing) {
      const timeSinceCreated =
        Date.now() - new Date(existing.createdAt).getTime();

      // Reset resend counter if window has passed
      if (timeSinceCreated > RESEND_WINDOW_MS) {
        existing.resendCount = 0;
      }

      // Check if resend limit exceeded
      if (existing.resendCount >= MAX_RESEND_PER_HOUR) {
        // Block phone for 30 minutes
        const blockDurationMinutes = 30;
        existing.blockedUntil = new Date(
          Date.now() + blockDurationMinutes * 60 * 1000,
        );
        await existing.save();

        logger.warn("OTP resend limit exceeded - phone blocked", {
          phone: normPhone,
          resendCount: existing.resendCount,
          blockedUntil: existing.blockedUntil,
          clientIP: req.ip,
          userAgent: req.get("User-Agent"),
        });

        return res.status(429).json(
          createErrorResponse(
            "TOO_MANY_RESENDS",
            `تعداد درخواست کد بیش از حد. این شماره به مدت ${blockDurationMinutes} دقیقه مسدود شد`,
            {
              retryAfterSeconds: blockDurationMinutes * 60,
              blocked: true,
            },
          ),
        );
      }
    }

    // Generate 6-digit OTP code
    const code = generateCode(6);
    const codeHash = hashCode(code, normPhone);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    // Track IP addresses for this phone number
    const clientIP = req.ip || req.connection.remoteAddress || "unknown";
    const ipAddresses = existing?.ipAddresses || [];
    if (!ipAddresses.includes(clientIP)) {
      ipAddresses.push(clientIP);
      // Keep only last 5 IPs
      if (ipAddresses.length > 5) {
        ipAddresses.shift();
      }
    }

    // Increment resend count
    const resendCount = (existing?.resendCount || 0) + 1;

    // Store hashed code with expiry and security tracking
    await OtpCode.findOneAndUpdate(
      { phone: normPhone },
      {
        codeHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
        resendCount,
        ipAddresses,
        blockedUntil: null, // Clear any previous block
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    logger.info("otp/start: saved", {
      phone: normPhone,
      expiresAt,
      resendCount,
      clientIP,
    });
    // Respond immediately without awaiting SMS send
    const response = {
      ok: true,
      cooldownSeconds: OTP_RESEND_SECONDS,
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
    return res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "Server error"));
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
      return res
        .status(503)
        .json(
          createErrorResponse("SERVICE_UNAVAILABLE", "Database unavailable"),
        );
    }

    const { phone, code } = req.body || {};

    // Input sanitization and validation
    if (!phone || typeof phone !== "string") {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "شماره تلفن الزامی است", {
          field: "phone",
        }),
      );
    }

    if (!code || typeof code !== "string") {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "کد تایید الزامی است", {
          field: "code",
        }),
      );
    }

    // Validate code format (should be 6 digits)
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "کد تایید باید ۶ رقم باشد", {
          field: "code",
        }),
      );
    }

    const normPhone = normalizePhone(phone.trim());

    // Validate input
    if (!normPhone || !isValidIranianPhone(normPhone)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "فرمت شماره تلفن نادرست است",
            { field: "phone" },
          ),
        );
    }

    // Find OTP record
    const record = await OtpCode.findOne({ phone: normPhone });
    if (!record) {
      logger.warn("OTP verification failed - no record found", {
        phone: normPhone,
        clientIP: req.ip,
        userAgent: req.get("User-Agent"),
      });

      // Log suspicious activity (trying to verify without requesting OTP)
      otpMetrics.recordSuspiciousActivity(
        ["verify_without_request"],
        normPhone,
        req.ip,
        req.get("User-Agent"),
      );

      return res
        .status(400)
        .json(createErrorResponse("OTP_INVALID", "", { field: "code" }));
    }

    // Check if phone is temporarily blocked
    if (record.blockedUntil && record.blockedUntil > new Date()) {
      const retryAfterSeconds = Math.ceil(
        (record.blockedUntil.getTime() - Date.now()) / 1000,
      );
      const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);

      logger.warn("Verification blocked - phone temporarily blocked", {
        phone: normPhone,
        blockedUntil: record.blockedUntil,
        clientIP: req.ip,
      });

      return res.status(429).json(
        createErrorResponse(
          "TEMPORARILY_BLOCKED",
          `این شماره به دلیل تلاش‌های ناموفق زیاد، موقتاً مسدود است. ${retryAfterMinutes} دقیقه صبر کنید`,
          {
            retryAfterSeconds,
            blocked: true,
          },
        ),
      );
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
      return res
        .status(400)
        .json(
          createErrorResponse(
            "OTP_EXPIRED",
            "کد منقضی شده است. لطفاً کد جدید درخواست کنید",
            { field: "code", expired: true },
          ),
        );
    }

    // Verify the code using timing-safe comparison
    const isValid = verifyHash(trimmedCode, normPhone, record.codeHash);
    if (!isValid) {
      // Increment attempts and update last attempt time
      record.attempts = (record.attempts || 0) + 1;
      record.lastAttemptAt = new Date();

      logger.warn("OTP verification failed - invalid code", {
        phone: normPhone,
        attempts: record.attempts,
        clientIP: req.ip,
        userAgent: req.get("User-Agent"),
        maxAttempts: OTP_MAX_ATTEMPTS,
      });

      // Check if max attempts exceeded
      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        // Block phone for 15 minutes after max failed attempts
        const blockDurationMinutes = 15;
        record.blockedUntil = new Date(
          Date.now() + blockDurationMinutes * 60 * 1000,
        );
        await record.save();

        logger.warn("OTP attempts exceeded - phone blocked", {
          phone: normPhone,
          attempts: record.attempts,
          blockedUntil: record.blockedUntil,
          clientIP: req.ip,
          userAgent: req.get("User-Agent"),
        });

        // Log as suspicious activity
        otpMetrics.recordSuspiciousActivity(
          ["too_many_verification_attempts"],
          normPhone,
          req.ip,
          req.get("User-Agent"),
        );

        return res.status(429).json(
          createErrorResponse(
            "TOO_MANY_ATTEMPTS",
            `تعداد تلاش‌های ناموفق بیش از حد. این شماره به مدت ${blockDurationMinutes} دقیقه مسدود شد`,
            {
              retryAfterSeconds: blockDurationMinutes * 60,
              blocked: true,
            },
          ),
        );
      }

      // Save incremented attempts
      await record.save();

      return res.status(400).json(
        createErrorResponse("OTP_INVALID", "", {
          field: "code",
          attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - record.attempts),
        }),
      );
    }

    // Successful verification: delete OTP record to prevent reuse
    await OtpCode.deleteOne({ _id: record._id });

    const duration = Date.now() - startTime;
    otpMetrics.recordVerificationAttempt(
      normPhone,
      true,
      duration,
      req.ip,
      record.attempts || 1,
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
        // Generate unique handle for new user
        const handle = await generateUniqueHandle(normPhone);

        user = await User.create({
          name: "کاربر نخشا",
          phone: normPhone,
          handle: handle,
          isVerified: true,
          role: "user",
          creatorType: "artisan",
        });

        logger.info("New user auto-registered via OTP", {
          userId: user._id,
          phone: normPhone,
          handle: handle,
        });
      } catch (createError) {
        logger.error("Failed to create user", {
          error: createError.message,
          phone: normPhone,
        });

        // Return 500 error instead of issuing JWT with null id
        return res
          .status(500)
          .json(
            createErrorResponse("USER_CREATE_FAILED", "Failed to create user"),
          );
      }
    }

    // Fetch fresh user document with all required fields for complete UserDTO
    const freshUser = await User.findById(user._id).select(
      "name phone handle role avatar bio location creatorType isVerified createdAt updatedAt",
    );

    if (!freshUser) {
      logger.error("Fresh user fetch failed after creation/find", {
        userId: user._id,
        phone: normPhone,
      });
      return res
        .status(500)
        .json(
          createErrorResponse("USER_FETCH_FAILED", "Failed to fetch user data"),
        );
    }

    // Generate JWT token
    const token = sign(freshUser);

    logger.info("otp/verify: responded", { phone: normPhone });

    const userDTO = createUserDTO(freshUser, req);
    return res.json({
      token,
      user: userDTO,
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
    return res
      .status(500)
      .json(createErrorResponse("INTERNAL_ERROR", "Server error"));
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
    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "Server error"));
  }
});

module.exports = router;
