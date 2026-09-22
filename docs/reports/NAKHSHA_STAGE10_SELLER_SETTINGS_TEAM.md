<!--
  جهت نمایش صحیح متن فارسی راست‌به‌چپ در ویرایشگرهای Markdown پشتیبانی‌شده، روی هر پاراگراف
  از میان‌بر «دو طرفه» استفاده شده است. گزارش‌های فنی نخشا مطابق کنوانسیون RTL نوشته می‌شوند.
-->

# گزارش مهندسی — مرحله ۱۰: تنظیمات و اعضای تیم فروشنده

<div dir="rtl">

> **خلاصه مدیریتی:** در این مرحله آخرین دامنه‌ی «برنامه‌ریزی‌شده» در ناوبری فروشنده به
> بلوغ رسید. فروشنده اکنون می‌تواند تنظیمات فروشگاه (انتشار ویترین، اعلان‌ها، روش پیش‌فرض تسویه)
> را مدیریت کند و کاربران فرعی را به تیم خود دعوت کند (نقش‌های **مدیر / کارمند**) با یک
> ماتریس دسترسی سخت و تمام‌ممیزی‌شده. زیرساخت عضویت (TeamMember) به هسته‌ی احراز فروشنده وصل
> شد تا دشبورد و دامنه‌های دیگر برای اعضای تیم باز شود و بخش‌های مالی/تسویه، تیم و نوشتنِ
> تنظیمات فقط برای مالک بماند. بک‌اند **645/645**، فرانت‌اند **122/122** و ESLint هر دو سمت
> سبز است.

---

## ۱. موقعیت در نقشه‌ی راه

| فاز | وضعیت |
| --- | --- |
| 10.1 — مدل TeamMember، زیرسند settings در SellerProfile و توسعه‌ی enum ممیزی | ✅ انجام و تأییدشده |
| 10.2 — SettingsService (تنظیمات/تیم) + Membership در requireSellerProfile + میان‌افزارهای نقش | ✅ انجام و تأییدشده |
| 10.3 — مسیرها و کنترلرهای `/api/seller/settings` و `/api/seller/team` + قفل مالی/تیم/تنظیمات | ✅ انجام و تأییدشده |
| 10.4 — تست‌های واحد و یکپارچه (43 تست تازه) + پشته‌ی کامل بک‌اند سبز | ✅ انجام و تأییدشده |
| 10.5 — تایپ‌ها، سرویس کلاینت، صفحه‌ی «تنظیمات» دو زبانه، ناوبری و مسیر | ✅ انجام و تأییدشده |
| 10.6 — راستی‌آزمایی کامل، گزارش RTL، ثبت و ارسال (commit + push) | ✅ انجام و تأییدشده |

> ادامه دارد: **ویترین فروشگاه (storefront/catalog عمومی)** — استفاده از پرچم
> `storefrontPublished` که در همین مرحله ساخته شد.

---

## ۲. معماری و کارهای انجام‌شده

### ۲.۱ مدل‌ها (10.1)

- **`backend/models/TeamMember.js`** (جدید) — مدل عضویت کاربر فرعی:
  - `sellerProfileId` + `userId` (ارجاع به User)، `role` از enum
    `["manager","staff"]` با پیش‌فرض `staff`، `note` (حداکثر ۳۰۰ کاراکتر)، برچسب‌های زمانی.
  - ایندکس‌ها: `{userId:1}` **unique** (هر کاربر فقط عضو یک فروشگاه) ،
    `{sellerProfileId:1,userId:1}` unique ، `{sellerProfileId:1,createdAt:-1}`
    (مرتب‌سازی فهرست تیم).
  - کتابخانه‌ی `<NavItem>`: صادر `TEAM_ROLES` برای مصرف در فرانت‌اند.
