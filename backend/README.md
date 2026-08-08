# 🎨 Nakhsha Backend API

**نخشا** — پلتفرم صنایع دستی و فرهنگی ایران

Backend API با Node.js + Express + MongoDB

---

## 🚀 Quick Start

### پیش‌نیازها

- Node.js 18+ یا 20+
- MongoDB 6+
- npm یا yarn

### نصب و راه‌اندازی

```bash
# Clone repository
git clone https://github.com/OmidG9/Nakhsha.git
cd Nakhsha/backend

# نصب dependencies
npm install

# کپی .env.example و تنظیم
cp .env.example .env
nano .env

# اجرا در حالت development
npm run dev

# اجرا در حالت production
npm start
```

Backend در http://localhost:5000 اجرا می‌شود.

---

## API Documentation

Swagger UI در http://localhost:5000/api-docs در دسترس است.

### Main Endpoints

#### Authentication

- `POST /api/auth/register` - ثبت‌نام
- `POST /api/auth/login` - ورود
- `POST /api/auth/otp/start` - درخواست OTP
- `POST /api/auth/otp/verify` - تایید OTP
- `GET /api/auth/me` - پروفایل (نیاز به auth)

#### Crafts (محصولات)

- `GET /api/crafts` - لیست محصولات (با فیلتر و pagination)
- `GET /api/crafts/:id` - جزئیات محصول
- `POST /api/crafts` - ایجاد محصول (نیاز به auth)
- `PUT /api/crafts/:id` - ویرایش محصول (owner)
- `DELETE /api/crafts/:id` - حذف محصول (owner)

#### Geospatial

- `GET /api/listings/near` - جستجوی محصولات نزدیک

#### Health

- `GET /api/health` - بررسی سلامت سرویس

---

## 🔭 Error Monitoring (Sentry)

