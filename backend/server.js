const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

dotenv.config();

const app = express();
app.locals.dbReady = false;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:4173", "*"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
// Allow images to be embedded cross-origin (frontend dev server vs backend)
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 });
app.use("/api/", limiter);
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
const authRoutes = require("./routes/auth");
const recipeRoutes = require("./routes/recipes");
const craftRoutes = require("./routes/crafts");
const userRoutes = require("./routes/users");
const uploadRoutes = require("./routes/uploads");

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/crafts", craftRoutes);
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
  } catch (error) {
    app.locals.dbReady = false;
    console.warn("MongoDB not available, continuing without DB (dev mode)");
  }
};

// Health check endpoint
app.get("/api/health", (req, res) => {
  const dbStatus = app.locals.dbReady ? "connected" : "disconnected";
  res.json({
    status: "OK",
    message: "نخشا API is running",
    db: dbStatus,
    env: {
      mongoUri: process.env.MONGODB_URI ? "set" : "not set",
      nodeEnv: process.env.NODE_ENV || "development",
    },
  });
});

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
})();

module.exports = app;
