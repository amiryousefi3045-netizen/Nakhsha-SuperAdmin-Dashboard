# مرحله ۲۰ — یادآوری پرداخت سفارش‌های در انتظار (SMS)

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۰:** ۸۲۵/۸۲۵ بک‌اند، ۱۵۵/۱۵۵ فرانت

## هدف
کاهش ترک‌شدگیِ تسویه: سفارش‌های ویترینی که بعد از پایان مهلتِ «گریس» همچنان در وضعیت `pending` (انتظار پرداخت) مانده‌اند، یک پیامک یادآوری واحد دریافت می‌کنند. ارسال، idempotent و اتمیک است، از زیرساخت صف مرحلهٔ ۱۹ (retry/backoff/attempts) استفاده می‌کند و به محض خروج سفارش از `pending` باطل می‌شود تا خریداری که پرداخت کرده پیام «پرداخت کنید» نگیرد.

## تغییرات بک‌اند
- **`models/Order.js`** — فیلد `paymentReminderAt: {type: Date, default: null}` (علامتِ ارسالِ یک‌بارهٔ یادآوری؛ ضامن idempotency).
- **`services/NotificationService.js`**:
  - ثابت `REMINDER_REASON = "payment_reminder"`.
  - `buildPaymentReminderMessage(order)` — متن فارسی با شمارهٔ سفارش («سفارش شما در انتظار پرداخت است…»).
  - `buildNotificationMessage(order, status, reason)` — سازندهٔ عمومی: قالب‌های وضعیت (transition) اول، یادآوری دوم، بقیه «بی‌صدا».
  - گارد دفاعی در حلقهٔ تحویل: رکوردِ `status: "pending"` روی سفارشی که دیگر pending نیست هرگز claim نمی‌شود.
- **`services/PaymentReminderService.js`** (جدید) — زمان‌بند singleton هم‌سبک `NotificationQueueService`:
  - `findReminderDue({now, limit})` — فیلتر `{origin:"storefront", status:"pending", buyerUserId نه null، paymentReminderAt: null، createdAt ≤ now − age، phone موجود}`.
  - `enqueueReminder(row)` — اتمیک: `updateOne` با گارد `{status:"pending", paymentReminderAt:null}` + `$set paymentReminderAt` + `$push` رکورد اعلان (channel sms، status pending، reason payment_reminder، delivered false)؛ `matchedCount 0` = قبلاً یادآوری/منقضی → رد می‌شود.
  - `runOnce()/triggerRun()/start()/stop()/getStats()` — گزارش `{scanned, reminded, skipped, durationMs}`.
  - env: `PAYMENT_REMINDER_ENABLED` (فقط "false" غیرفعال)، `PAYMENT_REMINDER_INTERVAL_MS` (پیش‌فرض ۶۰s)، `PAYMENT_REMINDER_AGE_MS` (پیش‌فرض ۲۴h)، `PAYMENT_REMINDER_RUN_LIMIT` (پیش‌فرض ۵۰).
- **`services/OrderService.js`** — در `transitionOrder`، به محض خروج از `pending` (→ confirmed/cancelled) رکوردهای یادآوریِ ارسال‌نشده از `notifications` حذف می‌شوند؛ صف دیگر هرگز آن‌ها را نمی‌سوزاند.
- **`server.js`** — شروع زمان‌بند پس از `otpCleanupService` و پیش از صف (همان گاردهای test/ENABLED) + توقف در `SIGTERM`/`SIGINT`. تحویلِ خودِ پیامک همچنان از طریق `NotificationQueueService` (مرحلهٔ ۱۹) انجام می‌شود — فقط «صفِ یادآوری‌ها» اینجا ساخته می‌شود.

## تست‌ها
- **`__tests__/payment-reminder.test.js`** (۱۲ تست) — isolated به ازای هر تست (`beforeEach` پاک‌سازی Order چون `runOnce` کل مجموعهٔ pending را می‌سوزاند):
  - پیام: شمارهٔ سفارش + واژهٔ «در انتظار پرداخت»؛ قالب وضعیت/یادآوری/خاموش.
  - زمان‌بند: enqueue یک یادآوری برای سفارش قدیمی؛ idempotency دو اجرا؛ ایمنیِ داخلِ گریس (swap سن)؛ ردِ سفارش غیر-pending؛ ردِ سفارش ثبت دستی (seller)؛ ردِ سفارش بدون خریدار؛ stats.
  - تحویل: یادآوری از مسیر صف مرحلهٔ ۱۹ به `delivered` می‌رسد.
  - چرخهٔ گذار: خروج از pending → حذف یادآوری و ارسال نکردن آن؛ گارد «رکورد کهنه» حتی اگر به‌صورت دستی باقی بماند (تغییر مستقیم status بدون سرویس) claim نمی‌شود.
- تست‌های مراحل ۱۸/۱۹ (۲۱ تست) بدون تغییر سبز ماندند.
- گیت کامل بک‌اند: **837/837** (۴۷ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`pages/storefront/BuyerOrderPage.tsx`** — در «اعلام‌های ارسالی»، رکورد با `reason === "payment_reminder"` به‌جای برچسب وضعیت، برچسب «یادآوری پرداخت» می‌گیرد (رسید خریدار).
- **`pages/admin/NotificationQueueAdmin.tsx`** — ستون «دلیل»: تگ «یادآوری پرداخت» برای رکوردهای یادآوری، در غیر این صورت متن دلیل (truncate) یا «—» (دید عملیاتی صف).
- گیت‌ها: `tsc --noEmit` clean، `lint` clean، **157/157** تست (بدون تغییر).

## کامیت
- `feat(storefront): payment reminder SMS for abandoned pending orders (stage 20)`

## فایل‌ها
- بک‌اند: `backend/models/Order.js`, `backend/services/NotificationService.js`, `backend/services/PaymentReminderService.js` (جدید), `backend/services/OrderService.js`, `backend/server.js`, `backend/__tests__/payment-reminder.test.js` (جدید)
- فرانت: `frontend/src/pages/storefront/BuyerOrderPage.tsx`, `frontend/src/pages/admin/NotificationQueueAdmin.tsx`
- مستند: `docs/reports/NAKHSHA_STAGE20_PAYMENT_REMINDER.md`