- **`backend/models/SellerProfile.js`** — زیرسند `settings` پس از `finance` اضافه شد:
  `storefrontPublished` (بولی، پیش‌فرض false) ، `notificationEmail` (true) ،
  `notificationSms` (false) ، `defaultPayoutMethod` (enum
  bank_transfer/card/wallet/other، پیش‌فرض bank_transfer). برخلاف طرح اولیه،
  `lowStockThreshold` **حذف شد** چون از قبل به‌صورت per-product وجود دارد.
- **`backend/models/AuditLog.js`** — سه‌گانه‌ی اکشن: `SELLER_SETTINGS_UPDATED`،
  `TEAM_MEMBER_INVITED`، `TEAM_MEMBER_ROLE_CHANGED`، `TEAM_MEMBER_REMOVED` (پس از
  PAYOUT_STATUS_CHANGED) و دو مقدار جدید برای `resourceSchema.type`:
  `SELLER_PROFILE` و `TEAM_MEMBER`. این افزودن یک **اشکال نهفته** را هم رفع کرد: ممیزی‌های
  فروشنده تاکنون با نوع SELLER_PROFILE نوشته می‌شدند، حال آن‌که enum این رشته را نمی‌پذیرفت
  و AuditService خطا را فرو می‌داد («Failed to create audit log»).

### ۲.۲ سرویس تنظیمات و تیم (10.2)

`backend/services/SettingsService.js` (جدید):

- **`getSettings(profile)`** — ادغام `SETTINGS_DEFAULTS` با فیلدهای ذخیره‌شده (زیرسند
  جزئی است، نه کامل).
- **`updateSettings(profile, patch)`** — با `normalizeSettings`: کلیدهای ناشناخته دور ریخته
  می‌شوند، بولی‌ها سخت‌گیرانه‌ی `true/false` اعتبارسنجی و روش تسویه در enum بررسی می‌شود
  (غیر آن `SettingsDomainError`). BODY خالی/بدون کلید قابل‌پذیرش → `EMPTY_UPDATE` (400).
  **به‌روزرسانی جزئی با `$set` مسیر نقطه‌دار** (مثلاً `{ "settings.defaultPayoutMethod": v }`)
  انجام می‌شود تا کلیدهای دیگر پاک نشوند؛ خروجی DTO باز ادغام‌شده است.
- **`listTeam(profile)`** — ردیف‌های تیم (مرتب بر createdAt نزولی) + `owner` (مالک واقعی
  پروفایل) تا فرانت بتواند کارت مالک را جدا نشان دهد.
- **`inviteTeam({ profile, phone, role, note })`** — قوانین سخت:
  - تلفن اجباری و ایرانی: `/^09\d{9}$/` (رقم نرمال‌سازی شده)؛ ناهم‌خوان → `INVALID_PHONE` (400).
  - `role` نامعتبر → پیش‌فرض `staff`؛ کاربر باید وجود داشته باشد
    (`TEAM_MEMBER_USER_NOT_FOUND` 404)؛ دعوت از خود → `TEAM_MEMBER_SELF_INVITE` (400)؛
    کاربر با نقش admin/super_admin → `TEAM_MEMBER_INVALID_USER` (400)؛ کاربری که خودش
    فروشگاه دارد → `TEAM_MEMBER_IS_OWNER` (400)؛ کاربری که عضو هر فهرستی است →
    `TEAM_MEMBER_ALREADY_EXISTS` (409).
  - کاربر عادی (نقش `user`) هنگام دعوت به نقش **فروشنده (seller) ارتقا می‌یابد** و این در
    متادیتای ممیزی و پاسخ (`roleChanged`) گزارش می‌شود — لازمه‌ی عبور از `requireRole("seller")`.
- **`changeTeamRole`** / **`removeTeamMember`** — تغییر نقش با خروجی `{ member, from }`
  برای ثبت ممیزی `from → to`؛ حذف نرم/سخت‌حذف کامل رکورد عضویت. شناسه‌ی ناشناخته یا مربوط
  به فروشگاه دیگر → `TEAM_MEMBER_NOT_FOUND` (404).

