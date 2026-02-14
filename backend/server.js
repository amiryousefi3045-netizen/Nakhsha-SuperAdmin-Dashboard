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

// Request ID middleware
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  next();
});

// Custom morgan format with request ID
morgan.token("reqId", (req) => req.id);
const logFormat =
  process.env.NODE_ENV === "production"
    ? ':reqId :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
    : ":reqId :method :url :status :response-time ms";

// Middleware
app.use(morgan(logFormat));

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
  message: { message: "درخواست‌های زیاد. لطفاً کمی صبر کنید" },
});

const uploadsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 30, // 30 uploads per hour
  message: { message: "محدودیت آپلود. لطفاً بعداً تلاش کنید" },
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
    logger.info("MongoDB connected successfully");

    // Start OTP cleanup service
    otpCleanupService.start();

    // Ensure geospatial index exists for Craft model
    try {
      await Craft.collection.createIndex({ "location.geometry": "2dsphere" });
      logger.info("Geospatial index ensured for crafts");
    } catch (indexErr) {
      logger.warn("Warning: Could not create geospatial index", {
        error: indexErr.message,
      });
    }
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
