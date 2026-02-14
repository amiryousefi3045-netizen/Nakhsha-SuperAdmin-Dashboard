const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;
const Post = require("../models/Post");
const User = require("../models/User");
const { validate, createPostSchema } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { createErrorResponse } = require("../utils/userDto");
const { normalizeLocation } = require("../utils/geospatial");

const router = express.Router();

// Configure multer for post image uploads (memory storage)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB per file
    files: 6, // Max 6 files
  },
  fileFilter: (req, file, cb) => {
    // Check mime type
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("INVALID_FILE_TYPE"), false);
    }
  },
});

// Helper function to format Post to PostDTO
function formatPostDTO(post, req) {
  const baseUrl = req.protocol + "://" + req.get("host");

  return {
    id: post._id,
    type: post.type,
    title: post.title,
    description: post.description,
    images: (post.images || []).map((imagePath) =>
      imagePath.startsWith("http") ? imagePath : `${baseUrl}${imagePath}`,
    ),
    location: post.location,
    owner: post.owner
      ? {
          id: post.owner._id || post.owner.id,
          name: post.owner.name,
          handle: post.owner.handle,
          avatar: post.owner.avatar
            ? post.owner.avatar.startsWith("http")
              ? post.owner.avatar
              : `${baseUrl}${post.owner.avatar}`
            : null,
        }
      : null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

// POST /api/posts - Create new post
router.post("/", requireAuth, validate(createPostSchema), async (req, res) => {
  try {
    const { title, description, category, price, location } = req.body;

    // Verify user exists
    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(401)
        .json(
          createErrorResponse(
            "USER_NOT_FOUND",
            "کاربر یافت نشد",
            "User not found",
          ),
        );
    }

    // Create the post
    const postData = {
      owner: req.user.id,
      title,
      description,
      status: "published",
    };

    // Add optional fields if provided
    if (category) postData.category = category;
    if (price !== undefined) postData.price = price;

    // Normalize location to GeoJSON format if provided
    if (location) {
      const normalized = normalizeLocation(location);
      if (normalized) {
        postData.location = normalized;
      } else {
        postData.location = {
          city: location.city || "",
          neighborhood: location.neighborhood || "",
        };
      }
    }

    const post = await Post.create(postData);

    // Populate owner information for response
    await post.populate("owner", "name handle avatar");

    // Format response as PostDTO
    const postDTO = formatPostDTO(post, req);

    res.status(201).json({
      item: postDTO,
    });
  } catch (error) {
    console.error("POST /api/posts error:", error);

    if (error.name === "ValidationError") {
      const details = Object.values(error.errors || {}).map(
        (err) => err.message,
      );
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "اطلاعات ارسالی نامعتبر است",
            details,
          ),
        );
    }

    res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "خطای سرور. لطفاً دوباره تلاش کنید",
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
        ),
      );
  }
});

// POST /api/posts/:id/images - Upload images to post
router.post(
  "/:id/images",
  requireAuth,
  imageUpload.array("images", 6),
  async (req, res) => {
    try {
      const postId = req.params.id;

      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json(
          createErrorResponse("VALIDATION_ERROR", "شناسه پست نامعتبر است", {
            field: "id",
          }),
        );
      }

      // Find post and verify ownership
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json(
          createErrorResponse("POST_NOT_FOUND", "پست یافت نشد", {
            field: "id",
          }),
        );
      }

      // Check if user owns the post
      if (post.owner.toString() !== req.user.id) {
        return res.status(403).json(
          createErrorResponse("FORBIDDEN", "دسترسی محدود", {
            field: "owner",
          }),
        );
      }

      // Check if files were uploaded
      if (!req.files || req.files.length === 0) {
        return res.status(400).json(
          createErrorResponse("VALIDATION_ERROR", "هیچ تصویری ارسال نشده است", {
            field: "images",
          }),
        );
      }

      // Validate file count
      if (req.files.length > 6) {
        return res.status(400).json(
          createErrorResponse("VALIDATION_ERROR", "حداکثر ۶ تصویر مجاز است", {
            field: "images",
          }),
        );
      }

      // Create uploads/posts directory if it doesn't exist
      const postsDir = path.join(__dirname, "..", "uploads", "posts");
      try {
        await fs.access(postsDir);
      } catch {
        await fs.mkdir(postsDir, { recursive: true });
      }

      // Process and save each image
      const timestamp = Date.now();
      const imagePaths = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const filename = `${postId}-${timestamp}-${i}.webp`;
        const imagePath = path.join(postsDir, filename);

        try {
          // Process image with sharp
          await sharp(file.buffer)
            .rotate() // Auto-rotate based on EXIF
            .resize({ width: 1280, withoutEnlargement: true }) // Max width 1280, keep aspect ratio
            .webp({ quality: 75 }) // Convert to webp with 75% quality
            .toFile(imagePath);

          // Store relative path for database
          const relativePath = `/uploads/posts/${filename}`;
          imagePaths.push(relativePath);
        } catch (sharpError) {
          console.error("Sharp processing error:", sharpError);
          return res.status(500).json(
            createErrorResponse(
              "IMAGE_PROCESSING_ERROR",
              "خطا در پردازش تصویر",
              {
                field: "images",
              },
            ),
          );
        }
      }

      // Add new image paths to post.images array
      post.images.push(...imagePaths);
      await post.save();

      // Populate owner information for response
      await post.populate("owner", "name handle avatar");

      // Format response as PostDTO
      const postDTO = formatPostDTO(post, req);

      res.status(200).json({
        item: postDTO,
      });
    } catch (error) {
      console.error("POST /api/posts/:id/images error:", error);

      // Handle multer errors
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "حجم فایل نباید از ۲ مگابایت بیشتر باشد",
            {
              field: "images",
            },
          ),
        );
      }

      if (error.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json(
          createErrorResponse("VALIDATION_ERROR", "حداکثر ۶ تصویر مجاز است", {
            field: "images",
          }),
        );
      }

      if (error.message === "INVALID_FILE_TYPE") {
        return res.status(400).json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "فرمت تصویر باید JPEG، PNG یا WebP باشد",
            {
              field: "images",
            },
          ),
        );
      }

      res
        .status(500)
        .json(
          createErrorResponse(
            "INTERNAL_SERVER_ERROR",
            "خطای سرور. لطفاً دوباره تلاش کنید",
            process.env.NODE_ENV === "development"
              ? error.message
              : "Internal server error",
          ),
        );
    }
  },
);

module.exports = router;
