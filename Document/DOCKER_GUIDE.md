# Docker Setup برای Nakhsha

## 🚀 راه‌اندازی سریع

### 1. تنظیم Environment Variables

```bash
# کپی فایل .env.docker.example
cp .env.docker.example .env

# ویرایش و تنظیم مقادیر (خصوصاً JWT_SECRET و MONGO_PASSWORD)
nano .env
```

### 2. Build و اجرای سرویس‌ها

```bash
# Build images
docker-compose build

# اجرای همه سرویس‌ها
docker-compose up -d

# مشاهده logs
docker-compose logs -f
```

### 3. دسترسی به سرویس‌ها

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Documentation**: http://localhost:5000/api-docs
- **MongoDB**: localhost:27017

---

## 🐳 دستورات Docker Compose

### اجرای سرویس‌ها

```bash
# اجرا در background
docker-compose up -d

# اجرا با نمایش logs
docker-compose up

# اجرای سرویس خاص
docker-compose up -d backend
```

### مدیریت سرویس‌ها

```bash
# توقف سرویس‌ها
docker-compose down

# توقف و حذف volumes
docker-compose down -v

# Restart سرویس
docker-compose restart backend

# مشاهده وضعیت
docker-compose ps
```

### Logs

```bash
# همه logs
docker-compose logs -f

# Logs سرویس خاص
docker-compose logs -f backend

# 100 خط آخر
docker-compose logs --tail=100 backend
```

### Build مجدد

```bash
# Build همه images
docker-compose build

# Build بدون cache
docker-compose build --no-cache

# Build سرویس خاص
docker-compose build backend
```

---

## 🔧 Development Mode

برای development، می‌توانید volumes را برای hot-reload اضافه کنید:

```yaml
# docker-compose.dev.yml
services:
  backend:
    volumes:
      - ./backend:/app
      - /app/node_modules
    command: npm run dev
```

اجرا:

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## 🗄️ مدیریت Database

### دسترسی به MongoDB Shell

```bash
docker exec -it nakhsha-mongodb mongosh -u admin -p nakhsha123
```

### Backup Database

```bash
docker exec nakhsha-mongodb mongodump --uri="mongodb://admin:nakhsha123@localhost:27017/nakhsha?authSource=admin" --out=/backup

docker cp nakhsha-mongodb:/backup ./backup
```

### Restore Database

```bash
docker cp ./backup nakhsha-mongodb:/backup

docker exec nakhsha-mongodb mongorestore --uri="mongodb://admin:nakhsha123@localhost:27017/nakhsha?authSource=admin" /backup/nakhsha
```

---

## 🔍 Troubleshooting

### بررسی Health Status

```bash
docker-compose ps
```

### دسترسی به Container

```bash
# Backend shell
docker exec -it nakhsha-backend sh

# MongoDB shell
docker exec -it nakhsha-mongodb mongosh
```

### مشاهده Resource Usage

```bash
docker stats
```

### پاک کردن کامل

```bash
# حذف containers، networks، volumes
docker-compose down -v

# حذف images
docker rmi nakhsha-backend nakhsha-frontend

# پاک کردن کامل Docker (احتیاط!)
docker system prune -a --volumes
```

---

## 📊 Production Deployment

### استفاده از Docker Swarm

```bash
docker stack deploy -c docker-compose.yml nakhsha
```

### استفاده از Kubernetes

ابتدا images را به registry آپلود کنید:

```bash
docker tag nakhsha-backend your-registry.com/nakhsha-backend:latest
docker push your-registry.com/nakhsha-backend:latest
```

---

## 🔐 Security Tips

1. **تغییر پسوردها**: حتماً `MONGO_PASSWORD` و `JWT_SECRET` را تغییر دهید
2. **استفاده از secrets**: در production از Docker secrets استفاده کنید
3. **محدود کردن ports**: فقط portهای لازم را expose کنید
4. **استفاده از SSL**: برای production حتماً SSL/TLS فعال کنید

---

## 📝 Monitoring

### Health Checks

همه سرویس‌ها health check دارند:

```bash
docker inspect --format='{{json .State.Health}}' nakhsha-backend
```

### Logs Aggregation

برای production، از ELK stack یا Loki استفاده کنید.

---

## 🎯 Next Steps

- [ ] تنظیم reverse proxy با Nginx
- [ ] پیکربندی SSL certificates
- [ ] تنظیم CI/CD pipeline
- [ ] استفاده از Docker secrets
- [ ] تنظیم monitoring با Prometheus
