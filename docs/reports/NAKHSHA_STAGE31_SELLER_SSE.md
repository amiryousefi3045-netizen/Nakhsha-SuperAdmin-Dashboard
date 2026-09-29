# استیج ۳۱ — اعلان بلادرنگ فروشنده: SSE + زنگ اعلان (P1-05)

**شاخه:** `feature/seller-dashboard` — **وضعیت دروازه‌ها:** بک‌اند ۹۲۳/۹۲۳ (۵۷ suite) | فرانت ۱۷۰/۱۷۰ | ESLint: صفر خطا / ۶۶ هشدار (بدون تغییر نسبت به baseline)

## چرا این مرحله؟

باقی‌ماندهٔ P1-05 گزارش PDF نبود: «فروشنده تا باز کردن صفحه نفهمد سفارش جدید آمده، مجبور به refresh دستی یا polling باشد». تا پیش از این مرحله هیچ مسیر push‌ای وجود نداشت و فروشنده فقط با refresh متوجه تغییر می‌شد.

رویکرد این مرحله **Server-Sent Events** است، نه WebSocket و نه polling: جریان یک‌طرفهٔ سرور→مرورگر است، از همان الگوی `AdminEventHub` موجود در پروژه پیروی می‌کند، و نیازی به وابستگی جدید ندارد (محدودیت شبکهٔ npm در این محیط).

## آنچه اضافه شد «یک فایل»

### `services/SellerEventHub.js` (هستهٔ جدید)
- یک pub/sub درون‌پروسه‌ای، دقیقاً هم‌سبک با `AdminEventHub`، با تفاوت‌های لازم برای فروشنده:
  - **scoping اجباری بر اساس فروشگاه**: هر کلاینت به یک `sellerProfileId` مقید است و `publish` فقط به کلاینت‌های همان فروشگاه می‌فرستد؛ انتشار یک فروشنده هرگز به فروشندهٔ دیگر نمی‌رسد.
  - **سقف اتصال**: ۱۰ اتصال برای هر فروشگاه و ۲۰۰ اتصال کل، تا یک فروشنده نتواند کل ظرفیت را بگیرد.
  - **دفاع چندلایه در برابر کلاینت مرده**: قبل از نوشتن، `writableEnded`/`destroyed` بررسی و کلاینت‌های ازکارافتاده حذف می‌شوند؛ خود `write` هم در `try/catch` است تا خطای یک سوکت، انتشار بقیهٔ مشتری‌ها را نکشد.
  - `write` هر مقدار را با `JSON.stringify` می‌نویسد، پس newline در داده به فریم SSE نمی‌شکند.
  - **نکتهٔ استقرار**: در چند نمونه (multi-instance) باید با Redis Pub/Sub جایگزین شود — همان محدودیتی که `AdminEventHub` دارد.
- متدها: `subscribe` (برمی‌گرداند `{ id, unsubscribe }`)، `canAccept` (پیش از نوشتن هدر بررسی می‌شود)، `heartbeat(id)`، `publish`، `reset` (جداکنندهٔ تست).
- رویدادها: `initial`، `heartbeat`، `activity`، `order`، `payout`.

### مسیر جدید
- `GET /api/seller/events/live` — `requireAuth` + `requireRole("seller")` + `requireSellerProfile` + **`requireManagerOrOwner`** (هم‌سطح با فید رویدادها و فایل‌های مالی، چون رویداد payout مبلغ را حمل می‌کند).
- هدرها: `text/event-stream; charset=utf-8`، `no-cache, no-transform`، `keep-alive`، `X-Accel-Buffering: no` + `flushHeaders()` (تا پراکسی‌ها جریان را بافر نکنند).

