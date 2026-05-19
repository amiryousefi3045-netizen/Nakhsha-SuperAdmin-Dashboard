# Local Development Setup (Without Docker)

This guide walks you through setting up Nakhsha (نخشا) for local development using Node.js and MongoDB, without Docker containers.

---

## Prerequisites

Before starting, ensure you have the following installed on your machine:

- **Node.js** (v20 or higher) - [Download](https://nodejs.org/)
- **npm** (v10 or higher) - Comes with Node.js
- **MongoDB Community Edition** - [Download](https://www.mongodb.com/try/download/community)
- **Git** - For cloning the repository

### Verify Installation

```bash
node --version      # Should be v20.x or higher
npm --version       # Should be v10.x or higher
mongod --version    # Should be v7.x or higher
```

---

## Step 1: Install MongoDB Locally

MongoDB will run as a background service on your machine and handle all database operations.

### On Windows

1. **Download MongoDB Community Edition** for Windows from [mongodb.com](https://www.mongodb.com/try/download/community)
2. **Run the installer** (.msi file) and follow the installation wizard
   - ✅ Install MongoDB as a Windows Service (recommended for auto-start)
   - ✅ Install MongoDB Compass (MongoDB GUI tool - optional but helpful)
3. **Verify MongoDB is running**:
   ```bash
   mongosh  # Or: mongo (depending on MongoDB version)
   ```
   You should see the MongoDB shell prompt: `test>`
   Type `exit` to quit.

### On macOS (Intel/Apple Silicon)

```bash
# Install via Homebrew (easiest method)
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB as a background service
brew services start mongodb-community

# Verify it's running
mongosh
# You should see: test>
```

### On Linux (Ubuntu/Debian)

```bash
# Install MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB service
sudo systemctl start mongod

# Enable auto-start on boot
sudo systemctl enable mongod

# Verify it's running
mongosh
# You should see: test>
```

### Verify MongoDB Connection

```bash
# Connect to MongoDB
mongosh

# In the MongoDB shell, run:
db.adminCommand('ping')

# Should output: { ok: 1 }
```

**Port Check**: MongoDB should be running on `127.0.0.1:27017` (the default port).

---

## Step 2: Clone & Install Project

```bash
# Clone the repository
git clone https://github.com/your-username/nakhsha.git
cd nakhsha

# Install root dependencies (includes concurrently)
npm install

# Install backend dependencies
npm install --prefix backend

# Install frontend dependencies
npm install --prefix frontend
```

---

## Step 3: Configure Environment Variables

### Create Root `.env` File

```bash
# Copy the example
cp .env.example .env

# Open .env in your editor and update:
# - PORT=5000                                  (backend port)
# - MONGODB_URI=mongodb://127.0.0.1:27017/nakhsha (local MongoDB)
# - JWT_SECRET=<generate-a-secure-value>      (see command below)
# - ALLOWED_ORIGINS=http://localhost:5173,... (for CORS)
```

**Generate a secure JWT_SECRET**:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Root `.env` Example Values

```env
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/nakhsha
PORT=5000
JWT_SECRET=<your-secure-random-value>
JWT_TTL=7d
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:5000
LOG_LEVEL=info
VITE_API_BASE=/api
VITE_SERVER_ORIGIN=http://localhost:5000
```

### Create Backend `.env` File

```bash
# Copy the example
cp backend/.env.example backend/.env

# The defaults should work for local development:
# - NODE_ENV=development
# - PORT=5000
# - MONGODB_URI=mongodb://127.0.0.1:27017/nakhsha
# - ALLOWED_ORIGINS includes localhost:5173, localhost:3000, localhost:5000
# - SMS_MOCK=true (skips real SMS calls and prints OTP to console)
# - SENTRY_TRACES_SAMPLE_RATE=0 (disable Sentry in dev)
```

### Backend `.env` Example Values

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/nakhsha
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/nakhsha_test
JWT_SECRET=<same-value-as-root-.env>
JWT_TTL=7d
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:5000
SMS_MOCK=true
SMS_USERNAME=<your-melipayamak-username>
SMS_PASSWORD=<your-melipayamak-password>
SMS_FROM=<your-sender-number>
SYNC_INDEXES=false
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=0
OTP_SECRET=<generate-another-secure-value>
OTP_TTL_SECONDS=120
OTP_RESEND_SECONDS=30
OTP_MAX_ATTEMPTS=8
```

**Generate OTP_SECRET**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 4: Start the Development Environment

Open a terminal in the project root and run:

```bash
# Start both backend and frontend concurrently
npm run dev
```

You should see output like:

```
[backend] Server running on http://localhost:5000
[frontend] VITE v... ready in ... ms
```

### What's Running

| Service      | URL                   | Purpose                       |
| ------------ | --------------------- | ----------------------------- |
| **Frontend** | http://localhost:5173 | React app (Vite dev server)   |
| **Backend**  | http://localhost:5000 | API server (Express)          |
| **MongoDB**  | localhost:27017       | Database (background service) |

---

## Step 5: Test the Setup

### Test Backend API

```bash
# In a new terminal, test the backend health check
curl http://localhost:5000/api/health

# Should return: { "ok": true }
```

### Test Frontend

1. Open your browser: http://localhost:5173
2. You should see the Nakhsha home page (نخشا)
3. Try signing up or logging in to test end-to-end functionality

### Test Database

```bash
# In a new terminal, connect to MongoDB
mongosh

# List databases
show dbs

# Switch to nakhsha database
use nakhsha

# Check collections
show collections

# Example: Count users
db.users.countDocuments()
```

---

## Available npm Scripts

```bash
# Start backend + frontend together (recommended for development)
npm run dev

# Start backend only
npm run dev:backend

# Start frontend only
npm run dev:frontend

# Build for production
npm run build

# Start production build (requires npm run build first)
npm run start

# Run backend tests
npm test

# Run backend tests with coverage
npm run test:coverage
```

---

## Troubleshooting

### MongoDB Connection Error

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:27017`

**Solution**:

1. Ensure MongoDB is running as a service:
   - **Windows**: Open "Services" app and look for "MongoDB Server" (should be running)
   - **macOS**: Run `brew services list | grep mongodb` (should show "started")
   - **Linux**: Run `sudo systemctl status mongod` (should show "active")
2. If MongoDB isn't running, start it:
   - **Windows**: Open Services app → Right-click MongoDB Server → Start
   - **macOS**: Run `brew services start mongodb-community`
   - **Linux**: Run `sudo systemctl start mongod`

### Port Already in Use

**Error**: `Error: listen EADDRINUSE :::5000`

**Solution**: The port 5000 is already in use. Either:

- Kill the process using port 5000, or
- Change the PORT in `.env` to an unused port (e.g., 5001)

```bash
# Find and kill process on port 5000 (macOS/Linux)
lsof -ti:5000 | xargs kill -9

# For Windows, use:
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Frontend Can't Connect to Backend

**Error**: API requests fail in the browser console

**Solution**:

1. Verify backend is running on port 5000
2. Check CORS configuration in `backend/.env`:
   - Ensure `ALLOWED_ORIGINS` includes `http://localhost:5173`
3. Check frontend Vite proxy in `frontend/vite.config.ts`:
   - Verify `/api` proxy target is `http://localhost:5000`

### Dependency Installation Issues

**Error**: `npm ERR! command failed` during install

**Solution**:

```bash
# Clear npm cache and try again
npm cache clean --force
rm -rf node_modules package-lock.json

# Reinstall
npm install
npm install --prefix backend
npm install --prefix frontend
```

### MongoDB Authentication Issues

If you enabled MongoDB authentication:

```env
# Update MONGODB_URI in .env files:
MONGODB_URI=mongodb://admin:your-password@127.0.0.1:27017/nakhsha?authSource=admin
```

---

## Development Tips

### View MongoDB Data Easily

Install MongoDB Compass (GUI for MongoDB):

1. Open MongoDB Compass
2. Connect to `mongodb://127.0.0.1:27017`
3. Browse databases, collections, and documents visually

### Debug OTP Flow (SMS Mocking)

With `SMS_MOCK=true` in `.env`, OTP codes are printed to the console instead of being sent via SMS:

```
[backend] OTP Code for user: 123456
```

Use this code in the frontend to complete the signup/login flow.

### Check Logs

```bash
# Frontend logs appear in the dev server terminal
# Backend logs appear in the dev server terminal with [backend] prefix

# For persistent backend logs, check:
backend/logs/
```

### Make API Requests During Development

```bash
# Create a user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Get all artisans
curl http://localhost:5000/api/artisans

# Search by location (geospatial)
curl "http://localhost:5000/api/artisans/near?lng=51.3895&lat=35.6892&maxDistance=10000"
```

---

## Database Schema

The Nakhsha database includes these main collections:

- **users** - User accounts (artisans, travelers, admins)
- **artisans** - Artisan profiles with location and verified status
- **crafts** - Handmade products listed by artisans
- **events** - Cultural events and workshops
- **reviews** - Reviews for artisans and crafts
- **regions** - Geographic regions of Iran

All collections use geospatial indexing on location coordinates for fast location-based queries.

---

## Next Steps

1. ✅ Local dev is running? Great!
2. 📚 Read [README.md](./README.md) for project overview
3. 📖 Check [backend/README.md](./backend/README.md) for API documentation
4. 🗺️ Explore the map interface in the frontend
5. 🧪 Run tests: `npm test`
6. 📦 For production deployment, see [DEPLOYMENT_VPS_NODOCKER.md](./DEPLOYMENT_VPS_NODOCKER.md) (coming soon)

---

## Need Help?

- 📧 Issues? Create a GitHub Issue
- 💬 Questions? Check existing documentation
- 🐛 Bugs? Run `npm test` to check for test failures

**Happy coding!** 🚀
