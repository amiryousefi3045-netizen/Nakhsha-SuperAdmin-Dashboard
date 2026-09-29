# مرحله ۳۰ — پوشش کامل خروجی CSV: سفارش‌ها، موجودی، فعالیت (P1-02)

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۳۰:** ۹۰۴/۹۰۴ بک‌اند (۵۵ suite)، ۱۶۳/۱۶۳ فرانت

## ایده و هدف
گزارش جامع یک کاستی P1 را ثبت کرد:
- **P1-02** — «خروجی CSV فقط برای گزارش فروش موجود است؛ فهرست سفارش‌ها، موجودی و فعالیت فروشگاه خروجی ندارند».

تا پیش از این مرحله فقط گزارش فروش (St25) و گزارش تسویه (St28) CSV داشتند. این مرحله سه endpoint جدید اضافه می‌کند که هر کدام **دقیقاً همان فیلترهای endpoint فهرست خود** را می‌گیرند (پس کاربر می‌تواند «همان‌چیزی که می‌بیند» را دانلود کند) و همان scoping مالکیت را رعایت می‌کنند.

## ابزار مشترک — `backend/utils/csv.js` (جدید)
- `toCsv(rows)`: RFC-4180 — هر سلول quote می‌شود، `"` داخل سلول دوبل، جداکنندهٔ سطر `\r\n` (سازگار با Excel).
- **خنثی‌سازی CSV-injection**: سلولی که با `=`، `+`، `-` یا `@` شروع شود با `'` پیشوند داده می‌شود (دفاع در برابر فرمول‌آرایی هنگام باز کردن فایل در Excel).
- `sendCsv(res, name, csv)`: هدر `text/csv; charset=utf-8` + `Content-Disposition: attachment` + **BOM** (تا فارسی در Excel درست باز شود).

## تغییرات بک‌اند
### `services/OrderService.js`
- منطق فیلتر از `listOrders` به `buildOrderFilter` جدید استخراج شد (single source of truth).
- `exportOrders(sellerId, filters)` جدید: همان فیلترها، بدون صفحه‌بندی، مرتب‌سازی `createdAt: -1`، سقف ۵۰٬۰۰۰ سطر (محافظ حافظه).

### `controllers/SellerController.js`
- `buildInventoryFilter(sellerId, {status, q})` استخراج شد (shared با `listInventory`).
- سه handler جدید: **`exportOrders`** (۱۴ ستون: id, orderNumber, status, payment, currency, subtotal, shippingFee, discount, total, itemCount, customerName, customerPhone, createdAt, items)، **`exportInventory`** (۱۳ ستون شامل onHand/reserved/incoming/**available**)، **`exportActivity`** (۹ ستون شامل endpoint و `after`؛ `changes.before` مانند feed هرگز expose نمی‌شود).
- هر سه: در catch، `if (!res.headersSent)` (اگر هدرها ارسال شده باشند crash نمی‌کنند).

### `routes/seller.js`
- `GET /orders/export`، `GET /inventory/export` (همان سطح دسترسی لیست)، `GET /activity/export` (manager+owner، همگام با feed).

## تست‌ها — `__tests__/seller-csv-exports.test.js` (۸ تست جدید)
- CSV سفارش: BOM، هدر دقیق، quote کردن «مشتری با کاما، خاص»، احترام به `status`+`min/maxTotal`، عدم نشت فروشندهٔ دیگر.
- CSV موجودی: فقط کالاهای tracked (`stockPolicy: tracked`)، ستون‌های موجودی، فیلتر `status=low`.
- CSV فعالیت: فقط رکوردهای فروشندهٔ احراز‌شده، حذف `LEAK-ME` و رکورد فروشندهٔ دیگر.
- Guards: 401 ناشناس روی هر سه؛ scoping مستقل هر فروشنده.

## تغییرات فرانت
- **`lib/download.ts` (جدید)**: `downloadBlob` به‌عنوان util مشترک (پیش از این در ۲ صفحه تکرار شده بود) — هر ۴ صفحهٔ CSV حالا از آن استفاده می‌کنند.
- **`services/sellerService.ts`**: helper داخلی `downloadCsv(path, params, fallback)` (حذف تکرار در ۴ تابع موجود) + سه تابع جدید: `exportSellerOrdersCsv`, `exportSellerInventoryCsv`, `exportSellerActivityCsv`.
- **صفحه‌ها**: دکمهٔ «خروجی CSV» + بنر موفقیت/خطا در `OrdersSeller` (با فیلترهای جاری)، `InventorySeller` (با فیلتر موجودی/جستجو)، `ActivitySeller`.
- **تست سرویس**: ۴ تست جدید (شامل fallback نام فایل وقتی هدر خالی است).

## دروازهها
- بک‌اند: **912/912** (۵۶ suite) | ESLint: ۰ خطا / ۶۶ هشدار (بدون هشدار جدید)
- فرانت: **167/167** | `tsc --noEmit` و `lint` پاک

## کامیت
- `feat(seller): CSV export coverage for orders, inventory, activity (stage 30, P1-02)`

## فایل‌ها
- بک‌اند: `backend/utils/csv.js` (جدید), `backend/services/OrderService.js`, `backend/controllers/SellerController.js`, `backend/routes/seller.js`, `backend/__tests__/seller-csv-exports.test.js` (جدید)
- فرانت: `frontend/src/lib/download.ts` (جدید), `frontend/src/services/sellerService.ts`, `frontend/src/pages/seller/{Orders,Inventory,Activity,SalesReport,Finance}Seller.tsx`, `frontend/src/services/__tests__/sellerService.test.ts`
- مستند: `docs/reports/NAKHSHA_STAGE30_CSV_EXPORTS.md`