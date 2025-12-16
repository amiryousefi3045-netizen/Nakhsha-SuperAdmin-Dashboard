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
const { requireAuth } = require("../middleware/auth");
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
      "name phone role avatar bio location creatorType isVerified createdAt updatedAt"
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
          createErrorResponse("SERVICE_UNAVAILABLE", "Database unavailable")
        );
    }

    const { phone } = req.body || {};

    // Input sanitization and validation
    if (!phone || typeof phone !== "string") {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "شماره تلفن الزامی است", {
          field: "phone",
        })
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
            { field: "phone" }
          )
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
            { field: "phone" }
          )
        );
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
      return res.status(429).json(
        createErrorResponse(
          "RATE_LIMITED",
          "درخواست مشکوک تشخیص داده شد. لطفاً بعداً تلاش کنید",
          {
            suspiciousActivity: true,
            indicators: suspiciousIndicators,
          }
        )
      );
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
          return res.status(429).json(
            createErrorResponse(
              "RATE_LIMITED",
              `لطفاً ${retryAfterSeconds} ثانیه صبر کنید`,
              {
                retryAfterSeconds,
                cooldown: true,
              }
            )
          );
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
      ok: true,
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
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
          createErrorResponse("SERVICE_UNAVAILABLE", "Database unavailable")
        );
    }

    const { phone, code } = req.body || {};

    // Input sanitization and validation
    if (!phone || typeof phone !== "string") {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "شماره تلفن الزامی است", {
          field: "phone",
        })
      );
    }

    if (!code || typeof code !== "string") {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "کد تایید الزامی است", {
          field: "code",
        })
      );
    }

    // Validate code format (should be 6 digits)
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "کد تایید باید ۶ رقم باشد", {
          field: "code",
        })
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
            { field: "phone" }
          )
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
      return res
        .status(400)
        .json(
          createErrorResponse("OTP_INVALID", "کد نادرست است", { field: "code" })
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
            { field: "code", expired: true }
          )
        );
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

          return res.status(429).json(
            createErrorResponse(
              "TOO_MANY_ATTEMPTS",
              `تعداد تلاش‌ها بیش از حد. لطفاً ${remainingMinutes} دقیقه صبر کنید.`,
              {
                retryAfterSeconds: Math.ceil(
                  (resetTimeMinutes * 60 * 1000 - timeSinceLastAttempt) / 1000
                ),
                field: "code",
                tooManyAttempts: true,
                remainingMinutes,
              }
            )
          );
        } else {
          // Reset attempts if enough time has passed
          record.attempts = 1;
          await record.save();
        }
      }
      return res.status(400).json(
        createErrorResponse("OTP_INVALID", "کد نادرست است", {
          field: "code",
          attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - record.attempts),
        })
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
          role: "user",
          creatorType: "artisan",
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

        // Return 500 error instead of issuing JWT with null id
        return res
          .status(500)
          .json(
            createErrorResponse("USER_CREATE_FAILED", "Failed to create user")
          );
      }
    }

    // Fetch fresh user document with all required fields for complete UserDTO
    const freshUser = await User.findById(user._id).select(
      "name phone role avatar bio location creatorType isVerified createdAt updatedAt"
    );

    if (!freshUser) {
      logger.error("Fresh user fetch failed after creation/find", {
        userId: user._id,
        phone: normPhone,
      });
      return res
        .status(500)
        .json(
          createErrorResponse("USER_FETCH_FAILED", "Failed to fetch user data")
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
