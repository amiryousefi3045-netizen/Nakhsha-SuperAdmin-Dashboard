# مرحله ۲۳ — فاکتور ایمیل پس از پرداخت موفق

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۳:** ۸۵۷/۸۵۷ بک‌اند، ۱۵۷/۱۵۷ فرانت

## هدف
بستن حلقهٔ خرید: بعد از اینکه callback پرداخت (SUCCESS) سفارش ویترینی را پرداخت‌شده می‌کند، خریداری که ایمیل دارد یک فاکتور اقلام‌به‌اقلام HTML می‌گیرد. فاکتور یک رکورد اعلان با `reason: "invoice"` در کانال ایمیل است که روی همان موتور اتمیک claim مراحل ۱۹–۲۲ (attempts/backoff/retry/صف) تحویل می‌شود؛ HTML در زمان تحویل از اسنپ‌شات سفارش ساخته می‌شود و نسخهٔ متنی در `message` رکورد می‌ماند.

## تغییرات بک‌اند
- **`services/email/invoiceHtml.js`** (جدید):
  - `buildInvoiceText(order)` — فاکتور متنی فارسی (شماره سفارش، فروشگاه، اقلام، جمع هاس، مبلغ نهایی، وضعیت)؛ همان نسخه داخل `message` رکورد.
  - `buildInvoiceHtml(order)` — فاکتور RTL کامل: هدر نخشا، شماره سفارش، نام فروشگاه، جدول اقلام (عنوان/تعداد/قیمت واحد/جمع)، جدول مجموعات (جمع/ارسال/تخفیف/نهایی)، وضعیت پرداخت.
- **`models/Order.js`** — فیلد `sellerStoreName` (اسنپ‌شات نام فروشگاه در checkout برای نمایش در فاکتور).
- **`services/StorefrontOrderService.js`**:
  - در `createBuyerOrder` نام فروشگاه روی سفارش می‌نشیند؛
  - در `submitPaymentResult` — شاخهٔ SUCCESS: اگر `hasEmailTarget` برقرار باشد، رکورد ایمیل `{ channel: "email", status: order.status, to, reason: "invoice" }` push و سپس kick آتش‌به‌سوز تحویل (همان الگوی `transitionOrder`). پرداخت FAIL فاکتوری نمی‌سازد.
- **`services/email/emailSender.js`** — `sendEmail` گزینهٔ `meta.html` را می‌پذیرد و در payload زنده (`html:` field) و لاگ (`hasHtml`) ضبط می‌کند؛ mock بی‌تغییر.
- **`services/NotificationService.js`** — ثابت `INVOICE_REASON = "invoice"` و `buildInvoiceSubject` («نخشا | فاکتور سفارش {شماره}»)؛ در حلقهٔ تحویل: `message` برای رکورد فاکتور از `buildInvoiceText` و dispatch ایمیل از `sendEmail(..., { html: buildInvoiceHtml(order) })` با `kind: "invoice"`. رکوردهای فاکتور status خود را از وضعیتِ موقعِ پرداخت (pending) می‌گیرند و گارد «رکورد pending روی سفارش غیرpending» (مرحلهٔ ۲۰) مانع فاکتورِ سفارشِ لغوشده می‌شود.
- صادرات جدید `INVOICE_REASON`، `buildInvoiceSubject`، `buildInvoiceText`، `buildInvoiceHtml`.

## تست‌ها
- **`__tests__/invoice-email-notifications.test.js`** (۷ تست):
  - builders: متن فارسی با اعداد fa-IR و مجموعات درست؛ HTML با `dir="rtl"`، نام فروشگاه، ردیف اقلام و مبلغ نهایی.
  - چرخهٔ HTTP: callback SUCCESS → رکورد فاکتور (channel email، to، status pending) و تحویل؛ خریدار بدون ایمیل → بدون فاکتور؛ پرداخت FAIL → بدون فاکتور.
  - robustness: با `EMAIL_MOCK_FAIL` رکورد error می‌گیرد و صف مرحلهٔ ۱۹ آن را روی تلاش بعدی delivers می‌کند.
  - رسید خریدار `reason: "invoice"` را نشان می‌دهد.
- تست‌های مراحل ۱۸–۲۲ (۴۱ تست) بدون تغییر سبز ماندند.
- گیت کامل بک‌اند: **864/864** (۵۰ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`pages/storefront/BuyerOrderPage.tsx`** — رکورد با `reason === "invoice"` برچسب «فاکتور سفارش» می‌گیرد.
- **`pages/admin/NotificationQueueAdmin.tsx`** — در ستون «دلیل»، رکوردهای فاکتور تگ آبی «فاکتور» می‌گیرند.
- گیت‌ها: `tsc --noEmit` clean، `lint` clean، **157/157** تست.

## کامیت
- `feat(storefront): itemised email invoice on successful payment (stage 23)`

## فایل‌ها
- بک‌اند: `backend/services/email/invoiceHtml.js` (جدید), `backend/services/email/emailSender.js`, `backend/services/NotificationService.js`, `backend/services/StorefrontOrderService.js`, `backend/models/Order.js`, `backend/__tests__/invoice-email-notifications.test.js` (جدید)
- فرانت: `frontend/src/pages/storefront/BuyerOrderPage.tsx`, `frontend/src/pages/admin/NotificationQueueAdmin.tsx`
- مستند: `docs/reports/NAKHSHA_STAGE23_EMAIL_INVOICE.md`