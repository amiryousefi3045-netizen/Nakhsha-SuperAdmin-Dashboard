**نخشا (نخشا) — مستند کامل و مستقل پروژه**

## مقدمه و هدف

نخشا یک پلتفرم فارسی‌محور و مبتنی بر نقشه برای معرفی و فروش محصولات صنایع‌دستی، نمایش کارگاه‌ها و تجربه‌های گردشگری فرهنگی در ایران است. هدف: برقراری ارتباط مستقیم بین هنرمندان و خریداران/بازدیدکنندگان، افزایش دیده‌شدن محصولات محلی، و ارائه قابلیت‌های جستجوی مکانی (نزدیک من، منطقه، محدوده) و مدیریت رویدادها (کارگاه، تور).

این فایل مستقل است: تمام اطلاعات لازم شامل وابستگی‌ها (dependencies)، اسکریپت‌ها، متغیرهای محیطی، ساختار داده‌ها، جریان احراز هویت، روش‌های استقرار، نقاط قوت و ضعف و دستورالعمل‌های راه‌اندازی محلی و تست در همین فایل قرار دارد.

## خلاصهٔ امکانات

- نمایش نقشه و جستجوی مکانی برای هنرمندان، آثار و جاذبه‌ها
- پروفایل هنرمند، لیست محصولات (دست‌ساز) با تصاویر و قیمت
- سیستم رویداد/کارگاه با امکان ثبت و مدیریت تاریخ و محل
- احراز هویت مبتنی بر OTP (کد یک‌بارمصرف) و توکن‌های JWT (دسترسی + رفرش) با چرخش refresh tokens
- ثبت وقایع Audit Log برای بررسی امنیت و تغییرات حساس
- محدودیت نرخ درخواست (rate limiting) برای مسیرهای حساس
- سرویس آپلود امن فقط تصاویر `.webp` و قواعد جلوگیری از path traversal

## معماری کلی

- Backend: Node.js + Express (entry: server.js) — ارائهٔ REST API و منطق بیزنس
- Data layer: MongoDB با Mongoose ODM
- Frontend: React (Vite) + TailwindCSS + Leaflet برای نقشه
- Deployment: پشتیبانی از Docker Compose برای توسعه و تولید، توصیه به Nginx به‌عنوان reverse proxy در تولید

## فایل‌های مهم و ساختار پوشه‌ها (خلاصه)

- `backend/` — سورس API: `server.js`, `models/`, `routes/`, `services/`, `middleware/`
- `frontend/` — اپ React با Vite
- `Document/` — (نسخه‌ی کامل در این فایل ادغام شده، نیازی به ارجاع نیست)
- `docker-compose.yml` و `docker-compose.production.yml` — تنظیمات کانتینر

## فهرست کامل وابستگی‌ها (نسخه‌ها) و اسکریپت‌ها

1. ریشهٔ پروژه (`package.json` ریشه):

dependencies:

- @tailwindcss/vite: ^4.1.11
- express-rate-limit: ^8.2.1
- helmet: ^8.1.0
- postcss: ^8.5.6
- sharp: ^0.34.5
- tailwindcss: ^4.1.11
- zod: ^4.1.12

devDependencies:

- @tailwindcss/postcss: ^4.1.11
- @vitejs/plugin-react: ^4.7.0
- concurrently: ^9.0.0
- cross-env: ^7.0.3

scripts (root):

- `dev`: concurrently backend+frontend dev
- `build`: build frontend then backend
- `start`: start backend (production)

2. Backend (`backend/package.json`):

dependencies:

- @sentry/node: ^10.39.0
- axios: ^1.11.0
- bcryptjs: ^3.0.3
- cors: ^2.8.5
- dotenv: ^17.2.0
- envalid: ^8.1.1
- express: ^5.1.0
- express-rate-limit: ^7.5.1
- form-data: ^4.0.4
- helmet: ^7.1.0
- jsonwebtoken: ^9.0.2
- melipayamak: ^1.0.5 (SMS provider integration)
- mongoose: ^8.16.4
- morgan: ^1.10.0
- multer: ^2.0.2
- sharp: ^0.34.5
- swagger-jsdoc: ^6.2.8
- swagger-ui-express: ^5.0.1
- winston: ^3.19.0
- zod: ^4.1.12

devDependencies:

- @eslint/js: ^9.30.1
- @types/jest: ^30.0.0
- cross-env: ^7.0.3
- eslint: ^9.30.1
- globals: ^16.3.0
- jest: ^30.2.0
- supertest: ^7.1.4

