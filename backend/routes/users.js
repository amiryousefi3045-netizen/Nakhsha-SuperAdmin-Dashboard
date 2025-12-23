const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const { createUserDTO, createErrorResponse } = require("../utils/userDto");
const logger = require("../utils/logger");

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
        return res
          .status(400)
          .json(
            createErrorResponse("VALIDATION_ERROR", "No avatar file provided", {
              field: "avatar",
            })
          );
      }

      const userId = req.user.id;
      const timestamp = Date.now();
      const filename = `${userId}-${timestamp}.webp`;
      const avatarPath = path.join(
        __dirname,
        "..",
        "uploads",
        "avatars",
        filename
      );

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
        { new: true }
      );

      if (!updatedUser) {
        // Clean up uploaded file if user not found
        try {
          await fs.unlink(avatarPath);
        } catch (cleanupError) {
          logger.error(
            "Failed to cleanup avatar file after user not found",
            cleanupError
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
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "Invalid file type. Only JPEG, PNG, and WebP images are allowed",
              {
                field: "avatar",
                allowedTypes: ["image/jpeg", "image/png", "image/webp"],
              }
            )
          );
      }

      if (error.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "VALIDATION_ERROR",
              "File too large. Maximum size is 2MB",
              { field: "avatar", maxSize: "2MB" }
            )
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
              { field: "avatar" }
            )
          );
      }

      // Generic server error
      res
        .status(500)
        .json(createErrorResponse("INTERNAL_ERROR", "Failed to upload avatar"));
    }
  }
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
          })
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
              { field: "name" }
            )
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
          })
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
              { field: "bio" }
            )
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
              { field: "avatar" }
            )
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
              { field: "location" }
            )
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
                  { field: "location.city" }
                )
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
                  { field: "location.neighborhood" }
                )
              );
          }
          updateData["location.neighborhood"] =
            allowedFields.location.neighborhood;
        }

        // Validate and process coordinates
        if (allowedFields.location.coordinates !== undefined) {
          if (
            allowedFields.location.coordinates !== null &&
            typeof allowedFields.location.coordinates !== "object"
          ) {
            return res
              .status(400)
              .json(
                createErrorResponse(
                  "VALIDATION_ERROR",
                  "Location coordinates must be an object or null",
                  { field: "location.coordinates" }
                )
              );
          }

          if (allowedFields.location.coordinates === null) {
            // Set coordinates to null
            updateData["location.coordinates"] = null;
          } else {
            // Process individual coordinate fields
            let hasCoordinates = false;

            // Validate and set lat
            if (allowedFields.location.coordinates.lat !== undefined) {
              if (
                allowedFields.location.coordinates.lat !== null &&
                typeof allowedFields.location.coordinates.lat !== "number"
              ) {
                return res
                  .status(400)
                  .json(
                    createErrorResponse(
                      "VALIDATION_ERROR",
                      "Location coordinates lat must be a number or null",
                      { field: "location.coordinates.lat" }
                    )
                  );
              }
              updateData["location.coordinates.lat"] =
                allowedFields.location.coordinates.lat;
              if (allowedFields.location.coordinates.lat !== null) {
                hasCoordinates = true;
              }
            }

            // Validate and set lng
            if (allowedFields.location.coordinates.lng !== undefined) {
              if (
                allowedFields.location.coordinates.lng !== null &&
                typeof allowedFields.location.coordinates.lng !== "number"
              ) {
                return res
                  .status(400)
                  .json(
                    createErrorResponse(
                      "VALIDATION_ERROR",
                      "Location coordinates lng must be a number or null",
                      { field: "location.coordinates.lng" }
                    )
                  );
              }
              updateData["location.coordinates.lng"] =
                allowedFields.location.coordinates.lng;
              if (allowedFields.location.coordinates.lng !== null) {
                hasCoordinates = true;
              }
            }

            // If both lat and lng are null or neither is provided, set coordinates to null
            if (
              !hasCoordinates &&
              ((allowedFields.location.coordinates.lat === null &&
                allowedFields.location.coordinates.lng === null) ||
                (allowedFields.location.coordinates.lat === undefined &&
                  allowedFields.location.coordinates.lng === undefined))
            ) {
              updateData["location.coordinates"] = null;
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
            { field: null }
          )
        );
    }

    // Update user with findByIdAndUpdate
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      {
        new: true,
        runValidators: true,
      }
    ).select(
      "name phone role avatar bio location creatorType isVerified createdAt updatedAt"
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
        })
      );
    }

    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "Server error"));
  }
});

// Placeholder user routes
router.get("/:id", (req, res) => {
  return res.status(501).json({ message: "Not implemented" });
});

module.exports = router;
