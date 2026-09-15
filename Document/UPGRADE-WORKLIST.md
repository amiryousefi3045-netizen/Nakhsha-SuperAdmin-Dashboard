# فهرست نیازمندی‌ها و کارنامه توسعه — داشبورد سوپرادمین نخشا

**تاریخ:** 2026-09-15 | **مبنای تهیه:** ممیزی زنده از وضعیت فعلی کد + گزارش مقایسه (این فهرست بر اساس **وضعیت واقعی و راستی‌آزمایی‌شده‌ی امروز** بازنویسی شده است؛ برخلاف گزارش اولیه، بسیاری از گپ‌های پرادعا قبلاً پیاده‌سازی شده‌اند.)
**ترتیب:** اولویت = شدت اثر × احتمال؛ هر مرحله پس از تست کامل (backend: jest | frontend: typecheck/lint/test) تأیید و سپس commit + push می‌شود.

---

## ۰) مرور وضعیت راستی‌آزمایی‌شده (آیا وجود دارد؟)

| قابلیت | وضعیت | شواهد |
|---|---|---|
| Sentry + پاک‌سازی اسرار + captureError | ✅ موجود | `backend/utils/monitoring.js`، `middleware/errorHandler.js:85` |
| RBAC (۵ نقش + permission) | ✅ موجود | `models/User.js`، `middleware/auth.js:141-193` |
| پشتیبان و بازیابی MongoDB | ✅ موجود | `scripts/backup-mongodb.*`، `restore-mongodb.*`، `Document/BACKUP_RECOVERY_SETUP.md` |
| BI / آمار / نمودار ادمین | ✅ موجود | `services/adminStats.js`، `pages/admin/DashboardAdmin.tsx` |
| چرخش و ابطال refresh token | ✅ موجود | `services/TokenService.js:157`، `routes/auth.js` |
| لاگ ممیزی کامل + خروجی CSV | ✅ موجود | `models/AuditLog.js`، `services/AuditService.js` |
| بلادرنگ (SSE) ادمین | ✅ موجود | `routes/admin.js:70`، `LiveActivityPanel.tsx` |
| اکشن‌های گروهی کاربران/لینتینگ | ✅ موجود | `pages/admin/UsersAdmin.tsx`، `ListingsAdmin.tsx` |
| ریت‌لیمیت اندپوینت‌های سنگین | ✅ موجود | `middleware/rateLimiter.js` (heavyLimiter) |

---

## ۱) شکاف‌های واقعی باقی‌مانده و کارهای لازم (به ترتیب اولویت)

### سطح P0 — عملیات و امنیت

| # | نیازمندی | جزئیات کار | فایل‌های اثر‌پذیر | تست موردنیاز |
|---|---|---|---|---|
| **N-01** | Health endpoint همه‌جانبه | افزودن به `/api/health`: وضعیت سرویس SMS (mock/واقعی/آفلاین)، uptime، memory (rss)، محیط اجرا، نسخه | `routes/health.js` | unit: payload صحیح با/بدون SMS mock |
| **N-02** | API وضعیت SMS برای ادمین | اندپوینت `GET /api/admin/sms-status` با نقش super_admin: provider، mock، اعتبار (در صورت در دسترس)، آخرین خطا؛ استفاده از `testConfiguration`/credit | `services/sms/melipayamakSms.js`، `routes/admin.js`، `controllers/AdminController.js` | integration: فقط super_admin؛ پاسخ ساختاردار |
| **N-03** | Log rotation | فعال‌سازی چرخش لاگ‌ها با removeی winston (maxsize + maxFiles + zippedArchive) برای all/error/exceptions/rejections؛ بدون وابستگی جدید | `utils/logger.js` | unit: پیکربندی transports شامل rotation |
| **N-04** | اجرای بدون-داغی 2FA/TOTP | سرویس TOTP مبتنی بر Node crypto (RFC 6238): تولید secret (base32)، تولید کد، تأیید با پنجره‌ی زمانی؛ اندپوینت‌های `enable/verify/disable/status` فقط super_admin | فایل جدید `services/TotpService.js`، `routes/admin.js`، `controllers/AdminController.js`، مدل User | unit: صحت کد TOTP؛ قدیمی/تازه؛ integration: فعال/تأیید/غیرفعال‌سازی |
| **N-05** | الزام TOTP در ورود | هنگام تأیید OTPِ کاربرِ با 2FA فعال → پاسخ `requiresTotp`؛ تأیید TOTP در کنار کد OTP قبل از صدور توکن | `routes/auth.js`، `services/auth`، فرم AuthPanel فرانت | integration: مسیر ورود با/بدون TOTP |

