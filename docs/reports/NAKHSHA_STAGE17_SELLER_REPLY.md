# گزارش مرحلهٔ ۱۷ — پاسخ فروشنده به دیدگاه‌ها (Seller Reply)

**وضعیت:** کامل ✅  
**شاخه:** `feature/seller-dashboard`  
**زمان:** ساختمان‌سازیِ مرحله‌به‌مرحلهٔ ویترین نخشا

## هدف

مرحلهٔ ۱۶ فروشنده را قادر کرد دیدگاه‌ها را ببیند و مخفی/نمایان کند، اما هیچ راهی برای پاسخ دادن به خریدار نبود. این مرحله «پاسخ فروشگاه» (یک پاسخ در هر دیدگاه، قابل ویرایش/حذف) را اضافه می‌کند و آن را زیر دیدگاه در ویترین محصول نمایش می‌دهد — حلقهٔ بازخورد خریدار ⇄ فروشنده با یک مکانیزم واحد.

## طراحی کلیدی

- **یک پاسخ در هر دیدگاه (upsert-style):** اولین ثبت `createdAt` را حک می‌کند؛ بازنویسی‌ها فقط `updatedAt` را جابه‌جا می‌کنند. هیچ پاسخ دومی هرگز ساخته نمی‌شود — دقیقاً همان الگوی «یک دیدگاه در هر خریدار» در مرحلهٔ ۱۴.
- **مالکیت در سرویس:** هر دو عملیات روی `{_id, sellerId}` اجرا می‌شوند (فیلتر `sellerId` از `req.seller._id`)؛ دیدگاهِ فروشگاه دیگر → `404 REVIEW_NOT_FOUND`.
- **گیتِ عمومی:** پاسخ فقط وقتی به‌همراه DTOی عمومی بیرون می‌آید که خودِ دیدگاه `published` باشد (`sellerReplyDTO` همیشه بی‌رنگ `null` در غیر آن). دیدگاهِ مخفی با پاسخش در لیست عمومی هرگز دیده نمی‌شود؛ اما خریدارِ مالک همچنان پاسخ را در «دیدگاه من» می‌بیند (نخِ گفتگوی خودش).
- **پاسخ روی سنجه‌ها اثر ندارد:** بازمحاسبهٔ امتیازها فقط متکی بر `rating`/`status` است؛ پاسخ صرفاً محتوای نمایشی است.
- **درزِ مسیر:** `PUT`/`DELETE /seller/reviews/:id/reply` هر دو با `write` (rate-limited) و `requireManagerOrOwner`؛ طول پاسخ ۵۰۰ کاراکتر، متن خالی نامعتبر.
- **رفع نامحسوس مرحلهٔ ۱۶:** اکشن‌های مدیریتبازبینی در enumِ `AuditLog.action` سوخته نشده بودند و `AuditService.log` شکستِ سیلنت را می‌بلعید (خطای «Failed to create audit log» فقط لاگ می‌شد). این مرحله سه اکشن (`REVIEW_VISIBILITY_CHANGED`، `SELLER_REVIEW_REPLIED`، `SELLER_REVIEW_REPLY_REMOVED`) را به enum اضافه می‌کند تا رویدادهای مرحلهٔ ۱۶ و ۱۷ واقعاً ثبت شوند.

## تغییرات بک‌اند

- `models/Review.js`: زیرسند `sellerReply: { comment (maxlength ۵۰۰), createdAt, updatedAt }`.
- `services/StorefrontReviewService.js`:
  - `sellerReplyDTO(review)` — بلاک پاسخ یا `null`؛ به `reviewToPublicDTO` و `reviewToSellerDTO` هردو تزریق شد.
  - `setSellerReply({ reviewId, sellerId, comment })` — اعتبارسنجی خالی/طول، مالکیت، سپس `$set` روی `sellerReply.*` با حفظ `createdAt`؛ خروجی DTOی فروشنده با زمینهٔ محصول.
  - `removeSellerReply({ reviewId, sellerId })` — `$unset` با `new:true`؛ در یادِ غیب‌پاسخ هم idempotent و `sellerReply: null`.
- `controllers/SellerController.js`: هندلرهای `setSellerReviewReply` (PUT) و `deleteSellerReviewReply` (DELETE) با اعتبارسنجی `ObjectId.isValid`، نگاشت خطاهای سرویس (400/404) و ثبت رویداد audit.
- `routes/seller.js`: `PUT /reviews/:id/reply` و `DELETE /reviews/:id/reply` (هر دو با `write` + `requireManagerOrOwner`).
- `models/AuditLog.js`: اکشن‌های review moderation به enum اضافه شد.

## تغییرات فرانت‌اند

- `types/seller.ts`: `SellerReply` + فیلد `sellerReply` روی `SellerReview`.
- `types/storefront.ts`: `sellerReply` اختیاری روی `ReviewItem`.
- `services/sellerService.ts`: `updateSellerReviewReply(id, comment)` و `deleteSellerReviewReply(id)`.
- `pages/seller/ReviewsSeller.tsx`: دکمهٔ «پاسخ/ویرایش» در هر ردیف، نشانِ خلاصهٔ «پاسخ شما» در دیدگاه، و دیالوگ پاسخ (textarea با شمارندهٔ ۵۰۰ کاراکت، ذخیره/به‌روزرسانی، حذف با تأیید، پیام خطا) + باز-refetch خودکار.
- `pages/storefront/StorefrontProductPage.tsx`: `ReviewCard` بلاک «پاسخ فروشگاه» را با زمان پاسخ زیر دیدگاه نمایش می‌دهد.

## آزمون‌ها و گیت‌ها

- **بک‌اند:** ۱۱ تست جدید reply (حفاظت 401/403، ایجاد/به‌روزرسانی با حفظ `createdAt`، 400 برای خالی/بلند بودن، 404 برای غیرمالک/ناشناخته، 400 برای id بدساخت، حذف idempotent، نمایش عمومیِ پاسخ برای `published`، عدم‌نشتیِ پاسخِ دیدگاهِ مخفی در لیست عمومی با دیده‌شدنش در «دیدگاه من») → کل سویت **۸۰۴/۸۰۴** در ۴۴ سوئیت؛ ESLint: ۰ خطا (۶۶ هشدار از قبل).
- **فرانت‌اند:** ۲ تست سرویس جدید → **۱۵۵/۱۵۵**؛ `typecheck` و `lint` هر دو پاک.

## صحنهٔ بعدی

حلقهٔ بازخورد خریدار ⇄ فروشنده کامل است (ثبت، مدیریتبازبینی، پاسخ). پیشنهادهای بعدی:
1. **اعلان تغییر وضعیت سفارش به خریدار** (SMS/ایمیل) — تأیید/ارسال/تحویل/لغو با `orderLabels` مشترک.
2. **درگاه پرداخت واقعی** + ردیابی درآمد/payout سفارش‌های ویترینی.
3. **گرایشِ شکایات برای فروشنده** (میانگین امتیاز به‌تفکیک محصول + سیگنال پاسخ‌داده‌نشده).