/**
 * Custom Application Error Class
 * برای مدیریت خطاهای برنامه با کدهای status مشخص
 */
class AppError extends Error {
  /**
   * @param {string} message - پیام خطا
   * @param {number} statusCode - HTTP status code
   * @param {boolean} isOperational - آیا خطای عملیاتی است یا برنامه‌نویسی
   */
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = isOperational;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error Types - برای استفاده راحت‌تر
 */
class BadRequestError extends AppError {
  constructor(message = "درخواست نامعتبر است") {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "عدم احراز هویت") {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "دسترسی غیرمجاز") {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = "یافت نشد") {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = "تداخل در داده‌ها") {
    super(message, 409);
  }
}

class ValidationError extends AppError {
  constructor(message = "خطای اعتبارسنجی", errors = {}) {
    super(message, 400);
    this.errors = errors;
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = "سرویس در دسترس نیست") {
    super(message, 503);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ServiceUnavailableError,
};
