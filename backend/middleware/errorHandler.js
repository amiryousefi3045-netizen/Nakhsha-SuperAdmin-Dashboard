const logger = require("../utils/logger");
const { AppError } = require("../utils/errors");
const { createErrorResponse, codeFromStatus } = require("../utils/response");
const monitoring = require("../utils/monitoring");

/**
 * Global Error Handler Middleware
 * مدیریت یکپارچه تمام خطاهای برنامه
 *
 * All responses follow the canonical Nakhsha error envelope:
 *   { success: false, error: { code, message, details? }, reqId }
 */
const errorHandler = (err, req, res, next) => {
  // ── Normalise error object ────────────────────────────────────────────────
  let statusCode = err.statusCode || 500;
  let message = err.message || "خطای داخلی سرور";
  let code = err.code && typeof err.code === "string" ? err.code : null;
  let details = err.details || err.errors || null;

  // ── Mongoose: bad ObjectId ───────────────────────────────────────────────
  if (err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_ID";
    message = "شناسه نامعتبر است";
  }

  // ── Mongoose: duplicate key ──────────────────────────────────────────────
  if (err.code === 11000) {
    const field =
      Object.keys(err.keyPattern || err.keyValue || {})[0] || "فیلد";
    statusCode = 409;
    code = "DUPLICATE_KEY";
    message = `${field} قبلاً استفاده شده است`;
    details = { field };
  }

  // ── Mongoose: validation error ───────────────────────────────────────────
  if (err.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "خطای اعتبارسنجی";
    details = Object.values(err.errors || {}).map((e) => e.message);
  }

  // ── JWT errors ───────────────────────────────────────────────────────────
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    code = "TOKEN_INVALID";
    message = "توکن نامعتبر است";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    code = "TOKEN_EXPIRED";
    message = "توکن منقضی شده است";
  }

  // ── CORS errors ──────────────────────────────────────────────────────────
  if (err.message && err.message.includes("CORS")) {
    statusCode = 403;
    code = "CORS_REJECTED";
  }

  // Resolve code from status when not yet set
  if (!code) {
    code = codeFromStatus(statusCode);
  }

  const reqId = req.id ?? null;

  // ── Log ──────────────────────────────────────────────────────────────────
  if (statusCode >= 500) {
    logger.error("Server error", {
      reqId,
      code,
      message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?.id,
    });
    // Report to Sentry with reqId, matched route, and userId as searchable tags.
    // captureError is a no-op when SENTRY_DSN is not configured.
    monitoring.captureError(err, req);
  } else {
    logger.warn("Client error", {
      reqId,
      code,
      statusCode,
      message,
      url: req.originalUrl,
      method: req.method,
    });
  }

  // ── Build canonical envelope ──────────────────────────────────────────────
  // In development, include stack in details for easier debugging
  let responseDetails = details;
  if (process.env.NODE_ENV === "development" && err.stack) {
    responseDetails = {
      ...(typeof details === "object" && !Array.isArray(details)
        ? details
        : { errors: details }),
      stack: err.stack,
    };
  }

  res
    .status(statusCode)
    .json(createErrorResponse(code, message, responseDetails, reqId));
};

/**
 * Async Error Wrapper
 * برای جلوگیری از try-catch در هر route handler
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.find();
 *   res.json(users);
 * }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 Not Found Handler
 * برای route هایی که وجود ندارند
 */
const notFoundHandler = (req, res, next) => {
  const reqId = req.id ?? null;
  res
    .status(404)
    .json(
      createErrorResponse(
        "NOT_FOUND",
        `مسیر ${req.originalUrl} یافت نشد`,
        null,
        reqId,
      ),
    );
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
};
