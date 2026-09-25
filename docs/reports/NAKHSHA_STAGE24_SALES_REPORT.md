# مرحله ۲۴ — گزارش فروش e2e فروشنده

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۴:** ۸۶۴/۸۶۴ بک‌اند (۵۰ suite)، ۱۵۷/۱۵۷ فرانت

## هدف
پر کردن شکاف «گزارش متن کامل مالی و فروش» که در `GET /api/seller/analytics` (مرحلهٔ ۵) معلق ماند: یک endpoint گزارش فروش واقعی مبتنی بر دامنهٔ سفارش (`Order`)، با فیلتر بازهٔ زمانی، شکست بر اساس وضعیت، پرفروش‌ترین محصولات و سری زمانی روزانه — به‌همراه صفحهٔ اختصاصی در داشبورد فروشنده.

## تغییرات بک‌اند
- **`services/SalesReportService.js`** (جدید) — تمام اعداد با یک `$facet` روی `Order.aggregate` و فیلتر سخت `{ sellerId, createdAt: [start, end] }` (ownership با idِ فروشندهٔ احرازشده، نه از پارامتر کلاینت):
  - **نرمال‌سازی بازه:** `from`/`to` به روزهای کامل UTC تراش می‌خورند؛ گاردها: تاریخ نامعتبر، بازهٔ وارونه، بازهٔ بیش از ۳۶۶ روز (VALIDATION_ERROR→400)؛ `top` (پرفروش) بین ۱ تا ۲۰.
  - **summary:** تعداد سفارش، واحد فروخته‌شده (unwind items)، subtotal/shippingFee/discount/total.
  - **byStatus:** count و total به‌ازای status، با zero-fill در ترتیب `ORDER_STATUSES`.
  - **daily:** باکت UTC روز به‌روز + پرکردن روزهای بدون سفارش (سری پیوسته برای نمودار).
  - **topProducts:** رتبه‌بندی بر اساس تعداد واحد (با revenue و تعداد سفارشِ متمایز).
  - خروجی: `{ period, summary, byStatus, topProducts, daily, currency: "IRR" }`. هیچ‌وقت reject نمی‌شود؛ AggregationPipeline همیشه آرایهٔ خروجی دارد؛ `SalesReportDomainError` برای ورودی نادرست کلاینت.
- **`controllers/SellerController.js`** — هندلر `getSalesReport`: پارامترهای query را به سرویس می‌دهد، `SalesReportDomainError` را با کد مناسب (400) برمی‌گرداند؛ سمت‌سرور نه‌تنها با DomainError.
- **`routes/seller.js`** — `GET /api/seller/reports/sales` با `requireAuth + requireRole("seller") + requireSellerProfile + requireManagerOrOwner` (هم‌سطح `/analytics`).

## تست‌ها — `__tests__/seller-sales-report.test.js` (۸ تست)
- Seed دو فروشنده با سفارش در روزهای گوناگون (`createdAt` صریح، UTC) و وضعیت‌های different؛ سفارشِ ۶۰ روز پیشِ فروشندهٔ A خارج از پنجرهٔ پیش‌فرض.
- پنجرهٔ پیش‌فرض (۳۰ روز → ۳۱ روز تقویمی شامل هر دو سر): aggregateهای orders/units/total درست؛ `daily` به طول ۳۱ با روزهای صفر.
- شکست بر اساس وضعیت: delivered ۲ سفارش/۶۰۰٬۰۰۰ تومان؛ zero-fill برای statusهای بدون سفارش در ترتیب enum؛ مجمع totalها برابر ۱٬۰۵۰٬۰۰۰.
- topProducts: «سفال» با ۵ واحد/۳۰۰٬۰۰۰ رتبهٔ اول (ranking بر اساس units).
- «سری پیوستهٔ روزانه»: باکت با ۲ سفارش و total ۶۰۰٬۰۰۰.
- مرزهای from/to: پنجرهٔ تک‌روزه → ۲ سفارش و `daily` به طول ۱ (بدون skew زمانی: مقادیر seed ذخیره‌شده).
- بازهٔ وارونه و بازهٔ بیش از ۳۶۶ روز → 400.
- ownership: گزارش فروشندهٔ B هیچ سفارشی از A را نمی‌بیند (عدد ۸۸٬۸۸۸٬۸۸۸/۱ سفارش فقط برای خودش).
- گیت کامل بک‌اند: **872/872** (۵۱ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (همان هشدارهای قبلی).

## تغییرات فرانت
- **`types/seller.ts`** — تایپ‌های `SellerSalesReport`, `SalesReportSummary`, `SalesReportStatusRow`, `SalesReportTopProduct`, `SalesReportDay`, `SalesReportParams`.
- **`services/sellerService.ts`** — `getSellerSalesReport(params)` → `GET /seller/reports/sales` با fallback خالی.
- **`pages/seller/SalesReportSeller.tsx`** (جدید) — فیلتر از/تا (پیش‌فرض ۳۰ روز اخیر + دکمهٔ بازگشت)، ۴ کارت summary (سفارش‌ها، جمع فروش، جمع تخفیف، واحد)، چیپ‌های شکست وضعیت، **نمودار ستونی روزانهٔ div-based بدون dependency جدید** (با tooltip و اوج)، جدول پرفروش‌ترین محصولات. استفاده از `useSellerFetch` با dependencies بازه (refetch خودکار).
- **`App.tsx`** — lazy import + route `seller/reports/sales`.
- **`components/seller/SellerLayout.tsx`** — آیتم ناو «گزارش فروش» با آیکن `FileBarChart2` زیر «تحلیل عملکرد».
- گیت‌ها: `tsc --noEmit` clean، `lint` clean، **158/158** تست (۱ تست جدید در `sellerService.test.ts`).

## کامیت
- `feat(seller): period sales report endpoint and page (stage 24)`

## فایل‌ها
- بک‌اند: `backend/services/SalesReportService.js` (جدید), `backend/controllers/SellerController.js`, `backend/routes/seller.js`, `backend/__tests__/seller-sales-report.test.js` (جدید)
- فرانت: `frontend/src/types/seller.ts`, `frontend/src/services/sellerService.ts`, `frontend/src/pages/seller/SalesReportSeller.tsx` (جدید), `frontend/src/App.tsx`, `frontend/src/components/seller/SellerLayout.tsx`, `frontend/src/services/__tests__/sellerService.test.ts`
- مستند: `docs/reports/NAKHSHA_STAGE24_SALES_REPORT.md`