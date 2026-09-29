const { cleanEnv, str, port, url, num, bool } = require("envalid");

/**
 * Environment Variables Validation
 * اعتبارسنجی و تایپ چک متغیرهای محیطی
 */
const validateEnv = () => {
  const env = cleanEnv(process.env, {
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

    // Super Admin bootstrap: the ONLY legal assignment path for the
    // super_admin role is an OTP login whose normalized phone matches this
    // value. Leave empty to disable auto-promotion entirely.
    SUPER_ADMIN_PHONE: str({
      default: "",
      desc: "شماره تلفن سوپر ادمین برای تخصیص خودکار نقش در ورود OTP",
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
    // In production this MUST be explicitly set to the real frontend domain(s).
    // No default is provided so a missing value causes a fast startup failure
    // rather than silently allowing all origins via the development fallback.
    ALLOWED_ORIGINS: str({
      devDefault: "http://localhost:5173,http://localhost:4173",
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

    // ── Observability (stage 34) ─────────────────────────────────────────
  // METRICS_ENABLED gates the /metrics route entirely. It is opt-in so that
  // the operational surface of a deployment is always an explicit decision.
  METRICS_ENABLED: bool({
    default: false,
    desc: "فعال‌سازی مسیر /metrics (پیش‌فرض غیرفعال)",
  }),

  // When metrics are enabled, a scraper token is mandatory. Exposing an
  // operational endpoint without authentication is a reconnaissance leak,
  // so the app refuses to boot rather than serving it unauthenticated.
  METRICS_TOKEN: str({
    default: "",
    desc: "توکن Bearer برای اسکرپ /metrics (در صورت فعال بودن الزامی)",
  }),

  // Optional Sentry DSN. Absent => error monitoring is a no-op by design.
  SENTRY_DSN: str({
    default: "",
    desc: "DSN سرویس Sentry برای پایش خطا (خالی = غیرفعال)",
  }),

  SENTRY_TRACES_SAMPLE_RATE: num({
    default: 0.1,
    desc: "نمونه‌برداری تریس Sentry (۰ تا ۱)",
  }),

  // ── MongoDB automated backup (stage 34) ────────────────────────────────
  BACKUP_DIR: str({
    default: "./backups",
    desc: "مسیر ذخیرهٔ آرشیو پشتیبان MongoDB",
  }),

  BACKUP_RETENTION_DAYS: num({
    default: 7,
    desc: "تعداد روز نگهداری آرشیو پشتیبان پیش از حذف چرخشی",
  }),

  // Minimum acceptable free disk, in megabytes, before a backup is attempted.
  // A backup that fills the disk is an outage, not a safeguard.
  BACKUP_MIN_FREE_MB: num({
    default: 512,
    desc: "حداقل فضای آزاد دیسک (مگابایت) برای اجازهٔ اجرای پشتیبان‌گیری",
  }),

  // ── External uptime probe (stage 34) ───────────────────────────────────
  UPTIME_URL: str({
    default: "",
    desc: "آدرس کامل endpoint آمادگی برای مانیتور بیرونی",
  }),

  UPTIME_TIMEOUT_MS: num({
    default: 5000,
    desc: "مهلت پاسخ مانیتور آپ‌تایم به میلی‌ثانیه",
  }),
  });

  // ── Cross-field validation ─────────────────────────────────────────────
  // A metrics endpoint without a token would be an unauthenticated
  // reconnaissance surface. Fail fast at boot instead of shipping it.
  if (env.METRICS_ENABLED && !env.METRICS_TOKEN) {
    throw new Error(
      "METRICS_ENABLED=true requires METRICS_TOKEN to be set. Refusing to expose an unauthenticated /metrics endpoint.",
    );
  }

  if (env.SENTRY_DSN) {
    const rate = env.SENTRY_TRACES_SAMPLE_RATE;
    if (rate < 0 || rate > 1) {
      throw new Error("SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1.");
    }
  }

  return env;
};

module.exports = validateEnv;
