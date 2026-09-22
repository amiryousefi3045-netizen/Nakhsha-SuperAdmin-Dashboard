<!--
  جهت نمایش صحیح متن فارسی راست‌به‌چپ در ویرایشگرهای Markdown پشتیبانی‌شده، روی هر پاراگراف
  از میان‌بر «دو طرفه» استفاده شده است. گزارش‌های فنی نخشا مطابق کنوانسیون RTL نوشته می‌شوند.
-->

# گزارش مهندسی — مرحله ۱۲: پرداخت خریدار و بستن حلقه‌ی سفارش

<div dir="rtl">

> **خلاصه مدیریتی:** در این مرحله کاتالوگ عمومیِ مرحله‌ی ۱۱ به یک چرخه‌ی **خرید شبیه‌سازی‌شده**
> تا انتها متصل شد: خریدارِ احرازشده از ویترین منتشرشده سفارش می‌دهد، موجودی به‌صورت اتمیک رزرو
> می‌شود، یک «درگاه پرداخت آزمایشی» (provider `mock`) نتیجه‌ی خود را از طریق یک callback عمومی و
> **idempotent** (پرداخت موفق / ناموفق) اعمال می‌کند، و در نهایت خریدار رسید سفارش خود را دریافت
> می‌کند. هیچ قوه‌ی جدیدی به مدل سفارش اضافه نشد؛ کافی بود «خاستگاه» (origin) و «خریدار»
> (buyerUserId) و بلوک پرداختِ موجود به Order بچسبد و `OrderService.createOrder` با همین صدا بازاستفاده
> شود — بنابراین سفارش‌های ویترینی بدون هیچ تغییری وارد گردش کار فروشنده (مرحله‌ی ۷) می‌شوند.
> بک‌اند با **۳۷ تست تازه** (پشته‌ی کامل **723/723**) و فرانت‌اند با تایپ‌ها، متدهای کلاینت، پنل
> پرداخت در صفحه‌ی محصول و صفحه‌ی رسید (مسیر `/store/orders/:orderId` با احراز) و در مجموع
> **138 تست ویتس** تأیید شد. پول به‌صورت عدد صحیح ریال و بدون شناور می‌ماند و کلِ «درگاه» آفلاین
> و قابل‌تست است؛ دریچه‌ی اتصال یک درگاه واقعی بعداً با همین شکلِ اسنپ‌شات باز می‌ماند.

---

## ۱. موقعیت در نقشه‌ی راه

| فاز | وضعیت |
| --- | --- |
| 12.1 — مطالعه‌ی ساختار (مدل‌های سفارش/خریدار، زیرساخت پرداخت/سبد، طراحی محدوده) | ✅ انجام و تأییدشده |
| 12.2 — بک‌اند: گسترش Order + OrderService + StorefrontOrderService (checkout/payment/receipt) | ✅ انجام و تأییدشده |
| 12.3 — بک‌اند: کنترلر + مسیرها + پشته‌ی کامل سبز + ESLint | ✅ انجام و تأییدشده |
| 12.4 — فرانت‌اند: تایپ‌ها، سرویس کلاینت، پنل خرید/پرداخت، صفحه‌ی رسید + مسیر | ✅ انجام و تأییدشده |
| 12.5 — راستی‌آزمایی نهایی، گزارش RTL، ثبت و ارسال (commit + push) | ✅ انجام و تأییدشده |

> ادامه دارد (پیشنهادی): سبد خرید چندقلمی دائمی، آدرس/هزینه‌ی ارسال در checkout، اتصال یک درگاه
> واقعی (به‌جای `mock`) روی همین شکلِ اسنپ‌شات، و ردیابی مالی خودکار در صورت تکرار پرداخت.

---

## ۲. معماری و کارهای انجام‌شده

### ۲.۱ تصمیم طراحی: بستن حلقه با کمترین قوه‌ی جدید

بررسی ساختار نشان داد هیچ مدل `Cart`/`Transaction`/`Wallet`/`Checkout` وجود ندارد؛ Order در مرحله‌ی ۷
برای گردش کار فروشنده ساخته شده بود. برای مرحله‌ی ۱۲ **به‌جای ساخت یک لایه‌ی پرداخت موازی**، همان
زیرساختِ اتمیکِ سفارش بازاستفاده شد:

