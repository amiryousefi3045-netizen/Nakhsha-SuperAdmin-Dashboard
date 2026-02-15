/**
 * Rate limiting utilities for OTP system
 */

const logger = require("../utils/logger");

// In-memory store for rate limiting (in production, use Redis)
const rateLimitStore = new Map();

// Configuration
const RATE_LIMIT_CONFIG = {
  // IP-based limits - prevent brute force from single IP
  IP_WINDOW_MINUTES: 15,
  IP_MAX_ATTEMPTS: 10,

  // Phone-based limits - prevent targeting specific phone numbers
  PHONE_WINDOW_MINUTES: 2,
  PHONE_MAX_ATTEMPTS: 5,

  // Global limits - prevent system-wide attacks
  GLOBAL_WINDOW_MINUTES: 5,
  GLOBAL_MAX_ATTEMPTS: 100,
};

/**
 * Clean expired rate limit entries
 */
function cleanExpiredEntries() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Check if an IP/phone is rate limited
 * @param {string} identifier - IP address or phone number
 * @param {string} type - 'ip', 'phone', or 'global'
 * @returns {Object} Rate limit status
 */
function checkRateLimit(identifier, type = "ip") {
  // Clean expired entries periodically
  if (Math.random() < 0.1) {
    // 10% chance
    cleanExpiredEntries();
  }

  const config = {
    ip: {
      window: RATE_LIMIT_CONFIG.IP_WINDOW_MINUTES * 60 * 1000,
      maxAttempts: RATE_LIMIT_CONFIG.IP_MAX_ATTEMPTS,
    },
    phone: {
      window: RATE_LIMIT_CONFIG.PHONE_WINDOW_MINUTES * 60 * 1000,
      maxAttempts: RATE_LIMIT_CONFIG.PHONE_MAX_ATTEMPTS,
    },
    global: {
      window: RATE_LIMIT_CONFIG.GLOBAL_WINDOW_MINUTES * 60 * 1000,
      maxAttempts: RATE_LIMIT_CONFIG.GLOBAL_MAX_ATTEMPTS,
    },
  };

  const { window, maxAttempts } = config[type];
  const key = `${type}:${identifier}`;
  const now = Date.now();

  let data = rateLimitStore.get(key);

  if (!data || data.resetTime < now) {
    // Create new window
    data = {
      count: 1,
      resetTime: now + window,
      firstAttempt: now,
    };
    rateLimitStore.set(key, data);

    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetTime: data.resetTime,
      retryAfterSeconds: 0,
    };
  }

  // Increment counter
  data.count++;

  if (data.count > maxAttempts) {
    const retryAfterSeconds = Math.ceil((data.resetTime - now) / 1000);

    logger.warn("Rate limit exceeded", {
      type,
      identifier,
      count: data.count,
      maxAttempts,
      retryAfterSeconds,
    });

    return {
      allowed: false,
      remaining: 0,
      resetTime: data.resetTime,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    remaining: maxAttempts - data.count,
    resetTime: data.resetTime,
    retryAfterSeconds: 0,
  };
}

/**
 * Rate limiting middleware for OTP endpoints
 */
