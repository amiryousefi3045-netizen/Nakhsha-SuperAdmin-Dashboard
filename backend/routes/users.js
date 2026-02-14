const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const { createUserDTO, createErrorResponse } = require("../utils/userDto");
const logger = require("../utils/logger");
const {
  isValidCoordinates,
  normalizeLocation,
} = require("../utils/geospatial");

const router = express.Router();

// Configure multer for avatar uploads (memory storage)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
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

// POST /api/users/me/avatar - Upload avatar
router.post(
  "/me/avatar",
  requireAuth,
  avatarUpload.single("avatar"),
  async (req, res) => {
    try {
      // Check if file exists
      if (!req.file) {
        return res.status(400).json(
          createErrorResponse("VALIDATION_ERROR", "No avatar file provided", {
            field: "avatar",
          }),
        );
      }

      const userId = req.user.id;
      const timestamp = Date.now();
      const filename = `${userId}-${timestamp}.webp`;
      const avatarsDir = path.join(__dirname, "..", "uploads", "avatars");
      const avatarPath = path.join(avatarsDir, filename);

      // Ensure avatars directory exists
      try {
        await fs.mkdir(avatarsDir, { recursive: true });
      } catch (mkdirError) {
        logger.error("Failed to create avatars directory", mkdirError);
        return res
          .status(500)
          .json(
            createErrorResponse(
              "INTERNAL_ERROR",
              "Failed to create upload directory",
            ),
          );
      }

      // Process image with sharp
      await sharp(req.file.buffer)
        .resize(256, 256, {
          fit: "cover",
          position: "center",
        })
        .webp({ quality: 75 })
        .toFile(avatarPath);

      // Update user's avatar field in database
      const relativePath = `/uploads/avatars/${filename}`;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { avatar: relativePath },
        { new: true },
      );

      if (!updatedUser) {
        // Clean up uploaded file if user not found
        try {
          await fs.unlink(avatarPath);
        } catch (cleanupError) {
          logger.error(
            "Failed to cleanup avatar file after user not found",
            cleanupError,
          );
        }

        return res
          .status(404)
          .json(createErrorResponse("NOT_FOUND", "User not found"));
      }

      logger.info("Avatar uploaded successfully", {
        userId,
        filename,
        originalName: req.file.originalname,
        size: req.file.size,
      });

      // Return updated user
      res.json({ user: createUserDTO(updatedUser, req) });
    } catch (error) {
      logger.error("Avatar upload error:", error);

      // Handle multer errors
      if (error.message === "INVALID_FILE_TYPE") {
        return res.status(400).json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Invalid file type. Only JPEG, PNG, and WebP images are allowed",
            {
              field: "avatar",
              allowedTypes: ["image/jpeg", "image/png", "image/webp"],
            },
          ),
        );
      }

      if (error.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "File too large. Maximum size is 2MB",
              { field: "avatar", maxSize: "2MB" },
            ),
          );
      }

      // Handle sharp processing errors
      if (error.message && error.message.includes("Input file")) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "Invalid image file or corrupted data",
              { field: "avatar" },
            ),
          );
      }

      // Generic server error
      res
        .status(500)
        .json(createErrorResponse("INTERNAL_ERROR", "Failed to upload avatar"));
    }
  },
);