### ۲.۳ عضویت، نقش‌ها و ماتریس دسترسی (10.2)

- `requireSellerProfile` در `backend/middleware/seller.js` اکنون **عضویت را حل می‌کند**:
  ابتدا پروفایل مالک (که از TokenManager مشخص است)، درغیراین‌صورت جستجوی TeamMember با
  `userId` و بارگذاری پروفایل فروشگاه؛ خروجی شامل `req.seller` و `req.sellerMember =
  { id, userId, role }` (برای مالک صریحاً null). بررسی تعلیق روی هر دو مسیر اعمال می‌شود؛
  اگر هیچ مسیری نبود → 403 `SELLER_PROFILE_REQUIRED`.
- دو میان‌افزار نقش جدید:
  - `requireOwnerOnly` → 403 `FORBIDDEN` با پیام «این بخش فقط برای مالک فروشگاه در دسترس است».
  - `requireManagerOrOwner` → 403 `FORBIDDEN` با `requiredRole: manager`.
- **ماتریس قابلیت** (در تست‌ها قطعی): مالک همه‌چیز؛ اعضا دشبورد/سفارش/محصولات/انبار را
  می‌بینند؛ کارمند از `changeOrderStatus` و آنالیتیکس مسدود است؛ همه‌ی اعضا از مالی/تسویه،
  سطح تیم و **نوشتن** تنظیمات مسدودند ولی **خواندن** تنظیمات برای همه باز است (چون
  `defaultPayoutMethod` برای فرم تسویه لازم است).

### ۲.۴ API سمت سرور (10.3)

مسیرهای `backend/routes/seller.js` (همه با زنجیره‌ی احراز `authRequired + requireRole("seller")`،
علاوه بر آن‌ها به‌صورت جداگانه ذکر شده):

| متد | مسیر | دسترسی |
| --- | --- | --- |
| GET | `/api/seller/settings` | read (همه‌ی اعضا) |
| PATCH | `/api/seller/settings` | write + `requireOwnerOnly` |
| GET | `/api/seller/team` | OwnerOnly (فهرست تیم شامل owner) |
| POST | `/api/seller/team` | OwnerOnly (دعوت) |
| PATCH | `/api/seller/team/:id/role` | OwnerOnly |
| DELETE | `/api/seller/team/:id` | OwnerOnly |

و قفل‌گذاری محدوده‌های حساسِ موجود: فایننس و همه‌ی مسیرهای payouts
(فهرست/درخواست/لغو) → `requireOwnerOnly`؛ تغییر وضعیت سفارش و آنالیتیکس →
`requireManagerOrOwner`.

`controllers/SellerController.js` — شش handler تازه (`getSettings`، `updateSettings`،
`listTeam`، `inviteTeam`، `changeTeamRole`، `removeTeamMember`) + نقشه‌ی خطای
`SETTINGS_ERROR_STATUS` (VALIDATION_ERROR→400 ، INVALID_PHONE→400 ،
TEAM_MEMBER_ALREADY_EXISTS→409 ، … NOT_FOUND→404) + کمکی `settingsError`.
ممیزی‌ها: `SELLER_SETTINGS_UPDATED` با `updatedFields` (فیلترشده با `SETTINGS_KEYS`) و
ریسک LOW؛ `TEAM_MEMBER_INVITED` با `{ userId, name, role, roleChanged }`؛
`TEAM_MEMBER_ROLE_CHANGED` با `{ from, to }`؛ `TEAM_MEMBER_REMOVED` با `{ userId, role }`.
و پایان‌بندی: به‌درخواست الفای، `FinanceService.requestPayout` وقتی `method` غایب/نامعتبر است
به `profile.settings.defaultPayoutMethod` برمی‌گردد (فقط در `requestPayout` با
`select("finance settings")`).

