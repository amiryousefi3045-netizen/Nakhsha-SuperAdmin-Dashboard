# مرحله ۲۵ — خروجی CSV گزارش فروش

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۵:** ۸۷۲/۸۷۲ بک‌اند (۵۱ suite)، ۱۵۸/۱۵۸ فرانت

## هدف
بستن قابلیت گزارش مرحلهٔ ۲۴ با خروجی قابل استفادهٔ spreadsheet: دانلود CSV ردیف‌به‌ردیف (هر سطر یک سفارش) برای همان بازهٔ انتخابی، با همان قواعد دسترسی و اعتبارسنجی بازه. فایل با BOM و CRLF استاندارد تولید می‌شود تا در Excel (فارسی) درست باز شود.

## تغییرات بک‌اند
- **`services/SalesReportService.js`**:
  - refactor: منطق parse/اعتبارسنجی/نرمال‌سازی بازه به `resolveRange({from,to})` مشترک استخراج شد؛ `salesReport` و `salesReportCsv` هر دو از آن استفاده می‌کنند (تک‌منبعی گاردها: تاریخ نامعتبر، بازهٔ وارونه، بیش از ۳۶۶ روز).
  - `salesReportCsv(sellerId, {from,to})` (جدید): کوئری مستقیم `Order.find({sellerId, createdAt: [start,end]})` با `.sort(createdAt).lean()`؛ سطر به‌ازای هر سفارش با ستون‌های `orderNumber, orderStatus, createdAt (ISO), customerName, customerPhone, items («عنوان xتعداد» با جداکنندهٔ |), units, subtotal, shippingFee, discount, total, currency`؛ escape کامل RFC-4180 (کاما/نقل‌قول/خط جدید) با `csvCell`.
- **`controllers/SellerController.js`** — `exportSalesReport`: CSV را برمی‌گرداند با `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="sales-report-<date>.csv"` + BOM پیشوندی؛ `SalesReportDomainError` → 400 JSON؛ گارد `!res.headersSent` برای خطای داخلی.
- **`routes/seller.js`** — `GET /api/seller/reports/sales/export` با همان زنجیرهٔ `requireAuth + requireRole("seller") + requireSellerProfile + requireManagerOrOwner`.

## تست‌ها (افزوده به `seller-sales-report.test.js` — ۳ تست جدید)
- CSV: status 200، `content-type` حاوی `text/csv`، `content-disposition` حاوی `attachment`، شروع با BOM (`0xFEFF`)؛ خط هدر دقیق؛ تعداد خطوط `header + 4` (سفارش seller B کنار رفته)؛ عدد فروشندهٔ دیگر (۸۸٬۸۸۸٬۸۸۸) در هیچ ردیفی نیست؛ ردیف‌های delivered و «گلدان x2» و ستون total عددی.
- اعداد ستون‌ها برای spreadsheet عددی می‌مانند (totals دقیقاً شامل 400000/200000/150000/300000).
- بازهٔ وارونه در export هم → 400 (برابر JSON).
- گیت کامل بک‌اند: **875/875** (۵۱ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`services/sellerService.ts`** — `exportSellerSalesReportCsv({from,to})` با `apiClient.rawGet<Blob>` + `responseType:"blob"`؛ نام فایل از `content-disposition` استخراج می‌شود (fallback به `sales-report-<date>.csv`).
- **`pages/seller/SalesReportSeller.tsx`** — دکمهٔ «خروجی CSV» در هدر (با state exporting/اسپینر)، مسیر `downloadBlob` (objectURL + کلیک)، پیام موفقیت سبز و خطای قرمز پس از تلاش.
- گیت‌ها: افزودن تست `exportSellerSalesReportCsv` در `sellerService.test.ts`؛ `tsc --noEmit` clean، `lint` clean، **159/159** تست.

## کامیت
- `feat(seller): CSV export for the sales report (stage 25)`

## فایل‌ها
- بک‌اند: `backend/services/SalesReportService.js`, `backend/controllers/SellerController.js`, `backend/routes/seller.js`, `backend/__tests__/seller-sales-report.test.js`
- فرانت: `frontend/src/services/sellerService.ts`, `frontend/src/pages/seller/SalesReportSeller.tsx`, `frontend/src/services/__tests__/sellerService.test.ts`
- مستند: `docs/reports/NAKHSHA_STAGE25_SALES_REPORT_CSV.md`