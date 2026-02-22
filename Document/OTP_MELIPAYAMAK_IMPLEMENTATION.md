# OTP با MeliPayamak SMS - خلاصه پیاده‌سازی

## مرور کلی

پیاده‌سازی سیستم رمز یکبار مصرف (OTP) با ارسال پیامک از طریق سرویس MeliPayamak انجام شد.

## ویژگی‌های پیاده‌سازی شده

### 1. تولید و ذخیره OTP

- تولید کد 6 رقمی تصادفی
- هش کردن کد با HMAC-SHA256 + شماره تلفن
- ذخیره hash و زمان انقضا در MongoDB
- TTL = 120 ثانیه (قابل تنظیم)

### 2. کنترل ارسال مجدد (Cooldown)

- کولداون 120 ثانیه بین ارسال‌های متوالی
- پیام خطای 429 با retryAfterSeconds

### 3. مدیریت شماره تلفن

- تبدیل ارقام فارسی/عربی به انگلیسی
- اعتبارسنجی فرمت ایرانی: `09xxxxxxxxx`
- پشتیبانی از فرمت‌های مختلف ورودی (+98, 0098, 989xxx)
- قابلیت تبدیل به فرمت 989xxx برای ارائه‌دهنده

### 4. ارسال SMS

- استفاده از MeliPayamak REST API
- Fallback به SOAP در صورت خرابی REST
- پیام فارسی استاندارد با برند نخشا
- لاگ کامل عملیات ارسال

### 5. تایید و ثبت‌نام خودکار

- بررسی امنیتی با timing-safe comparison
- ثبت‌نام خودکار کاربران جدید
- محدودیت تعداد تلاش (8 بار)
- ریست کردن بعد از 10 دقیقه

## فایل‌های ایجاد/تغییر یافته

### فایل‌های جدید:

- `services/sms/melipayamakSms.js` - سرویس ارسال SMS
- `utils/phone.js` - توابع مدیریت شماره تلفن
- `scripts/test-sms.js` - اسکریپت تست تنظیمات
- `.env.example` - تمپلیت متغیرهای محیطی

### فایل‌های بروزرسانی شده:

- `routes/auth.js` - مسیرهای OTP start/verify
- `.env` - متغیرهای محیطی MeliPayamak
- `package.json` - اضافه شدن بسته melipayamak

## متغیرهای محیطی مورد نیاز

```env
# MeliPayamak SMS Configuration
MELIPAYAMAK_USERNAME=your-username
MELIPAYAMAK_PASSWORD=your-password
MELIPAYAMAK_FROM=50004001854432
MELIPAYAMAK_TO_FORMAT=09  # اختیاری: 09 یا 98

# OTP Configuration
OTP_TTL_SECONDS=120
OTP_RESEND_SECONDS=120
OTP_SECRET=your-otp-secret
OTP_MAX_ATTEMPTS=8
```

## API Endpoints

### POST /api/auth/otp/start

ارسال کد OTP به شماره تلفن

**درخواست:**

```json
{
  "phone": "09123456789"
}
```

**پاسخ موفق:**

```json
{
  "success": true,
  "message": "کد ارسال شد",
  "retryAfterSeconds": 120,
  "devCode": "123456" // فقط در محیط غیرتولیدی
}
```

**خطاها:**

- 400: فرمت شماره نادرست
- 429: کولداون فعال
- 500: خطای ارسال SMS

### POST /api/auth/otp/verify

تایید کد OTP و صدور توکن

**درخواست:**

```json
{
  "phone": "09123456789",
  "code": "123456"
}
```

**پاسخ موفق:**

```json
{
  "token": "jwt-token",
  "user": {
    "id": "user-id",
    "name": "کاربر نخشا",
    "phone": "09123456789",
    "role": "user"
  }
}
```

**خطاها:**

- 400: کد نادرست یا منقضی شده
- 429: تعداد تلاش بیش از حد

## تست کردن

```bash
# تست تنظیمات SMS
node scripts/test-sms.js

# تست با شماره خاص
node scripts/test-sms.js 09123456789
```

## امنیت

- هش کردن کدها با HMAC-SHA256
- مقایسه timing-safe
- محدودیت تعداد تلاش
- کولداون ارسال مجدد
- عدم نمایش خطاهای SMS در تولید

## لاگ‌ها

تمام عملیات مهم لاگ می‌شوند:

- ارسال موفق SMS
- خطاهای ارسال
- ثبت‌نام خودکار کاربران
- تلاش‌های نادرست تایید

## مثال استفاده در توسعه

```javascript
// ارسال OTP
const response = await fetch("/api/auth/otp/start", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "09123456789" }),
});

// تایید OTP
const verifyResponse = await fetch("/api/auth/otp/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    phone: "09123456789",
    code: "123456",
  }),
});
```