Production errors are captured by [Sentry](https://sentry.io) with full request
context attached to every event.

### Features

| Feature                      | Detail                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Unhandled exceptions         | Captured automatically at process level by `Sentry.init()`                                                                           |
| Unhandled promise rejections | Same — no extra code required                                                                                                        |
| 5xx Express errors           | Explicitly reported from `errorHandler.js` with reqId, route, userId                                                                 |
| Secret scrubbing             | `Authorization`, `cookie` headers and body fields (`password`, `token`, `otp`, …) are replaced with `[Filtered]` before transmission |
| Per-request tags             | `reqId` and `route` are Sentry tags; `userId` is set as the Sentry user (id only)                                                    |

### Setup

1. Create a **Node.js** project on [sentry.io](https://sentry.io).
2. Copy the DSN and add it to `.env`:

   ```env
   SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
   SENTRY_ENVIRONMENT=production
   SENTRY_TRACES_SAMPLE_RATE=0.1
   ```

3. Leave `SENTRY_DSN` empty (or unset) in local development — every monitoring
   call becomes a no-op and the app behaves identically without network traffic.

### Cross-referencing logs

Every Sentry event carries `reqId` as a searchable tag. The same value
appears in Winston access logs (`logs/all.log`) so you can jump from a Sentry
alert directly to the full log trace for that request.

### What is NOT reported

- 4xx client errors (validation failures, auth errors, not-found) — these are
  expected and are logged locally only.
- Any event while `NODE_ENV=test` — test runs are excluded via `enabled: false`.

---

## 🧪 Testing

```bash
# اجرای تمام تست‌ها
npm test

# Watch mode
npm run test:watch

# با coverage report
npm run test:coverage
```

Test coverage: **~82%** 🎯

مستندات: [**tests**/README.md](./__tests__/README.md)

---

## 📁 ساختار پروژه

```
backend/
├── config/
│   ├── env.js              # Environment validation
│   └── swagger.js          # API documentation config
├── middlewares/
│   ├── errorHandler.js     # Global error handling
│   └── validate.js         # Request validation (Zod)
├── models/
│   ├── User.js
│   ├── Artisan.js
│   ├── Craft.js
│   ├── OtpCode.js
│   └── Recipe.js
├── routes/
│   ├── auth.js
│   ├── crafts.js
│   ├── users.js
│   ├── uploads.js
│   ├── listings.near.js
│   └── health.js
├── utils/
│   ├── logger.js           # Winston logger
│   ├── errors.js           # Custom error classes
│   └── otp.js              # OTP utilities
├── __tests__/
│   ├── auth.test.js
│   ├── crafts.test.js
│   └── README.md
├── logs/                   # Log files (gitignored)
├── uploads/                # Uploaded files (gitignored)
├── .env.example
├── jest.config.js
├── package.json
└── server.js
```

---

## 🔐 Environment Variables

متغیرهای اجباری:

```env
JWT_SECRET=your-super-secret-jwt-key
```

متغیرهای اختیاری (با default):

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/nakhsha
JWT_TTL=7d
ALLOWED_ORIGINS=http://localhost:5173
LOG_LEVEL=info
```

فایل کامل: [.env.example](./.env.example)

---

## 🛡️ Security Features

### Authentication

- ✅ JWT tokens با expiration
- ✅ Password hashing با bcrypt
- ✅ OTP authentication (SMS-ready)
- ✅ Role-based access control (user/artisan/admin)

### Security Headers (Helmet)

- ✅ Content Security Policy (CSP) — strict for API routes; relaxed for `/api-docs` only
- ✅ HTTP Strict Transport Security (HSTS) — 1 year, includeSubDomains, preload
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ X-Permitted-Cross-Domain-Policies: none
- ✅ X-DNS-Prefetch-Control: off

### Rate Limiting

- ✅ Auth endpoints: 50 req/15min
- ✅ Upload endpoints: 30 req/hour
- ✅ CORS strict allowlist (exact string match, no wildcard)

### Input Validation

- ✅ Zod schemas
- ✅ Mongoose validation
- ✅ Sanitization
- ✅ JSON/URL-encoded body capped at 64 KB / 16 KB

---

## 🔐 Security Checklist (Pre-production)

Use this before every production deploy to confirm the hardening is intact.

#### CORS

- [ ] `ALLOWED_ORIGINS` is explicitly set in the production environment (no dev fallback)
- [ ] All listed origins use HTTPS and contain no trailing slash
- [ ] No wildcard (`*`) appears anywhere in CORS config or `Access-Control-Allow-Origin` response headers

#### HTTP Headers (verify with `curl -I https://api.nakhsha.ir/api/health`)

- [ ] `Content-Security-Policy` is present and does **not** contain `unsafe-inline` outside `/api-docs`
- [ ] `Strict-Transport-Security` header is present with `max-age=31536000`
- [ ] `X-Frame-Options: DENY` is present
- [ ] `X-Content-Type-Options: nosniff` is present
- [ ] `X-Powered-By` header is **absent**
- [ ] `Server` header does not expose nginx/node version (set `server_tokens off` in nginx)

#### File Uploads

- [ ] `MAX_FILE_SIZE` env var is set (default 5 MB — lower in production if acceptable)
- [ ] `GET /uploads/temp/<any-file>` returns 403 (temp directory is blocked)
- [ ] `GET /uploads/<file>.jpg` returns 403 (non-WebP extensions are blocked)
- [ ] `GET /uploads/../../etc/passwd` returns 403 (path traversal is blocked)
- [ ] Uploaded images are stored as `.webp` only — confirm with `ls -la backend/uploads/`

#### Body Limits

- [ ] `POST /api/auth/login` with a 1 MB JSON body returns 413
- [ ] Multer `LIMIT_FILE_SIZE` error returns 413 (not 500) with a Persian message

#### Environment / Secrets

- [ ] `JWT_SECRET` is at least 64 random bytes (generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
- [ ] `SENTRY_DSN` is set and points to the production Sentry project
- [ ] `.env` is **not** committed to version control (check `.gitignore`)
- [ ] MongoDB URI uses authentication (`mongodb://<user>:<pass>@...`) and is not the default dev URI

#### Error Monitoring

- [ ] Trigger a test 500 and confirm the event appears in Sentry with `reqId` tag
- [ ] Confirm `password` and `Authorization` are shown as `[Filtered]` in Sentry request data

---

## 📊 Logging

Winston logger با سطوح مختلف:

```javascript
logger.error("Critical error", { context });
logger.warn("Warning message", { data });
logger.info("Info message");
logger.http("HTTP request details");
logger.debug("Debug information");
```

Log files:

- `logs/error.log` - فقط خطاها
- `logs/all.log` - همه logs
- `logs/exceptions.log` - Uncaught exceptions

---

## 🗄️ Database

### Models

- **User**: کاربران (authentication)
- **Artisan**: هنرمندان (پروفایل حرفه‌ای)
- **Craft**: محصولات صنایع دستی
- **OtpCode**: کدهای OTP
- **Recipe**: (legacy compatibility)

### Geospatial

MongoDB 2dsphere index برای جستجوی مکان‌محور.

```javascript
// جستجوی نزدیک‌ترین محصولات
GET /api/listings/near?lng=51.6746&lat=32.6546&maxDistance=10000
```

---

## 🔧 Development

### Hot Reload

برای development، می‌توانید از nodemon استفاده کنید:

```bash
npm install -g nodemon
nodemon server.js
```

### Debug Mode

```bash
LOG_LEVEL=debug npm run dev
```

### Database Seed

```bash
# TODO: اضافه شود
npm run seed
```

---

## 📈 Performance

### Optimizations

- ✅ MongoDB indexes (geospatial, text search)
- ✅ Query pagination
- ✅ Image optimization با Sharp
- ✅ Static file serving با express.static
- 🔜 Redis caching (TODO)
- 🔜 CDN برای uploads (TODO)

---

## 🐛 Troubleshooting

### MongoDB Connection Failed

```bash
# Check MongoDB status
mongosh --eval "db.version()"

# Start MongoDB
# Windows: services.msc → MongoDB Server
# Linux: sudo systemctl start mongod
# macOS: brew services start mongodb-community
```

### Port Already in Use

```bash
# Kill process on port 5000
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/macOS
lsof -ti:5000 | xargs kill -9
```

### Environment Variables Not Loading

```bash
# مطمئن شوید .env در root backend است
ls -la .env

# و در .gitignore نیست
cat .gitignore | grep .env
```

---

## 📦 Dependencies

### Production

- `express` - Web framework
- `mongoose` - MongoDB ODM
- `jsonwebtoken` - JWT authentication
- `bcryptjs` - Password hashing
- `winston` - Logging
- `helmet` - Security headers
- `cors` - CORS handling
- `express-rate-limit` - Rate limiting
- `multer` - File uploads
- `sharp` - Image processing
- `zod` - Schema validation
- `dotenv` - Environment variables
- `envalid` - Env validation
- `swagger-jsdoc` - API docs
- `swagger-ui-express` - API docs UI

### Development

- `jest` - Testing framework
- `supertest` - HTTP testing
- `nodemon` - Hot reload (optional)

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

### Code Style

- ESLint configuration (TODO)
- Prettier formatting (TODO)
- فارسی برای پیام‌ها و comments

---

## 📄 License

MIT License - مشاهده [LICENSE](../LICENSE)

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/OmidG9/Nakhsha/issues)
- **Email**: support@nakhsha.ir (TODO)
- **Docs**: [API Documentation](http://localhost:5000/api-docs)

---

## 🎯 Roadmap

### Phase 1 (✅ Complete)

- [x] Authentication & Authorization
- [x] CRUD operations
- [x] Geospatial search
- [x] File uploads
- [x] Testing setup
- [x] Logging system

### Phase 2 (✅ Complete)

- [x] Global error handler
- [x] API documentation (Swagger)
- [x] Environment validation
- [x] Enhanced security

### Phase 3 (🔜 Planned)

- [ ] Redis caching
- [ ] E2E tests
- [ ] CI/CD pipeline
- [ ] Monitoring (Prometheus)
- [ ] Admin dashboard
- [ ] Email notifications
- [ ] SMS integration
- [ ] CDN integration

---

**🎨 ساخته شده با ❤️ برای هنرمندان ایرانی**
