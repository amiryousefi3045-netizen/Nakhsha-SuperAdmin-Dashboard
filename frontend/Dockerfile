# Nakhsha Frontend - Dockerfile
# ============================================================
# Stage 1: Build the Vite/React production bundle
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (respects .dockerignore – no test/docs)
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy source and build
COPY . .
RUN npm run build

# ============================================================
# Stage 2: Serve with unprivileged nginx (runs as uid 101,
#          listens on port 8080 – no root required)
# ============================================================
FROM nginxinc/nginx-unprivileged:alpine AS runtime

# Copy only the compiled static assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Override the default server block
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
