# راهنمای تست‌نویسی - Nakhsha Backend

## 🧪 اجرای تست‌ها

```bash
# اجرای همه تست‌ها
npm test

# اجرای تست‌ها در حالت watch
npm run test:watch

# اجرای تست‌ها با coverage report
npm run test:coverage
```

## 📁 ساختار تست‌ها

```
backend/
  __tests__/
    auth.test.js       # تست‌های احراز هویت
    crafts.test.js     # تست‌های محصولات (آینده)
    users.test.js      # تست‌های کاربران (آینده)
```

## ✅ Coverage هدف

- **Statements**: حداقل 70%
- **Branches**: حداقل 60%
- **Functions**: حداقل 70%
- **Lines**: حداقل 70%

## 📝 نکات مهم

### پیش‌نیازها

قبل از اجرای تست‌ها، مطمئن شوید MongoDB در حال اجرا است:

```bash
# چک کردن MongoDB
mongosh --eval "db.version()"
```

### Database جداگانه برای Test

تست‌ها از یک database جداگانه استفاده می‌کنند:

- **Development**: `nakhsha`
- **Test**: `nakhsha_test`

برای تنظیم database تست:

```bash
export MONGODB_TEST_URI="mongodb://127.0.0.1:27017/nakhsha_test"
```

### نوشتن تست جدید

```javascript
const request = require("supertest");
const app = require("../server");

describe("Feature Name", () => {
  describe("POST /api/endpoint", () => {
    it("should do something", async () => {
      const response = await request(app)
        .post("/api/endpoint")
        .send({ data: "value" })
        .expect(200);

      expect(response.body).toHaveProperty("expectedKey");
    });
  });
});
```

## 🔍 CI/CD Integration

تست‌ها به صورت خودکار در GitHub Actions اجرا می‌شوند:

```yaml
# .github/workflows/backend-ci.yml
- name: Run tests
  run: npm test
  working-directory: ./backend
```

## 📊 Coverage Report

بعد از اجرای `npm run test:coverage`، فایل HTML coverage در `coverage/lcov-report/index.html` ایجاد می‌شود.

برای مشاهده:

```bash
# Windows
start coverage/lcov-report/index.html

# macOS
open coverage/lcov-report/index.html

# Linux
xdg-open coverage/lcov-report/index.html
```
