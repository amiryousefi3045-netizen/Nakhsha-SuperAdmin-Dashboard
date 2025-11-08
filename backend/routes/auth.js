const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const TOKEN_TTL = process.env.JWT_TTL || "7d";

function sign(user) {
  return jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

router.post("/register", async (req, res) => {
  try {
    // If DB is not ready, return a clear 503 so client doesn't get a generic 500
    if (!req.app?.locals?.dbReady) {
      console.warn("POST /auth/register - DB not ready");
      return res.status(503).json({ message: "Database unavailable" });
    }
    console.log("Register request received:", JSON.stringify(req.body));
    const { name, email, phone, password, role } = req.body || {};
    const normEmail =
      typeof email === "string" ? email.toLowerCase().trim() : email;
    const normPhone = typeof phone === "string" ? phone.trim() : phone;
    if (!name || !email || !phone || !password) {
      console.log("Missing required fields:", {
        name,
        email,
        phone,
        password: !!password,
      });
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (typeof password === "string" && password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }
    const exists = await User.findOne({
      $or: [{ email: normEmail }, { phone: normPhone }],
    });
    if (exists) {
      console.log("User already exists:", { email, phone });
      return res.status(409).json({ message: "Email or phone already exists" });
    }
    console.log("Creating new user:", { name, email, phone });
    const user = await User.create({
      name: String(name).trim(),
      email: normEmail,
      phone: normPhone,
      password,
      role,
    });
    console.log("User created successfully:", user._id);
    const token = sign(user);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    // Handle validation and duplicate key errors with proper status codes
    if (e?.name === "ValidationError") {
      const details = Object.values(e.errors || {}).map((er) => er.message);
      return res.status(400).json({ message: "Validation error", details });
    }
    if (e?.code === 11000) {
      const field = Object.keys(e.keyPattern || e.keyValue || {})[0] || "field";
      return res.status(409).json({ message: `${field} already exists` });
    }
    console.error("POST /auth/register error", e);
    res.status(500).json({ message: "Server error", error: e.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    // If DB is not ready, return 503 to signal service unavailable
    if (!req.app?.locals?.dbReady) {
      console.warn("POST /auth/login - DB not ready");
      return res.status(503).json({ message: "Database unavailable" });
    }
    const { email, phone, password } = req.body || {};
    const normEmail =
      typeof email === "string" ? email.toLowerCase().trim() : email;
    const normPhone = typeof phone === "string" ? phone.trim() : phone;
    if ((!email && !phone) || !password)
      return res.status(400).json({ message: "Missing credentials" });
    const user = await User.findOne(
      email ? { email: normEmail } : { phone: normPhone }
    );
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });
    const token = sign(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error("POST /auth/login error", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email role avatar"
    );
    if (!user) return res.status(404).json({ message: "Not found" });
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
