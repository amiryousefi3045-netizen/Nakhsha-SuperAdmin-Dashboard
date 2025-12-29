# 🐳 راهنمای کامل Docker برای Nakhsha

## ✅ چک‌لیست قبل از شروع

### 1. نصب Docker Desktop

- اگه Docker Desktop نصب نیست، [راهنمای نصب](DOCKER_INSTALLATION_GUIDE.md) رو دنبال کنید
- مطمئن بشید Docker Desktop در حال اجراست (آیکون سبز در System Tray)

### 2. بررسی Docker

```powershell
# بررسی نسخه Docker
docker --version

# بررسی Docker Compose
docker-compose --version

# بررسی اینکه Docker در حال کار است
docker ps
```

---

## 🚀 راه‌اندازی پروژه Nakhsha

### مرحله 1: آماده‌سازی Environment

```powershell
# رفتن به پوشه پروژه
cd "d:\Work\Nakhsha"

# بررسی وجود فایل .env
dir .env

# اگر فایل .env خالی است، من آن را پیکربندی کرده‌ام
# فایل .env حاوی تمام تنظیمات مورد نیاز است
```

### مرحله 2: پاک کردن Docker Cache (اگر مشکل داشتید)

```powershell
# پاک کردن همه containers و images قدیمی (اختیاری)
docker system prune -a --force

# پاک کردن volumes قدیمی (اختیاری - تنها اگر مشکل داشته باشید)
docker volume prune --force
```

### مرحله 3: Build کردن Images

```powershell
# Build کردن همه services
docker-compose build

# یا build کردن هر service جداگانه
docker-compose build backend
docker-compose build frontend
```

### مرحله 4: اجرای سرویس‌ها

```powershell
# اجرای همه services در background
docker-compose up -d

# یا اجرای با نمایش logs در real-time
docker-compose up

# فقط backend و database
docker-compose up -d mongodb backend

# فقط frontend
docker-compose up -d frontend
```

---

## 📱 دسترسی به سرویس‌ها

پس از راه‌اندازی موفق:

- **🌐 Frontend**: http://localhost:3000
- **🔧 Backend API**: http://localhost:5000
- **📚 API Documentation**: http://localhost:5000/api-docs
- **🍃 MongoDB**: localhost:27017
- **❤️ Health Check**: http://localhost:5000/api/health

---

## 🔍 مانیتورینگ و Debug

### مشاهده وضعیت containers

```powershell
# لیست containers در حال اجرا
docker ps

# لیست همه containers (شامل متوقف شده‌ها)
docker ps -a

# مشاهده logs
docker-compose logs

# مشاهده logs فقط backend
docker-compose logs backend

# مشاهده logs در real-time
docker-compose logs -f

# مشاهده logs یک container خاص
docker logs nakhsha-backend -f
```

### بررسی سلامت services

```powershell
# بررسی health check
docker-compose ps

# اجرای دستور درون container
docker exec -it nakhsha-backend npm --version
docker exec -it nakhsha-mongodb mongosh

# دسترسی به shell container
docker exec -it nakhsha-backend sh
```

---

## 🛠️ دستورات مفید Docker Compose

### مدیریت Services

```powershell
# شروع services
docker-compose start

# متوقف کردن services
docker-compose stop

# restart services
docker-compose restart

# پاک کردن همه چیز (containers, networks, volumes)
docker-compose down -v

# فقط پاک کردن containers
docker-compose down
```

### Update و Rebuild

```powershell
# rebuild بعد از تغییر در کد
docker-compose up --build

# فقط rebuild یک service
docker-compose build backend
docker-compose up -d backend
```

---

## 🚨 عیب‌یابی مشکلات رایج

### مشکل 1: "port already in use"

```powershell
# پیدا کردن process استفاده کننده از port
netstat -an | findstr :3000
netstat -an | findstr :5000
netstat -an | findstr :27017

# کشتن process (اگر لازم باشد)
taskkill /PID <PID_NUMBER> /F
```

### مشکل 2: "MongoDB connection failed"

```powershell
# بررسی logs MongoDB
docker-compose logs mongodb

# تست اتصال به MongoDB
docker exec -it nakhsha-mongodb mongosh -u admin -p nakhsha123secure
```

### مشکل 3: "Frontend build failed"

```powershell
# پاک کردن node_modules و rebuild
docker-compose down
docker-compose build --no-cache frontend
docker-compose up -d
```

### مشکل 4: "Docker Desktop not running"

```powershell
# شروع Docker Desktop
start "Docker Desktop"

# یا از Start Menu
```

---

## 🗂️ ساختار Volume ها

Docker volumes زیر ایجاد می‌شوند:

- `nakhsha-mongodb-data`: داده‌های MongoDB
- `nakhsha-mongodb-config`: کانفیگ MongoDB
- `./backend/logs`: لاگ‌های backend
- `./backend/uploads`: فایل‌های آپلود شده

---

## 📋 چک‌لیست تست نهایی

✅ Docker Desktop در حال اجرا است  
✅ فایل `.env` پیکربندی شده  
✅ `docker-compose build` بدون خطا اجرا شد  
✅ `docker-compose up -d` بدون خطا اجرا شد  
✅ `docker ps` همه containers را سبز نشان می‌دهد  
✅ http://localhost:3000 frontend را نمایش می‌دهد  
✅ http://localhost:5000/api/health پاسخ OK می‌دهد  
✅ MongoDB اتصال برقرار است

---

## 🎯 دستورات یک خطی سریع

```powershell
# شروع سریع پروژه
docker-compose up -d && docker-compose logs -f

# تنها Development (بدون production optimizations)
docker-compose -f docker-compose.yml up -d

# پاک کردن کامل و شروع دوباره
docker-compose down -v && docker system prune -f && docker-compose up -d

# مشاهده وضعیت همه چیز
docker ps && docker-compose ps
```
