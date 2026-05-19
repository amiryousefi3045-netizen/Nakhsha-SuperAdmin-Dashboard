# VPS Deployment Guide (Without Docker)

This guide covers deploying Nakhsha (نخشا) to a production Linux VPS using systemd services and nginx, without Docker containers.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│         Nginx Reverse Proxy                  │
│  (Port 80/443, Static Files, API Proxy)     │
├─────────────────────────────────────────────┤
│  Systemd Service 1: Backend (Node.js)       │
│  → Listens on localhost:5000                │
│  → Runs with PM2 or direct node             │
├─────────────────────────────────────────────┤
│  Systemd Service 2: MongoDB                 │
│  → Listens on localhost:27017               │
│  → Manages database                         │
└─────────────────────────────────────────────┘
```

---

## Prerequisites

- **Ubuntu/Debian Linux VPS** (recommended: Ubuntu 22.04 LTS)
- **Root or sudo access**
- **Domain name** (optional, can use IP address)
- **SSH access** to your VPS
- **Local copy** of the Nakhsha repo (to upload code)

---

## Step 1: Initial Server Setup

### SSH into Your VPS

```bash
ssh root@your-vps-ip
# or
ssh user@your-vps-ip
```

### Update System

```bash
sudo apt update
sudo apt upgrade -y
```

### Install System Dependencies

```bash
# Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Nginx (reverse proxy)
sudo apt-get install -y nginx

# Build tools (for native npm packages like sharp)
sudo apt-get install -y build-essential python3

# Other utilities
sudo apt-get install -y curl wget git
```

### Verify Installations

```bash
node --version    # v20.x
npm --version     # v10.x
mongod --version  # v7.x
nginx -v          # nginx/...
```

---

## Step 2: MongoDB Setup

### Start MongoDB Service

```bash
# Start MongoDB
sudo systemctl start mongod

# Enable auto-start on boot
sudo systemctl enable mongod

# Verify status
sudo systemctl status mongod
```

### Configure MongoDB Authentication (Optional but Recommended)

```bash
# Connect to MongoDB
mongosh

# In the MongoDB shell:
use admin
db.createUser({
  user: "admin",
  pwd: "your-strong-password-here",
  roles: ["root"]
})

# Exit MongoDB shell
exit
```

### Update MongoDB Configuration for Authentication

```bash
# Edit MongoDB config
sudo nano /etc/mongod.conf

# Find the security section and uncomment/add:
# security:
#   authorization: enabled

# Save and restart MongoDB
sudo systemctl restart mongod
```

### Create Application Database User

```bash
# Connect with admin credentials
mongosh -u admin -p --authenticationDatabase admin

# Create app user
use admin
db.createUser({
  user: "nakhsha_user",
  pwd: "nakhsha-app-password",
  roles: [
    { role: "readWrite", db: "nakhsha" },
    { role: "readWrite", db: "nakhsha_test" }
  ]
})

# Test connection
exit
mongosh -u nakhsha_user -p --authenticationDatabase admin --db nakhsha
```

### Update Application Configuration

Update your `.env` file (see Step 5) with:

```env
MONGODB_URI=mongodb://nakhsha_user:nakhsha-app-password@127.0.0.1:27017/nakhsha?authSource=admin
MONGODB_TEST_URI=mongodb://nakhsha_user:nakhsha-app-password@127.0.0.1:27017/nakhsha_test?authSource=admin
```

---

## Step 3: Deploy Application Code

### Create Application Directory

```bash
sudo mkdir -p /var/www/nakhsha
sudo chown -R $USER:$USER /var/www/nakhsha
cd /var/www/nakhsha
```

### Clone Repository (or Upload Code)

**Option A: Clone from GitHub**

```bash
cd /var/www/nakhsha
git clone https://github.com/your-username/nakhsha.git .
```

**Option B: Upload via SCP or FTP**

```bash
# From your local machine:
scp -r ./nakhsha root@your-vps-ip:/var/www/
```

### Install Dependencies

```bash
cd /var/www/nakhsha

# Root dependencies
npm install

# Backend dependencies
npm install --prefix backend

# Frontend dependencies
npm install --prefix frontend
```

---

## Step 4: Configure Environment Variables

### Create `.env` File

```bash
cd /var/www/nakhsha
cp .env.example .env
nano .env
```

### Populate `.env` for Production

```env
# Application
NODE_ENV=production

