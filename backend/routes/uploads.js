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

// File signature validation (magic numbers)
const FILE_SIGNATURES = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF
};

/**
 * Validate file signature by checking magic numbers
 * Prevents MIME type spoofing attacks
 */
function validateFileSignature(filePath) {
  const buffer = Buffer.alloc(12);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buffer, 0, 12, 0);
  fs.closeSync(fd);

  // Check JPEG
  if (
    buffer[0] === FILE_SIGNATURES.jpeg[0] &&
    buffer[1] === FILE_SIGNATURES.jpeg[1] &&
    buffer[2] === FILE_SIGNATURES.jpeg[2]
  ) {
    return true;
  }

  // Check PNG
  if (
    buffer[0] === FILE_SIGNATURES.png[0] &&
    buffer[1] === FILE_SIGNATURES.png[1] &&
    buffer[2] === FILE_SIGNATURES.png[2] &&
    buffer[3] === FILE_SIGNATURES.png[3]
  ) {
    return true;
  }

  // Check WebP (RIFF header + WEBP signature)
  if (
    buffer[0] === FILE_SIGNATURES.webp[0] &&
    buffer[1] === FILE_SIGNATURES.webp[1] &&
    buffer[2] === FILE_SIGNATURES.webp[2] &&
    buffer[3] === FILE_SIGNATURES.webp[3] &&
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return true;
  }

  return false;
}

/**
 * Generate safe filename with sanitization
 * Prevents path traversal and ensures unique naming
 */
function generateSafeFilename(originalname = "upload") {
  const timestamp = Date.now();
  const random = crypto.randomBytes(6).toString("hex");
  
  // Sanitize original name: remove path separators, null bytes, and special chars
  const safeName = originalname
    .replace(/[\/\\\0]/g, "") // Remove path separators and null bytes
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
    .slice(0, 40);
  
  return `${safeName || "file"}-${timestamp}-${random}.webp`;
}

/**
 * Validate and sanitize file path to prevent path traversal
 */
function sanitizePath(basePath, filename) {
  // Remove any path traversal attempts
  const sanitized = filename.replace(/\.\.\/|\.\.\\/g, "");
  const fullPath = path.join(basePath, sanitized);
  
  // Ensure the resolved path is within the base directory
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(basePath);
  
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error("مسیر فایل نامعتبر است");
  }
  
  return resolvedPath;
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
    fileSize: 5 * 1024 * 1024, // 5MB limit for production
    files: 1, // Only one file at a time
    fieldSize: 1024 * 1024, // 1MB field size limit
  },
  fileFilter: (_req, file, cb) => {
    // Validate MIME type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("فقط تصاویر JPEG/PNG/WebP مجاز هستند"));
    }
    
    // Validate file extension
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error("پسوند فایل نامعتبر است"));
    }
    
    cb(null, true);
  },
});

/**
 * Process and secure uploaded image
 * - Validates file signature
 * - Strips EXIF data (privacy/security)
 * - Resizes and optimizes
 * - Converts to WebP format
 */
async function processImage(inputPath, filename) {
  try {
    // Validate file signature to prevent MIME type spoofing
    if (!validateFileSignature(inputPath)) {
      throw new Error("فرمت فایل نامعتبر است (signature mismatch)");
    }

    // Sanitize and validate output path
    const outputPath = sanitizePath(uploadsDir, filename);

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

/**
 * Clean up orphaned temp files older than 1 hour
 */
function cleanupTempFiles() {
  const tempDir = path.join(uploadsDir, "temp");
  if (!fs.existsSync(tempDir)) return;

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  
  fs.readdir(tempDir, (err, files) => {
    if (err) return;
    
    files.forEach((file) => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (stats.mtimeMs < oneHourAgo) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}

// Run cleanup periodically (every 30 minutes)
setInterval(cleanupTempFiles, 30 * 60 * 1000);

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

      // Validate filename doesn't contain path traversal
      if (finalFilename.includes("..") || finalFilename.includes("/") || finalFilename.includes("\\")) {
        throw new Error("نام فایل نامعتبر است");
      }

      // Process the uploaded image (includes signature validation)
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
      
      // Provide specific error messages
      const isSigError = err.message.includes("signature");
      const isPathError = err.message.includes("مسیر") || err.message.includes("نام فایل");
      
      res.status(isSigError || isPathError ? 400 : 500).json({
        message: err.message || "خطا در پردازش تصویر",
      });
    }
  });
});

module.exports = router;
