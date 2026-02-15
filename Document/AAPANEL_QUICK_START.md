# 🚀 راهنمای سریع: استقرار در aaPanel

## ✅ پاسخ سوال شما

**سوال:** آیا دیتابیس MongoDB در ایمیج‌ها هست؟  
**جواب:** **خیر!** MongoDB یک container جداگانه است.

**توضیح:**

- ✅ ایمیج Backend: فقط کد Node.js (بدون MongoDB)
- ✅ ایمیج Frontend: فقط فایل‌های HTML/CSS/JS (بدون MongoDB)
- ✅ MongoDB: یک ایمیج جداگانه که خودکار دانلود می‌شود

وقتی `docker-compose` را اجرا می‌کنید، **هر سه** (Frontend + Backend + MongoDB) بالا می‌آیند.

---

## 📦 چه چیزی دانلود می‌شود؟

```bash
docker-compose up -d
```

این دستور خودکار:

1. ✅ `mongo:7` را از Docker Hub دانلود می‌کند (دیتابیس)
2. ✅ `omid3179/nakhsha-backend:latest` را دانلود می‌کند (شما ساختید)
3. ✅ `omid3179/nakhsha-frontend:latest` را دانلود می‌کند (شما ساختید)
4. ✅ هر سه را اجرا و به هم وصل می‌کند

---

## 🎯 مراحل استقرار (خیلی ساده!)

### مرحله 1️⃣: اتصال SSH به سرور

```bash
ssh root@your-server-ip
```

### مرحله 2️⃣: نصب Docker (اگر نصب نیست)

```bash
# نصب Docker
curl -fsSL https://get.docker.com | sh

# نصب Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# بررسی نصب
docker --version
docker-compose --version
```

### مرحله 3️⃣: آپلود فایل‌های پروژه

**گزینه الف: با Git**

```bash
cd /www/wwwroot
git clone https://github.com/yourusername/Nakhsha.git
cd Nakhsha
```

**گزینه ب: آپلود دستی**

- فایل‌های پروژه را Zip کنید
- در aaPanel آپلود کنید به `/www/wwwroot/Nakhsha`

### مرحله 4️⃣: ساخت فایل .env

```bash
cd /www/wwwroot/Nakhsha

# ساخت فایل .env.production
cat > .env.production << 'EOF'
MONGO_USERNAME=admin
MONGO_PASSWORD=nakhsha_secure_password_123
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
ALLOWED_ORIGINS=http://your-domain.com
EOF
```

**⚠️ مهم:** رمزها را تغییر دهید!

### مرحله 5️⃣: اجرا!

```bash
# اجرای همه سرویس‌ها (MongoDB + Backend + Frontend)
docker-compose -f docker-compose.aapanel.yml --env-file .env.production up -d
```

### مرحله 6️⃣: بررسی

```bash
# بررسی وضعیت
docker-compose -f docker-compose.aapanel.yml ps

# باید ببینید:
# nakhsha-mongodb    Up (healthy)
# nakhsha-backend    Up (healthy)
# nakhsha-frontend   Up
```

**✅ تمام!** سایت شما روی `http://server-ip` در دسترس است!

---

## 🔍 بررسی عملکرد

```bash
# لاگ Backend
docker-compose -f docker-compose.aapanel.yml logs -f backend

# لاگ MongoDB
docker-compose -f docker-compose.aapanel.yml logs -f mongodb

# تست API
curl http://localhost:5000/api/health
```

---

## 🌐 اتصال دامنه

### در aaPanel:

1. **Website** → **Add site**
2. Domain: `yourdomain.com`
3. **Reverse proxy**:
   - Frontend: `http://127.0.0.1:80`
   - Backend API: `http://127.0.0.1:5000`

### نصب SSL:

1. **SSL** → **Let's Encrypt**
2. وارد کردن ایمیل
3. **Apply**

---

## 🔄 دستورات مفید

```bash
# Restart همه
docker-compose -f docker-compose.aapanel.yml restart

# Restart فقط Backend
docker-compose -f docker-compose.aapanel.yml restart backend

# مشاهده لاگ‌ها
docker-compose -f docker-compose.aapanel.yml logs -f

# توقف
docker-compose -f docker-compose.aapanel.yml down

# به‌روزرسانی (Pull آخرین نسخه)
docker-compose -f docker-compose.aapanel.yml pull
docker-compose -f docker-compose.aapanel.yml up -d
```

---

## 📊 داده‌های MongoDB کجا ذخیره می‌شوند؟

داده‌ها در **Docker Volume** ذخیره می‌شوند (حتی بعد از restart از بین نمی‌روند):

```bash
# لیست volumes
docker volume ls

# بررسی محل ذخیره
docker volume inspect nakhsha_mongodb-data
```

---

## 🐛 عیب‌یابی

### Backend به MongoDB وصل نمی‌شود

بررسی کنید نام سرویس درست باشد:

```env
# در .env.production
MONGODB_URI=mongodb://admin:password@mongodb:27017/nakhsha?authSource=admin
#                                     ^^^^^^^^
#                                     این باید 'mongodb' باشد نه 'localhost'
```

### Port 80 قبلاً استفاده شده

```bash
# تغییر port در docker-compose.aapanel.yml
ports:
  - "8080:80"    # استفاده از 8080
```

سپس دسترسی با: `http://server-ip:8080`

---

## ✅ چک‌لیست

- [ ] Docker نصب است
- [ ] Docker Compose نصب است
- [ ] فایل `docker-compose.aapanel.yml` روی سرور است
- [ ] فایل `.env.production` ساخته شده (با رمزهای تغییر یافته)
- [ ] `docker-compose up -d` اجرا شده
- [ ] با `docker-compose ps` همه سرویس‌ها Up هستند
- [ ] سایت روی `http://server-ip` باز می‌شود

---

## 💡 خلاصه

```
شما: آیا MongoDB در ایمیج‌ها هست؟
من: خیر! MongoDB جدا دانلود می‌شود.

یک دستور، سه سرویس:
  docker-compose up -d

✅ MongoDB (خودکار از Docker Hub)
✅ Backend (از repository شما)
✅ Frontend (از repository شما)
```

**نیازی به نصب جداگانه MongoDB ندارید!** 🎉
