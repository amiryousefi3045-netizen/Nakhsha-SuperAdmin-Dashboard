<!--  جهت نمایش صحیح متن فارسی راست‌به‌چپ در ویرایشگرهای Markdown پشتیبانی‌شده. -->

# گزارش مهندسی — مرحله ۱۴: امتیاز و نقدوبررسی محصول

<div dir="rtl">

> **خلاصه مدیریتی:** خریدارِ تحویلگرفته حالا می‌تواند برای کالا امتیاز و دیدگاه ثبت کند؛ این اولین جایی
> است که یک «نظر انسانیِ» زرنگاری‌شده به دامنهٔ فروش وارد می‌شود. هستهٔ امنیتی، «دروازهٔ خرید تحویل‌شده» است:
> دیدگاه فقط وقتی پذیرفته می‌شود که خریدار برای آن کالا یک سفارشِ ویترینیِ **پرداخت‌شده و تحویل‌شده** داشته
> باشد (وگرنه 403 `REVIEW_NOT_ALLOWED`). یک خریدار فقط یک دیدگاه دارد (upsert بر «محصول×خریدار»)، ولی همیشه
> می‌تواند آن را ویرایش کند. هر ثبت، میانگین و تعداد را از «دیدگاه‌های منتشرشده» بازمحاسبه می‌کند و هم در
> `Product.rating` و هم در `SellerProfile.stats` (که از مرحله‌های قبل در سرفر ویترین نشان داده می‌شد) می‌نشاند —
> این رکوردهای آماری برای اولین‌بار واقعی/جدول‌بندی شدند. تست‌پوشش: **بک‌اند ۷۶۸/۷۶۸** (۴۳ سوئیت، +۶۰ هشدارِ
> صفر خطا)، **فرانت** ۱۴۸/۱۴۸ + `typecheck`/`lint` سبز. نام و داده‌های هویتی خریدار به هیچ‌جا درز نمی‌کند؛
> دیدگاهِ ناشناس با برچسب «کاربر نخشا» نشان داده می‌شود و فیلد `buyerName` صرفاً یک «نام‌نوشت» (snapshot) است.

---

## ۱. موقعیت در نقشهٔ راه

| فاز | وضعیت |
| --- | --- |
| 14.1 — طراحی دامنه: دروازهٔ خرید تحویل‌شده، تک‌دیدگاه، بازمحاسبهٔ جمعی | ✅ |
| 14.2 — مدل `Review` + فیلد `rating.{average,count}` محصول + DTO ویترین | ✅ |
| 14.3 — سرویس (submit/upsert، getMy، list) + کنترلر + مسیرها + mount قبل از کاتالوگ | ✅ |
| 14.4 — تست واحد (۱۶) + انتگریشن (۱۶) — باگ تیپ‌کستِ ObjectId در aggregate کشف/رفع شد | ✅ |
| 14.5 — فرانت: تایپ/سرویس، بخش دیدگاه در صفحهٔ محصول، نشان امتیاز کارت/سرصفحه + تست | ✅ |
| 14.6 — راستی‌آزمایی نهایی، گزارش RTL، commit/push | ✅ |

> ادامهٔ طبیعی (بخش‌های آتی): مدیریت/حذف (moderation) دیدگاه‌ها در داشبورد فروشنده (فیلد آمادهٔ `status`)،
> بارگذاری امتیازهای بمثابه‌ی ورودی در الگوریتم‌های رتبه‌بندی ویترین، و اعلان «دیدگاه تازه» به فروشنده.

---

## ۲. معماری و جزئیات اجرا

### ۲.۱ دروازهٔ خرید تحویل‌شده (`hasDeliveredPurchase`)

فروشِ معتبر فقط : سفارش با `{ buyerUserId, origin: "storefront", "payment.status": "paid", status:
"delivered" }` که قلمِ `items.productId` را دارد. همین تابع یکتا هم در `submitReview` (مردود ساختن) و هم در
`getMyReview` (اجازهٔ جدید/ویرایش) است؛ بنابراین یک خریدارِ پرداخت‌نشده، سفارشی که هنوز تحویل نشده، یا خریدار
بی‌واسطه، همیشه پاسخ یکسانی می‌گیرد. توجه: پرداختِ موفقِ درگاهِ mock فقط `payment.status` را عوض می‌کند و «سفارش
تحویل‌شده» فقط با پیشرفت state machine به دست می‌آید — تست‌ها هر دو مسیر را پوشش داده‌اند.

