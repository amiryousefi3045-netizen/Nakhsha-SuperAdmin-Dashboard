const rateLimit = require("express-rate-limit");

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
};