// PATCH /api/users/me - Update current user profile
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const { body } = req;

    // Allow-list of updatable fields
    const allowedFields = {
      name: body.name,
      bio: body.bio,
      avatar: body.avatar,
      location: body.location,
    };

    // Build update object with only allowed fields
    const updateData = {};

    // Validate and process name
    if (allowedFields.name !== undefined) {
      if (typeof allowedFields.name !== "string") {
        return res.status(400).json(
          createErrorResponse("VALIDATION_ERROR", "Name must be a string", {
            field: "name",
          }),
        );
      }
      const trimmedName = allowedFields.name.trim();
      if (trimmedName.length > 60) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "Name must be 60 characters or less",
              { field: "name" },
            ),
          );
      }
      updateData.name = trimmedName;
    }

    // Validate and process bio
    if (allowedFields.bio !== undefined) {
      if (typeof allowedFields.bio !== "string") {
        return res.status(400).json(
          createErrorResponse("VALIDATION_ERROR", "Bio must be a string", {
            field: "bio",
          }),
        );
      }
      const trimmedBio = allowedFields.bio.trim();
      if (trimmedBio.length > 300) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "Bio must be 300 characters or less",
              { field: "bio" },
            ),
          );
      }
      updateData.bio = trimmedBio;
    }

    // Validate and process avatar
    if (allowedFields.avatar !== undefined) {
      if (
        allowedFields.avatar !== null &&
        typeof allowedFields.avatar !== "string"
      ) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "Avatar must be a string or null",
              { field: "avatar" },
            ),
          );
      }
      updateData.avatar = allowedFields.avatar;
    }

    // Validate and process location using dot-notation for partial updates
    if (allowedFields.location !== undefined) {
      if (
        allowedFields.location !== null &&
        typeof allowedFields.location !== "object"
      ) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "Location must be an object or null",
              { field: "location" },
            ),
          );
      }

      if (allowedFields.location === null) {
        // Set entire location to null
        updateData.location = null;
      } else {
        // Process location fields with dot-notation for partial updates

        // Validate and set city
        if (allowedFields.location.city !== undefined) {
          if (
            allowedFields.location.city !== null &&
            typeof allowedFields.location.city !== "string"
          ) {
            return res
              .status(400)
              .json(
                createErrorResponse(
                  "VALIDATION_ERROR",
                  "Location city must be a string or null",
                  { field: "location.city" },
                ),
              );
          }
          updateData["location.city"] = allowedFields.location.city;
        }

        // Validate and set neighborhood
        if (allowedFields.location.neighborhood !== undefined) {
          if (
            allowedFields.location.neighborhood !== null &&
            typeof allowedFields.location.neighborhood !== "string"
          ) {
            return res
              .status(400)
              .json(
                createErrorResponse(
                  "VALIDATION_ERROR",
                  "Location neighborhood must be a string or null",
                  { field: "location.neighborhood" },
                ),
              );
          }
          updateData["location.neighborhood"] =
            allowedFields.location.neighborhood;
        }

        // Validate and process coordinates (supports both legacy and GeoJSON formats)
        if (allowedFields.location.coordinates !== undefined) {
          // Handle array format [lng, lat]
          if (Array.isArray(allowedFields.location.coordinates)) {
            const coords = allowedFields.location.coordinates;
            if (coords.length === 2) {
              const [lng, lat] = coords;
              if (isValidCoordinates(lng, lat)) {
                updateData["location.geometry"] = {
                  type: "Point",
                  coordinates: [lng, lat],
                };
              } else {
                return res
                  .status(400)
                  .json(
                    createErrorResponse(
                      "VALIDATION_ERROR",
                      "مختصات جغرافیایی نامعتبر است",
                      { field: "location.coordinates", lng, lat },
                    ),
                  );
              }
            } else if (
              coords.length === 0 ||
              allowedFields.location.coordinates === null
            ) {
              updateData["location.geometry"] = null;
            }
          }
          // Handle null
          else if (allowedFields.location.coordinates === null) {
            updateData["location.geometry"] = null;
          }
          // Handle legacy object format {lat, lng}
          else if (typeof allowedFields.location.coordinates === "object") {
            const { lat, lng } = allowedFields.location.coordinates;
            if (lat !== undefined && lng !== undefined) {
              if (lat === null && lng === null) {
                updateData["location.geometry"] = null;
              } else if (typeof lat === "number" && typeof lng === "number") {
                if (isValidCoordinates(lng, lat)) {
                  updateData["location.geometry"] = {
                    type: "Point",
                    coordinates: [lng, lat],
                  };
                } else {
                  return res
                    .status(400)
                    .json(
                      createErrorResponse(
                        "VALIDATION_ERROR",
                        "مختصات جغرافیایی نامعتبر است",
                        { field: "location.coordinates", lng, lat },
                      ),
                    );
                }
              }
            }
          }
        }

        // Also support direct geometry field (GeoJSON format)
        if (allowedFields.location.geometry !== undefined) {
          if (allowedFields.location.geometry === null) {
            updateData["location.geometry"] = null;
          } else if (
            allowedFields.location.geometry.type === "Point" &&
            Array.isArray(allowedFields.location.geometry.coordinates)
          ) {
            const [lng, lat] = allowedFields.location.geometry.coordinates;
            if (isValidCoordinates(lng, lat)) {
              updateData["location.geometry"] = {
                type: "Point",
                coordinates: [lng, lat],
              };
            } else {
              return res
                .status(400)
                .json(
                  createErrorResponse(
                    "VALIDATION_ERROR",
                    "مختصات جغرافیایی نامعتبر است",
                    { field: "location.geometry", lng, lat },
                  ),
                );
            }
          }
        }
      }
    }

    // Only proceed if there are valid fields to update
    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "No valid fields provided for update",
            { field: null },
          ),
        );
    }

    // Update user with findByIdAndUpdate
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      {
        new: true,
        runValidators: true,
      },
    ).select(
      "name phone handle role avatar bio location creatorType isVerified createdAt updatedAt",
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json(createErrorResponse("USER_NOT_FOUND", "User not found"));
    }

    // Return fresh UserDTO
    res.json({ user: createUserDTO(updatedUser, req) });
  } catch (error) {
    logger.error("PATCH /users/me error", {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      body: req.body,
    });

    // Handle Mongoose validation errors
    if (error.name === "ValidationError") {
      const firstError = Object.values(error.errors)[0];
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", firstError.message, {
          field: firstError.path,
        }),
      );
    }

    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "Server error"));
  }
});