### ۲.۲ مدل داده

- `backend/models/Review.js` (جدید): `{productId, sellerId, sellerUserId, buyerUserId, buyerName, rating
  (1..5 عدد صحیح), comment (≤۱۰۰۰), isAnonymous, status: published|hidden}`؛ ایندکس یکتای `{productId,
  buyerUserId}` (تک‌دیدگاه)، ایندکس فهرست `{productId,status,createdAt}` و ایندکس فروشنده.
  `buyerName` زمانِ نوشتن snapshot می‌شود (بدون join هنگام خواندن) و هیچ شمارهٔ تماس/نامکاربری ذخیره نمی‌شود.
  `status` سه‌گزینه، جایی برای مدریت بعدی.
- `backend/models/Product.js`: افزودن subschema فیلد `rating.{average,count}` (از 0 شروع می‌شود؛ صرفاً توسط
  `refreshProductRating` نوشته می‌شود).
- DTO کاتالوگ (`publicProductToDTO`) و select عمومی: شامل `rating` — کارت‌ها و صفحهٔ محصول بدون تغییر
  واسط، ستاره می‌گیرند.

### ۲.۳ سرویس (`StorefrontReviewService`)

- `submitReview({productId, buyerUserId, rating, comment, isAnonymous})`: اعتبارسنجی، یافتن محصول (404)،
  دروازهٔ خرید (403)، snapshot نام، سپس `findOneAndUpdate` با upsert روی کلید `{productId,buyerUserId}`
  (ویرایش درجا، status به `published`). بعد بازمحاسبهٔ **complete** (نه delta): میانگین+تعداد از
  `aggregate` روی review های `published` و نوشتن هم در `Product.rating` هم در `SellerProfile.stats`.
- باگِ مهم (کتش شده در تست): پیرلاینِ‌های `aggregate` بر خلاف `find` از cast خودکار schema بهره نمی‌برند؛
  رشتهٔ BSON/ObjectId باید صریح تبدیل شود — با `toObjectId` حل شد وگرنه `$match` هرگز جواب نمی‌داد (میانگین ۰).
- `getMyReview`: `{canReview, hasDeliveredPurchase, review}` — برای تصمیمِ UI دربارهٔ «ثبت جدید» در برابر
  «ویرایش».
- `listProductReviews`: فقط `published`، صفحه‌بندی، و نشان دادن میانگین از `Product.rating` (یک‌سند، سریع).

### ۲.۴ سطح HTTP

- `backend/routes/storefront-review.js` (مونت قبل از کاتالوگ):
  - `POST /api/storefront/products/:productId/review` — auth + heavyLimiter + zod (rating 1..5 صحیح، comment≤۱۰۰۰، isAnonymous).
  - `GET /api/storefront/products/:productId/review/mine` — auth.
  - `GET /api/storefront/products/:productId/reviews` — عمومی + صفحه‌بندی.
  - تمام‌مسیرها با بخشِ «/products/…» شروع می‌شوند؛ با `/:slug…` های کاتالوگ نه تداخل دارند نه تداخل می‌گیرند.
- `StorefrontReviewController`: نگاشت خطا `PRODUCT_NOT_FOUND→404، REVIEW_NOT_ALLOWED→403، VALIDATION_ERROR→400`.

### ۲.۵ فرانت‌اند

- تایپ‌ها: `ProductRating`، rating اختیاری روی `StorefrontProduct`، `ReviewItem`، `StorefrontReviewsPage`،
  `SubmitReviewInput`، `MyStorefrontReview`.
- سرویس: `getStorefrontProductReviews`، `submitStorefrontReview`، `getMyStorefrontReview`.
- `StorefrontProductPage.tsx`: نشان ستاره‌ای کنار عنوان (وقتی `count>0`) و کامپوننت `ReviewsSection`:
  سرصفحهٔ جمعبندی (میانگین + شمار), فرم نویسنزدن/ویرایش (انتخاب ۱..۵ ستاره، کامنت، تیک ناشناس)، کارت دیدگاهِ
  خودِ خریدار با دکمهٔ ویرایش، فهرست عمومی با `Pagination`، و حالت‌های خالی/خطا. فرم فقط وقتی نوشته است که
  `canReview` یا در حالت ویرایش؛ اگر خریدار اصلاً تحویل‌نگرفته باشد هیچ فرمی نشان داده نمی‌شود.