- `OrderService.createOrder` همان رزرو اتمیکِ دوانتظام (onHand←، reserved↑ با گارد `onHand >= qty`) و
  اسنپ‌شات قیمتِ صحیحِ ریال را بدون تغییر انجام می‌دهد؛ checkout خریدار فقط «خاستگاه» و «خریدار» را
  به آن می‌دهد (`origin: "storefront"`، `buyerUserId`).
- نتیجه: سفارشِ ویترینی به‌صورت یک Order معمولی در فهرست فروشنده (GET `/api/seller/orders`) ظاهر
  می‌شود و کل گردش کار مرحله‌ی ۷ (تأیید، پردازش، ارسال، تحویل) روی آن کار می‌کند — تستِ
  «seam» در پایان همین مرحله این را به‌صراحت اثبات می‌کند.

### ۲.۲ تغییرات مدل و سرویس سفارش

`backend/models/Order.js` (گسترش حداقلی):

- فیلد `origin` با enum `["seller","storefront"]` (پیش‌فرض `seller`) بعد از `sellerUserId`.
- فیلد `buyerUserId` از نوع ObjectId با ref User، پیش‌فرض null و ایندکس (`{ buyerUserId: 1, createdAt: -1 }`)
  برای «سفارش‌های من» در رسید خریدار.
- بلوک `payment` برای درگاه باز شد: `provider` (پیش‌فرض "")، `refId` (پیش‌فرض "")،
  `paidAt` (پیش‌فرض null) — `status`/`method`/`currency` قبلاً بودند.
- بدون هیچ فیلد انباشته‌ی جدیدِ مالی؛ کل همان RPIC ریال صحیح باقی می‌ماند.

`backend/services/OrderService.js`:

- `createOrder({ ..., origin = "seller", buyerUserId = null })` → در ضبط سند همان دو فیلد رد می‌شوند.
- `orderToDTO` دو خروجیِ مشتق `origin` و `buyerUserId` را به DTO افزود تا رسیدِ خریدار بتواند آن‌ها را
  بخواند (بدون اینکه DTOِ فروشنده شکسته شود).

### ۲.۳ StorefrontOrderService (جدید)

`backend/services/StorefrontOrderService.js`:

- **`createBuyerOrder({ slug, buyerUserId, customer, items, paymentMethod, customerNote })`**:
  - گیتِ ویترین منتشرشده با **همان** `StorefrontService.findPublishedStorefront` کاتالوگ عمومی
    (فقط از فروشگاه زنده/منتشرشده می‌شود خرید کرد)؛ نبودِ ویترین → `STORE_NOT_FOUND`.
  - گارد **خرید از فروشگاه خودتان**: مالکیت فروشگاه جداگانه واکشی می‌شود (DTO عمومی عمداً `userId`
    ندارد) و خریدارِ هم‌شخص با فروشنده → `SELF_PURCHASE`.
  - هر قلم باید محصولِ **همین ویترین** و `active` باشد؛ غیر از آن → `PRODUCT_NOT_AVAILABLE` (نه
    نشتی وجود). پیش‌شرط `items` غیرخالی → `VALIDATION_ERROR`.
  - رزرو اتمیک + اسنپ‌شات با `OrderService.createOrder({ origin: "storefront", buyerUserId, ... })`.
  - درگاه‌گذاری: `payment.method/provider="mock"/refId = _id سفارش` و ثبت `ORDER_CREATED` در لاگ حسابرسی.
  - خروجی: `{ order, paymentIntent: { provider, refId, amount, currency, status } }`.
- **`submitPaymentResult({ refId, result, reason })`** — بازخورد «درگاه»:
  - `refId` باید همان شناسه‌ی ۲۴-هگز سفارشِ `origin: "storefront"` باشد؛ وگرنه `PAYMENT_NOT_FOUND`
    (نشتی وجود خیر).
  - **Idempotency**: اگر از قبل `paid` یا `cancelled` باشد → `{ applied: false }` بدون هیچ تغییری
    (تکرار callback بی‌اثر و امن برای redelivery).
  - `SUCCESS`: `payment.status paid` + `paidAt` و ثبت `PAYMENT_RECEIVED`. `FAIL`: همین که
    نداریم → سفارش `cancelled` می‌شود (از طریق انتقال قانونیِ `transitionOrder` + **بازگرداندن
    ذخیره‌ی رزروشده**) و ثبت `PAYMENT_FAILED`.
- **`getBuyerOrder({ buyerUserId, orderId })`** — رسیدِ دو-دامنه‌شده: فقط سفارشی که `buyerUserId`
  همان درخواست‌کننده باشد و `origin: "storefront"` → DTO سفارش؛ وگرنه `null` (صفح 404).