scripts (backend):

- `start`: NODE_ENV=production node server.js
- `dev`: NODE_ENV=development node server.js
- `lint`: eslint .
- `test`: jest (ENV=test)

3. Frontend (`frontend/package.json`):

dependencies:

- @heroicons/react: ^2.2.0
- @tailwindcss/postcss: ^4.1.11
- @tailwindcss/vite: ^4.1.11
- axios: ^1.11.0
- classnames: ^2.5.1
- leaflet: ^1.9.4
- leaflet.markercluster: ^1.5.3
- lucide-react: ^0.575.0
- react: ^19.1.0
- react-date-object: ^2.1.9
- react-dom: ^19.1.0
- react-leaflet: ^5.0.0
- react-multi-date-picker: ^4.5.2
- react-router-dom: ^7.7.0

devDependencies:

- @eslint/js: ^9.30.1
- @tailwindcss/forms: ^0.5.10
- @types/leaflet: ^1.9.21
- @types/react: ^19.1.8
- @types/react-dom: ^19.1.6
- @vitejs/plugin-react: ^4.6.0
- autoprefixer: ^10.4.21
- eslint: ^9.30.1
- eslint-plugin-react-hooks: ^5.2.0
- eslint-plugin-react-refresh: ^0.4.20
- globals: ^16.3.0
- postcss: ^8.5.6
- tailwindcss: ^4.1.11
- typescript: ^5.3.3
- vite: ^7.0.4
- vitest: ^4.0.18

توجه: نسخه‌ها در زمان نوشتن این فایل از package.json خوانده شده‌اند؛ قبل از نصب در محیط جدید، `npm install` اجرا کنید.

## متغیرهای محیطی مهم (ENV) و توضیحات

