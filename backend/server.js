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
app.locals.dbReady = false;

// Request ID middleware — must be first so req.id is available everywhere
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  next();
});

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

// CORS configuration with development flexibility
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin requests from HTML pages)
      if (!origin) {
        return callback(null, true);
      }

      // In development, allow all localhost requests
      if (process.env.NODE_ENV !== "production") {
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
          return callback(null, true);
        }
      }

      // Check whitelist for production
      if (allowedOrigins.includes(origin)) {
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

// Enhanced security headers with Helmet
app.use(
  helmet({
    // Required for uploaded images to be accessible
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,

    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for Swagger UI
        styleSrc: ["'self'", "'unsafe-inline'"], // Needed for Swagger UI
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", ...allowedOrigins],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },

    // HTTP Strict Transport Security (HSTS)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },

    // X-Frame-Options
    frameguard: {
      action: "deny", // محافظت در برابر clickjacking
    },

    // X-Content-Type-Options
    noSniff: true, // جلوگیری از MIME-sniffing

    // X-XSS-Protection
    xssFilter: true,

    // Referrer Policy
    referrerPolicy: {
      policy: "same-origin",
    },

    // Hide X-Powered-By header
    hidePoweredBy: true,
  }),
);

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50, // 50 requests per windowMs
  // Message follows canonical error envelope; responseEnricher fills in reqId
  message: {
    success: false,
    error: { code: "TOO_MANY_REQUESTS", message: "درخواست‌های زیاد. لطفاً کمی صبر کنید" },
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
    error: { code: "TOO_MANY_REQUESTS", message: "محدودیت آپلود. لطفاً بعداً تلاش کنید" },
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Secure static file serving for uploads
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    // Security headers
    setHeaders: (res, filePath) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("X-Content-Type-Options", "nosniff");

      // Only serve WebP images (our processed format)
      if (path.extname(filePath).toLowerCase() === ".webp") {
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        // Block non-WebP files
        res.status(403).end();
      }
    },
    // Prevent directory listing
    index: false,
    // Don't follow symlinks (security)
    dotfiles: "deny",
    // Disable etag for better caching control
    etag: true,
  }),
);

// Import routes
// Ensure models are registered before routes that populate them
require("./models/User");
// Register Craft model (wrapper) so crafts routes have the model available
const Craft = require("./models/Craft");
const authRoutes = require("./routes/auth");
const craftRoutes = require("./routes/crafts");
const postsRoutes = require("./routes/posts");
// NOTE: `/api/recipes` compatibility alias removed. Use `/api/crafts` instead.
const userRoutes = require("./routes/users");
const uploadRoutes = require("./routes/uploads");
const listingsNearRoutes = require("./routes/listings.near");
const healthRoutes = require("./routes/health");

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
// Mount the new near-search route
app.use("/api/listings", listingsNearRoutes);
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
    // INDEX SYNCHRONIZATION - Production Safety
    // ========================================================================
    logger.info("Synchronizing database indexes...");

    try {
      // Sync all model indexes (Mongoose will create missing indexes)
      await mongoose.connection.syncIndexes();
      logger.info("✓ All model indexes synchronized successfully");

      // Log index details for each collection
      const User = require("./models/User");
      const OtpCode = require("./models/OtpCode");
      const Craft = require("./models/Craft");
      const Post = require("./models/Post");

      const collections = [
        { name: "users", model: User },
        { name: "otpcodes", model: OtpCode },
        { name: "crafts (listings)", model: Craft },
        { name: "posts", model: Post },
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
      logger.error("Index synchronization failed", { error: indexErr.message });
      throw indexErr;
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
