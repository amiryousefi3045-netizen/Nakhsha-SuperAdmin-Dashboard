const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const logger = require("./utils/logger");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { responseEnricher } = require("./middleware/responseEnricher");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const otpCleanupService = require("./services/otpCleanup");

// Load environment variables
dotenv.config();

// Initialise error monitoring (Sentry) immediately after env vars are loaded
// so that uncaughtException / unhandledRejection handlers are installed before
// any application code runs.  This is a no-op when SENTRY_DSN is not set.
const monitoring = require("./utils/monitoring");
monitoring.init();

// Validate environment variables
const validateEnv = require("./config/env");
const env = validateEnv();

// Parse CORS allowed origins
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000,http://localhost:5173,http://localhost:5000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

logger.info("Origins allowed for CORS:", { origins: allowedOrigins });

const app = express();

// Trust the first reverse proxy (nginx in Docker / production).
// Required for express-rate-limit to read X-Forwarded-For correctly
// and avoid the ERR_ERL_UNEXPECTED_X_FORWARDED_FOR validation error.
app.set("trust proxy", 1);

app.locals.dbReady = false;

// Request ID middleware — must be first so req.id is available everywhere
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  next();
});

// Attach reqId to the active Sentry scope so every event for this request
// carries the request identifier (no-op when SENTRY_DSN is not configured).
app.use(monitoring.requestContextMiddleware);

// Enrich inline error responses with success:false and reqId automatically
app.use(responseEnricher);

// Custom morgan format with request ID
morgan.token("reqId", (req) => req.id);
const logFormat =
  process.env.NODE_ENV === "production"
    ? ':reqId :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
    : ":reqId :method :url :status :response-time ms";

// Middleware
app.use(
  morgan(logFormat, {
    // Stream HTTP access logs through Winston so reqId appears in log files
    stream: { write: (msg) => logger.http(msg.trim()) },
  }),
);

// Debug CORS requests
app.use((req, res, next) => {
  if (req.path.includes("/api/auth/otp")) {
    logger.info("OTP request debug:", {
      method: req.method,
      path: req.path,
      origin: req.headers.origin,
      referer: req.headers.referer,
      userAgent: req.headers["user-agent"],
    });
  }
  next();
});

// Pre-compiled set for O(1) allowlist lookups
const allowedOriginSet = new Set(allowedOrigins);

// CORS configuration
// ‣ In production ONLY origins from ALLOWED_ORIGINS are accepted — no wildcard.
// ‣ In non-production the localhost check uses URL parsing so that a crafted
//   hostname like "localhost.evil.com" is never accidentally allowed.
app.use(
  cors({
    origin: (origin, callback) => {
      // Requests with no origin header (server-to-server, curl, same-origin
      // page fetches) are allowed unconditionally.
      if (!origin) {
        return callback(null, true);
      }

      // Development: allow exact localhost / 127.0.0.1 hostnames only.
      // We parse the URL to avoid substring-match bypasses such as
      // "http://localhost.evil.com".
      if (process.env.NODE_ENV !== "production") {
        try {
          const { hostname } = new URL(origin);
          if (hostname === "localhost" || hostname === "127.0.0.1") {
            return callback(null, true);
          }
        } catch {
          // Malformed origin — fall through to allowlist check
        }
      }

      // Strict allowlist check (exact string match, case-sensitive)
      if (allowedOriginSet.has(origin)) {
        callback(null, true);
      } else {
        logger.warn("CORS: Origin not allowed", { origin, allowedOrigins });
        callback(new Error("CORS policy: Origin not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ─── Helmet security headers ────────────────────────────────────────────────
//
// CSP strategy:
//  • /api-docs   — needs unsafe-inline for Swagger UI; served by a separate
//                  app.use block below with a relaxed policy.
//  • Everything else — strict policy; no unsafe-inline.
//
app.use((req, res, next) => {
  // Swagger UI needs inline scripts/styles.  Apply a permissive CSP only for
  // the /api-docs prefix and nowhere else.
  if (req.path.startsWith("/api-docs")) {
    return helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      frameguard: { action: "deny" },
      noSniff: true,
      referrerPolicy: { policy: "same-origin" },
      hidePoweredBy: true,
      permittedCrossDomainPolicies: { permittedPolicies: "none" },
      dnsPrefetchControl: { allow: false },
    })(req, res, next);
  }

  // Strict CSP for all API routes and static file serving
  return helmet({
    // Required for uploaded images served from the same origin
    crossOriginResourcePolicy: { policy: "same-site" },
    crossOriginEmbedderPolicy: false,

    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // no unsafe-inline outside Swagger
        styleSrc: ["'self'"],
        // imgSrc: restrict to self + data URIs.  If the frontend loads images
        // from an external CDN, add its hostname here explicitly instead of
        // using the broad "https:" wildcard.
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },

    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },

    frameguard: { action: "deny" },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hidePoweredBy: true,
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    dnsPrefetchControl: { allow: false },
  })(req, res, next);
});

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50, // 50 requests per windowMs
  // Message follows canonical error envelope; responseEnricher fills in reqId
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "درخواست‌های زیاد. لطفاً کمی صبر کنید",
    },
    reqId: null,
  },
  handler: (req, res, _next, options) => {
    options.message.reqId = req.id ?? null;
    res.status(options.statusCode).json(options.message);
  },
});

const uploadsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 30, // 30 uploads per hour
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "محدودیت آپلود. لطفاً بعداً تلاش کنید",
    },
    reqId: null,
  },
  handler: (req, res, _next, options) => {
    options.message.reqId = req.id ?? null;
    res.status(options.statusCode).json(options.message);
  },
});

// Apply rate limits to specific routes
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/uploads", uploadsLimiter);
// Explicit body-size caps — prevents large-payload DoS attacks.
// Uploads use multipart/form-data and are handled by multer, so these limits
// only apply to JSON / URL-encoded API requests.
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// ─── Secure static file serving for uploads ─────────────────────────────────
//
// Guard middleware runs BEFORE express.static so we can reject requests
// outright — calling res.status() inside setHeaders is too late because
// express.static has already started streaming the file by that point.
//
// Rules enforced:
//  1. The /uploads/temp/ staging directory is never accessible.
//  2. Only files with the .webp extension are served; everything else → 403.
//  3. Path-traversal attempts ("../") are caught by path.resolve() check.
//
const uploadsRoot = path.resolve(__dirname, "uploads");

app.use("/uploads", (req, res, next) => {
  // Resolve the full path so path-traversal sequences are collapsed first
  const requested = path.resolve(uploadsRoot, "." + req.path);

  // Must stay inside the uploads root
  if (
    !requested.startsWith(uploadsRoot + path.sep) &&
    requested !== uploadsRoot
  ) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "دسترسی مجاز نیست" },
    });
  }

  // Temp directory must never be publicly accessible
  const tempDir = path.join(uploadsRoot, "temp");
  if (requested.startsWith(tempDir)) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "دسترسی مجاز نیست" },
    });
  }

  // Only .webp files are served
  if (path.extname(requested).toLowerCase() !== ".webp") {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "نوع فایل مجاز نیست" },
    });
  }

  next();
});

