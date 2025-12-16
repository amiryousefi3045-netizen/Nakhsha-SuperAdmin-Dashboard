const logger = require("../utils/logger");
const { AppError } = require("../utils/errors");

/**
 * Global Error Handler Middleware
 * مدیریت یکپارچه تمام خطاهای برنامه
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.status = err.status || "error";

  // Log error details
  if (error.statusCode >= 500) {
    logger.error("Server error", {
      message: error.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?.id,
    });
  } else {
    logger.warn("Client error", {
      message: error.message,
      statusCode: error.statusCode,
      url: req.originalUrl,
      method: req.method,
    });
  }

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    error.message = "شناسه نامعتبر است";
    error.statusCode = 400;
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field =
      Object.keys(err.keyPattern || err.keyValue || {})[0] || "فیلد";
    error.message = `${field} قبلاً استفاده شده است`;
    error.statusCode = 409;
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors || {}).map((e) => e.message);
    error.message = "خطای اعتبارسنجی";
    error.statusCode = 400;
    error.errors = errors;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    error.message = "توکن نامعتبر است";
    error.statusCode = 401;
  }

  if (err.name === "TokenExpiredError") {
    error.message = "توکن منقضی شده است";
    error.statusCode = 401;
  }

  // Build response
  const response = {
    status: error.status,
    message: error.message,
  };

  // در محیط development جزئیات بیشتری برگردان
  if (process.env.NODE_ENV === "development") {
    response.stack = err.stack;
    response.error = err;
  }

  // اگر خطای validation داریم، errors را اضافه کن
  if (error.errors) {
    response.errors = error.errors;
  }

  res.status(error.statusCode).json(response);
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
  const error = new AppError(`مسیر ${req.originalUrl} یافت نشد`, 404);
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
};
