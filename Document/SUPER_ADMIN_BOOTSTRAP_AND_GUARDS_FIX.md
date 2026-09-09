# گزارش: اصلاح دکترین نقش `super_admin` — بوتاسترپ و گاردهای دسترسی

تاریخ: 2026-09-08
دامنه: `backend` + `frontend` (پروژه Nakhsha)

---

## ۱) خلاصه

دو ناسازگاری اصلی با دکترین نقش‌ها (master prompt) بررسی، اصلاح و تحت تست قرار گرفت:

1. **گارد روت‌های پنل ادمین**: پنل `/api/admin/*` قبلاً برای هر دو نقش
   `admin` و `super_admin` باز بود؛ طبق دکترین باید **فقط** `super_admin` باشد.
2. **بوتاسترپ سوپرادمین**: قبلاً «اولین کاربر ثبت‌نام‌شده» به‌صورت خودکار
   `super_admin` می‌شد؛ طبق دکترین تنها مسیر قانونی، ورود OTP با شماره‌ای است که
   برابر `SUPER_ADMIN_PHONE` باشد و هنوز سوپرادمین دیگری وجود نداشته باشد.

همچنین برای سازگاری، همه‌ی گیت‌هایی که نقش `admin` را درباره‌ی قابلیت‌های
مودریشن/مالکیت می‌پذیرفتند، نقش `super_admin` را نیز (به‌عنوان «≥ admin») قبول
می‌کنند.

آخرین وضعیت تست: **۱۶ سوئیت / ۳۵۷ تست — همه سبز**، lint بک‌اند بدون خطا.

---

## ۲) تغییرات انجام‌شده

### ۲٫۱ — گارد روت‌های پنل ادمین (فقط `super_admin`)

فایل: `backend/routes/admin.js`

- تمام ۱۸ مورد `requireRole("admin", "super_admin")` → `requireRole("super_admin")`
  (روت‌های: audit-logs, stats, users, role, permissions, block, delete,
  providers, listings, crafts, profile, logout-all, settings, ...)
- یک استثنا حفظ شد: فیلتر کوئری `GET /users?role=super_admin` برای **لیست‌کردن**
  کاربران مجاز است (لیست است، نه تخصیص).
- نقش `admin` از طریق API قابل تخصیص است اما هرگز به پنل ادمین دسترسی ندارد
  (تست اختصاصی اضافه شد — بخش ۴٫۲).

فایل: `backend/server.js:408` — کامنت مربوطه اصلاح شد:
"Admin (super_admin only) — the `admin` role is never allowed on /api/admin/*".

### ۲٫۲ — بوتاسترپ سوپرادمین با `SUPER_ADMIN_PHONE` (حذف «اولین کاربر»)

فایل: `backend/routes/auth.js` (مسیر `otp/verify`)

- **حذف** منطق «اولین کاربر = super_admin» (`countDocuments === 0`).
- حساب‌های جدید همیشه با نقش `user` ساخته می‌شوند.
- **افزودن** تخصیص خودکار بر اساس `SUPER_ADMIN_PHONE` که در هر ورود OTP اجرا
  می‌شود:
  - پیش‌شرط: شماره نرمال‌شده برابر `SUPER_ADMIN_PHONE` باشد **و** نقش فعلی
    `super_admin` نباشد.
  - برای حساب‌های تازه و حساب‌های از-قبل-موجود هر دو کار می‌کند (حساب‌هایی که
    قبل از تنظیم متغیر ساخته شده‌اند نیز پوشش داده می‌شوند).
  - **Singleton-safe**: اگر سوپرادمین دیگری وجود داشته باشد، گارد
    `pre-validate` مدل `User` ذخیره را رد می‌کند؛ ما نقش قبلی کاربر را حفظ،
    هشدار server-side می‌زنیم و هرگز ورود را شکست نمی‌دهیم.
  - **Idempotent**: نقشِ از-قبل `super_admin` دست‌نخورده می‌ماند.
  - در صورت تخصیص، یک رکورد `USER_ROLE_CHANGE` با
    `metadata: { autoAssigned: true, source: "SUPER_ADMIN_PHONE" }` ثبت می‌شود.
  - اگر متغیر تنظیم نشده باشد و کاربر جدیدی ثبت‌نام کند، هشدار لاگ می‌شود
    («Super Admin bootstrap غیرفعال است»).

فایل‌های پشتیبان:

- `backend/config/env.js` — افزودن `SUPER_ADMIN_PHONE` اختیاری (پیش‌فرض خالی).
- `backend/.env.example` — مستندسازی «تنها مسیر قانونی» برای bootstrap.
- `backend/.env` — افزودن `SUPER_ADMIN_PHONE=` خالی + راهنمای فارسی
  (مقدار را اپراتور باید تنظیم کند).
- `backend/models/AuditLog.js` — افزودن `autoAssigned` و `source` به زیراسکیمای
  `metadata` تا پیلود audit حذف نشود (قبلاً مونگوس با strict mode آن‌ها را
  دور می‌ریخت).

### ۲٫۳ — سازگاری «`super_admin` ≧ `admin`» در مودریشن/مالکیت

