# مرحله ۲۶ — رویدادهای فروشگاه (activity feed فروشنده)

**شاخه:** `feature/seller-dashboard` — **قبل از استیج ۲۶:** ۸۷۵/۸۷۵ بک‌اند (۵۱ suite)، ۱۵۹/۱۵۹ فرانت

## ایده و هدف
فروشنده (و مدیر فروشگاه) باید بداند در فروشگاهش چه گذشته است: هر تغییر محصول، اصلاح موجودی، تغییر وضعیت سفارش، تسویه، دعوت همکار و مدیریت دیدگاه که توسط مالک یا هر یک از اعضای تیم انجام می‌شود. تمام این عملیات از مرحلهٔ ۷ به بعد با `AuditService.log` ثبت می‌شوند؛ این مرحله یک فید فقط‌خواندنی و ایزوله از همین داده می‌سازد — بدون مدل و بدون روت جدید برای نوشتن.

## تغییرات بک‌اند
- **`services/AuditService.js`** — متد جدید `getTeamAuditLogs(userIds, {limit, skip, action})`: کوئری `AuditLog.findAll({userId: {$in}})`, مرتب نزولی `createdAt`, `select("-changes.before")` (هرگز مقادیر قبلی به کلاینت نمی‌رود) و شمارش `total`. همان شکل بازگشت دوقسمتی `{logs, total, limit, skip}` سرویس موجود.
- **`controllers/SellerController.js`** — هندلر `getActivity` + تبدیل `activityToDTO`:
  - اعضای رستر از `TeamMember.find({sellerProfileId: req.seller._id})` و مجموعهٔ userId = مالک + همهٔ اعضا؛
  - پاگینیشن `safePage/safePageSize`؛ خروجی `{items, total, page, limit}`؛
  - DTO: `id, action, riskLevel, result, resource{type,id}, after, metadata, endpoint, createdAt` — بدون `before` و بدون `strong`یت غیرضروری.
- **`routes/seller.js`** — `GET /api/seller/activity` با `requireAuth + requireRole("seller") + requireSellerProfile + requireManagerOrOwner` (فقط مالک/مدیر؛ staff → 403).

## تست‌ها — `__tests__/seller-activity.test.js` (۵ تست)
- Seed: فروشندهٔ صاحب + دو عضو تیم (manager و staff) + فروشندهٔ دیگر؛ رکوردهای Audit با `createdAt` صریح برای ترتیب قطعی (owner: PRODUCT_CREATED و STOCK_ADJUSTED؛ manager: PAYOUT_REQUESTED؛ فروشندهٔ دیگر: ORDER_STATUS_CHANGED).
- مالک: total=3، items به ترتیب نزولی جدید→قدیم، رکورد فروشندهٔ دیگر دیده نمی‌شود، هیچ آیتمی `before` ندارد، `after` و `riskLevel` سالم است.
- پاگینیشن page/limit (صفحهٔ ۲ با limit=2 → ۱ آیتم باقی‌مانده).
- manager عضو: می‌تواند فید کل فروشگاه را ببیند.
- staff عضو: 403.
- فروشندهٔ بدون پروفایل در این تست: 403 (ایزوله کامل).
- گیت کامل بک‌اند: **880/880** (۵۲ suite)؛ ESLint: ۰ خطا، ۶۶ هشدار (بدون هشدار جدید).

## تغییرات فرانت
- **`types/seller.ts`** — `SellerActivityItem`, `SellerActivityPage`, `SellerActivityParams`, `SellerActivityAction`, `ActivityRiskLevel`.
- **`services/sellerService.ts`** — `getSellerActivity({page, limit})` → `GET /seller/activity` با fallback خالی.
- **`pages/seller/ActivitySeller.tsx`** (جدید) — لیست رویدادها با نقشهٔ فارسی اکشن، بج سطح ریسک (LOW/MEDIUM/HIGH/CRITICAL)، لینک منبع، endpoint، نمایش خلاصهٔ `after` به‌صورت JSON و زمان `formatDateTime`؛ پاگینیشن قبلی/بعدی.
- **`App.tsx`** — lazy import + route `seller/activity`.
- **`components/seller/SellerLayout.tsx`** — آیتم ناو «رویدادها» با آیکن `History` زیر «گزارش فروش».
- گیت‌ها: تست جدید `getSellerActivity` در `sellerService.test.ts`؛ `tsc --noEmit` clean، `lint` clean، **160/160** تست.

## کامیت
- `feat(seller): store activity feed from the audit log (stage 26)`

## فایل‌ها
- بک‌اند: `backend/services/AuditService.js`, `backend/controllers/SellerController.js`, `backend/routes/seller.js`, `backend/__tests__/seller-activity.test.js` (جدید)
- فرانت: `frontend/src/types/seller.ts`, `frontend/src/services/sellerService.ts`, `frontend/src/pages/seller/ActivitySeller.tsx` (جدید), `frontend/src/App.tsx`, `frontend/src/components/seller/SellerLayout.tsx`, `frontend/src/services/__tests__/sellerService.test.ts`
- مستند: `docs/reports/NAKHSHA_STAGE26_STORE_ACTIVITY.md`