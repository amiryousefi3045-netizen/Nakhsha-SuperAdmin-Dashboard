# مرحله ۲۷ — فیلترهای پیشرفتهٔ سفارش‌ها در پنل فروشنده

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۷:** ۸۸۰/۸۸۰ بک‌اند (۵۲ suite)، ۱۶۰/۱۶۰ فرانت

## ایده و هدف
با رشد حجم سفارش‌ها، فروشنده باید بتواند بین سفارش‌هایش دقیق‌تر بگردد. تا این مرحله‌ «لیست سفارش‌ها» فقط `{page, limit, status, q}` داشت (تست مرحلهٔ ۱۰). این مرحله سه فیلتر جدید با پشتیبانی کامل سمت سرور اضافه می‌کند: **بازهٔ تاریخ ثبت** (`from/to` روی `createdAt`)، **وضعیت پرداخت** (`payment` روی `payment.status`) و **بازهٔ مبلغ کل** (`minTotal/maxTotal` روی `total`). مالکیت همیشه سمت سرور از `req.seller._id` استخراج می‌شود و هیچ تغییری توان نشت سفارشِ فروشندگان دیگر را ندارد.

## تغییرات بک‌اند
- **`services/OrderService.js`** — توسعهٔ `listOrders`:
  - `from/to`: اگر مقدار تاریخ معتبر باشد بازهٔ `$gte/$lte` روی `createdAt` بسته می‌شود؛ تاریخ نامعتبر/خالی نادیده گرفته می‌شود (رفتار lenient همنوا با `q`).
  - `payment`: فقط مقادیر مجاز `paid`/`unpaid` فیلتر `payment.status` را فعال می‌کنند.
  - `minTotal/maxTotal`: مقادیر عددی متناهی (کمک‌متد `numericFilter` که رشتهٔ خالی/غیرعددی را undefined می‌کند) بازهٔ `$gte/$lte` روی `total` می‌سازند؛ کران‌ها بسته (inclusive) هستند.
  - همهٔ فیلترها با `status` و `q` ترکیب‌پذیرند و با لاگیک `filter`/`sort` موجود یکی می‌شوند.
- **`controllers/SellerController.js`** — `listSellerOrders` پارامترهای جدید کوئری را به `OrderService.listOrders` منتقل می‌کند.

## تست‌ها — `__tests__/seller-orders-filter.test.js` (۶ تست جدید)
- Seed: سه سفارش برای فروشندهٔ A در تاریخ/مبلغ/پرداخت متفاوت + یک سفارش بزرگ برای فروشندهٔ B.
- بازهٔ تاریخ دقیقاً یک سفارش را برمی‌گرداند.
- `payment=paid` → ۲ سفارش و `payment=unpaid` → ۱ سفارش.
- بازهٔ مبلغ بسته: `minTotal=200000&maxTotal=290000` → فقط `250000`.
- ترکیب `status + payment + minTotal` → دقیقاً همان سفارش دلخواه.
- تحمل پارامترهای نامعتبر (`from=not-a-date`, `minTotal=abc`) بدون خطای 500.
- در تمام فیلترها سفارش فروشندهٔ B هرگز برنمی‌گردد (ایزولهٔ مالکیت).
- گیت کامل بک‌اند: **886/886** (۵۳ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`services/sellerService.ts`** — `ListSellerOrdersParams` به‌صورت اختیاری `from, to, payment, minTotal, maxTotal` می‌گیرد.
- **`pages/seller/OrdersSeller.tsx`** — یک باکس «فیلترهای بیشتر» (آیکن `SlidersHorizontal`) با چهار کنترل: بازهٔ تاریخ (`input type=date` در دو طرف)، بازهٔ مبلغ به تومان (`input type=number`)، دکمهٔ «پاک کردن فیلترها» وقتی فیلتری فعال است. افزودن `select` وضعیت پرداخت (همه/پرداخت‌شده/پرداخت‌نشده) کنار فیلتر وضعیت. هر تغییر، صفحه را به ۱ بازنشانی و درخواست را همراه پارامترها می‌فرستد.
- گیت‌ها: تست جدید `listSellerOrders` با فیلترهای پیشرفته در `sellerService.test.ts`؛ `tsc --noEmit` clean، `lint` clean، **161/161** تست.

## کامیت
- `feat(seller): advanced order filters for the seller list (stage 27)`

## فایل‌ها
- بک‌اند: `backend/services/OrderService.js`, `backend/controllers/SellerController.js`, `backend/__tests__/seller-orders-filter.test.js` (جدید)
- فرانت: `frontend/src/services/sellerService.ts`, `frontend/src/pages/seller/OrdersSeller.tsx`, `frontend/src/services/__tests__/sellerService.test.ts`
- مستند: `docs/reports/NAKHSHA_STAGE27_ORDER_FILTERS.md`