- `StorefrontPage.tsx`: کارت محصول اگر `count>0` ستاره/میانگین/تعداد را زیر عنوان (بالای ردیف قیمت) نشان می‌دهد؛
  سرفر ویترین هم با am statهای واقعی‌شده پر می‌شود.

---

## ۳. پذیرش و راستی‌آزمایی

### ۳.۱ بک‌اند (پشته کامل: 768/768 در 43 سوئیت)

- **واحد** (`storefront-review-unit.test.js`, ۱۷ تست):
  دروازهٔ خرید (paid+delivered / unpaid / delivered-nested / ‏seller-origin / محصولِ دیگر)، ساخت+بازمحاسبهٔ
  `Product.rating` و `SellerProfile.stats`، تک‌دیدگاه/upsert و ویرایش درجا، ردِ rating نامعتبر، `PRODUCT_NOT_FOUND`،
  بیکسِ `REVIEW_NOT_ALLOWED`، پنهان‌سازی نام (ناشناس + snapshot), لیست فقط `published` + صفحه‌بندی، و
  حالت‌های `getMyReview`.
- **انتگریشن** (`storefront-review.test.js`, ۱۶ تست، HTTP واقعی):
  فلاوی کامل checkout→SUCCESS→deliver→امتیاز؛ 401 بدون توکن؛ 400 برای rating نامعتبر؛ 404 محصول ناموجود؛
  403 برای خریدارِ بدون خرید و برای سفارشِ پرداخت‌نشده/تحویل‌نشده؛ بازتاب rating در کاتالوگ و `storefront.stats`
  پس از دو خریدار؛ `mine` برای خریدارِ دارای دیدگاه، خریدارِ تحویل‌گرفته‌ی بی‌دیدگاه (خریدارC), و غریبه؛ و
  anonymity.

### ۳.۲ فرانت‌اند

- `storefrontService.test.ts`: 19 → 26 تست (۷ جدید: لیست+پارامترها، پیش‌فرض‌ها، 404، ارسال+upsert=rating،
  `REVIEW_NOT_ALLOWED`, mine با دیدگاه، mine بی‌خرید).
- گیت‌ها: `typecheck` ✅، `lint` ✅، `npm test` → **148/148**.

---

## ۴. امنیت و نکات طراحانه

- **هیچ درزِ مالکیت/هویت**: واکنشِ 403 به «نداشتنِ خریدِ تحویل‌شده» هیچ‌وقت نمی‌گوید که سفارش وجود دارد یا نه
  (همان سیاستِ 404 محصولِ ناموجود در ویترین). پاسخِ عمومیِ دیدگاه فقط نامِ snapshot‌شده دارد؛ شمارهٔ تماس/نامکاربری
  ذخیره نمی‌شود.
- **جمع‌های مقاوم به رانش**: بازمحاسبه هر بار از کل review های `published` (بدون `$inc` شناور) — حتی پس از
  ویرایش مجدداً دقیق می‌ماند.
- **یک دیدگاه در هر خریدار**: unique index + upsert؛ «تکرارِ» خریدار ویرایش محسوب می‌شود نه کپی.
- **قابل تثبیت**: مرتب‌سازی `createdAt DESC, _id DESC`؛ صفحه‌بندی تک‌بخشی/سریع؛ کلیدهای ثابتِ سرویس برای ساخت
  تست‌های کشف باگ (ککتشِ cast) مفید بود.

---

## ۵. راه آینده

1. مرکز مدیریت دیدگاه برای فروشنده (پینکردنِ `status: hidden` در داشبورد فروشنده) — خروجیِ آماده.
2. اعلان «دیدگاه جدید» به فروشنده و وزن‌دادن امتیاز در رتبه‌بندی ویترین.
3. میانگین/تعداد در صفحهٔ فروشگاه میزبان و Cache-Control روی `GET /reviews`.
4. در گام‌های بعدی، محدودیت‌های ضد-spam (heavyLimiter موجود) و گزارش محتوای دیدگاه (flag) برای ادمین.

</div>