### ناشرها (هرگز throw نمی‌کنند)
اعلان زنده هرگز نباید مسیر نوشتنی را که آن را تحریک کرده خراب کند، پس همه در `try/catch` با لاگ هشدار هستند:
- `services/OrderService.js`: یک تابع کمکی `publishOrderEvent(order, fromStatus)` که هم **سفارش جدید** (`from: null` — شامل checkout استوری‌فرونت، که مهم‌ترین اعلان فروشنده است) و هم **تغییر وضعیت** را با یک شکل واحد منتشر می‌کند.
- `services/FinanceService.js`: `publishPayout` در سه نقطه — ثبت درخواست (`from: null`)، لغو توسط فروشنده (`from: "requested"`)، و تغییر وضعیت توسط ادمین (از وضعیت قبلی).
- `services/AuditService.js`: رویداد `activity` برای تمام ممیزی‌های فروشنده.

**نکتهٔ مهم در ممیزی:** هیچ‌کدام از ۱۶ فراخوانی `AuditService.log` در کنترلر فروشنده `sellerProfileId` را در metadata نمی‌گذاشتند، پس انتشار رویداد فعالیت در عمل **هرگز** اجرا نمی‌شد (تست اولیه هم دقیقاً به همین دلیل مستقیم `AuditService.log` را صدا می‌زد و سبز می‌شد، در حالی که مسیر واقعی هیچ‌وقت رویدادی نمی‌فرستاد). حالا مخاطب از `requestContext.seller` استخراج می‌شود — همان فروشگاهی که درخواست با آن احراز هویت شده — تا همهٔ فراخوانی‌های موجود و آینده بدون تکرار شناسهٔ فروشگاه کار کنند. `metadata.sellerProfileId` به‌عنوان راه فرار صریح برای ناشرهای غیر-HTTP باقی ماند. رخدادهای بدون فروشگاه (ادمین، خریدار، سیستم) اصلاً مخاطب فروشنده ندارند.

## اصلاحات امنیتی/رفتاری انجام‌شده در همین مرحله

- **سقف اتصال پیش از هدرها بررسی می‌شود**: قبلاً اگر سهمیه تمام بود، هدرهای SSE از قبل ارسال شده بودند و «503» عملاً روی یک جریان نیمه‌باز اعمال می‌شد. حالا `canAccept` قبل از هر نوشتنی صدا زده می‌شود و پاسخ، JSON تمیز با `TOO_MANY_CONNECTIONS` است.
- **heartbeat فقط به اتصال خودش**: قبلاً هر تب باز یک تایمر ۲۵ ثانیه‌ای داشت که **همهٔ** مشتری‌ها را ping می‌کرد؛ با N تب، ترافیک N برابر می‌شد. حالا هر تایمر فقط `id` خودش را می‌زند.
- **نشت نقش به کاربر staff**: زنگ اعلان برای همهٔ اعضای تیم رندر می‌شد، ولی staff از مسیر 403 می‌گیرد و فقط یک زنگ «همیشه خاموش» می‌دید. حالا `myRole` در DTO پروفایل اضافه شد و چیدمان برای `staff` زنگ را رندر نمی‌کند (هم‌راستا با محدودیت‌های خود `requireOwnerOnly`/`requireManagerOrOwner`).

## آنچه در فرانت اضافه شد

- **`components/seller/SellerLiveBell.tsx` (جدید)**: نقطهٔ وضعیت اتصال، badge شمارندهٔ «دیده‌نشده»، منوی بازشونده با آخرین اعلان‌ها (۸ ثانیه می‌مانند و فهرست کامل به صفحهٔ رویدادها لینک دارد)، شمارش «دیده‌نشده» با بستن منو، و باز اتصال خودکار (backoff) در برابر خطا.
- **`services/sellerService.ts`**: `subscribeSellerLiveEvents` با `fetch` + `ReadableStream` (چون `EventSource` بومی نمی‌تواند هدر `Authorization` بفرستد — همان تصمیمی که سمت ادمین هم گرفته شد) و یک parser که فریم‌های چندخطی را دوباره سرِ هم می‌کند و JSON خراب را نادیده می‌گیرد.
- **`types/seller.ts`**: `SellerLiveEvent`، `SellerLivePayload` و `SellerLiveAlert` + فیلد `myRole`.