### ۲.۴ کنترلر و مسیرها

`backend/controllers/StorefrontOrderController.js` + `backend/routes/storefront-order.js` (جدید) که بعد از
مسیر کاتالوگ در `server.js` سوار می‌شود (`app.use("/api/storefront", ...)`)؛ چون `GET /orders/:orderId`
دو-بخشی است، با `GET /:slug` یک‌بخشی هم‌پوشانی نمی‌کند:

| متد و مسیر | احراز | نرخ‌محدودیت | سرویس |
| --- | --- | --- | --- |
| `POST /api/storefront/:slug/checkout` | ✅ `requireAuth` | heavyLimiter | `createBuyerOrder` |
| `POST /api/storefront/payments/:refId/callback` | ❌ عمومی (طبیعت درگاه) | heavyLimiter | `submitPaymentResult` |
| `GET /api/storefront/orders/:orderId` | ✅ `requireAuth` | — | `getBuyerOrder` |

- اعتبارسنجی بدنه به‌صورت zod: `items` (حداقل یک قلم؛ `productId` هگز-۲۴؛ `qty` از ۱ تا ۹۹)،
  `customer` (نام ≥۲ نویسه، تلفن با الگوی `09…`، email اختیاری با refine، آدرس ≤۱۰۰۰ نویسه)،
  `paymentMethod` از enum، `customerNote` ≤۲۰۰۰، و بدنه‌ی callback با `result: SUCCESS|FAIL` و
  `reason` ≤۲۰۰.
- نقشه‌ی خطا: `STORE_NOT_FOUND / PRODUCT_NOT_FOUND / PAYMENT_NOT_FOUND` → **404**؛ بقیه‌ی
  خطاهای دامنه (SELF_PURCHASE، VALIDATION_ERROR، PRODUCT_NOT_AVAILABLE) → **400**؛ «موجودی ناکافیِ»
  `OrderDomainError` → **400** با `code` معنی‌دار. پیمانه‌ی پاسخ، همان envelop استاندارد است.
- callback به‌عمد **عمومی** است (درگاه توکن نشست ندارد) اما refId هگز-۲۴ + gating کارش را امن می‌کند.

### ۲.۵ فرانت‌اند

- `frontend/src/types/storefront.ts` — گروه تایپ‌های خریدار: `CheckoutInput/CheckoutItemInput/
  CheckoutCustomerInput`، `BuyerOrder` (رسیدِ مطابق DTO سفارش)، `StorefrontPayment`، `PaymentIntent`،
  `PaymentCallbackResult`.
- `frontend/src/services/storefrontService.ts` — سه متد کلاینت: `checkoutStorefront(slug, input)`,
  `submitStorefrontPayment(refId, result, reason?)` و `getStorefrontOrder(orderId)`؛ همه با قرارداد
  envelop/خطای نرمال‌شده‌ی پروژه (throw به‌جای مقدار invalid).
- `frontend/src/pages/storefront/StorefrontProductPage.tsx` — پنل خرید زیر بلوک موجودی:
  ماشین‌حالت `idle → submitting → paying → success|failed`؛ فرم نام/تلفن (الگوی 09…)، گام‌شمار تعداد
  (کپ ۹۹ و ≤ موجودی)، اتصال به درگاه با **پرداخت موفق/ناموفقِ شبیه‌سازی‌شده**، پیام خطا با کدهای
  معنی‌دار (UNAUTHORIZED → دعوت به ورود برای مهمان، INSUFFICIENT_STOCK → کاهش تعداد)، و در موفقیت
  لینک رسید.
- `frontend/src/pages/storefront/BuyerOrderPage.tsx` (جدید) — رسید: شماره‌ی سفارش، وضعیت و
  برچسب‌های رنگی، بلوک پرداخت (وضعیت/درگاه/زمان)، جدول اقلام، تخفیف/جمع‌کل، تاریخچه‌ی وضعیت؛ با
  جعبه‌ی «سفارش پیدا نشد» و بازگشت.
- `frontend/src/App.tsx` — مسیر `store/orders/:orderId` با `RequireAuth` + Suspense، **قبل از**
  `store/:slug` (بخشیِ استاتیک «orders» بر «:slug» ارجح است).

---

## ۳. پذیرش (Tests) و راستی‌آزمایی

### ۳.۱ بک‌اند — ۳۷ تست تازه در دو سوئیت