### سطح P1 — گیت‌های کیفیت و UX

| # | نیازمندی | جزئیات کار | فایل‌های اثر‌پذیر | تست موردنیاز |
|---|---|---|---|---|
| **N-06** | Coverage threshold | اندازه‌گیری واقعی فعلی؛ افزودن `coverageThreshold` به jest.config (شروع از اعداد واقعی، افزایش تدریجی)؛ اجرای `test:coverage` در CI | `jest.config.js`، `.github/workflows/ci.yml` | اجرای پوشش و صحت گیت |
| **N-07** | Audit امنیتی وابستگی‌ها در CI | افزودن `npm audit --audit-level=high` به `ci.yml` و `fe-ci.yml`؛ در صورت advisory موجود → allowlist مستند | workflowها | اجرای دستی npm audit |
| **N-08** | ErrorBoundary سراسری | کامپوننت کلاس‌محور + استفاده در router؛ نمایش خطای خوانا با دکمه re-try/report | `frontend/src/components/ErrorBoundary.tsx`، `main.tsx`/router | typecheck + lint + تست کوتاه |
| **N-09** | Toast یکپارچه | سیستم toast سبک بدون وابستگی (زمان‌دار، انواع success/error/info، انیمیشن)؛ اتصال به اکشن‌های کلیدی فرم/حذف | `frontend/src/components/ui/Toast.tsx`، `ToastProvider.tsx` + صفحات | typecheck + lint |
| **N-10** | نمایش وضعیت SMS در تنظیمات | کارت وضعیت (provider، mock، اعتبار، وضعیت) در `SettingsAdmin` | `SettingsAdmin.tsx`، `adminService.ts` | typecheck + lint |

### سطح P2 — معماری و استقرار

| # | نیازمندی | جزئیات کار | فایل‌های اثر‌پذیر | تست موردنیاز |
|---|---|---|---|---|
| **N-11** | Cache جستجوی geo | پیاده‌سازی کش TTL سبک (بدون وابستگی) برای پاسخ‌های geo؛ اتصال `invalidateRegionCache` به مسیرهای write | `modules/listings/listing.geo.js`، مدل کش جدید | unit: TTL، invalidation و یکپارچگی داده |
| **N-12** | env.example جامع | مستندسازی تمام متغیرهای محیطی (SMS، Sentry، TOTP، DB) با توضیح | `backend/.env.example` | — |
| **N-13** | Deploy تولید Blueprint | پیش‌نویس `render.yaml` production (runnable) + مستندسازی نقش متغیرها | `render.yaml`/مستندات | — |

---

## ۲) قراردادهای اجرا

- **بدون وابستگی جدید** (npm در دسترس نیست): TOTP سمت Node crypto؛ چرخش لاگ با winston بومی؛ toast سفارشی.
- برای **هر مرحله**: اجرای `npm run lint` + `npm test` (بک‌اند) و `npm run typecheck` + `npm run lint` + `npm test` (فرانت، در صورت اثر) تا عبور کامل.
- پس از تأیید هر مرحله: `git commit` معنادار + `git push origin feature/seller-dashboard`.
- پایان هر مرحله: **گزارش خلاصه فارسی RTL** ذخیره می‌شود.