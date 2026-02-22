# 🗺️ Nakhsha (نخشا)

**نخشا** — پلتفرم صنایع دستی، فرهنگی و توریستی ایران

پلتفرمی برای نمایش، خرید و تجربه صنایع‌دستی و فرهنگ اصیل ایرانی بر روی نقشه تعاملی.

---

## 📚 مستندات

**تمام مستندات پروژه در پوشه [`Document/`](Document/) موجود است.**

### 🚀 شروع سریع

برای استقرار پروژه:

- **با aaPanel**: [`Document/AAPANEL_QUICK_START.md`](Document/AAPANEL_QUICK_START.md)
- **با Docker**: [`Document/DOCKER_COMPLETE_GUIDE.md`](Document/DOCKER_COMPLETE_GUIDE.md)

### 📖 فهرست کامل مستندات

برای دسترسی به تمام مستندات:
👉 **[Document/README.md](Document/README.md)**

---

## 🏗️ ساختار پروژه

```
Nakhsha/
├── backend/          # Node.js + Express + MongoDB API
├── frontend/         # React + Vite + TailwindCSS
├── Document/         # 📚 تمام مستندات پروژه
├── docker-compose.yml                # Docker Compose اصلی
├── docker-compose.production.yml     # Production با Docker Hub images
└── docker-compose.aapanel.yml        # تنظیمات aaPanel
```

---

## 🚀 استقرار سریع

### روش ۱: با Docker Compose (توصیه می‌شود)

```bash
# Clone پروژه
git clone https://github.com/yourusername/Nakhsha.git
cd Nakhsha

# ساخت فایل .env برای backend
cp backend/.env.example backend/.env
# ویرایش و تنظیم مقادیر

# اجرا
docker-compose up -d
```

پروژه در دسترس است:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- MongoDB: localhost:27018

### روش ۲: بدون Docker

#### Backend

```bash
cd backend
npm install
cp .env.example .env
# ویرایش .env و تنظیم MONGODB_URI
npm run dev
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 🐳 استقرار Production

### با aaPanel

از Docker Hub images استفاده کنید:

```bash
# روی سرور
docker-compose -f docker-compose.aapanel.yml up -d
```

**راهنمای کامل**: [Document/AAPANEL_DEPLOYMENT_GUIDE.md](Document/AAPANEL_DEPLOYMENT_GUIDE.md)

### با Docker Images از Docker Hub

ایمیج‌های آماده:

- Backend: `omid3179/nakhsha-backend:latest`
- Frontend: `omid3179/nakhsha-frontend:latest`
- MongoDB: `mongo:7` (رسمی)

```bash
docker-compose -f docker-compose.production.yml up -d
```

---

## 🛠️ تکنولوژی‌ها

### Backend

- **Runtime**: Node.js 20+
- **Framework**: Express 5
- **Database**: MongoDB 7 + Mongoose
- **Authentication**: JWT + OTP
- **Validation**: Zod
- **File Upload**: Multer + Sharp
- **Security**: Helmet, Rate Limiting
- **Logging**: Winston + Morgan

### Frontend

- **Framework**: React 18 + Vite
- **Styling**: TailwindCSS
- **Maps**: Leaflet
- **HTTP Client**: Axios
- **State**: React Context
- **Routing**: React Router

### DevOps

- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions (optional)
- **Proxy**: nginx (frontend serving)

---

## 📋 قابلیت‌های اصلی

### 🗺️ نقشه تعاملی

- نمایش هنرمندان و صنعتگران روی نقشه ایران
- جستجوی مکانی (Geospatial Search) با شعاع قابل تنظیم
- Clustering برای نمایش بهتر

### 👤 احراز هویت

- ورود با شماره موبایل
- OTP با Melipayamak
- JWT Token Authentication
- Rate Limiting برای جلوگیری از سوء استفاده

### 🎨 صنایع‌دستی

- ثبت و مدیریت محصولات صنایع‌دستی
- دسته‌بندی: نقاشی، سفال، فلزکاری، فرش، و...
- آپلود تصاویر با بهینه‌سازی خودکار
- فیلتر پیشرفته (قیمت، نوع، موقعیت)

### 🎭 رویدادها و کارگاه‌ها

- ثبت رویدادهای فرهنگی
- کارگاه‌های آموزشی صنایع‌دستی
- تجربه‌های توریستی محلی

---

## � تنظیم متغیرهای محیطی (Environment Setup)

**هرگز فایل `.env` را به مخزن git اضافه نکنید.**

### Backend

```bash
cd backend
cp .env.example .env   # ویندوز: copy .env.example .env
```

فایل `backend/.env` را باز کنید و مقادیر زیر را پر کنید:

| متغیر             | توضیح                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`     | آدرس اتصال به MongoDB                                                                                      |
| `JWT_SECRET`      | رشته تصادفی طولانی — اجرا کنید: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `OTP_SECRET`      | رشته تصادفی جداگانه برای OTP                                                                               |
| `SMS_USERNAME`    | نام کاربری MeliPayamak                                                                                     |
| `SMS_PASSWORD`    | رمز API سرویس SMS                                                                                          |
| `SMS_MOCK`        | در محیط توسعه `true` قرار دهید تا SMS واقعی ارسال نشود                                                     |
| `ALLOWED_ORIGINS` | Originهای مجاز CORS (جدا با ویرگول)                                                                        |

