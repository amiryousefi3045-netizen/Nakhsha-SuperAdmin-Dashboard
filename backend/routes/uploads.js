const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const crypto = require("crypto");

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Safe filename generation
function generateSafeFilename(originalname = "upload") {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString("hex");
  const safeName = originalname
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return `${safeName}-${timestamp}-${random}.webp`;
}

// Configure Multer for temporary storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tempDir = path.join(uploadsDir, "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    // Use random name for temp file
    const tempName = `${Date.now()}-${crypto
      .randomBytes(8)
      .toString("hex")}${path.extname(file.originalname)}`;
    cb(null, tempName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1, // Only one file at a time
  },
  fileFilter: (_req, file, cb) => {
    // Validate MIME type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("فقط تصاویر JPEG/PNG/WebP مجاز هستند"));
    }
    cb(null, true);
  },
});

// Process image with Sharp
async function processImage(inputPath, filename) {
  const outputPath = path.join(uploadsDir, filename);

  try {
    // Process image: strip EXIF, resize if needed, convert to WebP
    await sharp(inputPath)
      .rotate() // Auto-rotate based on EXIF orientation
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: 85,
        effort: 4, // Decent compression (0-6)
      })
      .toFile(outputPath);

    // Clean up temp file
    fs.unlink(inputPath, (err) => {
      if (err) console.error("Error deleting temp file:", err);
    });

    return outputPath;
  } catch (err) {
    // Clean up temp file on error
    fs.unlink(inputPath, () => {});
    throw err;
  }
}

// POST /api/uploads - single file field name: "file"
router.post("/", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      const msg = err.message || "خطا در آپلود فایل";
      const tooLarge = /File too large/i.test(msg);
      const badType = /Only JPEG\/PNG\/WebP/i.test(msg);
      return res.status(tooLarge ? 413 : badType ? 415 : 400).json({
        message: tooLarge ? "حجم فایل نباید از ۲ مگابایت بیشتر باشد" : msg,
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "هیچ فایلی آپلود نشده است" });
    }

    try {
      // Generate final filename
      const finalFilename = generateSafeFilename(req.file.originalname);

      // Process the uploaded image
      await processImage(req.file.path, finalFilename);

      // Return the URL for the processed image
      const url = `/uploads/${finalFilename}`;
      res.status(201).json({
        url,
        filename: finalFilename,
        message: "تصویر با موفقیت آپلود و پردازش شد",
      });
    } catch (err) {
      console.error("Image processing error:", err);
      res.status(500).json({
        message: "خطا در پردازش تصویر",
        error: err.message,
      });
    }
  });
});

module.exports = router;