### ۲.۵ تست‌های بک‌اند (43 تست تازه، پشته 645/645)

- **واحد** (`backend/__tests__/settings-unit.test.js`، 21 تست): پیش‌فرض‌ها؛ به‌روزرسانی جزئی؛
  بولی‌ها؛ روش نامعتبر؛ به‌روزرسانی خالی؛ فهرست تیم؛ دعوت (ارتقا، نقش ناشناخته، تلفن نامعتبر،
  کاربر ناموجود، خود، admin، کاربري که فروشگاه خودش را دارد، تکراری)؛ تغییر نقش و نامعتبر؛
  حذف و حذفِ خارج از فروشگاه؛ و فال‌بک `requestPayout` به روش پیش‌فرض + روش صریح.
  Helpers: `makeProfile` یک کاربر واقعی با نقش `seller` می‌سازد؛ `makeUser` تلفن ۱۱ رقمی
  (`09` + ۹ رقم شانسی) و handle با پیشوند `user_` تولید می‌کند.
- **یکپارچه** (`backend/__tests__/settings-team.test.js`، 22 تست HTTP): قرارداد پاکت پاسخ؛
  تنظیمات (خواندن، به‌روزرسانی، بسته‌شدنِ نوشتن برای عضو 403)؛ تیم (دعوت، فهرست، تغییر نقش،
  حذف، 404/409/400)؛ ممیزی هر چهار اکشن؛ ماتریس قابلیت (دشبورد کارمند 200، آنالیتیکس مدیر
  200 / کارمند 403، وضعیت سفارش کارمند 403 ولی مدیر 200، قفل کامل فایننس/پرداخت برای اعضا)؛
  و تسویه با روش پیش‌فرض از سطح API. تلفن‌های ثابت 09147000030..35 برای
  seller/manager/staff/plain/otherOwner/admin تخصیص یافته‌اند.
- **عیب‌یابی در مسیر سبز شدن (سه درس آموخته‌ی مهم):**
  ۱) **پاکت پاسخ:** نقاط فروشنده از `createSuccessResponse` استفاده می‌کنند که payload را
  **هم‌سطح** پخش می‌کند —`{ success, reqId, ...data }` — و نه `{ data: {...} }`. ادعاها باید
  `res.body.settings` ، `res.body.member` ، `res.body.items` را بخوانند (نه `res.body.data.*`).
  ۲) **enum ممیزی:** نبودِ SELLER_PROFILE در enumِresource باعث شکست صامتِ ممیزی می‌شد؛
  افزودن به enum نقص را بست.
  ۳) **نشت وضعیت:** تنظیمات مالک بین تست‌ها باقی می‌ماند — `wipeDomain` اکنون تنظیمات را به
  پیش‌فرض برمی‌گرداند. هم‌چنین تلفن ۱۰ رقمی (قدیمی) با ۱۱ رقمیِ ایرانی جایگزین شد.

### ۲.۶ رابط کاربری (10.5)

- **تایپ‌ها** (`frontend/src/types/seller.ts`): `SellerSettings`، `SellerSettingsUpdate`،
  `TeamMemberRole`، `TeamMember`، `SellerTeam`، `InviteTeamMemberInput`.
- **سرویس کلاینت** (`frontend/src/services/sellerService.ts`): شش متد تازه —
  `getSellerSettings` ، `updateSellerSettings` ، `getSellerTeam` ، `inviteSellerTeamMember` ،
  `changeSellerTeamMemberRole` ، `removeSellerTeamMember`.
- **برچسب‌ها** (`frontend/src/lib/sellerFormat.ts`): `TEAM_ROLE_LABEL` («مدیر»/«کارمند») و
  `TEAM_ROLE_TONE` (آبی/خاکستری).
