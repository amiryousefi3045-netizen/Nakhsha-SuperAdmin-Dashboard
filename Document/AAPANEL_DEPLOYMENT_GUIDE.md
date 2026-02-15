# راهنمای استقرار Nakhsha در aaPanel

## 📋 پیش‌نیازها

aaPanel شما باید Docker نصب داشته باشد.

---

## 🚀 مراحل استقرار

### مرحله ۱: نصب Docker در aaPanel

1. وارد پنل aaPanel شوید
2. از منوی سمت چپ **App Store** → **Docker** را انتخاب کنید
3. **Install** کلیک کنید و صبر کنید تا نصب شود
4. همچنین **Docker Compose** را نصب کنید

یا از طریق SSH:

```bash
# نصب Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# نصب Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

---

### مرحله ۲: آپلود فایل‌های پروژه

#### گزینه الف: از طریق Git (توصیه می‌شود)

```bash
# اتصال SSH به سرور
ssh root@your-server-ip

# رفتن به پوشه وب
cd /www/wwwroot

# Clone کردن پروژه
git clone https://github.com/yourusername/Nakhsha.git
cd Nakhsha
```

#### گزینه ب: آپلود دستی

1. فایل‌های پروژه را Zip کنید
2. در aaPanel → Files، فایل را آپلود کنید
3. Extract کنید در `/www/wwwroot/Nakhsha`

---

### مرحله ۳: ساخت فایل Environment

```bash
# رفتن به پوشه پروژه
cd /www/wwwroot/Nakhsha

# ساخت فایل .env
nano .env.production
```

محتوای فایل `.env.production`:

```env
# MongoDB
MONGO_USERNAME=admin
MONGO_PASSWORD=nakhsha_secure_123456

# Backend
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
ALLOWED_ORIGINS=http://your-domain.com,https://your-domain.com

# Optional
NODE_ENV=production
```

**نکته:** رمزها را حتماً تغییر دهید!

---

### مرحله ۴: اجرای Docker Compose

```bash
# اجرا با فایل production
docker-compose -f docker-compose.production.yml --env-file .env.production up -d

# یا اجرا با فایل عادی
docker-compose up -d
```

این دستور:

- ✅ MongoDB را دانلود و اجرا می‌کند
- ✅ Backend را از Docker Hub می‌کشد و اجرا می‌کند
- ✅ Frontend را از Docker Hub می‌کشد و اجرا می‌کند

---

### مرحله ۵: بررسی وضعیت

```bash
# لیست containerها
docker-compose ps

# مشاهده لاگ‌ها
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb
```

باید چیزی شبیه این ببینید:

```
NAME                  COMMAND                  SERVICE    STATUS
nakhsha-mongodb       "docker-entrypoint.s…"   mongodb    Up (healthy)
nakhsha-backend       "node server.js"          backend    Up (healthy)
nakhsha-frontend      "nginx -g 'daemon of…"   frontend   Up
```

---

## 🔧 تنظیمات aaPanel

### تنظیم Reverse Proxy

برای دسترسی از طریق دامنه:

1. در aaPanel → **Website** → **Add site**
2. Domain: `yourdomain.com`
3. به **Site settings** بروید
4. **Reverse proxy** را فعال کنید:

```
Target URL: http://127.0.0.1:3000    (برای Frontend)
Enable: Yes
```

یا برای Backend API:

```
Target URL: http://127.0.0.1:5000
Enable: Yes
```

---

## 🔒 تنظیم SSL (HTTPS)

1. در aaPanel → Website → yourdomain.com
2. **SSL** → **Let's Encrypt**
3. ایمیل خود را وارد کنید
4. **Apply** کلیک کنید

---

## 📊 مانیتورینگ در aaPanel

### مشاهده استفاده از منابع

```bash
# استفاده CPU و Memory
docker stats

# لاگ‌های زنده
docker-compose logs -f
```

### Restart سرویس‌ها

```bash
# Restart همه
docker-compose restart

# Restart فقط Backend
docker-compose restart backend
```

### توقف سرویس‌ها

```bash
# توقف بدون حذف داده‌ها
docker-compose stop

# توقف و حذف (داده‌های MongoDB محفوظ می‌ماند)
docker-compose down
```

---

## 🔄 به‌روزرسانی

وقتی نسخه جدید آماده شد:

```bash
# Pull کردن آخرین images
docker-compose pull

# Restart با نسخه جدید
docker-compose up -d
```

---

## 🐛 عیب‌یابی

### مشکل ۱: MongoDB اجرا نمی‌شود

```bash
# بررسی لاگ
docker-compose logs mongodb

# پاک کردن و اجرای مجدد
docker-compose down
docker volume rm nakhsha_mongodb-data
docker-compose up -d
```

### مشکل ۲: Backend به MongoDB وصل نمی‌شود

بررسی کنید `MONGODB_URI` درست باشد:

```env
# در فایل .env.production
MONGODB_URI=mongodb://admin:your-password@mongodb:27017/nakhsha?authSource=admin
```

**نکته:** نام سرویس باید `mongodb` باشد (نه `localhost`)

### مشکل ۳: Port در دسترس نیست

```bash
# بررسی portهای استفاده شده
netstat -tulpn | grep LISTEN

# تغییر port در docker-compose.yml
ports:
  - "8080:80"    # استفاده از 8080 به جای 80
```

---

## 📝 فایل‌های مورد نیاز

در سرور شما باید این فایل‌ها باشد:

```
/www/wwwroot/Nakhsha/
├── docker-compose.yml              ← اصلی
├── docker-compose.production.yml   ← برای production
├── .env.production                 ← تنظیمات محیطی
├── backend/
│   └── Dockerfile
└── frontend/
    └── Dockerfile
```

---

## 🎯 چک‌لیست

- [ ] Docker در aaPanel نصب شده
- [ ] Docker Compose نصب شده
- [ ] فایل‌های پروژه آپلود شده
- [ ] فایل `.env.production` ساخته شده
- [ ] `MONGO_PASSWORD` و `JWT_SECRET` تغییر کرده
- [ ] `docker-compose up -d` اجرا شده
- [ ] با `docker-compose ps` وضعیت بررسی شده
- [ ] Reverse proxy در aaPanel تنظیم شده
- [ ] SSL نصب شده
- [ ] دامنه به IP سرور متصل است

---

## 💡 نکته مهم

اگر می‌خواهید از **Docker Hub images** استفاده کنید:

فایل `docker-compose.production.yml` را استفاده کنید:

- Backend: `omid3179/nakhsha-backend:latest`
- Frontend: `omid3179/nakhsha-frontend:latest`
- MongoDB: `mongo:7` (از Docker Hub رسمی)

همه خودکار دانلود می‌شوند! ✨
