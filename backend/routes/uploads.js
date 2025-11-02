const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage: keep provided filename if present, else timestamp
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const base = (file.originalname || "upload").replace(/[^\w\-.]+/g, "_");
    const target = path.join(uploadsDir, base);
    if (fs.existsSync(target)) {
      const ext = path.extname(base);
      const name = path.basename(base, ext);
      cb(null, `${name}-${Date.now()}${ext}`);
    } else {
      cb(null, base);
    }
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(
      file.mimetype
    );
    if (!ok) return cb(new Error("Only JPEG/PNG/WEBP images are allowed"));
    cb(null, true);
  },
});

// POST /api/uploads - single file field name: "file"
router.post("/", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const msg = err.message || "Upload failed";
      const tooLarge = /File too large/i.test(msg);
      const badType = /Only JPEG\/PNG\/WEBP images/i.test(msg);
      return res
        .status(tooLarge ? 413 : badType ? 415 : 400)
        .json({ message: msg });
    }
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({ url, filename: req.file.filename });
  });
});

module.exports = router;