- `__tests__/buyer-order-unit.test.js` (۲۰ تست واحد): گیت‌های `createBuyerOrder` (بدون خریدار، ویترین
  ناموجود، self-purchase، آیتم خالی، محصولِ خارجِ ویترین، پذیرشِ پارامترها در `OrderService.createOrder`
  با `origin/buyerUserId`، رزروِ اتمیک/اسنپ‌شات/orderNumber عادی، paymentIntent)، `submitPaymentResult`
  (refId ناهنجار، سفارشِ غیر-ویترینی، idempotency تکراریِ SUCCESS/FAIL، علامت‌گذاری paid +
  PAYMENT_RECEIVED، لغو سلسله‌وار + بازگشت ذخیره + PAYMENT_FAILED)، و `getBuyerOrder` (تعلق/غیرتعلق،
  غیر-ویترینی → null).
- `__tests__/buyer-order.test.js` (۱۷ تست یکپارچه HTTP): checkout موفق (بدنه، `origin`، `buyerUserId`،
  `refId = _id`)، رزرو واقعیِ موجودی، 401 بدون توکن، 404 ویترین منتشرنشده/ناشناخته، self-purchase،
  کمبود موجودی (قضیه‌ی qty=60 که از اسکیمای ۹۹ رد می‌شود ولی از انبار رد می‌شود)، اعتبارسنجی نام/تلفن،
  محصولِ خارجِ ویترین، callback موفق + اتم‌پتانسی، بازگشت ذخیره در FAIL، 404 تراکنش ناموجود،
  اعتبارسنجی result، رسیدِ خودی/غیرخودی/بدون-احراز، و **seam**: سفارش ویترینی در
  `GET /api/seller/orders` با `origin: "storefront"` دیده می‌شود.
- پشته‌ی کامل: **723/723** در 41 سوئیت؛ ESLint روی ۸ فایل تغییر‌یافته → **0 خطا**.

### ۳.۲ فرانت‌اند

- گیت‌ها: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` → **138/138** (7 فایل).
- تست‌های `storefrontService` از 9 به **16** رسیدند (checkout/پرداخت/رسید + مسیرهای صحیحِ URL و کد
  خطاهای معنی‌دار).

---

## ۴. امنیت، یکپارچگی و ملاحظات طراحانه

- **بدون نشتی وجود**: ویترینِ منتشرنشده/ناشناخته، تراکنشِ ناشناخته/غیرویترینی و سفارشِ دیگری — همه
  با کد `NOT_FOUND`/`PAYMENT_NOT_FOUND` پاسخ می‌دهند؛ نه آری، نه توضیح.
- **یکپارچگی حالت**: callbackهای تکراری بی‌اثرند (`applied: false`)؛ FAIL فقط از حالت pending اتفاق
  می‌افتد و ذخیره‌ی رزروشده در همان عملیاتِ انتقالِ قانونی آزاد می‌شود؛ هیچ مسیری پرداخت دوم را
  روی سفارشِ پرداخت‌شده اجرا نمی‌کند.
- **دامنه‌ی اعداد**: مبلغ‌ها integer ریال از همان اسنپ‌شاتِ `createOrder`؛ در DTO و UI بدون شناور.
- **بازاستفاده به‌جای بازسازی**: گردش کار فروشنده، حسابرسی (`ORDER_CREATED/PAYMENT_RECEIVED/
  PAYMENT_FAILED` که از قبل در enum مدل بودند)، نرخ‌محدودیت و envelop همگی بدون تغییر مصرف شدند.
- **اسکوالِ مرزی آگاهانه**: اسکیما سقف ۹۹ در `qty` دارد لذا قضیه‌ی «کمبود موجودی» با مقداری آزموده
  شد (۶۰) که از اسکیما رد و فقط در گارد اتمیک سقوط کند.

---

## ۵. راه آینده

1. سبد خرید چندقلمی دائمی + آدرس/هزینه‌ی ارسال و `shippingFee` واقعی در checkout.
2. جایگزینی `provider: "mock"` با یک درگاه واقعی: callback با همین شکلِ `{result, reason}` و refId
   بالا می‌رود؛ نیاز به تغییر در checkout نیست.
3. ردیابی مالی (payout) برای درآمد حاصل از سفارش‌های ویترینی به قواعد مرحله‌ی ۹.
4. لیست «سفارش‌های من» برای خریدار (از روی ایندکس `buyerUserId + createdAt`).

</div>