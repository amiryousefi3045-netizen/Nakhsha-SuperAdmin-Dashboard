# استیج ۳۲ — عملیات گروهی محصولات و سفارش‌ها (P1-06)

**شاخه:** `feature/seller-dashboard` — **وضعیت دروازه‌ها:** بک‌اند ۹۳۷/۹۳۷ (۵۸ suite) | فرانت ۱۷۳/۱۷۳ | ESLint: صفر خطا / ۶۶ هشدار (بدون تغییر نسبت به baseline)

## چرا این مرحله؟

باقی‌ماندهٔ P1-06 گزارش PDF: «اعمال تغییر وضعیت روی چند محصول/سفارش فقط با کلیک تک‌به‌تک ممکن است؛ عملیات گروهی وجود ندارد». برای یک فروشگاه با صدها محصول آستانه‌ای (pause) یا بایگانی، و برای توزیع‌کننده‌ای که روزی ده‌ها سفارش را باید «آماده‌سازی/ارسال» کند، تک‌به‌تک عملیات‌زَن‌زدن معنا ندارد.

دو اصل راهبر این مرحله:
1. **بک‌اند یگانه است**: هر دو ژست گروهی روی سرور از همان نهادهای «اعتبارسنجی وضعیت» و «گذار وضعیت» تکی استفاده می‌کنند — محصول از `VALID_PRODUCT_STATUSES`/قیدهای شاملی، سفارش از `OrderService.transitionOrder`. میان‌بری در لایهٔ API وجود ندارد.
2. **شکست جزئی، نه صفر-و-یک**: نتیجهٔ هر ردیف (موفق / بدون‌تغییر / ناموفق + دلیل) گزارش می‌شود تا فروشنده بداند دقیقاً کدام اقلام خورده‌اند و چرا.

## بک‌اند

### `controllers/SellerController.js`
- `BATCH_MAX_IDS = 50` — سقف هر درخواست، جلوگیری از بارگذاریِ یک‌جا.
- `normalizeBatchIds(ids)`: فقط رشته/عدد می‌پذیرد، dedup می‌کند، بعد از سقف ۵۰ هرس می‌کند و آرایهٔ تمیز برمی‌گرداند.
- `batchSummary(total, succeeded, skipped, failed)`: شکل یکسان خروجی برای هر دو مسیر.
- **`bulkUpdateProductStatus`** — `body: { ids, status }`:
  - وضعیت باید در `PRODUCT_STATUSES` باشد؛ برای هر ردیف: `UNCHANGED` اگر وضعیت فعلی همان درخواستی باشد، و `NOT_FOUND` برای محصولی که به این فروشنده تعلق ندارد — بدون نشت وجود (فیلتر روی `sellerId: req.seller._id`؛ پیدا نشدن ردیف = محصول وجود ندارد یا مال این فروشگاه نیست و پاسخ قابل استفاده برای probing نیست).
  - **سیاست گروهی همان سیاست تک‌تکی است**: دقیقاً مثل `updateProductStatus` هر وضعیتِ داخل enum پذیرفته می‌شود (این محدودیت انحصاری این مرحله نیست) و بعد از تغییر، `rejectionReason` پاک می‌شود. UI محصول با نقشهٔ `TRANSITIONS` دکمه‌های مجاز هر ردیف را محدود می‌کند؛ مسیر گروهی همان قابلیت را برای ژست‌های چندتایی می‌دهد.
  - **یک** ردیف ممیزی `DATA_BULK_OPERATION` به ازای کل ژست — نه ۵۰ ردیف — تا فید فعالیت را از استیج ۳۱ غرق نکند؛ ids موفق در `metadata.ids` جمع‌بندی می‌شود.
- **`bulkUpdateOrderStatus`** — `body: { ids, status, reason? }`، روی مسیر `requireManagerOrOwner`:
  - برای هر ردیف `OrderService.transitionOrder` واقعی صدا زده می‌شود؛ بنابراین قانون تکی (ماتریس گذارها، تأیید موجودی با رزرو، کنسل=آزادسازی موجودی) عیناً برقرار است.
  - خطاهای مسیر به‌صورت reason ردیف گزارش می‌شوند: `INVALID_TRANSITION`، `INSUFFICIENT_STOCK`، `NOT_FOUND`... و `skipped` اگر هدف برابر وضعیت فعلی باشد.
  - کل ژست یک ردیف ممیزی با `orderNumbers` می‌گیرد و `riskLevel` برای لغو/مرجوعی `HIGH` است (همان سیاست تک‌تکی).
  - `requireManagerOrOwner` چون این مسیر سفارش را به وضعیت‌های پولی/لغو می‌برد — هم‌سطح «تغییر وضعیت تک‌تکی».

### `routes/seller.js`
- `PATCH /api/seller/products/bulk-status` با `write` — **عمداً قبل از `/products/:id`** ثبت شده؛ در Express، `:id` می‌تواند `"bulk-status"` را ببلعد.
- `PATCH /api/seller/orders/bulk-status` با `write` + `requireManagerOrOwner`.

**یکدست‌سازی خروجی:** ردیف موفق محصول پیش‌تر یک رشتهٔ id خام بود در حالی که سفارش `{ id, orderNumber }` برمی‌گرداند. برای اینکه کلاینت یک شکل واحد ببیند، ردیف موفق محصول هم به `{ id }` تبدیل شد (تست و `metadata.ids` ممیزی هم به همان اندازه).

## فرانت