// GET /api/users/handle/:handle - Get user by handle
router.get("/handle/:handle", async (req, res) => {
  try {
    const { handle } = req.params;

    // Validate handle parameter
    if (!handle || typeof handle !== "string" || handle.trim().length === 0) {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "Handle is required", {
          field: "handle",
        }),
      );
    }

    const cleanHandle = handle.trim().toLowerCase();

    // Find user by handle
    const user = await User.findOne({ handle: cleanHandle }).select(
      "name phone handle role avatar bio location creatorType isVerified createdAt updatedAt",
    );

    if (!user) {
      return res.status(404).json(
        createErrorResponse("NOT_FOUND", "User not found", {
          handle: cleanHandle,
        }),
      );
    }

    // Return user data using DTO
    res.json({ user: createUserDTO(user, req) });
  } catch (error) {
    logger.error("GET /users/handle/:handle error", {
      error: error.message,
      stack: error.stack,
      handle: req.params?.handle,
    });

    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "Server error"));
  }
});

// GET /api/users/handle/:handle/content - Get user content by handle and type
router.get("/handle/:handle/content", async (req, res) => {
  try {
    const { handle } = req.params;
    const { type } = req.query;

    // Validate handle parameter
    if (!handle || typeof handle !== "string" || handle.trim().length === 0) {
      return res.status(400).json(
        createErrorResponse("VALIDATION_ERROR", "Handle is required", {
          field: "handle",
        }),
      );
    }

    // Validate type parameter
    const validTypes = ["posts", "tours", "tutorials"];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json(
        createErrorResponse(
          "VALIDATION_ERROR",
          "Valid content type is required",
          {
            field: "type",
            validTypes,
          },
        ),
      );
    }

    const cleanHandle = handle.trim().toLowerCase();

    // Find user by handle to verify they exist
    const user = await User.findOne({ handle: cleanHandle }).select("_id name");

    if (!user) {
      return res.status(404).json(
        createErrorResponse("NOT_FOUND", "User not found", {
          handle: cleanHandle,
        }),
      );
    }

    // Generate mock content based on type (will be replaced with real collections later)
    const generateMockContent = (contentType, userId) => {
      const cities = [
        "تهران",
        "اصفهان",
        "شیراز",
        "مشهد",
        "تبریز",
        "کرج",
        "قم",
        "کرمان",
      ];
      const count = Math.floor(Math.random() * 5) + 8; // 8-12 items

      const items = [];
      for (let i = 0; i < count; i++) {
        const randomCity = cities[Math.floor(Math.random() * cities.length)];
        const randomDate = new Date(
          Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
        );

        const baseItem = {
          id: `${contentType}_${userId}_${i}`,
          type: contentType.slice(0, -1), // Remove 's' to get singular form
          city: randomCity,
          createdAt: randomDate.toISOString(),
          thumbnailUrl:
            Math.random() > 0.3
              ? `https://picsum.photos/400/225?random=${contentType}_${i}`
              : null,
        };

        if (contentType === "posts") {
          items.push({
            ...baseItem,
            title: `صنایع دستی زیبا از ${randomCity} - نمونه ${i + 1}`,
            price:
              Math.random() > 0.5
                ? `${Math.floor(Math.random() * 500 + 100)} هزار تومان`
                : null,
          });
        } else if (contentType === "tours") {
          items.push({
            ...baseItem,
            title: `تور گردشگری ${randomCity} - برنامه ${i + 1}`,
            price: `${Math.floor(Math.random() * 2000 + 500)} هزار تومان`,
          });
        } else if (contentType === "tutorials") {
          items.push({
            ...baseItem,
            title: `آموزش ساخت صنایع دستی ${randomCity} - قسمت ${i + 1}`,
            price: null,
          });
        }
      }

      return items;
    };

    const items = generateMockContent(type, user._id);

    res.json({ items });
  } catch (error) {
    logger.error("GET /users/handle/:handle/content error", {
      error: error.message,
      stack: error.stack,
      handle: req.params?.handle,
      type: req.query?.type,
    });

    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "Server error"));
  }
});

// Placeholder user routes
router.get("/:id", (req, res) => {
  return res.status(501).json({ message: "Not implemented" });
});

module.exports = router;
