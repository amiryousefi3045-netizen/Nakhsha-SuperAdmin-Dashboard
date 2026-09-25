# مرحله ۲۲ — کانال اعلان تلگرام (رشتهٔ اعلان‌های مراحل ۱۸–۲۱)

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۲:** ۸۴۵/۸۴۵ بک‌اند، ۱۵۷/۱۵۷ فرانت

## هدف
تلگرام به‌عنوان سومین کانال اعلان خریدار: خریدار یک‌بار chat id تلگرام خود را روی حسابش لینک می‌کند (`PATCH /api/users/me/telegram`)، checkout به‌صورت سمت‌سرور روی سفارش می‌نشاند (هرگز از فرم عمومی پذیرفته نمی‌شود) و هر گذارِ وضعیت دوباره رکورد «telegram» می‌سازد که روی همان موتور اتمیک claim مراحل ۱۹–۲۱ تحویل می‌شود. بدون لینک، رکورد تلگرامی ساخته نمی‌شود؛ شکستِ هر کانال مستقل است.

## تغییرات بک‌اند
- **`models/User.js`** — فیلد اختیاری `telegramChatId` (default `""`) برای لینک chat id خریدار.
- **`models/Order.js`** — enum کانال اعلان: `["sms","email","telegram"]`؛ زیرسند `customer` فیلد `telegram` (default `""`) — فقط سمت‌سرور پر می‌شود.
- **`services/telegram/telegramSender.js`** (جدید) — `sendTelegram(chatId, message, meta)` هم‌شکلِ sender های قبلی:
  - Mock در `TELEGRAM_MOCK==="true"` / `NODE_ENV==="test"` / dev بدون توکن؛ درز تستی `TELEGRAM_MOCK_FAIL`؛ اعتبارسنجی عددی بودن chat id.
  - Transport زنده: POST به `https://api.telegram.org/bot<TOKEN>/sendMessage` (`TELEGRAM_BOT_TOKEN`، `TELEGRAM_TIMEOUT_MS` پیش‌فرض ۵s، بررسی `body.ok`)؛ بدون توکن در تولید → خطای صریح «Telegram bot not configured».
- **`services/NotificationService.js`** — `hasTelegramTarget(order)` (همان قاعدهٔ sms/email ولی با `customer.telegram`)؛ حلقهٔ تحویل و dispatch کانال‌سوم (`sendTelegram`)؛ لاگ خطای عمومی «Order notification failed»؛ صادرات `hasTelegramTarget`.
- **`services/OrderService.js`** — در `transitionOrder` رکورد telegram کنار sms/email؛ **رفع باگ**: whitelist ساخت `customer` در `createOrder` حالا `telegram` را هم نگه می‌دارد (قبلاً مرجِ checkout را می‌انداخت).
- **`services/StorefrontOrderService.js`** — `createBuyerOrder` قبل از ساخت سفارش `User.telegramChatId` خریدار را می‌خواند و در `customer.telegram` مرج می‌کند.
- **`services/NotificationQueueService.js`** — sweep صف: `channel: {$in: ["sms","email","telegram"]}`.
- **`routes/users.js`** — `PATCH /api/users/me/telegram` (authed): ست/پاک کردن chat id (عدد ۱–۲۰ رقم)؛ پاسخ `{ user, telegramChatId, linked }`.
- یادآوری پرداخت (مرحلهٔ ۲۰) عمداً فقط SMS می‌ماند.

## تست‌ها
- **`__tests__/order-telegram-notifications.test.js`** (۱۲ تست):
  - درزهای sender: mock در تست؛ شبیه‌سازی شکست `TELEGRAM_MOCK_FAIL`؛ رد chat id غیرعددی.
  - helpers: گاردهای `hasTelegramTarget` (origin/خریدار/بدون chat id).
  - `PATCH /api/users/me/telegram`: لینک، پاک‌سازی، رد ورودی غیرعددی.
  - چرخهٔ HTTP کامل: لینک → checkout → گذار → ساخت رکورد سه‌گانه و تحویل؛ خریدار غیرلینک → فقط sms/email؛ استقلال کانال‌ها با `TELEGRAM_MOCK_FAIL`؛ رسید خریدار کانال telegram را بدون افشای chat id نشان می‌دهد.
  - صف مرحلهٔ ۱۹: رکورد telegram غرق‌نشده را sweep و delivers می‌کند.
- تست‌های مراحل ۱۸–۲۱ (۲۹ تست) بدون تغییر سبز ماندند.
- گیت کامل بک‌اند: **857/857** (۴۹ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`types/storefront.ts`** و **`types/admin.ts`** — `channel: "sms" | "email" | "telegram"`.
- **`pages/storefront/BuyerOrderPage.tsx`** — chip کانال: «ایمیل» / «تلگرام» / «پیامک».
- گیت‌ها: `tsc --noEmit` clean، `lint` clean، **157/157** تست.

## کامیت
- `feat(storefront): telegram channel for order notifications (stage 22)`

## فایل‌ها
- بک‌اند: `backend/services/telegram/telegramSender.js` (جدید), `backend/services/NotificationService.js`, `backend/services/OrderService.js`, `backend/services/StorefrontOrderService.js`, `backend/services/NotificationQueueService.js`, `backend/routes/users.js`, `backend/models/User.js`, `backend/models/Order.js`, `backend/__tests__/order-telegram-notifications.test.js` (جدید)
- فرانت: `frontend/src/types/storefront.ts`, `frontend/src/types/admin.ts`, `frontend/src/pages/storefront/BuyerOrderPage.tsx`
- مستند: `docs/reports/NAKHSHA_STAGE22_TELEGRAM_NOTIFICATIONS.md`