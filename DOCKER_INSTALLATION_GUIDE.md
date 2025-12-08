# 🐳 راهنمای نصب Docker برای Windows

## مرحله 1: دانلود Docker Desktop

### روش اول: دانلود از سایت رسمی

1. به این لینک بروید:
   https://www.docker.com/products/docker-desktop

2. دکمه "Download for Windows" را کلیک کنید

3. فایل `Docker Desktop Installer.exe` را دانلود کنید

### روش دوم: با Winget (اگر دارید)

```powershell
winget install Docker.DockerDesktop
```

### روش سوم: با Chocolatey (اگر دارید)

```powershell
choco install docker-desktop
```

---

## مرحله 2: نصب Docker Desktop

1. فایل `Docker Desktop Installer.exe` را اجرا کنید (Run as Administrator)

2. در مرحله Configuration:
   ✅ Enable WSL 2 (پیشنهادی)
   ✅ Add shortcut to desktop

3. منتظر بمانید تا نصب کامل شود (5-10 دقیقه)

4. پس از نصب، کامپیوتر را **Restart** کنید

---

## مرحله 3: راه‌اندازی Docker Desktop

1. Docker Desktop را باز کنید

2. Accept the terms and conditions

3. منتظر بمانید تا Docker Engine راه‌اندازی شود (چند دقیقه)

4. وقتی آیکون Docker در System Tray سبز شد، آماده است! ✅

---

## مرحله 4: تست Docker

PowerShell را باز کنید و این دستورات را اجرا کنید:

```powershell
# بررسی نسخه Docker
docker --version

# بررسی Docker Compose
docker-compose --version

# تست اجرای یک container ساده
docker run hello-world
```

اگر پیام "Hello from Docker!" را دیدید، Docker با موفقیت نصب شده! 🎉

---

## 🔧 عیب‌یابی

### مشکل 1: "WSL 2 installation is incomplete"

**راه حل:**

```powershell
# اجرای این دستور در PowerShell (Run as Administrator)
wsl --install
wsl --set-default-version 2

# سپس Restart کنید
```

### مشکل 2: "Docker Desktop starting..." برای مدت طولانی

**راه حل:**

- منتظر بمانید (اولین بار کند است)
- یا Docker Desktop را Restart کنید
- یا Windows را Restart کنید

### مشکل 3: "Hardware assisted virtualization is not enabled"

**راه حل:**

1. وارد BIOS شوید
2. Virtualization Technology را Enable کنید
3. Save & Restart

---

## ✅ بعد از نصب موفق Docker

برگردید به پروژه Nakhsha و این دستورات را اجرا کنید:

```powershell
# رفتن به root پروژه
cd D:\Work\Nakhsha

# کپی کردن .env.docker.example
cp .env.docker.example .env

# ویرایش .env و تنظیم JWT_SECRET و MONGO_PASSWORD
notepad .env

# Build کردن images
docker-compose build

# اجرای همه سرویس‌ها
docker-compose up -d

# مشاهده logs
docker-compose logs -f
```

---

## 📞 نیاز به کمک؟

اگر مشکلی پیش آمد:

1. Screenshot بگیرید
2. پیام خطا را کپی کنید
3. به من بگویید تا کمک کنم!

---

**⏱️ زمان نصب:** 15-30 دقیقه
**💾 فضای مورد نیاز:** ~4-5 GB
