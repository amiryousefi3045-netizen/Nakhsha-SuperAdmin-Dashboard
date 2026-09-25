# مرحله ۲۸ — گزارش تسویهٔ دوره‌ای فروشنده + خروجی CSV (P0-04)

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۸:** ۸۸۶/۸۸۶ بک‌اند (۵۳ suite)، ۱۶۱/۱۶۱ فرانت

## ایده و هدف
گزارش جامع (PDF) کاستی اولویت‌صفر **P0-04** را ثبت کرد: «فروشنده هیچ گزارش/خروجی ای برای تسویه و پرداخت‌ها ندارد؛ فقط خلاصهٔ لحظه‌ای و تاریخچهٔ صفحه‌بندی‌شدهٔ جزئی در ``مالی و تسویه`` است». این مرحله یک **گزارش تسویهٔ دوره‌ای** به صفحهٔ مالی اضافه می‌کند: جمع و تعداد پرداخت‌ها در یک بازهٔ انتخابی، تفکیک بر اساس وضعیت (requested/processing/paid/cancelled/rejected) و روش پرداخت (bank_transfer/card/wallet/other)، سری روزانهٔ پیوسته، و **خروجی CSV** ردیف‌به‌ردیف با BOM برای اکسل — کاملاً هم‌ارز با امکانات بهترین داشبوردها (Stripe Balance → گزارش Transfer، Shopify Payouts با فیلتر دوره و export). همه‌چیز Owner-only و سمت سرور روی `req.seller._id` مقیّد است.

## بازطراحی مشترک (ری‌فکتور)
- **`utils/reportRange.js` (جدید)** — منطق تحلیل/عادی‌سازی بازهٔ `from/to` (تبدیل به روزهای کامل UTC، سقف ۳۶۶ روز، خطای `ReportRangeError` با کد `VALIDATION_ERROR`) از `SalesReportService` خارج و به یک یوتیلی مشترک منتقل شد تا گزارش فروش و گزارش تسویه یک رفتار واحد داشته باشند. `SalesReportService` اکنون آن را import می‌کند و `SalesReportDomainError` صرفاً alias ثابت‌مانده است — API عمومی ماژول و رفتار تست‌های مرحلهٔ ۲۴/۲۵ تغییری نکرد.

## تغییرات بک‌اند
- **`services/FinanceService.js`** — دو تابع جدید:
  - `payoutReport(sellerId, {from,to})`: aggregation با `$facet` روی `Payout` در پنجرهٔ `createdAt` → `summary` (کل + per-status)، `byMethod` (با صفر-پر در ترتیب enum)، `daily` (سری روز پیوسته روی UTC). فقط متعلق به همان فروشنده.
  - `payoutReportCsv(sellerId, {from,to})`: یک ردیف به ازای هر پرداخت (مرتب صعودی)، ستون‌های `id,status,method,amount,currency,note,decisionNote,reference,createdAt,updatedAt`، escaping RFC-4180؛ BOM را کنترلر اضافه می‌کند.
- **`controllers/SellerController.js`** — هندلرهای `getPayoutReport` و `exportPayoutReport` (خطای انحصاری `ReportRangeError` → 400؛ خروجی CSV با `Content-Disposition: attachment`).
- **`routes/seller.js`** — `GET /reports/payouts` و `GET /reports/payouts/export` با گارد `requireOwnerOnly` (مثل مابقی دامنهٔ مالی).

## تست‌ها — `__tests__/seller-payout-report.test.js` (۱۱ تست جدید)
- Seed: ۶ پرداخت برای فروشندهٔ A (وضعیت/روش/تاریخ متنوع + یک پرداخت خارج از پنجرهٔ ۳۰ روزه) + یک پرداخت برای فروشندهٔ B + یک عضو staff.
- جمع/تعداد کل، تفکیک وضعیت و تفکیک روش (صفر-پر و ترتیب enum) + سری روزانهٔ ۳۱ روزه.
- فیلتر `from/to` دقیق، رد بازهٔ وارونه و بیش از ۳۶۶ روز → 400.
- نشت صفر: گزارش فروشندهٔ B فقط دادهٔ خودش را دارد.
- گارد: ناشناس → 401؛ **staff با نقش غیر-owner → 403** روی هر دو endpoint (Owner-only).
- CSV: BOM، هدر دقیق، ۵+۱ ردیف، حذف پرداخت‌های خارج از پنجره و فروشندهٔ دیگر، و 400 برای بازهٔ نامعتبر.
- گیت کامل بک‌اند: **897/897** (۵۴ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`types/seller.ts`** — `SellerPayoutReport`, `PayoutReportStatusSummary`, `PayoutReportMethodRow`, `PayoutReportDay`, `PayoutReportParams`.
- **`services/sellerService.ts`** — `getSellerPayoutReport` (unwrap با خلأها) و `exportSellerPayoutReportCsv` (الگوی `rawGet<Blob>` + استخراج filename از header).
- **`pages/seller/FinanceSeller.tsx`** — بخش «گزارش تسویهٔ دوره‌ای» در پایین صفحه: دو `input type=date`، دکمهٔ «نمایش گزارش»، بازگشت به ۳۰ روز اخیر، دکمهٔ «خروجی CSV». چهار کارت KPI (جمع دوره، در انتظار پردازش، پرداخت‌شده، لغو/ردشده)، تفکیک وضعیت (چیپ StatusBadge)، جدول تفکیک روش پرداخت، و نمودار میل‌های روزانهٔ CSS (سبک گزارش فروش).
- تست‌های سرویس: ۲ تست جدید در `sellerService.test.ts`. گیت‌ها: `tsc --noEmit` clean، `lint` clean، **163/163** تست.

## کامیت
- `feat(seller): periodic settlement report + CSV export (stage 28, P0-04)`

## فایل‌ها
- بک‌اند: `backend/utils/reportRange.js` (جدید), `backend/services/SalesReportService.js`, `backend/services/FinanceService.js`, `backend/controllers/SellerController.js`, `backend/routes/seller.js`, `backend/__tests__/seller-payout-report.test.js` (جدید)
- فرانت: `frontend/src/types/seller.ts`, `frontend/src/services/sellerService.ts`, `frontend/src/pages/seller/FinanceSeller.tsx`, `frontend/src/services/__tests__/sellerService.test.ts`
- مستند: `docs/reports/NAKHSHA_STAGE28_PAYOUT_REPORT.md`