app.use(
  "/uploads",
  express.static(uploadsRoot, {
    index: false, // no directory listing
    dotfiles: "deny", // hide dotfiles
    etag: true,
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "same-site");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);

// Import routes
// Ensure models are registered before routes that populate them
require("./models/User");
// Register Craft model (wrapper) so crafts routes have the model available
const Craft = require("./models/Craft");
// Register Draft model for autosave functionality
const Draft = require("./models/Draft");
const authRoutes = require("./routes/auth");
const craftRoutes = require("./routes/crafts");
const postsRoutes = require("./routes/posts");
// NOTE: `/api/recipes` compatibility alias removed. Use `/api/crafts` instead.
const userRoutes = require("./routes/users");
const uploadRoutes = require("./routes/uploads");
// NEW: Consolidated listings module (replaces scatter of listings.*.js files)
const listingsModule = require("./modules/listings");
// NEW: Consolidated drafts module
const draftsModule = require("./modules/drafts");
// LEGACY: Old route files (deprecated, kept for backward compatibility during migration)
const listingsNearRoutes = require("./routes/listings.near");
const listingsHeatmapRoutes = require("./routes/listings.heatmap");
const listingsClusterRoutes = require("./routes/listings.clusters");
const listingsWithinBoundaryRoutes = require("./routes/listings.within-boundary");
const listingsRoutes = require("./routes/listings");
const draftRoutes = require("./routes/drafts");
const healthRoutes = require("./routes/health");
// Heavy-endpoint rate limiter — also applied per-route inside the route files;
// the app.use() here acts as a second layer for any future routes added under
// /api/listings without explicit per-handler wiring.
const { heavyLimiter } = require("./middleware/rateLimiter");

// Serve static files for monitoring
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
// Mount canonical crafts API first
app.use("/api/crafts", craftRoutes);
// Mount posts API
app.use("/api/posts", postsRoutes);
// (Removed compatibility alias to /api/recipes)
// NEW: Mount consolidated drafts module FIRST so /draft and /draft/latest are matched before /:id
app.use("/api/listings", draftsModule);
// NEW: Mount consolidated listings module with all CRUD + geo endpoints
// This replaces the old scattered route files (listings.*.js)
app.use("/api/listings", listingsModule);
// LEGACY: Keep old route files for backward compatibility during migration
// (Can be removed after verifying new modules work correctly)
// app.use("/api/listings", draftRoutes);
// app.use("/api/listings", heavyLimiter, listingsNearRoutes);
// app.use("/api/listings", heavyLimiter, listingsHeatmapRoutes);
// app.use("/api/listings", heavyLimiter, listingsClusterRoutes);
// app.use("/api/listings", heavyLimiter, listingsWithinBoundaryRoutes);
// app.use("/api/listings", listingsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/uploads", uploadRoutes);

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// MongoDB connection
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha";
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    app.locals.dbReady = true;
    logger.info("MongoDB connected successfully", {
      uri: uri.replace(/\/\/.*@/, "//***@"),
    });

    // ========================================================================
    // INDEX SYNCHRONIZATION  (opt-in via SYNC_INDEXES=true)
    // ========================================================================
    // Disabled by default because syncIndexes() drops and recreates indexes,
    // which can be slow and briefly block queries on large collections.
    // Enable it explicitly during first deploy or after schema changes.
    if (process.env.SYNC_INDEXES === "true") {
      logger.info("SYNC_INDEXES=true — synchronizing database indexes...");

      try {
        // Sync all model indexes (Mongoose will create missing indexes)
        await mongoose.connection.syncIndexes();
        logger.info("✓ All model indexes synchronized successfully");

        // Log index details for each collection
        const User = require("./models/User");
        const OtpCode = require("./models/OtpCode");
        const Craft = require("./models/Craft");
        const Post = require("./models/Post");
        const { Listing: ListingModel } = require("./models/Listing");

        const collections = [
          { name: "users", model: User },
          { name: "otpcodes", model: OtpCode },
          { name: "crafts (listings)", model: Craft },
          { name: "posts", model: Post },
          { name: "listings", model: ListingModel },
        ];

        for (const { name, model } of collections) {
          const indexes = await model.collection.getIndexes();
          const indexNames = Object.keys(indexes);
          logger.info(`✓ ${name}: ${indexNames.length} indexes active`, {
            indexes: indexNames.filter((i) => i !== "_id_"), // Exclude default _id index
          });
        }

        // Verify critical geospatial indexes
        const craftIndexes = await Craft.collection.getIndexes();
        if (craftIndexes["location.geometry_2dsphere"]) {
          logger.info(
            "✓ Geospatial index verified for crafts (nearby search ready)",
          );
        } else {
          logger.warn(
            "⚠ WARNING: Missing 2dsphere index on crafts.location.geometry",
          );
        }

        // Verify TTL index on OTP codes
        const otpIndexes = await OtpCode.collection.getIndexes();
        const ttlIndex = Object.values(otpIndexes).find(
          (idx) => idx.expireAfterSeconds === 0,
        );
        if (ttlIndex) {
          logger.info(
            "✓ TTL index verified for OTP codes (auto-cleanup enabled)",
          );
        } else {
          logger.warn("⚠ WARNING: Missing TTL index on otpcodes.expiresAt");
        }
      } catch (indexErr) {
        logger.error("Index synchronization failed", {
          error: indexErr.message,
        });
        throw indexErr;
      }
    } else {
      logger.info(
        "Index synchronization skipped (SYNC_INDEXES is not 'true'). " +
          "Set SYNC_INDEXES=true to enable on startup.",
      );
    }

    // Start OTP cleanup service
    otpCleanupService.start();
    logger.info("OTP cleanup service started");
  } catch (error) {
    app.locals.dbReady = false;
    logger.warn("MongoDB not available, continuing without DB (dev mode)", {
      error: error.message,
    });
  }
};

// Swagger API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Nakhsha API Documentation",
  }),
);

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  const server = app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully...");
    otpCleanupService.stop();
    server.close(() => {
      logger.info("Process terminated");
    });
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT received, shutting down gracefully...");
    otpCleanupService.stop();
    server.close(() => {
      logger.info("Process terminated");
    });
  });
})();

module.exports = app;