# MongoDB - with authentication
MONGODB_URI=mongodb://nakhsha_user:nakhsha-app-password@127.0.0.1:27017/nakhsha?authSource=admin
MONGODB_TEST_URI=mongodb://nakhsha_user:nakhsha-app-password@127.0.0.1:27017/nakhsha_test?authSource=admin

# Backend
PORT=5000
JWT_SECRET=<generate-secure-value: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_TTL=7d
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Frontend
VITE_API_BASE=/api
VITE_SERVER_ORIGIN=https://your-domain.com

# SMS (real SMS in production)
SMS_MOCK=false
SMS_USERNAME=<your-melipayamak-username>
SMS_PASSWORD=<your-melipayamak-password>
SMS_FROM=<your-sender-number>

# Monitoring
SENTRY_DSN=<your-sentry-dsn>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# OTP
OTP_SECRET=<generate-secure-value: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
OTP_TTL_SECONDS=120
OTP_RESEND_SECONDS=30
OTP_MAX_ATTEMPTS=8

# Sync indexes (only on first deploy or schema changes)
SYNC_INDEXES=false
```

### Create Backend `.env` File

```bash
cd /var/www/nakhsha/backend
cp .env.example .env
nano .env
```

Use the same values as above (backend `.env` also needs these variables).

---

## Step 5: Build Frontend

```bash
cd /var/www/nakhsha

# Build React app to static files
npm run build
# Frontend output: frontend/dist/
# Backend output: ready to run
```

---

## Step 6: Setup Systemd Services

### Create Backend Service

```bash
sudo nano /etc/systemd/system/nakhsha-backend.service
```

**Paste this configuration:**

```ini
[Unit]
Description=Nakhsha Backend API
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/nakhsha
Environment="NODE_ENV=production"
Environment="PATH=/usr/bin"
ExecStart=/usr/bin/node /var/www/nakhsha/backend/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=nakhsha-backend

[Install]
WantedBy=multi-user.target
```

### Create MongoDB Service

```bash
# MongoDB usually comes with a systemd service already
# Verify it's installed:
sudo systemctl status mongod

# If not, MongoDB is likely already set up during installation
```

### Enable and Start Backend Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable nakhsha-backend
sudo systemctl start nakhsha-backend
sudo systemctl status nakhsha-backend
```

### View Backend Logs

```bash
# Real-time logs
sudo journalctl -u nakhsha-backend -f

# Last 50 lines
sudo journalctl -u nakhsha-backend -n 50

# With timestamps
sudo journalctl -u nakhsha-backend --all
```

---

## Step 7: Configure Nginx Reverse Proxy

### Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/nakhsha
```

**Paste this configuration:**

```nginx
# Upstream backend service
upstream nakhsha_backend {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Redirect HTTP to HTTPS (optional but recommended)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL certificates (see Step 8 for Let's Encrypt setup)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Root directory for static frontend files
    root /var/www/nakhsha/frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;

    # API proxy to backend
    location /api {
        proxy_pass http://nakhsha_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;

        # Timeouts for long requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Uploads proxy to backend
    location /uploads {
        proxy_pass http://nakhsha_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Serve frontend static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Security: Block access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~ ~$ {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

### Enable Nginx Configuration

```bash
# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/nakhsha /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Verify Nginx is running
sudo systemctl status nginx
```

---

## Step 8: Setup SSL Certificates (Let's Encrypt)

### Install Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### Generate SSL Certificate

```bash
sudo certbot certonly --nginx -d your-domain.com -d www.your-domain.com
```

**Follow the prompts:**

- Enter your email
- Agree to terms
- Choose whether to share email (optional)

### Auto-Renewal

```bash
# Test renewal (dry run)
sudo certbot renew --dry-run

# Enable automatic renewal cron
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Verify
sudo systemctl status certbot.timer
```

---

## Step 9: Verify Deployment

### Check Backend Service

```bash
# Service status
sudo systemctl status nakhsha-backend

# Test health endpoint
curl http://127.0.0.1:5000/api/health

# Should return: {"ok":true}
```

### Check Nginx

```bash
# Service status
sudo systemctl status nginx

# Test configuration
sudo nginx -t

# Reload if changed
sudo systemctl reload nginx
```

### Check MongoDB

```bash
# Service status
sudo systemctl status mongod

# Test connection
mongosh -u nakhsha_user -p --authenticationDatabase admin --db nakhsha
# In MongoDB shell: db.adminCommand('ping')
# Should return: { ok: 1 }
```

### Access Application

Open your browser and visit:

- **https://your-domain.com** (HTTPS only, redirects from HTTP)
- Test signup/login
- Check API calls in browser DevTools

---

## Maintenance & Monitoring

### Backup MongoDB Database

```bash
# Monthly backup script (save as backup.sh)
#!/bin/bash
BACKUP_DIR="/var/backups/mongodb"
mkdir -p $BACKUP_DIR

# Create timestamped backup
mongodump -u nakhsha_user -p <password> --authenticationDatabase admin --out $BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S)

# Clean old backups (keep last 30 days)
find $BACKUP_DIR -type d -mtime +30 -exec rm -rf {} +
```

### Monitor Services

```bash
# Check all service logs
sudo journalctl -xe

# Backend logs (last 100 lines)
sudo journalctl -u nakhsha-backend -n 100 --no-pager

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check disk space
df -h

# Check memory/CPU usage
top
```

### Update Application Code

```bash
# SSH to VPS
ssh root@your-vps-ip

# Go to app directory
cd /var/www/nakhsha

# Pull latest code
git pull origin main

# Install new dependencies (if any)
npm install --prefix backend
npm install --prefix frontend

# Rebuild frontend
npm run build

# Restart backend service
sudo systemctl restart nakhsha-backend

# Verify
sudo systemctl status nakhsha-backend
```

---

## Troubleshooting

### Backend Service Won't Start

```bash
# Check logs
sudo journalctl -u nakhsha-backend -n 50

# Manual test (as www-data user)
sudo -u www-data NODE_ENV=production node /var/www/nakhsha/backend/server.js

# Check permissions
ls -la /var/www/nakhsha/backend/

# Fix if needed
sudo chown -R www-data:www-data /var/www/nakhsha
```

### MongoDB Connection Error

```bash
# Verify MongoDB is running
sudo systemctl status mongod

# Test connection
mongosh -u nakhsha_user -p --authenticationDatabase admin

# Check MongoDB logs
sudo journalctl -u mongod -n 50
```

### Nginx Not Proxying Correctly

```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Test backend connectivity
curl http://127.0.0.1:5000/api/health
```

### SSL Certificate Issues

```bash
# Check certificate
sudo certbot certificates

# Renew manually
sudo certbot renew --force-renewal

# Fix permissions if needed
sudo chown -R root:root /etc/letsencrypt
```

---

## Performance Tuning (Optional)

### Nginx Worker Processes

```bash
# Edit nginx config
sudo nano /etc/nginx/nginx.conf

# Set worker_processes to number of CPU cores
# worker_processes 4;

# Reload
sudo systemctl reload nginx
```

### MongoDB Performance

```bash
# Monitor MongoDB performance
mongostat -u admin -p --authenticationDatabase admin

# Check index usage
mongosh -u admin -p --authenticationDatabase admin
use nakhsha
db.artisans.aggregate([{ $indexStats: {} }])
```

### Backend Process Management (Optional: PM2)

For more advanced process management, consider PM2:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create PM2 ecosystem file
sudo nano /var/www/nakhsha/ecosystem.config.js

# Copy this configuration:
module.exports = {
  apps: [{
    name: "nakhsha-backend",
    script: "./backend/server.js",
    env: {
      NODE_ENV: "production"
    },
    instances: "max",
    exec_mode: "cluster",
    error_file: "/var/www/nakhsha/logs/pm2-error.log",
    out_file: "/var/www/nakhsha/logs/pm2-out.log"
  }]
};

# Start with PM2
pm2 start ecosystem.config.js

# Setup auto-start
pm2 startup
pm2 save
```

---

## Next Steps

1. ✅ Server is deployed!
2. 📊 Monitor performance using the commands above
3. 🔄 Set up automated backups
4. 📧 Configure email notifications for errors (via Sentry or other monitoring)
5. 🔐 Review security settings regularly
6. 📝 Document your deployment details for future reference

---

## Need Help?

- 📖 Check Ubuntu Server documentation
- 📘 MongoDB docs: https://docs.mongodb.com/manual/
- 🔗 Nginx docs: https://nginx.org/en/docs/
- 🛡️ Let's Encrypt: https://letsencrypt.org/

**Your Nakhsha deployment is live!** 🚀
