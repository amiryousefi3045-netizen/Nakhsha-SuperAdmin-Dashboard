const { cleanEnv, str, port, url, num, bool } = require("envalid");

/**
 * Environment Variables Validation
 * اعتبارسنجی و تایپ چک متغیرهای محیطی
 */
const validateEnv = () => {
  return cleanEnv(process.env, {
    // Server
    NODE_ENV: str({
      choices: ["development", "production", "test"],
      default: "development",
      desc: "محیط اجرا",
    }),
    PORT: port({
      default: 5000,
      desc: "پورت سرور",
    }),

    // Database
    MONGODB_URI: url({
      default: "mongodb://127.0.0.1:27017/nakhsha",
      desc: "آدرس MongoDB",
    }),

    // Authentication
    JWT_SECRET: str({
      desc: "کلید مخفی JWT - باید در production تنظیم شود",
    }),
    JWT_TTL: str({
      default: "7d",
      desc: "مدت اعتبار توکن",
    }),

    // OTP Configuration
    OTP_TTL_SECONDS: num({
      default: 120,
      desc: "مدت اعتبار کد OTP به ثانیه",
    }),
    OTP_RESEND_SECONDS: num({
      default: 60,
      desc: "مدت زمان بین ارسال مجدد OTP",
    }),
    OTP_MAX_ATTEMPTS: num({
      default: 5,
      desc: "تعداد تلاش مجاز برای OTP",
    }),

    // CORS
    ALLOWED_ORIGINS: str({
      default: "http://localhost:5173,http://localhost:4173",
      desc: "لیست originهای مجاز برای CORS (با کاما جدا شوند)",
    }),

    // Logging
    LOG_LEVEL: str({
      choices: ["error", "warn", "info", "http", "debug"],
      default: "info",
      desc: "سطح لاگ",
    }),

    // Database index management
    SYNC_INDEXES: bool({
      default: false,
      desc: "اگر true باشد، هنگام راه‌اندازی syncIndexes() اجرا می‌شود. فقط در اولین deploy یا بعد از تغییر schema فعال کنید.",
    }),

    // Optional: File Upload
    MAX_FILE_SIZE: num({
      default: 5242880, // 5MB
      desc: "حداکثر سایز فایل به بایت",
    }),
  });
};

module.exports = validateEnv;