- **صفحه‌ی جدید** `frontend/src/pages/seller/SettingsSeller.tsx` با دو زبانه:
  - **تنظیمات فروشگاه:** سوییچ‌های انتشار ویترین، اعلان ایمیل و اعلان پیامک + انتخابگر روش
    پیش‌فرض تسویه + دکمه‌ی ذخیره با پیام موفقیت/خطا؛ یادداشت توضیحی که روش پیش‌فرض فقط بر
    درخواست‌های تسویه‌ی آینده اثر می‌گذارد.
  - **اعضای تیم:** فرم دعوت (تلفن با حذف خودکار کاراکترهای غیررقمی، انتخاب نقش، یادداشت
    اختیاری)، کارت مالک، جدول اعضا با تغییر نقش درجا و حذفِ تأییددار.
- **ناوبری/مسیریابی:** آیتم «تنظیمات» در `SellerLayout` از حالت «برنامه‌ریزی» خارج شد،
  پرچمِ مرده‌ی `planned` و نشان «برنامه‌ریزی» از کامپوننت حذف شدند، مسیر lazy در `App.tsx`
  به `SettingsSeller` وصل شد و `PlannedDomainPage.tsx` (که دیگر پس از حذفِ آخرین دامنه‌ی
  برنامه‌ریزی‌شده کاربرد نداشت) **حذف شد**.
- **پیش‌فرض تسویه در `FinanceSeller.tsx`:** هنگام بارگذاری، `getSellerSettings` خوانده و
  `method` فرم از `defaultPayoutMethod` مقداردهی اولیه می‌شود (در شکست، `bank_transfer` می‌ماند).
- **تست سرویس** (`sellerService.test.ts`، 7 تست تازه): خواندن تنظیمات، به‌روزرسانی جزئی،
  فهرست تیم (با owner)، دعوت (با و بدون note)، تغییر نقش، حذف عضو.

---

## ۳. چرا مدل عضویت مستقل از Storefrontpublished است؟

ماتریس دسترسی تلاش می‌کند «اعتمادِ گسترده ولی مالیِ محدود» باشد: اعضای تیم باید بتوانند در
عملیات روزمره (سفارش، انبار، محصول) کار کنند، اما **چشمه‌ی پول** (`requestPayout`، وضعیت
تسویه)، ترکیب تیم و تغییر تنظیمات که «چه کسی پول را می‌گیرد و فروشگاه چطور دیده می‌شود» را
تعیین می‌کنند، فقط مالک تصمیم می‌گیرد. منع دعوتِ «کاربری که خودش مالک است» و منع عضویت دوم
(`{userId:1}` unique) هم از دو نشت رایج جلوگیری می‌کنند: تسویه‌های موازی و نمای دوگانه‌ی
دشبورد. فهرست بریدن ها (blockerها) در unit و integration هر دو به‌تفصیل تست شد.

---

## ۴. دروازه‌های کیفیت و اعداد نهایی

| دروازه | نتیجه |
| --- | --- |
| بک‌اند: پشته‌ی کامل Jest | ✅ **645/645 تست — 0 شکست** (602 مرحله‌۹ + 43 تازه) |
| بک‌اند: ESLint فایل‌های تغییریافته | ✅ بدون خطا |
| تست واحد تنظیمات/تیم (`settings-unit`) | ✅ 21/21 |
| تست یکپارچه‌ی تنظیمات/تیم (`settings-team`) | ✅ 22/22 |
| فرانت‌اند: `npm run typecheck` (tsc) | ✅ بدون خطا |
| فرانت‌اند: `npm run lint` | ✅ بدون خطا |
| فرانت‌اند: ویتس | ✅ **122/122 — 6 فایل** (7 تست سرویس تازه) |

### الزامات تازه و ستون‌های درجا (همان‌طور که درخواست شد)

