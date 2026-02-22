# Nakhsha Backend - Dockerfile
# ============================================================
# Stage 1: Install production dependencies (separate layer for
#          cache efficiency; devDeps never enter the final image)
# ============================================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ============================================================
# Stage 2: Final minimal runtime image
# ============================================================
FROM node:20-alpine AS runtime

# Create a dedicated non-root user/group
RUN addgroup -S nakhsha && adduser -S nakhsha -G nakhsha

WORKDIR /app

# Pull only the production node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source code (governed by .dockerignore –
# tests, docs, logs, uploads, and dev config are excluded)
COPY . .

# Create runtime directories and hand ownership to the app user
RUN mkdir -p logs uploads && chown -R nakhsha:nakhsha /app

# Drop privileges
USER nakhsha

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