- `MONGODB_URI` — رشتهٔ اتصال به MongoDB (پیش‌فرض: mongodb://127.0.0.1:27017/nakhsha)
- `PORT` — پورت سرور (پیش‌فرض: 5000)
- `NODE_ENV` — environment (development|production|test)
- `ALLOWED_ORIGINS` — فهرست دامنه‌های مجاز برای CORS، جداشده با کاما
- `JWT_SECRET` — کلید امضای توکن‌های دسترسی
- `JWT_REFRESH_SECRET` — کلید امضای توکن‌های رفرش
- `SENTRY_DSN` — آدرس Sentry برای مانیتورینگ خطا (اختیاری)
- `SYNC_INDEXES` — اگر به `true` تنظیم شود، هنگام راه‌اندازی شاخص‌ها همگام‌سازی می‌شوند (محتاط باشید)

## نحوهٔ راه‌اندازی محلی (خط به خط)

1. از ریشه:

```bash
npm install
npm run dev
```

این دستور با `concurrently` هم‌زمان backend و frontend را در حالت توسعه اجرا می‌کند.

یا جداگانه:

```bash
cd backend
npm install
npm run dev

cd ../frontend
npm install
npm run dev
```

برای بررسی سلامت سرویس (پس از راه‌اندازی backend):

```bash
curl http://localhost:5000/api/health
```

## شرح مدل‌های داده‌ای (خلاصه)

1. User

- فیلدها: name, email, passwordHash, role (user|artisan|admin), location {city, province, coordinates [lng, lat]}, verified, createdAt

2. Artisan

- فیلدها: userId (ارجاع به User), craftType، bio، stars، verified، region

3. Craft (محصول)

- فیلدها: artisanId، title، description، images[], price، forSale (boolean)، tags، createdAt

4. Event (کارگاه/تور)

- فیلدها: title، description، location {city، coordinates}، date، organizer (User)، tags

5. OtpCode

- ذخیرهٔ کدهای یک‌بارمصرف با TTL index برای منقضی‌شدن خودکار

6. RefreshToken (جلسه)

- ذخیره توکن‌های رفرش مرتبط با کاربر و اطلاعات جلسه برای ردیابی و انسداد

7. AuditLog

- لاگ رویدادهای حساس با اطلاعات: who، what، when، meta

8. Draft / Listing

- مدل‌هایی برای پشتیبانی از ذخیرهٔ موقت و لیستینگ‌های مکانی (با indexهای جغرافیایی 2dsphere)

## جریان احراز هویت و توکن‌ها

1. کاربر با شماره/ایمیل درخواست OTP می‌دهد (`/api/auth/otp/request` یا مسیر مشابه).
2. سرور کد OTP تولید و ذخیره می‌کند (با TTL) و آن را از طریق SMS (یکپارچه‌سازی با Melipayamak) ارسال می‌کند.
3. کاربر کد را ارسال می‌کند (`/api/auth/otp/verify`). در صورت موفقیت، سرور:
   - یک `accessToken` کوتاه‌مدت (JWT) صادر می‌کند.
   - یک `refreshToken` طولانی‌تر صادر می‌کند و رکورد آن در collection `refreshTokens` ذخیره می‌شود (برای ردیابی جلسات).
4. refresh token با هر درخواست رفرش چرخش (rotation) می‌شود: وقتی کاربر `/api/auth/refresh` را فراخوانی می‌کند، سرور توکن قدیمی را باطل می‌کند و یک توکن رفرش جدید صادر می‌کند تا حملات replay کاهش یابد.
5. خروج (logout) مسیرهایی برای ابطال یک جلسه یا همهٔ جلسات کاربر وجود دارد.

## امنیت و قوانین سخت‌گیری

- CORS: در تولید فقط originهای مشخص‌شده در `ALLOWED_ORIGINS` مجاز هستند. در توسعه localhost مجاز است.
- Helmet: هدرهای امنیتی، CSP سخت برای API و فایل‌های استاتیک؛ استثناء برای UI داک‌های Swagger با CSP مناسب.
- Rate limiting: محدوده‌های جداگانه برای مسیرهای احراز هویت و آپلودها برای جلوگیری از حملهٔ بروت‌فورس و سوء‌استفاده.
- اندازهٔ بدنهٔ درخواست محدود شده (`express.json({ limit: '64kb' })`) تا حملات DOS با payload بزرگ کاهش یابند.
- آپلودها: تنها فایل‌های `.webp` سرو می‌شوند؛ مسیر `/uploads/temp` نباید در دسترس عمومی باشد؛ هددرهای کش و امنیتی ارسال می‌شوند.

## تنظیمات MongoDB و شاخص‌ها

- اتصال: `maxPoolSize: 25`, `minPoolSize: 5`, `maxIdleTimeMS: 30000`, `socketTimeoutMS: 30000` — مقادیر پیش‌فرض مناسب برای بار متوسط؛ تعدیل با توجه به بار واقعی لازم است.
- indexهای جغرافیایی: برای جستجوی نزدیک-من از `2dsphere` استفاده می‌شود و باید روی فیلد `location.geometry` وجود داشته باشد.
- TTL index: برای مجموعهٔ OTP codes یک TTL index وجود دارد تا کد‌ها خودبه‌خود پاک شوند.
- همگام‌سازی ایندکس‌ها (`syncIndexes`) در محیط تولید به‌صورت پیش‌فرض غیرفعال است؛ فعال‌سازی می‌تواند منجر به DROP/CREATE روی کلکسیون‌ها شود.

## پشتیبان‌گیری و بازیابی (مقدماتی)

- پشتیبان‌گیری با `mongodump`:

```bash
mongodump --uri="$MONGODB_URI" --archive=backup-$(date +%F).gz --gzip
```

- بازیابی با `mongorestore`:

```bash
mongorestore --uri="$MONGODB_URI" --archive=backup-YYYY-MM-DD.gz --gzip --drop
```

## نکات استقرار (Production)

- HTTPS ضروری است: توصیهٔ اصلی استفاده از Nginx به‌عنوان reverse proxy و خودکارسازی SSL با Let's Encrypt (Certbot یا companion برای docker nginx-proxy).
- در Nginx هدرهای `X-Forwarded-For` تنظیم شود و `app.set('trust proxy', 1)` در اپ فعال بماند.
- `ALLOWED_ORIGINS` را به دامنه(های) فرانت‌اند تنظیم کنید؛ از wildcard در تولید دوری کنید.
- تنظیم مقیاس: MongoDB مدیریت‌شده یا سرور مجزا، پیکربندی منابع مناسب و مانیتورینگ
- راه‌اندازی لاگ‌ها، گردش فایل‌های لاگ و نگهداری آن‌ها (Winston + فایل یا جمع‌آوری به سرویس مانیتورینگ)

## تست‌ها و کیفیت کد

- Backend: تست‌های واحد و انتگرال با `jest` و `supertest`.
- Frontend: تست‌های واحد/اجرا با `vitest`.
- ESLint در هر دو سمت برای یکنواختی استایل کد.

## نقاط قوت (Strengths)

- طراحی امنیت‌محور: Helmet، rate-limiting، CSP و محدودیت payload
- احراز هویت مدرن: OTP و refresh-token rotation برای کاهش ریسک‌ سرقت توکن
- معماری جداسازی frontend/backed با کانتینریزه شدن برای استقرار آسان
- پشتیبانی از جستجوی مکانی و ایندکس‌های جغرافیایی برای موارد استفادهٔ اصلی
- Audit logging برای پیگیری تغییرات حساس

## نقاط ضعف و محدودیت‌ها (Weaknesses)

- HTTPS / reverse-proxy تولید هنوز باید کامل شود و برای تولید حیاتی است
- برخی مسیرها و امکانات فرانت‌اند ممکن است تست‌های e2e کافی نداشته باشند
- اگر SYNC_INDEXES فعال شود، احتمال وقفه کوتاه در پایگاه‌داده وجود دارد؛ نیاز به برنامه‌ریزی
- وابستگی به سرویس SMS (melipayamak)؛ در محیط‌هایی که این سرویس در دسترس نیست، نیاز به mock یا جایگزین

## مسیرهای API مهم (مثال‌ها)

- `GET /api/health` — سلامت سرویس
- `POST /api/auth/otp/request` — درخواست ارسال کد OTP (ورودی: شماره/ایمیل)
- `POST /api/auth/otp/verify` — بررسی کد OTP و صدور توکن‌ها
- `POST /api/auth/refresh` — دریافت access token جدید با refresh token
- `POST /api/auth/logout` — ابطال یک نشست (refresh token)
- `GET /api/crafts` — لیست محصولات (پشتیبانی از پارامترهای مکانی)
- `POST /api/uploads` — آپلود تصویر (محدودیت‌ها اعمال می‌شود)

## نمونهٔ سیاست CORS و رفتار در توسعه/تولید

- `ALLOWED_ORIGINS` به صورت لیست کاما-جدا نگهداری می‌شود.
- در حالت توسعه (NODE_ENV != production) درخواست‌هایی با hostname `localhost` یا `127.0.0.1` مجاز هستند.

## نکات عیب‌یابی سریع

- اگر اتصال به MongoDB برقرار نشد: بررسی `MONGODB_URI`، فایروال، و در دسترس بودن سرویس MongoDB
- خطاهای CORS: مقدار `ALLOWED_ORIGINS` را چک کنید و origin درخواست را لاگ‌ها بررسی کنید
- مشکلات JWT: اطمینان از وجود و یکسان بودن `JWT_SECRET` و `JWT_REFRESH_SECRET`

## مراحل پیشنهادی بعدی (عملیاتی)

1. پیاده‌سازی و آزمون Nginx + Let's Encrypt در محیط staging
2. پیاده‌سازی silent-refresh در فرانت‌اند برای UX بهتر و هماهنگی با refresh-token rotation
3. اضافه کردن e2e tests برای flow ورود/رفرش و جستجوی مکانی
4. تنظیم CI: lint -> test -> build -> image build

## راهنمای ارائهٔ پروژه به یک مدل زبانی (مثل ChatGPT جدید)

برای اینکه مدل به‌خوبی پروژه را بفهمد، کافی است این فایل را به عنوان تنها منبع ورودی بدهید. خلاصهٔ اطلاعات کلیدی که مدل نیاز دارد:

- اهداف: بازار صنایع‌دستی، نمایش نقشه، فروش و تجربه‌های محلی
- معماری: Node/Express backend، MongoDB، React/Vite frontend، Leaflet
- احراز هویت: OTP + JWT (access + refresh) با روتیشن توکن رفرش
- نکات امنیتی: Helmet, CSP, rate-limiting, محدودیت آپلودها
- وابستگی‌ها: فهرست دقیق package.json های root، backend، frontend آمده است
- مسیرهای API و قراردادهای اصلی: health, auth (otp/verify/refresh/logout), crafts, uploads

وقتی این فایل را در ورودی قرار دهید، مدل می‌تواند بدون نیاز به فایل‌های اضافی:

- پیشنهاد معماری استقرار (Nginx, Docker Compose)
- نحوهٔ اصلاح یا بهبود جریان توکن‌ها در فرانت‌اند
- تولید نمونه‌هٔ کد برای endpoint های مشخص

## پایان