- ✅ تست‌به‌پیش؛ هر گام فقط پس از سبز شدنِ ۱۰۰٪ دروازه‌ها بسته شد؛ خطاهای اولیه (پاکت پاسخ،
  enum ممیزی، تلفن ۱۰ رقمی، نشت تنظیمات) ریشه‌یابی و به‌درستی اصلاح شدند — نه با ضعیف‌کردن ادعا.
- ✅ کل مدل عضویت و ماتریس دسترسی در هر دو لایه‌ی unit و HTTP تست شد (حضور مالک، نقش‌ها،
  باز/بسته‌شدن محدوده‌ها).
- ✅ هیچ بازگشتی در سوئیت‌های پیشین (مالی، سفارش، ممیزی، مرحله‌۹) رخ نداد.
- ✅ صفحه‌ی قدیمی «برنامه‌ریزی» حذف و هیچ مسیر/نمای مرده‌ای باقی نماند؛ `typecheck` و `lint`
  هر دو بدون خطا.

---

## ۵. فایل‌های کلیدی

| بخش | فایل‌ها |
| --- | --- |
| مدل‌ها | `backend/models/TeamMember.js` (جدید) ، `backend/models/SellerProfile.js` ، `backend/models/AuditLog.js` |
| سرویس + میان‌افزار + مسیرها + کنترلر | `backend/services/SettingsService.js` (جدید) ، `backend/services/FinanceService.js` ، `backend/middleware/seller.js` ، `backend/routes/seller.js` ، `backend/controllers/SellerController.js` |
| تست‌های بک‌اند | `backend/__tests__/settings-unit.test.js` ، `backend/__tests__/settings-team.test.js` |
| تایپ و سرویس فرانت | `frontend/src/types/seller.ts` ، `frontend/src/services/sellerService.ts` (+ تست) |
| صفحه‌ی تنظیمات | `frontend/src/pages/seller/SettingsSeller.tsx` (جدید) ، به‌روزرسانی `FinanceSeller.tsx` |
| ناوبری و مسیریابی | `frontend/src/components/seller/SellerLayout.tsx` ، `frontend/src/App.tsx` (حذف `PlannedDomainPage.tsx`) |
| برچسب‌های نقش | `frontend/src/lib/sellerFormat.ts` |
| گزارش | `docs/reports/NAKHSHA_STAGE10_SELLER_SETTINGS_TEAM.md` |

---

## ۶. مراحل بعدی پیشنهادی

1. **ویترین فروشگاه (stage 11):** کاتالوگ عمومیِ فقط‌خواندنی از محصولات `active` برای مهمانان
   و خریداران، گیت‌شده با پرچم `storefrontPublished` که همین‌جا ساخته شد؛ اولین مصرف‌کننده‌ی
   عمومی داده‌ی فروشنده در پلتفرم.
2. **پرداخت خریدار / یکپارچه‌سازی درگاه:** قطعیت نهایی سفارش در برابر پرداخت؛ اتصال این حلقه
   به آماده‌سازی سفارش و همین سرویس مالی.
3. **موارد اختیاری:** اعلان (ایمیل/پیامک) که زیرساخت آن در `settings.notification*` خوانا
   شده، آپلود عکس برای اعضای تیم، و دامنه‌ی گزارش‌گیری.

---

## ۷. جمع‌بندی

ساختار فروشنده‌ی نخشا با این مرحله تکمیل شد؛ هیچ دامنه‌ی «برنامه‌ریزی‌شده»‌ای در ناوبری
فروشنده باقی نماند. تیم‌ها با نقش‌های مدیر/کارمند، ماتریس دسترسیِ تمام‌ممیزی‌شده و قفل مطلق
مالی برای مالک، و تنظیمات فروشگاهیِ خود-مستند (که ویترین مرحله‌ی بعد به آن تکیه می‌کند)
پیاده شد. با 43 تست تازه در بک‌اند (کل 645) و 122 تست در فرانت‌اند، دروازه‌های همه‌ی فازها
سبز و تغییرات ثبت و به شاخه ارسال شد.

</div>