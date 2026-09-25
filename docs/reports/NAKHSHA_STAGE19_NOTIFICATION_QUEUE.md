# مرحله ۱۹ — صف ارسال اعلان + زمان‌بند (retry با backoff) + پنل عملیاتی ادمین

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۱۹:** ۸۱۴/۸۱۴ بک‌اند، ۱۵۵/۱۵۵ فرانت

## هدف
تحویل قطعی اعلان‌های SMS سفارش‌های ویترینی: رکوردهای ناموفق به‌جای رها شدن، داخل صف با سقف تلاش (`attempts`) و فاصلهٔ زمانی (`backoff`) دوباره‌سنجی می‌شوند؛ یک زمان‌بند درون‌فرایندی صف را می‌سوزاند و ادمین از صفحهٔ عملیاتی، وضعیت و اجرای فوری صف را می‌بیند.

## تغییرات بک‌اند
- **`models/Order.js`** — به `OrderNotificationSchema` فیلدهای صف اضافه شد: `attempts` (پیش‌فرض ۰، min ۰)، `lastAttemptAt` (nullable)، `nextAttemptAt` (nullable، زودترین لحظه‌ی retry مجاز).
- **`services/NotificationService.js`** (بازآفرینی هسته):
  - `maxAttemptsOf()`/`backoffMsOf()` — از env با پیش‌فرض (۳ / ۶۰۰۰۰).
  - `notificationRecordState(record, {now, maxAttempts})` — محاسبهٔ وضعیت خالص `delivered | pending | waiting | failed`.
  - `deliverOrderNotifications(orderId, {now, maxAttempts, backoffMs})` — «ادعا»ی اتمیک با `Order.updateOne` روی `$elemMatch {_id, channel:"sms", delivered:false, attempts:{$lt:maxAttempts}, $or:[{nextAttemptAt:null},{nextAttemptAt:{$lte:now}}]}` + `$inc attempts` + `$set lastAttemptAt/nextAttemptAt:null`؛ سپس `sendSms`، و در پایان mark تحویل‌شده یا `error` + `nextAttemptAt = now + (attempts)*backoffMs`. شرط timing داخل همان ادعاست، پس semantics زمان‌بند و فراخوانی دستی یکسان است. هرگز reject نمی‌کند؛ خروجی `{attempted, delivered, failed, skipped}`. تابع قدیمی `flushPendingNotifications()` حذف شد.
- **`services/NotificationQueueService.js`** (جدید) — زمان‌بند singleton هم‌سبک `otpCleanup`: `findPendingOrders({now, limit})` با همان `$elemMatch`؛ `runOnce({limit, now})` با گزارش `{scanned, attempted, delivered, failed, skipped, durationMs}` + `getStats()`؛ `start()`/`stop()`/`triggerRun()`.
  - env: `NOTIFICATION_QUEUE_ENABLED` (فقط "false" غیرفعال می‌کند)، `NOTIFICATION_QUEUE_INTERVAL_MS` (پیش‌فرض ۶۰۰۰۰)، `NOTIFICATION_QUEUE_RUN_LIMIT` (پیش‌فرض ۵۰).
- **`server.js`** — وقتی `NODE_ENV !== "test"` و `NOTIFICATION_QUEUE_ENABLED !== "false"` پس از `otpCleanupService.start()` شروع می‌شود؛ در `SIGTERM`/`SIGINT` با `stop()` متوقف می‌شود.
- **`models/AuditLog.js`** — اکشن `NOTIFICATION_QUEUE_RETRIED` به enum «عملیات صف اعلان (ادمین)».
- **`controllers/AdminController.js` + `routes/admin.js`** — فقط `super_admin`:
  - `GET /admin/notification-queue` — `{summary, items, total, page, limit}`؛ summary شمارش وضعیت‌ها به‌صورت aggregate؛ فیلتر `state` از enum `pending|waiting|failed|delivered`.
  - `POST /admin/notification-queue/retry` — `triggerRun()` + ثبت `NOTIFICATION_QUEUE_RETRIED` در اَودیت (بدون resource).

## تست‌ها
- **`__tests__/notification-queue.test.js`** (۱۱ تست): bookkeeping هسته — اولین تلاش تحویل و عدم ارسال مجددِ تحویل‌شده؛ احترام به پنجرهٔ backoff (waiting)؛ retry بعد از سپری شدن backoff؛ رها شدن پس از اتمام بودجهٔ تلاش (state=failed) — با `maxAttempts` صریح چون env پیش‌فرض در assert بعد از restore است؛ زمان‌بند — فقط رکوردهای eligible می‌سوزد (delivered/waiting رد می‌شوند) و stats را گزارش می‌دهد؛ API — رد ناشناس/نقش غیر super_admin؛ summary + ledger برای ادمین؛ فیلتر state؛ retry درجا + اَودیت.
- تست‌های مرحلهٔ ۱۸ (`order-notifications.test.js`، ۱۰ تست) با هستهٔ بازآفرینی‌شده بدون تغییر سبز ماندند (فقط `attempts==1` بعد از sleep کوتاه به‌جای assert روی race).
- گیت کامل بک‌اند: **825/825** (۴۶ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`types/admin.ts`** — `NotificationQueueState`، `NotificationQueueSummary`، `NotificationQueueRecord`، `ListNotificationQueueParams`، `NotificationQueueRunSummary`.
- **`services/adminService.ts`** — `getAdminNotificationQueue({page, limit, state})` و `retryAdminNotificationQueue()` (با meta صفحه‌بندی).
- **`pages/admin/NotificationQueueAdmin.tsx`** (جدید، مسیر `admin/notification-queue`) — چهار کارت خلاصه (تحویل/انتظار/صف بعدی/ناموفق)، فیلترهای state، جدول (شمارهٔ سفارش، وضعیت، کانال، متن پیام، تلاش‌ها، گیرنده، خطا، زمان)، دکمه‌های «تازه‌سازی» و «اجرای فوری صف» (با ConfirmDialog و نمایش نتیجهٔ اجرا).
- **`components/admin/AdminLayout.tsx`** — آیتم سایدبار «صف اعلان‌ها» (آیکون BellRing) قبل از «تنظیمات».
- **`App.tsx`** — مسیر lazy `notification-queue` در شاخهٔ ادمین.
- گیت‌ها: `tsc --noEmit` clean، `lint` clean، **157/157** تست (+۲).

## کامیت
- `feat(admin): notification retry queue + scheduler + ops page (stage 19)`

## فایل‌ها
- بک‌اند: `backend/models/Order.js`, `backend/services/NotificationService.js`, `backend/services/NotificationQueueService.js` (جدید), `backend/server.js`, `backend/models/AuditLog.js`, `backend/controllers/AdminController.js`, `backend/routes/admin.js`, `backend/__tests__/notification-queue.test.js` (جدید)
- فرانت: `frontend/src/types/admin.ts`, `frontend/src/services/adminService.ts`, `frontend/src/pages/admin/NotificationQueueAdmin.tsx` (جدید), `frontend/src/components/admin/AdminLayout.tsx`, `frontend/src/App.tsx`, `frontend/src/services/__tests__/adminService.test.ts`
- مستند: `docs/reports/NAKHSHA_STAGE19_NOTIFICATION_QUEUE.md`