بررسی شد که همه‌ی گیت‌های محتوایی که نقش `admin` را «مدیر» می‌دانند، به
`super_admin` هم دسترسی بدهند (بر اساس «super_admin تمام قابلیت‌های admin را
ضمناً دارد»):

| فایل | تغییر |
|---|---|
| `backend/routes/crafts.js:52` | `ownerOrAdmin` حالا `["admin","super_admin"]` را قبول می‌کند |
| `backend/routes/crafts.js:1071` | `isAdmin` شامل `super_admin` شد (حذف نظر) |
| `backend/controllers/DraftController.js:393` | دسترسی به آمار drafts دیگران برای `admin`/`super_admin` |
| `frontend/src/pages/CraftDetail.tsx` (۳ جا) | دکمه‌های ویرایش/حذف برای `super_admin` هم نمایش داده می‌شود |
| `frontend/src/components/ProfileHeader.tsx:53` | نشان «مدیر» برای `super_admin` هم نمایش داده می‌شود |
| `frontend/src/types/api.ts:105` | نوع `role` شامل `"super_admin"` شد |

پنل ادمین در فرانت‌اند **وجود ندارد** (هیچ route ای به `/api/admin/*` ندارد)،
پس گارد سمت کلاینت جدیدی لازم نبود.

---

## ۳) امنیت از عمق (defense-in-depth) — تأیید شد

- `PATCH /api/admin/users/:id/role`:
  `backend/routes/admin.js:69` فیلد `role` را با
  `z.enum(["user","tour_leader","admin"])` می‌پذیرد → ارسال `super_admin` با 400 رد
  می‌شود؛ و کنترلر `AdminController.js:255` با `ALLOWED_USER_ROLES` دوباره همان را
  رد می‌کند.
- `PATCH /api/admin/users/:id/permissions` فقط برای نقش `admin` معنا دارد؛ مسیر
  تعیین `super_admin` از آنجا ممکن نیست.
- هیچ بش/سیکویل «seed» در `backend/scripts` وجود ندارد که `super_admin` بسازد.
- شناسه‌های `role` باقی‌مانده در `admin.js` فقط فیلتر کوئری (list) هستند.

---

## ۴) تست‌ها

فایل: `backend/__tests__/admin.test.js`

### ۴٫۱ — پیکربندی جدید

- `beforeAll`: `process.env.SUPER_ADMIN_PHONE = PHONES.admin` (یعنی `09142000001`)
- `afterAll`: حذف متغیر تا به سوئیت‌های دیگر نشتی نکند.

### ۴٫۲ — تست‌های تغییر/افزوده

- **بوتاسترپ با OTP**: ورود با `SUPER_ADMIN_PHONE` → نقش `super_admin` می‌شود و
  به `/api/admin/stats` دسترسی دارد.
- **کاربر دوم**: شماره‌ای که برابر `SUPER_ADMIN_PHONE` نیست هرگز ارتقا نمی‌یابد
  و از روت‌های ادمین 403 می‌گیرد.
- **نقش `admin` رد می‌شود** (تست جدید): کاربری که نقش DB آن `admin` است روی
  `/api/admin/stats` → `403 FORBIDDEN`.
- **Audit bootstrap**: رکورد `USER_ROLE_CHANGE` با
  `metadata.autoAssigned: true` و `source: "SUPER_ADMIN_PHONE"` نوشته می‌شود
  (به‌جای `SUPER_ADMIN_AUTO_ASSIGN` قدیمی که برای هر ورود تکراری ثبت می‌شد —
  باگ ثابت‌شده).
- **فیلتر رکوردهای نقش**: کوئری تست role-change رکوردهای auto-assigned را
  کنار می‌گذارد تا خروجی ورزشی نشود.

---

## ۵) نتیجه‌ی اجرا

| تست | نتیجه |
|---|---|
| `eslint` بک‌اند (فایل‌های تغییر یافته) | بدون خطا (فقط warning های از-قبل) |
| `jest --runInBand` (کل بک‌اند) | **16 سوئیت — 357 تست، همگی سبز** |
| `tsc --noEmit` فرانت‌اند | قابل اجرا نبود (وابستگی‌ها نصب نیستند)؛ تغییر فقط افزودن عضو به union - غیرشکننده |

---

## ۶) اقدام عملیاتی لازم (اپراتور)

برای ساخت سوپرادمین اول، در `backend/.env` تنظیم کنید:

```dotenv
SUPER_ADMIN_PHONE=0912XXXXXXX   # شماره‌ی واقعی خودتان
```

سپس با همان شماره، ارسال OTP + تأیید انجام دهید. با اولین ورود موفق:
- نقش حساب `super_admin` می‌شود.
- اگر دوباره ورود کنید، چون سوپرادمین وجود دارد، تغییری رخ نمی‌دهد (idempotent).
- اگر این متغیر خالی بماند، هیچ کاربری هرگز سوپرادمین نمی‌شود
  (هشدار لاگ هنگام ثبت‌نام کاربر جدید).

> تعداد سوپرادمین همواره حداکثر **یک** است: گارد پیش‌ذخیره‌ی مدل `User` +
> ایندکس جزئی یکتا (`models/User.js`) هر مسیر دوم را رد می‌کنند.