### Docker Compose (ریشه پروژه)

```bash
cp .env.example .env   # ویندوز: copy .env.example .env
```

مقادیر `MONGO_USERNAME`، `MONGO_PASSWORD` و `JWT_SECRET` را با مقادیر امن جایگزین کنید.

---

## 🔒 امنیت

پروژه شامل قابلیت‌های امنیتی زیر است:

- ✅ **Secret management**: فایل‌های `.env` در `.gitignore` — هرگز commit نمی‌شوند
- ✅ **MongoDB Hardening**: Indexing بهینه، TTL برای OTP
- ✅ **Input Validation**: Zod schemas در همه endpointها
- ✅ **Rate Limiting**: محدودیت درخواست برای جلوگیری از spam
- ✅ **Helmet**: Security headers
- ✅ **CORS**: تنظیمات origin محدود
- ✅ **JWT**: Token-based authentication
- ✅ **Password Hashing**: bcrypt برای رمزهای عبور

مستندات کامل: [Document/MONGODB_PRODUCTION_HARDENING.md](Document/MONGODB_PRODUCTION_HARDENING.md)

---

## 📊 API Documentation

### Endpoints اصلی

```
POST   /api/auth/request-otp       # درخواست OTP
POST   /api/auth/verify-otp        # تایید OTP و ورود
GET    /api/auth/me                # اطلاعات کاربر

GET    /api/crafts                 # لیست صنایع‌دستی
GET    /api/crafts/:id             # جزئیات یک صنعت
POST   /api/crafts                 # ایجاد صنعت جدید (نیاز به احراز هویت)
GET    /api/crafts/near            # جستجوی مکانی

GET    /api/users/:handle          # پروفایل عمومی کاربر
PATCH  /api/users/profile          # ویرایش پروفایل (نیاز به احراز هویت)
```

مستندات کامل API: [Document/GEOSPATIAL_API_QUICK_REFERENCE.md](Document/GEOSPATIAL_API_QUICK_REFERENCE.md)

---

## 🧪 تست

```bash
# Backend tests
cd backend
npm test

# با coverage
npm run test:coverage
```

مستندات تست: [Document/TESTING_AND_LOGGING_IMPLEMENTATION.md](Document/TESTING_AND_LOGGING_IMPLEMENTATION.md)

---

## 🤝 مشارکت

1. Fork کنید
2. Branch جدید بسازید (`git checkout -b feature/amazing-feature`)
3. تغییرات را commit کنید (`git commit -m 'Add amazing feature'`)
4. به Branch خود push کنید (`git push origin feature/amazing-feature`)
5. Pull Request باز کنید

---

## 📝 لایسنس

این پروژه تحت لایسنس MIT منتشر شده است.

---

## 👨‍💻 نویسندگان

- **Backend**: Omid Ghaderi
- **Frontend**: [نام شما]

---

## 🔗 لینک‌های مفید

- [مستندات کامل](Document/README.md)
- [راهنمای استقرار aaPanel](Document/AAPANEL_QUICK_START.md)
- [راهنمای Docker](Document/DOCKER_COMPLETE_GUIDE.md)
- [مستندات Geospatial](Document/GEOSPATIAL_HARDENING_COMPLETE.md)
- [مستندات MongoDB](Document/MONGODB_PRODUCTION_HARDENING.md)

---

**ساخته شده با ❤️ برای فرهنگ و هنر ایران**
