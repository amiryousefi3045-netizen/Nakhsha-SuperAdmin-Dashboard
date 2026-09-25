# مرحله ۲۱ — کانال اعلان ایمیل (رشتهٔ اعلان‌های مراحل ۱۸–۲۰)

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۱:** ۸۳۷/۸۳۷ بک‌اند، ۱۵۷/۱۵۷ فرانت

## هدف
ایمیل به‌عنوان کانال دومِ اعلان خریدار در زیرساخت مرحلهٔ ۱۸–۲۰: هر گذارِ وضعیتِ یک سفارش ویترینی که خریدارش هم شمارهٔ موبایل دارد هم ایمیل، دو رکورد اعلان (sms + email) می‌سازد که روی همان موتور اتمیک claim (attempts/backoff/retry) از صفِ مرحلهٔ ۱۹ تحویل می‌شوند. شکستِ یک کانال هرگز کانال دیگر را بلاک نمی‌کند؛ بدون آدرس ایمیل، سفارش مثل قبل فقط پیامک می‌گیرد. یادآوری پرداخت (مرحلهٔ ۲۰) عمداً فقط SMS می‌ماند.

## تغییرات بک‌اند
- **`services/email/emailSender.js`** (جدید) — هم‌شکلِ `melipayamakSms.sendSms` اما وابستگی‌افزوده (بدون SMTP dependency):
  - Mock در `EMAIL_MOCK === "true"` / `NODE_ENV === "test"` / dev بدون تنظیمات؛ درز تستی `EMAIL_MOCK_FAIL === "true"` برای شبیه‌سازی شکست (کتاب‌داری retry صف).
  - Transport زنده: POST JSON به `MAIL_API_URL` با `Bearer MAIL_API_KEY` (fetch داخلی Node، timeout از `EMAIL_TIMEOUT_MS` پیش‌فرض ۵s؛ from از `EMAIL_FROM` پیش‌فرض `noreply@nakhsha.local`). تنظیم نشده → خطای صریح «Email API not configured».
- **`services/NotificationService.js`**:
  - `hasEmailTarget(order)` — همان قاعدهٔ sms (origin storefront + خریدار واقعی) ولی با `customer.email` موجود.
  - `buildEmailSubject(order, status, reason)` — «نخشا | {پیام وضعیت} — سفارش {شماره}» (+پسوند دلیل).
  - حلقهٔ تحویل کانال-آگاه شد: گارد فقط «sms» → `n.channel ∈ {sms, email}`؛ claim شامل `channel: n.channel`؛ dispatch جدا (`sendEmail(to, subject, message)` در برابر `sendSms`). رکوردهای ناشناخته همچنان skipped.
  - صادرات جدید: `hasEmailTarget`, `buildEmailSubject`.
- **`services/OrderService.js`** — در `transitionOrder`، وقتی `hasEmailTarget(order)` برقرار است رکورد ایمیل (channel email، status، to=ایمیل، reason) کنار رکورد sms push می‌شود؛ همان save واحد، همان تحویل off-loop.
- **`services/NotificationQueueService.js`** — `findPendingOrders` از `channel: "sms"` به `channel: {$in: ["sms","email"]}`؛ sweep زمان‌بند حالا رکوردهای ایمیل را هم می‌سوزاند.

## تست‌ها
- **`__tests__/order-email-notifications.test.js`** (۸ تست):
  - helpers: `hasEmailTarget` (گارد‌های origin/خریدار/بدون آدرس) و قالب موضوع فارسی.
  - HTTP چرخهٔ واقعی checkout → گذار فروشنده: ساخت رکورد دوتایی sms+email و تحویل هر دو؛ سفارش بدون ایمیل همچنان تک‌کاناله؛ idempotency چندهنگامی (هر رکورد دقیقاً یک‌بار); رسید خریدار ایمیل را بدون افشای `to` نشان می‌دهد.
  - استقلال کانال‌ها: با `EMAIL_MOCK_FAIL`، پیامک delivers می‌شود و ایمیل برچسب `error` و retry می‌گیرد.
  - گذر از صفِ مرحلهٔ ۱۹: رکورد ایمیل گیرکرده‌ای که `runOnce` اسکن می‌کند به `delivered` می‌رسد.
- تست‌های مراحل ۱۸/۱۹/۲۰ (۲۱ تست) بدون تغییر سبز ماندند.
- گیت کامل بک‌اند: **845/845** (۴۸ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`pages/storefront/BuyerOrderPage.tsx`** — در «اعلام‌های ارسالی»، هر رکورد یک chip کانال می‌گیرد: «ایمیل» / «پیامک» (نمایش بصری دوکاناله بودن اعلان در رسید خریدار).
- گیت‌ها: `tsc --noEmit` clean، `lint` clean، **157/157** تست.

## کامیت
- `feat(storefront): email channel for order notifications (stage 21)`

## فایل‌ها
- بک‌اند: `backend/services/email/emailSender.js` (جدید), `backend/services/NotificationService.js`, `backend/services/OrderService.js`, `backend/services/NotificationQueueService.js`, `backend/__tests__/order-email-notifications.test.js` (جدید)
- فرانت: `frontend/src/pages/storefront/BuyerOrderPage.tsx`
- مستند: `docs/reports/NAKHSHA_STAGE21_EMAIL_NOTIFICATIONS.md`