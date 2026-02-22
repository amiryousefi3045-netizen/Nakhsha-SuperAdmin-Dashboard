const rateLimit = require("express-rate-limit");

// ---------------------------------------------------------------------------
// Canonical 429 response payload — mirrors the global error envelope so the
// client always receives { success, error: { code, message }, reqId }.
// ---------------------------------------------------------------------------
const make429Message = () => ({
  success: false,
  error: {
    code: "TOO_MANY_REQUESTS",
    message: "درخواست‌های زیادی ارسال شده‌اند. لطفاً کمی صبر کنید",
  },
  reqId: null, // filled in by the custom handler at request time
});

// ---------------------------------------------------------------------------
// Factory — lets tests create an isolated limiter with a fresh MemoryStore
// and an overridden max so they can reliably trigger 429 without polluting
// the production store.
//
// Usage:
//   const limiter = createHeavyLimiter();            // default 30 / min
//   const testLimiter = createHeavyLimiter({ max: 3 }); // tight, for tests
// ---------------------------------------------------------------------------
function createHeavyLimiter(opts = {}) {
  return rateLimit({
    windowMs: 60 * 1000, // 1-minute sliding window
    max: 30, // 30 requests per IP per minute
    standardHeaders: true, // emit RateLimit-* headers (RFC-6585 draft)
    legacyHeaders: false, // suppress X-RateLimit-* legacy headers
    // Produce a fresh message object per instantiation so handler can
    // mutate reqId without cross-request contamination.
    message: make429Message(),
    handler(req, res, _next, options) {
      const body = { ...options.message };
      body.reqId = req.id ?? null;
      res.status(options.statusCode).json(body);
    },
    // Skip in the test environment so ordinary integration tests are not
    // accidentally blocked.  The dedicated rate-limit test bypasses this
    // by constructing its own limiter via createHeavyLimiter({ max: 3 }).
    skip: () => process.env.NODE_ENV === "test",
    ...opts,
  });
}

// Singleton used by route files and server.js middleware chain.
const heavyLimiter = createHeavyLimiter();

// Rate limiter for OTP start endpoint - more lenient
const otpStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Allow 10 requests per 15 minutes per IP
  message: {
    message: "درخواست‌های زیادی ارسال شده. لطفاً کمی صبر کنید.",
    retryAfterSeconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === "development";
  },
});

// Rate limiter for OTP verify endpoint - more strict
const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // Allow 20 verify attempts per 10 minutes per IP
  message: {
    message: "تلاش‌های تأیید کد زیادی انجام شده. لطفاً کمی صبر کنید.",
    retryAfterSeconds: 120,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === "development";
  },
});

// General auth endpoints rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Allow 50 requests per 15 minutes per IP
  message: {
    message: "درخواست‌های زیادی ارسال شده. لطفاً کمی صبر کنید.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === "development";
  },
});

module.exports = {
  otpStartLimiter,
  otpVerifyLimiter,
  authLimiter,
  heavyLimiter,
  createHeavyLimiter,
};