## تست‌ها «یک فایل»

`__tests__/seller-live-events.test.js` (۱۱ تست، جدید) — روی سرور واقعی (`app.listen(0)` + `http.request`) چون supertest جریان را بافر می‌کند:

- **protection**: 401 بدون توکن، 403 برای کاربر بدون پروفایل (`SELLER_PROFILE_REQUIRED`)، 403 برای عضو `staff`.
- **جریان**: فریم `initial` + هدر درست؛ سپس رویداد فعالیت از یک **مسیر واقعی HTTP** (`PATCH /api/seller/inventory/:id`) — عمداً، چون همان باگ بالا را باید بگیرد.
- **سفارش جدید** با `from: null` و **گذار وضعیت** با from/to.
- **تسویه**: `requested → processing → paid` (ماتریس تسویه اجازهٔ پرش مستقیم به `paid` را نمی‌دهد؛ تست اول همین را کشف کرد).
- **سقف اتصال**: ۱۰ اتصال باز شروع می‌شود، یازدهمی **JSON 503** می‌گیرد (نه جریان نیمه‌باز) و شمار اتصال‌ها تغییر نمی‌کند.
- **نقش**: پروفایل staff `myRole: "staff"` و مالک `"owner"` برمی‌گرداند.
- **ایزولیشن بین فروشگاه‌ها**: رویداد فروشندهٔ دوم هرگز به مشترک فروشندهٔ اول نمی‌رسد.
- **قطع اتصال**: بعد از destroy، شمار اتصال‌های هاب به صفر می‌رسد.
- تست‌های فرانت (`sellerService.test.ts` +۳): پارس فریم‌ها و ارسال هدر Bearer، سرهم‌کردن فریم دو تکه‌ای و نادیده‌گرفتن دادهٔ خراب، و گزارش پاسخ ناموفق (`403`) از طریق `onError`.

## وضعیت دروازه‌ها
- بک‌اند: **923/923** (۵۷ suite) | ESLint: صفر خطا / ۶۶ هشدار (بدون تغییر نسبت به baseline)
- فرانت: **170/170** | `tsc --noEmit` و `lint` تمیز

## پیام کامیت
`feat(seller): live SSE updates and notification bell (stage 31, P1-05)`

## فایل‌های کلیدی
- بک‌اند: `backend/services/SellerEventHub.js` (جدید)، `backend/__tests__/seller-live-events.test.js` (جدید)، `backend/controllers/SellerController.js`، `backend/routes/seller.js`، `backend/services/{AuditService,OrderService,FinanceService}.js`
- فرانت: `frontend/src/components/seller/SellerLiveBell.tsx` (جدید)، `frontend/src/components/seller/SellerLayout.tsx`، `frontend/src/services/sellerService.ts`، `frontend/src/types/seller.ts`، `frontend/src/services/__tests__/sellerService.test.ts`
- مستندات: `docs/reports/NAKHSHA_STAGE31_SELLER_SSE.md`

## بدهی شناخته‌شده (خارج از محدودهٔ این مرحله)
- هاب درون‌پروسه‌ای است؛ استقرار چند نمونه‌ای به Redis Pub/Sub نیاز دارد (`AdminEventHub` هم همین را دارد).
- `AdminController.streamAdminEvents` همان الگوی قدیمی «heartbeat سراسری برای هر اتصال» را دارد؛ این مرحله آن را دست نزد تا دامنه تغییر محدود بماند.
- اعلان‌ها پس از ۸ ثانیه از فهرست کوچک حذف می‌شوند و تاریخچهٔ پایدار از صفحهٔ رویدادها (که از AuditLog می‌خواند) می‌آید.
