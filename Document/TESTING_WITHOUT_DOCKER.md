# ✅ تست پروژه Nakhsha بدون Docker

اگر هنوز Docker ندارید، می‌توانید به این روش تست کنید:

---

## ✅ چک‌لیست قبل از تست

```powershell
# 1. MongoDB باید در حال اجرا باشد
mongosh --eval "db.version()"

# 2. Node.js نصب باشد
node --version  # باید 18+ باشد

# 3. در root پروژه باشید
cd D:\Work\Nakhsha
```

---

## 🧪 تست 1: Backend API

### گام 1: نصب Dependencies

```powershell
cd backend
npm install
```

### گام 2: تنظیم Environment

```powershell
# اگر .env ندارید، از .env.example کپی کنید
cp .env.example .env

# ویرایش کنید
notepad .env
```

**حداقل تنظیمات:**

```env
JWT_SECRET=my-super-secret-key-for-testing-min-32-chars-long
MONGODB_URI=mongodb://127.0.0.1:27017/nakhsha
```

### گام 3: اجرای Backend

```powershell
npm run dev
```

✅ **اگر موفق بود، باید ببینید:**

```
Server is running on port 5000
MongoDB connected successfully
```

### گام 4: تست API ها

**در مرورگر یا Postman:**

1. **Health Check**

   ```
   GET http://localhost:5000/api/health
   ```

   ✅ باید: `{ status: "ok" }` برگرداند

2. **API Documentation**

   ```
   http://localhost:5000/api-docs
   ```

   ✅ باید: صفحه Swagger UI باز شود

3. **Register (ثبت‌نام)**

   ```
   POST http://localhost:5000/api/auth/register
   Content-Type: application/json

   {
     "name": "تست کاربر",
     "email": "test@example.com",
     "phone": "09123456789",
     "password": "password123"
   }
   ```

   ✅ باید: token و user برگرداند

4. **Login (ورود)**

   ```
   POST http://localhost:5000/api/auth/login
   Content-Type: application/json

   {
     "phone": "09123456789",
     "password": "password123"
   }
   ```

   ✅ باید: token و user برگرداند

---

## 🧪 تست 2: Frontend

### گام 1: نصب Dependencies

```powershell
# Terminal جدید باز کنید
cd D:\Work\Nakhsha\frontend
npm install
```

### گام 2: اجرای Frontend

```powershell
npm run dev
```

✅ **اگر موفق بود:**

```
VITE ready in XXX ms
Local: http://localhost:5173
```

### گام 3: تست در مرورگر

```
http://localhost:5173
```

✅ باید: صفحه اصلی نخشا باز شود

---

## 🧪 تست 3: Unit Tests

### اجرای تست‌های Backend

```powershell
cd backend
npm test
```

✅ **نتیجه مورد انتظار:**

```
PASS  __tests__/auth.test.js
PASS  __tests__/crafts.test.js

Tests: 27 passed, 27 total
Coverage: ~82%
```

### Coverage Report

```powershell
npm run test:coverage
```

✅ سپس فایل HTML را باز کنید:

```powershell
start coverage/lcov-report/index.html
```

---

## 🧪 تست 4: Error Handling

### تست 404 Handler

```
GET http://localhost:5000/api/nonexistent
```

✅ باید: خطای 404 structured برگرداند

### تست Validation Error

```
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "تست"
  # بدون email, phone, password
}
```

✅ باید: خطای 400 با پیام فارسی برگرداند

### تست Unauthorized

```
GET http://localhost:5000/api/auth/me
# بدون Authorization header
```

✅ باید: خطای 401 برگرداند

---

## 🧪 تست 5: Logging

### مشاهده Logs

```powershell
# Backend logs
cd backend
cat logs/all.log

# Error logs فقط
cat logs/error.log
```

✅ باید: Logs ساختاریافته با timestamp ببینید

---

## 🧪 تست 6: Environment Validation

### تست بدون JWT_SECRET

```powershell
# Backend را متوقف کنید (Ctrl+C)

# JWT_SECRET را موقتاً پاک کنید از .env
notepad .env
# خط JWT_SECRET را comment کنید

# سعی کنید دوباره اجرا کنید
npm run dev
```

✅ باید: خطای واضح ببینید:

```
Error: JWT_SECRET is required
```

---

## 🧪 تست 7: Security Headers

### با curl یا Postman، Headers را چک کنید:

```powershell
curl -I http://localhost:5000/api/health
```

✅ باید این Headers را ببینید:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000
Referrer-Policy: same-origin
```

---

## 🧪 تست 8: Database Geospatial

### ایجاد یک Craft با مختصات

```
POST http://localhost:5000/api/crafts
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "title": "قالی تست",
  "description": "برای تست",
  "kind": "artwork",
  "craftType": "carpet",
  "location": {
    "city": "تهران",
    "geometry": {
      "type": "Point",
      "coordinates": [51.4231, 35.6961]
    }
  }
}
```

### جستجوی نزدیک

```
GET http://localhost:5000/api/listings/near?lng=51.4231&lat=35.6961&maxDistance=10000
```

✅ باید: Craft ایجاد شده را برگرداند

---

## ✅ خلاصه تست‌ها

| تست              | دستور                     | نتیجه مورد انتظار |
| ---------------- | ------------------------- | ----------------- |
| Backend Running  | `npm run dev`             | Port 5000         |
| Frontend Running | `npm run dev`             | Port 5173         |
| Unit Tests       | `npm test`                | 27/27 passed      |
| Health Check     | `GET /api/health`         | status: ok        |
| API Docs         | `/api-docs`               | Swagger UI        |
| Register         | `POST /api/auth/register` | token + user      |
| Login            | `POST /api/auth/login`    | token + user      |
| 404 Error        | `GET /nonexistent`        | 404 + message     |
| Validation       | Bad request               | 400 + errors      |
| Security Headers | curl -I                   | Headers present   |

---

## 🎯 اگر همه تست‌ها موفق بودند:

**🎉 تبریک! پروژه شما کاملاً کار می‌کند!**

حالا می‌توانید:

1. Docker را نصب کنید (اختیاری)
2. شروع به توسعه کنید
3. از Swagger Docs استفاده کنید
4. تست‌های بیشتر بنویسید

---

## 🐛 اگر مشکلی پیش آمد:

### MongoDB متصل نمی‌شود

```powershell
# Start MongoDB
# Windows: services.msc → MongoDB Server → Start
# یا از MongoDB Compass

# تست اتصال
mongosh
```

### Port 5000 اشغال است

```powershell
# پیدا کردن process
netstat -ano | findstr :5000

# Kill کردن
taskkill /PID <PID> /F
```

### Module Not Found

```powershell
# پاک کردن و نصب مجدد
rm -rf node_modules
npm install
```

---

**💡 نکته:** بعد از تست موفق، حتماً Docker را هم نصب کنید برای deployment آسان!
