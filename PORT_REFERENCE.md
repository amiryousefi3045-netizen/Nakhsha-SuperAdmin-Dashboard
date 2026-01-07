# 🔌 Port Configuration Reference - Nakhsha Project

## Standard Port Assignments

### Development Environment
```
Frontend (Vite):     5173
Backend (Express):   5000
MongoDB:             27017
```

### Docker Production Environment
```
Frontend (nginx):    3000 → 80 (container)
Backend (Express):   5000 → 5000 (container)  
MongoDB:             27018 → 27017 (container)
```

## Access URLs

### Development
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **API Docs**: http://localhost:5000/api-docs
- **Health Check**: http://localhost:5000/api/health
- **MongoDB**: mongodb://127.0.0.1:27017/nakhsha

### Docker Production
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000  
- **API Docs**: http://localhost:5000/api-docs
- **Health Check**: http://localhost:5000/api/health
- **MongoDB**: mongodb://admin:password@localhost:27018/nakhsha

## Environment Variables

### CORS Configuration
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Backend Configuration
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/nakhsha  # Development
# MONGODB_URI=mongodb://admin:password@mongodb:27017/nakhsha  # Docker
```

### Frontend Configuration
```env
VITE_API_BASE=/api
VITE_SERVER_ORIGIN=http://localhost:5000
```

## Proxy Configuration (Vite)
```javascript
// frontend/vite.config.js
server: {
  port: 5173,
  proxy: {
    "/api": "http://localhost:5000",
    "/uploads": "http://localhost:5000"
  }
}
```

## Troubleshooting Port Conflicts

### Check if port is in use:
```bash
# Windows
netstat -ano | findstr :5000
netstat -ano | findstr :5173
netstat -ano | findstr :3000
netstat -ano | findstr :27017

# Kill process using port (replace PID)
taskkill /PID <PID> /F
```

### Docker port conflicts:
```bash
# Stop all containers
docker-compose down

# Remove containers and restart
docker-compose down --volumes --remove-orphans
docker-compose up --build
```

---
*Updated: January 2026*