function otpRateLimit(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress || "unknown";
  const phone = req.body?.phone;

  // Check IP-based rate limiting
  const ipLimit = checkRateLimit(clientIP, "ip");
  if (!ipLimit.allowed) {
    // Record rate limit hit
    if (typeof require !== "undefined") {
      try {
        const otpMetrics = require("./otpMetrics");
        otpMetrics.recordRateLimitHit("ip", clientIP, clientIP);
      } catch (e) {
        // Ignore metrics errors
      }
    }

    return res.status(429).json({
      message: "تعداد درخواست‌ها از این IP بیش از حد مجاز است",
      retryAfterSeconds: ipLimit.retryAfterSeconds,
      type: "ip_limit",
    });
  }

  // Check phone-based rate limiting (if phone is provided)
  if (phone) {
    const phoneLimit = checkRateLimit(phone, "phone");
    if (!phoneLimit.allowed) {
      // Record rate limit hit
      if (typeof require !== "undefined") {
        try {
          const otpMetrics = require("./otpMetrics");
          otpMetrics.recordRateLimitHit("phone", phone, clientIP);
        } catch (e) {
          // Ignore metrics errors
        }
      }

      return res.status(429).json({
        message: "تعداد درخواست‌ها برای این شماره بیش از حد مجاز است",
        retryAfterSeconds: phoneLimit.retryAfterSeconds,
        type: "phone_limit",
      });
    }
  }

  // Check global rate limiting
  const globalLimit = checkRateLimit("global", "global");
  if (!globalLimit.allowed) {
    // Record rate limit hit
    if (typeof require !== "undefined") {
      try {
        const otpMetrics = require("./otpMetrics");
        otpMetrics.recordRateLimitHit("global", "global", clientIP);
      } catch (e) {
        // Ignore metrics errors
      }
    }

    return res.status(503).json({
      message: "سرویس به دلیل ترافیک بالا موقتاً در دسترس نیست",
      retryAfterSeconds: globalLimit.retryAfterSeconds,
      type: "global_limit",
    });
  }

  // Add rate limit headers
  res.set({
    "X-RateLimit-IP-Remaining": ipLimit.remaining.toString(),
    "X-RateLimit-IP-Reset": new Date(ipLimit.resetTime).toISOString(),
  });

  next();
}

/**
 * Advanced suspicious activity detection
 * Detects potential brute-force attacks and bot activity
 */
function detectSuspiciousActivity(req, phone) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get("User-Agent") || "unknown";

  const suspiciousIndicators = [];

  // Check for missing or suspicious User-Agent
  if (!userAgent || userAgent === "unknown" || userAgent.length < 10) {
    suspiciousIndicators.push("suspicious_user_agent");
    logger.warn("Suspicious: Missing or short User-Agent", {
      clientIP,
      phone,
      userAgent,
    });
  }

  // Check for common bot patterns
  const botPatterns = [
    "bot",
    "spider",
    "crawler",
    "curl",
    "wget",
    "python",
    "axios",
    "node",
  ];
  if (
    botPatterns.some((pattern) => userAgent.toLowerCase().includes(pattern))
  ) {
    suspiciousIndicators.push("bot_user_agent");
    logger.warn("Suspicious: Bot-like User-Agent detected", {
      clientIP,
      phone,
      userAgent,
    });
  }

  // Check for rapid requests from same IP
  const recentKey = `recent:${clientIP}`;
  let recentRequests = rateLimitStore.get(recentKey);
  const now = Date.now();

  if (!recentRequests || recentRequests.resetTime < now) {
    recentRequests = { count: 1, resetTime: now + 60000 }; // 1 minute window
    rateLimitStore.set(recentKey, recentRequests);
  } else {
    recentRequests.count++;
  }

  if (recentRequests.count > 20) {
    suspiciousIndicators.push("rapid_requests");
    logger.warn("Suspicious: Rapid requests from IP", {
      clientIP,
      phone,
      count: recentRequests.count,
    });
  }

  // Check for multiple phone numbers from same IP
  const ipPhoneKey = `ip_phones:${clientIP}`;
  let ipPhones = rateLimitStore.get(ipPhoneKey);

  if (!ipPhones || ipPhones.resetTime < now) {
    ipPhones = { phones: new Set([phone]), resetTime: now + 3600000 }; // 1 hour window
    rateLimitStore.set(ipPhoneKey, ipPhones);
  } else {
    ipPhones.phones.add(phone);
  }

  if (ipPhones.phones.size > 5) {
    suspiciousIndicators.push("multiple_phones_from_ip");
    logger.warn("Suspicious: Multiple phone numbers from same IP", {
      clientIP,
      phoneCount: ipPhones.phones.size,
    });
  }

  // Log comprehensive suspicious activity
  if (suspiciousIndicators.length > 0) {
    logger.warn("Suspicious OTP activity detected", {
      clientIP,
      phone,
      userAgent,
      indicators: suspiciousIndicators,
      indicatorCount: suspiciousIndicators.length,
      timestamp: new Date().toISOString(),
    });
  }

  return suspiciousIndicators;
}

module.exports = {
  otpRateLimit,
  checkRateLimit,
  detectSuspiciousActivity,
  RATE_LIMIT_CONFIG,
};
