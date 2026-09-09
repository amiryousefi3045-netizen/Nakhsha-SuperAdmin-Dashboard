# Nakhsha (نخشا) — Staging Deploy on Render.com + MongoDB Atlas

نسخه استیجینگ روی Render.com. این سند مراحل دیپلوی و چکلیست §17 روی استیجینگ را توضیح میدهد.

## معماری

| سرویس | نوع Render | مسیر repo | نام |
|---|---|---|---|
| Backend API | Web Service (Node) | `backend/` | `nakhsha-staging-api` |
| Frontend SPA | Static Site | `frontend/` | `nakhsha-staging-web` |
| MongoDB | Atlas Free (M0) | — | cluster جدا برای استیجینگ |

- URL پیشبینی‌شده (در صورت یکتایی نام): `https://nakhsha-staging-api.onrender.com` و `https://nakhsha-staging-web.onrender.com`. اگر Render به نام سرویس پسوند اضافه کند، مقادیر `ALLOWED_ORIGINS` / `VITE_API_BASE` / `VITE_API_ORIGIN` باید با URL واقعی به‌روز شوند.
- Blueprint: `render.yaml` در ریشه repo — توضیحات کامل در خود فایل.

## پیش‌نیازها

1. حساب Render.com و اتصال ریپوی GitHub (برنچ `super-admin-testing`).
2. کلاستر MongoDB Atlas رایگان (M0) با دیتابیس `nakhsha_staging`.
   - در Atlas شبکه را «Allow access from anywhere» (یا IP محدود) قرار دهید.
   - کانکشن‌استرینگ: `mongodb+srv://<user>:<pass>@<cluster>/nakhsha_staging`
3. مقدار `JWT_SECRET` مخصوص استیجینگ (متفاوت از پروداکشن):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
4. شماره سوپر ادمین استیجینگ (یک شماره تستی، مثل `09149990000` — نه شماره پروداکشن).

## مراحل دیپلوی

### 1. MongoDB Atlas
- Create Cluster (M0 free) → Database Access → کاربر تستی → Network Access → Allow from anywhere.
- نام دیتابیس جدید: `nakhsha_staging` (در استرینگ URI).

### 2. Render Blueprint
1. Dashboard → **New** → **Blueprint** → اتصال به ریپوی GitHub (برنچ `super-admin-testing`).
2. Render هر دو سرویس `render.yaml` را می‌سازد.
3. برای هر سرویس مقادیر `sync: false` را پر کنید:
   - **nakhsha-staging-api**: `MONGODB_URI` (Atlas)، `JWT_SECRET`، `SUPER_ADMIN_PHONE=09149990000`.
   - `ALLOWED_ORIGINS` به‌صورت خودکار از سرویس frontend گرفته می‌شود (در صورت یکتایی نام).
4. Deploy کنید. اولین دیپلوی با `SYNC_INDEXES=true` ایندکس‌ها را می‌سازد؛ بعداً به `false` برگردانید.

> نکته: `SMS_MOCK=true` در render.yaml — کد OTP روی لاگ سرور (تب Logs در Render) نوشته می‌شود و برای لاگین تستی از همان جا خوانده می‌شود. در NODE_ENV=production فیلد `devCode` در پاسخ OTP برنمی‌گردد (طراحی درست امنیتی).

### 3. بررسی دیپلوی
- Health: `GET https://nakhsha-staging-api.onrender.com/api/health` → `{"ok":true,"db":"up"}`
- Frontend: باز کردن `https://nakhsha-staging-web.onrender.com` — صفحه خانه فارسی.

## چک‌لیست §17 روی استیجینگ (SMS_MOCK)

نکته: چون OTP واقعی نیست، کد را از Render Logs (سرویس api) بردارید و در فرم OTP وارد کنید (منوی Manual entry، نه «استفاده خودکار» که فقط در dev نشان داده می‌شود).

### 1. ورود با شماره سوپر ادمین
1. به `/admin` بروید → فرم ورود OTP را پر کنید (باید برند باشد).
2. کد را از لاگ api دریافت کرده و وارد کنید.
3. پس از OTP، صفحه باید به داشبورد «نمای کلی» برود و سایدبار کامل مدیر پنل نمایش داده شود.
4. در تب Storage از مرورگر: وجود `nakhsha_token` در localStorage.
5. خروج از حساب → توکن پاک شود → دسترسی به `/admin` به لاگین برگردد.

### 2. آزمون نقش‌ها (با یک کاربر معمولی)
1. با یک شماره دوم (کاربر عادی) OTP بگیرید و لاگین کنید.
2. به `/admin` بروید → پیام «دسترسی محدود» و کارت منع نمایش داده شود.
3. باز کردن DevTools Network: درخواست API مدیر باید HTTP 403 برگرداند.

### 3. ویژگی‌های امنیتی (spot-check)
4. درخواست دستی `GET /api/admin/users` بدون توکن → 401.
5. توکن جعل‌شده با نقش super_admin روی حساب عادی → 403 (نقش دیتابیس تعیین‌کننده است).
6. بلاک کردن کاربر عادی از پنل → توکن پیشین آن کاربر → 403.

### 4. داده و محتوا (ثبت یک آگهی)
7. به‌عنوان کاربر عادی، یک آگهی جدید بسازید و آپلود تصویر → URL تصویر از `https://nakhsha-staging-api.onrender.com/uploads/...` سرو شود (تأیید VITE_API_ORIGIN).
8. آگهی به‌عنوان super admin در پنل دیده شود.

### 5. محیط استیجینگ (محیط‌های جدا)
9. بررسی عدم نشت: هیچ کاربر/داده پروداکشن در `nakhsha_staging` وجود ندارد.
10. `SUPER_ADMIN_PHONE` استیجینگ با پروداکشن فرق دارد → bootstrap روی کلستر استیجینگ اثر پروداکشن ندارد.

## نکته امنیتی — `backend/.env` ترک‌شده در git
فایل `backend/.env` همواره (commit `48f5c4e`) **در git ترک شده** است — نقض بندهای امنیتی (هرگز secret در repo). پیش از مرج (Step 20) باید:
```bash
git rm --cached backend/.env
```
و سپس روتیت (چرخش) رمزهای داخل آن (به‌ویژه JWT_SECRET و Mongo URI) انجام شود، چون در تاریخچه git باقی مانده‌اند. این فایل در `.gitignore` هست ولی «نباید پیگیری شود» — پیگیری قبلی باید حذف شود.

## پس از تأیید استیجینگ
- مرحله ۲۰: مرج `super-admin-testing` → `main`/`develop` و استقرار پروداکشن (با SMS واقعی، شماره سوپر ادمین واقعی، ALLOWED_ORIGINS دامنه واقعی).