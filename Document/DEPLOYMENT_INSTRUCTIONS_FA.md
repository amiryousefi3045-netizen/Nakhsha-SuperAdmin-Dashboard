# 🚀 دستورالعمل استقرار Nakhsha

## ✅ ایمیج‌های Docker Hub آماده شد!

**لینک‌های شما:**

- Backend: https://hub.docker.com/r/omid3179/nakhsha-backend
- Frontend: https://hub.docker.com/r/omid3179/nakhsha-frontend

---

## 📦 برای استقرار روی هاست

### مرحله ۱: آپلود فایل‌ها به سرور

دو فایل زیر را به سرور بفرستید:

- `docker-compose.production.yml`
- `.env.production`

### مرحله ۲: تنظیم فایل .env

فایل `.env.production` را ویرایش کنید و مقادیر زیر را تغییر دهید:

```env
# رمز عبور قوی برای MongoDB
MONGO_PASSWORD=your-strong-password-here

# کلید JWT (حتماً تغییر دهید!)
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters

# دامنه واقعی شما
ALLOWED_ORIGINS=https://yourdomain.com
```

### مرحله ۳: اجرا روی سرور

```bash
# اجرای Docker Compose
docker-compose -f docker-compose.production.yml --env-file .env.production up -d

# بررسی وضعیت
docker-compose -f docker-compose.production.yml ps

# مشاهده لاگ‌ها
docker-compose -f docker-compose.production.yml logs -f backend
```

---

## 🔗 لینک‌هایی که به هاست بدهید

اگر هاست از شما **لینک Docker repository** می‌خواهد:

```
omid3179/nakhsha-backend:latest
omid3179/nakhsha-frontend:latest
```

یا لینک کامل:

```
https://hub.docker.com/r/omid3179/nakhsha-backend
https://hub.docker.com/r/omid3179/nakhsha-frontend
```

---

## 📝 دستورات مفید روی سرور

### مشاهده لاگ‌ها:

```bash
docker-compose -f docker-compose.production.yml logs -f backend
docker-compose -f docker-compose.production.yml logs -f frontend
docker-compose -f docker-compose.production.yml logs -f mongodb
```

### Restart:

```bash
docker-compose -f docker-compose.production.yml restart
```

### توقف:

```bash
docker-compose -f docker-compose.production.yml down
```

### به‌روزرسانی (Pull آخرین نسخه):

```bash
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d
```

---

## 🔒 نکات امنیتی مهم

✅ **انجام شده:**

- [x] ایمیج‌ها را build و push کردیم
- [x] فایل production آماده شد

⚠️ **قبل از استقرار:**

- [ ] رمز `MONGO_PASSWORD` را تغییر دهید
- [ ] کلید `JWT_SECRET` را با یک کلید تصادفی جایگزین کنید
- [ ] `ALLOWED_ORIGINS` را با دامنه واقعی خود جایگزین کنید
- [ ] مطمئن شوید فایل `.env.production` را commit نکرده‌اید

---

## 💡 تولید کلید امنیتی تصادفی

```bash
# برای JWT_SECRET
openssl rand -hex 32

# برای MONGO_PASSWORD
openssl rand -hex 16
```

---

## 🎯 چک‌لیست استقرار

1. ✅ ایمیج‌ها در Docker Hub موجود هستند
2. ⬜ فایل‌های `docker-compose.production.yml` و `.env.production` را به سرور آپلود کردید
3. ⬜ مقادیر `.env.production` را ویرایش کردید
4. ⬜ دستور `docker-compose up -d` را اجرا کردید
5. ⬜ با `docker-compose ps` وضعیت را بررسی کردید
6. ⬜ با `docker-compose logs -f` لاگ‌ها را چک کردید
7. ⬜ دامنه را به IP سرور متصل کردید
8. ⬜ SSL (HTTPS) را فعال کردید

---

**موفق باشید! 🎉**
