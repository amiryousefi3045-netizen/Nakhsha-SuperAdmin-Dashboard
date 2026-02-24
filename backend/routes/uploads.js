const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const crypto = require("crypto");
const logger = require("../utils/logger");
const { toAbsoluteUrl } = require("../utils/urls");

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
//
// MAX_FILE_SIZE is validated by config/env.js (defaults to 5 MB).
// Kept at 5 MB; reduce via env var in production if smaller uploads suffice.
const MAX_FILE_BYTES = parseInt(process.env.MAX_FILE_SIZE || "5242880", 10);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tempDir = path.join(uploadsDir, "temp");
    fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 }); // not world-readable
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
    fileSize: MAX_FILE_BYTES,
    files: 1, // single file per request
    fields: 1, // no extra non-file fields beyond the upload field
    fieldSize: 256, // field name/value max 256 bytes
    parts: 2, // 1 file part + 1 field
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
 * Process and secure uploaded image.
 * - Validates file signature (magic bytes)
 * - Strips EXIF / metadata (privacy & security)
 * - Resizes to max 1600×1600
 * - Converts to WebP format
 *
 * Returns an object with { outputPath, width, height, size, mime }
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
    const info = await sharp(inputPath)
      .rotate() // Auto-rotate based on EXIF orientation (then strip orientation tag)
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

    // Get actual file size on disk
    let size = info.size;
    try {
      size = fs.statSync(outputPath).size;
    } catch {
      // fall back to sharp's reported size
    }

    return {
      outputPath,
      width: info.width,
      height: info.height,
      size,
      mime: "image/webp",
    };
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
//
// If the request carries the header  X-Client: nakhsha-web
// the response is wrapped in the canonical envelope:
//   { success: true, data: { files: [{ url, path, width, height, size, mime }] }, reqId }
//
// Without that header the legacy shape is preserved for backward compatibility:
//   { success: true, data: { url, filename }, message, reqId }
router.post("/", (req, res) => {
  const isNewClient =
    (req.headers["x-client"] || "").toLowerCase() === "nakhsha-web";

  upload.single("file")(req, res, async (err) => {
    if (err) {
      const msg = err.message || "خطا در آپلود فایل";
      const tooLarge =
        err.code === "LIMIT_FILE_SIZE" || /File too large/i.test(msg);
      const badType = /Only JPEG\/PNG\/WebP/i.test(msg) || /مجاز/.test(msg);
      const tooManyParts =
        err.code === "LIMIT_PART_COUNT" ||
        err.code === "LIMIT_FILE_COUNT" ||
        err.code === "LIMIT_FIELD_COUNT";
      logger.warn("Upload rejected", { code: err.code, message: msg });
      const status = tooLarge ? 413 : badType ? 415 : tooManyParts ? 400 : 400;
      const persianMsg = tooLarge
        ? `حجم فایل نباید از ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} مگابایت بیشتر باشد`
        : msg;
      return res.status(status).json({
        success: false,
        error: {
          code: tooLarge ? "FILE_TOO_LARGE" : "UPLOAD_ERROR",
          message: persianMsg,
        },
        reqId: req.id ?? null,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_FILE", message: "هیچ فایلی آپلود نشده است" },
        reqId: req.id ?? null,
      });
    }

    try {
      // Generate final filename
      const finalFilename = generateSafeFilename(req.file.originalname);

      // Validate filename doesn't contain path traversal
      if (
        finalFilename.includes("..") ||
        finalFilename.includes("/") ||
        finalFilename.includes("\\")
      ) {
        throw new Error("نام فایل نامعتبر است");
      }

      // Process the uploaded image (includes signature validation)
      // Returns { outputPath, width, height, size, mime }
      const meta = await processImage(req.file.path, finalFilename);

      // Relative path stored / returned to clients
      const relativePath = `/uploads/${finalFilename}`;
      // Absolute URL (uses PUBLIC_BASE_URL or req-derived origin)
      const absoluteUrl = toAbsoluteUrl(relativePath, req);

      if (isNewClient) {
        // ── Enriched envelope for nakhsha-web clients ───────────────────
        return res.status(201).json({
          success: true,
          data: {
            files: [
              {
                url: absoluteUrl,
                path: relativePath,
                width: meta.width,
                height: meta.height,
                size: meta.size,
                mime: meta.mime,
              },
            ],
          },
          reqId: req.id ?? null,
        });
      }

      // ── Legacy shape kept for backward compatibility ──────────────────
      res.status(201).json({
        success: true,
        data: { url: relativePath, filename: finalFilename },
        message: "تصویر با موفقیت آپلود و پردازش شد",
        reqId: req.id ?? null,
      });
    } catch (err) {
      logger.error("Image processing error", {
        reqId: req.id,
        message: err.message,
        stack: err.stack,
      });

      // Provide specific error messages
      const isSigError = err.message.includes("signature");
      const isPathError =
        err.message.includes("مسیر") || err.message.includes("نام فایل");

      res.status(isSigError || isPathError ? 400 : 500).json({
        success: false,
        error: {
          code: isSigError
            ? "INVALID_FILE"
            : isPathError
              ? "INVALID_PATH"
              : "PROCESSING_ERROR",
          message: err.message || "خطا در پردازش تصویر",
        },
        reqId: req.id ?? null,
      });
    }
  });
});

module.exports = router;
