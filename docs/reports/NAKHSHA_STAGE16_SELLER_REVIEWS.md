# گزارش مرحلهٔ ۱۶ — مدیریت دیدگاه‌ها در داشبورد فروشنده

**وضعیت:** کامل ✅  
**شاخه:** `feature/seller-dashboard`  
**زمان:** ساختمان‌سازیِ مرحله‌به‌مرحلهٔ ویترین نخشا

## هدف

در مرحلهٔ ۱۴ خریداران می‌توانستند روی محصولات نقدوبررسی ثبت کنند (مدل `Review`، دروازهٔ خریدِ تحویل‌شده، سنجه‌های امتیاز) اما فروشنده‌ای برای مدیریت این دیدگاه‌ها وجود نداشت. این مرحله، نمای «مدیریت دیدگاه‌ها» را به داشبورد فروشنده اضافه می‌کند: دیدن همهٔ دیدگاه‌های فروشگاه (با نام واقعی خریدار و نام محصول)، فیلتر بر وضعیت/محصول، و مخفی/نمایش کردن هر دیدگاه — با بازمحاسبهٔ خودکار امتیازِ محصول و فروشگاه.

## طراحی کلیدی

- **نوع بزرگ‌نمایی فروشنده در برابر عمومی:** همان `reviewToSellerDTO` از مرحلهٔ ۱۴ در سرویس بررسی فروشگاه اکنون داخل `listSellerReviews`/`setReviewVisibility` استفاده می‌شود: نام واقعی خریدار و توضیحات محصول فقط برای مالک فروشگاه بیرون می‌آید؛ دید عمومی همچنان فقط DTOی عمومی را می‌بیند.
- **مالکیت در سرویس، نه در مسیر:** همهٔ کوئری‌ها با فیلتر `sellerId` (از `req.seller._id`) ساخته می‌شوند؛ مشاهدهٔ دیدگاهِ فروشگاه دیگر یا تغییر وضعیتِ آن → `404 REVIEW_NOT_FOUND` (هیچ خبری از موجودیت دیگران، درست مثل بقیهٔ سطح فروشنده).
- **بازمحاسبهٔ سنجه‌ها:** هر تغییر وضعیت، امتیازِ محصول (`refreshProductRating`) و امتیازِ فروشگاه (`refreshSellerRating`) را دوباره از دیدگاه‌هایِ صرفاً `published` حساب می‌کند — امتیاز مخفی شده بلافاصله از ویترین و دایرکتوری حذف می‌شود.
- **درزِ مسیر:** تغییر وضعیت فقط با `write` (پیشوند rate-limited) و `requireManagerOrOwner` در دسترس است؛ فهرست خواندنی بدون محدودیت، ولی همان‌طور gated.

## تغییرات بک‌اند

- `services/StorefrontReviewService.js`:
  - `listSellerReviews({ sellerId, page, limit, status, productId })` — فیلتر `sellerId` اجباری + `status` اختیاری + `productId` اختیاری + sort `{createdAt:-1, _id:-1}` + `populate("productId","title")` → `{ items, total, page, limit }`. کاراکترهای `status`/`productId` با `toObjectId` cast می‌شوند (aggregation/`findOneAndUpdate` راه‌راه).
  - `setReviewVisibility({ reviewId, sellerId, status })` — `findOneAndUpdate` روی `{_id, sellerId}` با `$set { status }`؛ `status` فقط `published`/`hidden` (…،`VALIDATION_ERROR`)؛ نبود سند → `REVIEW_NOT_FOUND`؛ سپس بازمحاسبهٔ هر دو سنجه. خروجی همان `reviewToSellerDTO`.
- `controllers/SellerController.js`: دو هندلر جدید — `listSellerReviews` (با `safePage`/`safePageSize` و اعتبارسنجی صریح `status` خام → 400) و `setReviewVisibility` (اعتبارسنجی `ObjectId.isValid` → 400، نگاشت خطاهای سرویس به 400/404، و ثبت رویداد `REVIEW_VISIBILITY_CHANGED` در AuditService با `riskLevel` وابسته به وضعیت).
- `routes/seller.js`: `GET /reviews` (auth + role + sellerProfile) و `PATCH /reviews/:id/visibility` (با `write` و `requireManagerOrOwner`).

## تغییرات فرانت‌اند

- `types/seller.ts`: `ReviewStatus`، `SellerReview` (با `productTitle` و `buyerName`ِ واقعی)، `ListSellerReviewsParams`.
- `services/sellerService.ts`: `listSellerReviews(params)` و `updateSellerReviewVisibility(id, status)`.
- `pages/seller/ReviewsSeller.tsx` (جدید): جدول دیدگاه‌ها (محصول/متن/خریدارِ بی‌نام یا واقعی/ستاره/وضعیت/زمان)، فیلتر وضعیت، `Pagination`، بنر راهنما دربارهٔ اثر مخفی‌کردن، و `ConfirmDialog` پیش از هر مخفی‌سازی/نمایش (بدون confirm، عمل‌گری حساس را اجرا می‌کند) + باز-refetch خودکار.
- `App.tsx`: مسیر `/seller/reviews` (با `SellerPageSuspense`).
- `components/seller/SellerLayout.tsx`: آیتم «دیدگاه‌ها» در نوبار بین «ارسال / تحویل» و «مالی و تسویه».

## آزمون‌ها و گیت‌ها

- **بک‌اند:** تست انتگریشن جدید `__tests__/seller-reviews.test.js` (۱۴ تست): ارسال 401/403 بدون auth، فهرست با زمینهٔ محصول و بدون نشتی فروشگاه دیگر، فیلتر وضعیت/محصول، صفحه‌بندی، 400 برای وضعیت نامعتبر، مخفی/نمایش با تأیید بازمحاسبهٔ سنجهٔ محصول، 404 برای دیدگاهِ غیرمالک/ناشناخته، 400 برای id بدساخت و وضعیت نامعتبر → کل سویت **۷۹۳/۷۹۳** در ۴۴ سوئیت؛ ESLint: ۰ خطا (۶۷ هشدار که ۱ تای متغیرِ بلااستفاده از فایل تست با حذف پاک شد).
- **فرانت‌اند:** ۲ تست سرویس جدید در sellerService.test.ts → **۱۵۳/۱۵۳**؛ `typecheck` و `lint` هر دو پاک.

## صحنهٔ بعدی

فروشنده اکنون دیدگاه‌ها را می‌بیند و مخفی/نمایان می‌کند. پیشنهادهای بعدی:
1. **پاسخ به دیدگاه‌ها (seller reply)** به‌همراه گرایش‌های بدوی شکایات برای مالک.
2. **اعلان تغییر وضعیت به خریدار** (SMS/ایمیل) — کاربر ناقضِ حرکت‌های پیاپی دیدگاه‌اش را بداند.
3. **درگاه پرداخت واقعی** + ردیابی درآمد/payout سفارش‌های ویترینی برای فروشنده.