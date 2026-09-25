# مرحله ۱۸ — اعلان تغییر وضعیت سفارش به خریدار

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۱۶/۱۷:** ۷۹۳/۷۹۳ بک‌اند، ۱۵۵/۱۵۵ فرانت

## هدف
اطلاع‌رسانی SMS به خریدار در هر تغییر وضعیت سفارش ویترینی (تأیید، آماده‌سازی، ارسال، تحویل، لغو، مرجوع) با قابلیت مشاهدهٔ وضعیت تحویل در رسید سفارش.

## تغییرات بک‌اند
- **`models/Order.js`** — اسکیمای `OrderNotificationSchema` (زیرآرایهٔ `notifications` با `_id` زیرسند برای به‌روزرسانی اتمیک): `{channel, status, to, message, reason, delivered(default false), error, at}`. `delivered:false` = در انتظار/ناموفق؛ Dispatcher همین مجموعه را drain می‌کند.
- **`services/NotificationService.js`** (جدید) — هستهٔ سرویس:
  - `buildOrderStatusMessage(order, status, reason)` — قالب فارسی «نخشا | …» + شمارهٔ سفارش + دلیل (لغو/مرجوع)؛ وضعیت `pending` هیچ‌وقت اعلام نمی‌شود.
  - `hasNotificationTarget(order)` — گارد: فقط `origin==="storefront"` با `buyerUserId` و `customer.phone`.
  - `deliverOrderNotifications(orderId)` — drain idempotent رکوردهای sms؛ به‌روزرسانی اتمیک `$set` روی `notifications.$` با فیلتر `_id` زیرسند (بدون race کلیِ ذخیرهٔ کل سند)؛ هرگز reject نمی‌کند (شکست در `error` ثبت می‌شود).
  - `flushPendingNotifications()` — درزِ retry برای زمان‌بند آینده.
- **`services/OrderService.js`** — در `transitionOrder` رکورد pending به‌صورت اتمیک با تغییر وضعیت push می‌شود و بعد از `save` با `void deliverOrderNotifications` dispatch آتش‌وفراموش می‌شود (پاسخ `changeOrderStatus` را مسدود نمی‌کند و throw نمی‌کند). `orderToDTO` فیلد `notifications` را بدون شمارهٔ تلفن مقصد نگاشت می‌کند.
- **`services/sms/melipayamakSms.js`** — بازآفرینی به sender عمومی: `sendSms(phone, message, meta)` + `sendOtpSms` به‌صورت wrapper نازک با همان قالب؛ شرط mock شامل `NODE_ENV==="test"`؛ سیم تستی `SMS_MOCK_FAIL` برای شبیه‌سازی شکست تحویل به‌صورت hermetic.
- **پوشش خودکار:** گذار ابطالِ پرداخت (callback FAIL) نیز از `transitionOrder` می‌گذرد و بدون کد اضافه اعلان می‌گیرد. سفارش‌های ثبت دستی فروشنده (origin seller) هرگز اعلان نمی‌شوند.

## تست‌ها
- **`__tests__/order-notifications.test.js`** (۱۰ تست): واحدهای سازندهٔ پیام/گارد؛ سفارش تازه بدون اعلان؛ ثبت و تحویل در تأیید/لغو با دلیل؛ idempotency دو بار اجرا؛ حضور در رسید خریدار بدون شمارهٔ تلفن؛ عدم اعلان سفارش دستی؛ شکست تحویل → `delivered:false` + ثبت `error` بدون throw.
- گیت کامل بک‌اند: **814/814** (۴۵ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`types/storefront.ts`** — اینترفیس `OrderNotification` + فیلد اختیاری `notifications` روی `BuyerOrder`.
- **`pages/storefront/BuyerOrderPage.tsx`** — بلاک «اعلام‌های ارسالی» در رسید سفارش: برچسب وضعیت، متن پیام، وضعیت تحویل (ارسال شد / ناموفق / در انتظار)، تاریخ.
- گیت‌ها: `tsc --noEmit` clean، `lint` clean، **155/155** تست.

## کامیت
- `feat(buyer): order-status SMS notifications for storefront orders (stage 18)`

## فایل‌ها
- `backend/models/Order.js`, `backend/services/OrderService.js`, `backend/services/sms/melipayamakSms.js`, `backend/services/NotificationService.js` (جدید), `backend/__tests__/order-notifications.test.js` (جدید), `frontend/src/types/storefront.ts`, `frontend/src/pages/storefront/BuyerOrderPage.tsx`, `docs/reports/NAKHSHA_STAGE18_ORDER_NOTIFICATIONS.md`