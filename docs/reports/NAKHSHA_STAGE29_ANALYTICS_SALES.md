# مرحله ۲۹ — آنالیتیکس با فروش واقعی + نمودار + مقایسهٔ دوره‌با‌دوره (P1-01/P1-03)

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۹:** ۸۹۷/۸۹۷ بک‌اند (۵۴ suite)، ۱۶۳/۱۶۳ فرانت

## ایده و هدف
گزارش جامع دو کاستی P1 را ثبت کرد:
- **P1-01** — «نمودار/کتابخانهٔ نمودار و مقایسهٔ دوره‌با‌دوره وجود ندارد».
- **P1-03** — «صفحهٔ تحلیل عملکرد پیام قدیمی «گزارش فروش بعداً فعال می‌شود» را نشان می‌دهد و فقط موجودی/وضعیت کاتالوگ را دارد» — در حالی که دامنهٔ سفارش و گزارش‌های فروش/تسویه (مراحل ۱۰، ۲۴، ۲۵، ۲۸) سال‌هاست زنده‌اند.

این مرحله صفحهٔ «تحلیل عملکرد» را به یک داشبورد واقعی تبدیل می‌کند: فروش واقعی از دفتر سفارش (سفارش/تعداد واحد/جمع/میانگین ارزش سفارش)، **مقایسهٔ دوره‌با‌دوره** برابر با بازهٔ پیشین همان طول، سری روزانهٔ فروش، توزیع وضعیت سفارش، و نمودار **آرایهٔ سبک بدون وابستگی** (SVG خالص). انتخاب بازهٔ تاریخ (`from/to`) با همراستایی `utils/reportRange` رفتار واحد با گزارش فروش/تسویه دارد.

## یادداشت فنی: انتخاب کتابخانهٔ نمودار
برنامهٔ اولیه نصب **Recharts** بود، اما در این محیط `npm install` به دلیل قطعی شبکه شکست خورد (ثبت شد در package-cache: ENOTCACHED؛ نصب نافرجام هیچ تغییری روی `package.json`/`package-lock.json` نگذاشت). برای عدم مسدودکردن مرحله، نمودارها **بدون وابستگی** و با SVG خالص درون‌صفحه (کامپوننت `RevenueAreaChart`) پیاده شدند — همخوان با الگوی نمودار CSS گزارش فروش. در آینده و با بازشدن شبکه، تعویض این کامپوننت با Recharts تکاملی و بدون تغییر قرارداد API است. این حتی مزیت باندل دارد.

## تغییرات بک‌اند — `controllers/SellerController.js`
- `getAnalytics` بازنویسی شد:
  - پنجرهٔ انتخابی با `resolveRange` (پیش‌فرض ۳۰ روز آخر، روزهای کامل UTC) و **پنجرهٔ قبلی به همان طول** (`[start-window, start-1ms]`).
  - سه aggregation همزمان: موجودی/کاتالوگ (قبلی)، فروش دورهٔ جاری (count/units/subtotal/shipping/discount/total/avgOrderValue/byStatus به‌ترتیب enum وضعیت)، فروش دورهٔ قبلی (count/units/total)، و سری روزانهٔ پیوسته.
  - `sales` بلاک به پاسخ اضافه شد؛ پیام قدیمی `note` حذف شد (دیگر راکد نیست). بازهٔ نامعتبر → 400.

## تست‌ها — `__tests__/seller-analytics-sales.test.js` (۷ تست جدید)
- Seed: ۳ سفارش در پنجرهٔ جاری، ۲ در پنجرهٔ قبلی، ۱ خارج از هر پنجره (seller A) + ۱ سفارش بزرگ (seller B).
- جمع/واحد/میانگین سفارش، مقایسهٔ با دورهٔ قبل (orders/units/total)، تفکیک وضعیت، سری روزانهٔ ۳۱ روزه، فیلتر `from/to` دقیق، رد بازهٔ نامعتبر → 400، و ایزولهٔ کامل مالکیت.
- گیت کامل بک‌اند: **904/904** (۵۵ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`types/seller.ts`** — `AnalyticsSalesBlock`, `AnalyticsOrderStatusRow`, `AnalyticsParams`؛ فیلد `note` از `SellerAnalytics` حذف شد.
- **`services/sellerService.ts`** — `getSellerAnalytics({from,to})` با unwrap کامل و آنتروپی‌های صفر.
- **`pages/seller/AnalyticsSeller.tsx`** — بازنویسی کامل:
  - فیلتر بازهٔ تاریخ + بازگشت به ۳۰ روز اخیر.
  - ۴ کارت KPI فروش با نشان **درصد تغییر vs دورهٔ قبل** (سبز/قرمز + فلش، مدیریت «جدید در این دوره = +100٪» و «هیچ مقایسه‌ای نبود = —»).
  - **نمودار آرایهٔ SVG بدون وابستگی** برای فروش روزانه (گرادیان، اوج، برچسب اول/آخر).
  - توزیع وضعیت سفارش (چیپ + وضعیت خالی) و تابلوی موجودی؛ توزیع وضعیت محصولات و legend وضعیت.
- تست سرویس: آپدیت `getSellerAnalytics` (با params + sales block). گیت‌ها: `tsc --noEmit` clean، `lint` clean، **163/163** تست.

## کامیت
- `feat(seller): analytics with real sales, PoP compare and charts (stage 29, P1-01/P1-03)`

## فایل‌ها
- بک‌اند: `backend/controllers/SellerController.js`, `backend/__tests__/seller-analytics-sales.test.js` (جدید)
- فرانت: `frontend/src/types/seller.ts`, `frontend/src/services/sellerService.ts`, `frontend/src/pages/seller/AnalyticsSeller.tsx`, `frontend/src/services/__tests__/sellerService.test.ts`
- مستند: `docs/reports/NAKHSHA_STAGE29_ANALYTICS_SALES.md`