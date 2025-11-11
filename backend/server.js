const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error("خطای بحرانی: متغیر JWT_SECRET تنظیم نشده است");
  process.exit(1);
}

// Parse CORS allowed origins
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:4173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

console.log("Origins allowed for CORS:", allowedOrigins);

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

// Strict CORS with whitelist
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy: Origin not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
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
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", ...allowedOrigins],
      },
    },
  })
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
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

// Import routes
// Ensure models are registered before routes that populate them
require("./models/User");
// Register Craft model (wrapper) so crafts routes have the model available
const Craft = require("./models/Craft");
const authRoutes = require("./routes/auth");
const craftRoutes = require("./routes/crafts");
// NOTE: `/api/recipes` compatibility alias removed. Use `/api/crafts` instead.
const userRoutes = require("./routes/users");
const uploadRoutes = require("./routes/uploads");
const listingsNearRoutes = require("./routes/listings.near");

// Routes
app.use("/api/auth", authRoutes);
// Mount canonical crafts API first
app.use("/api/crafts", craftRoutes);
// (Removed compatibility alias to /api/recipes)
// Mount the new near-search route
app.use("/api/listings", listingsNearRoutes);
app.use("/api/users", userRoutes);
app.use("/api/uploads", uploadRoutes);

// MongoDB connection
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha";
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2000,
    });
    app.locals.dbReady = true;
    console.log("MongoDB connected successfully");

    // Ensure geospatial index exists for Craft model
    try {
      await Craft.collection.createIndex({ "location.geometry": "2dsphere" });
      console.log("Geospatial index ensured for crafts");
    } catch (indexErr) {
      console.warn(
        "Warning: Could not create geospatial index:",
        indexErr.message
      );
    }
  } catch (error) {
    app.locals.dbReady = false;
    console.warn("MongoDB not available, continuing without DB (dev mode)");
  }
};

// Import and use health routes
const healthRoutes = require("./routes/health");
app.use("/api/health", healthRoutes);

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
})();

module.exports = app;