- `services/sellerService.ts`: `bulkUpdateSellerProductStatus(ids, status)` و `bulkUpdateSellerOrderStatus(ids, status, reason?)` — از همان `apiClient.patch`، با همان قوانین ساخت payload مسیر تک.
- `types/seller.ts`: `BulkActionResult` و `BulkRowOutcome` — یک شکل برای هر دو مسیر (ردیف succeeded/skipped/failed)، با `orderNumber` اختیاری برای سفارش‌ها.
- `hooks/useRowSelection.ts` (جدید): وضعیت انتخابِ `Set<string>` + `toggle`/`toggleAll`/`clear`/`count`. انتخاب فقط به **قاب‌رویت** وابسته است: «انتخاب همه» فقط ردیف‌های صفحهٔ جاری را درگیر می‌کند، و هر تغییر در صفحه/فیلترها `clear()` می‌شود تا عملیات هرگز روی انتخاب‌های کهنه اجرا نشود.
- `components/seller/BulkActionBar.tsx` (جدید): نوار ابزار انتخاب (شمارش + لغو انتخاب) و `BulkResultNotice` — خلاصهٔ یک‌بارِ نتیجه: تعداد موفق، لیست ناموفق‌ها با دلیل، و skipهای بلا-تغییر. در هر دو صفحهٔ Products و Orders و Inventory از همین دو ریاز استفاده می‌شود.
- اتصال به سه صفحه:
  - `ProductsSeller.tsx`: فعال‌سازی / توقف فروش / بایگانی.
  - `OrdersSeller.tsx`: تأیید / آماده‌سازی / ثبت ارسال / لغو — ردیف لغو قرمز است.
  - `InventorySeller.tsx`: از همان endpoint محصولات (فعال‌سازی / توقف / بایگانی) — موجودی، بخشی از محصول است.

## تست‌ها

### بک‌اند — `backend/__tests__/seller-bulk-actions.test.js` (۱۴ تست، جدید)

فیکسچرهای این تست **فریبنده‌اند**: اولین نسخه سفارش‌ها را با `Order.create` خام می‌ساخت که `reserved: 0` داشت، پس لغو با خطای «موجودی ناکافی» به‌گل نمی‌خورد و تست از هر دو طرف — هم از سرور واقعی محروم بود و هم سناریوی واقعی را تمرین نمی‌کرد. نسخهٔ نهایی سفارش‌ها از `OrderService.createOrder` + `transitionOrder` ساخته می‌شوند، پس رزروِ موجودی واقعی است و مسیر لغو واقعاً موجودی را آزاد می‌کند.

- **محافظت**: 401 بی‌توکن؛ 400 برای ids خالی/نامعتبر؛ 400 وضعیت خارج از مجاز؛ staff برای مسیر سفارش 403.
- **محصولات**: مخلوطی از ردیف‌های موفق/بدون‌تغییر/ناموجود؛ محصول فروشندهٔ دیگر فقط `NOT_FOUND` گزارش می‌شود و دست نمی‌خورد؛ پاک‌شدن `rejectionReason` پس از تغییر؛ dedup و سقف ۵۰؛ فقط **یک** ردیف ممیزی برای کل ژست.
- **سفارش‌ها**: ردیف‌های مجاز می‌چرخند و ردیف‌های در وضعیت نادرست `INVALID_TRANSITION` می‌گیرند؛ کنسل/آماده‌سازی واقعی (بررسی موجودی)؛ وضعیت نامعتبر → 400؛ سفارش بیگانه → `NOT_FOUND`؛ ردیف ممیزی حاوی `orderNumbers` واقعی.

### فرانت — `sellerService.test.ts` (+۳)
- PATCH مسیر محصولات با `ids` و `status` و تفسیر خلاصه؛ انتقال `reason` روی مسیر سفارش‌ها و حفظ شکست جزئی؛ حذف `reason` وقتی داده نشده.

## وضعیت دروازه‌ها
- بک‌اند: **937/937** (۵۸ suite) | ESLint: صفر خطا / ۶۶ هشدار (بدون تغییر نسبت به baseline)
- فرانت: **173/173** | `tsc --noEmit` و `lint` تمیز

## پیام کامیت
`feat(seller): bulk selection actions for products and orders (stage 32, P1-06)`

## فایل‌های کلیدی
- بک‌اند: `backend/controllers/SellerController.js`، `backend/routes/seller.js`، `backend/__tests__/seller-bulk-actions.test.js` (جدید)
- فرانت: `frontend/src/services/sellerService.ts`، `frontend/src/types/seller.ts`، `frontend/src/hooks/useRowSelection.ts` (جدید)، `frontend/src/components/seller/BulkActionBar.tsx` (جدید)، `frontend/src/pages/seller/{ProductsSeller,OrdersSeller,InventorySeller}.tsx`، `frontend/src/services/__tests__/sellerService.test.ts`

## بدهی شناخته‌شده (خارج از محدودهٔ این مرحله)
- «کلیدهای» محصولات/سفارش‌ها فقط ids هستند؛ بدنهٔ bulk-size (بالای ۵۰) به چند ردیف درخواست نیاز دارد (UI این مرحله عمداً صفحه‌به‌صفحه انتخاب می‌کند تا سقف ۵۰ رد نشود).
- select-all «همهٔ صفحات» (فراتر از صفحهٔ جاری) کلاینت را به شکاف صفحه‌ها می‌کشاند؛ این مرحله عمداً محدود به قاب‌رویت است تا انتخاب بدیهی دروغ نباشد.
- `ProductsSeller` هنوز در حالت‌های جداگانهٔ خود، بایگانی تک را از `deleteSellerProduct` انجام می‌دهد؛ مسیر گروهی مستقیم `archived` می‌زند — رفتار، ممیزی و مسیر پایانی هر دو در این مرحله بررسی شده‌اند.