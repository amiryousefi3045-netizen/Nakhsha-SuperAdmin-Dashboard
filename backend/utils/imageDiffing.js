/**
 * imageDiffing.js — Image diffing utilities for tracking image changes.
 *
 * Supports:
 * - Detecting removed images
 * - Detecting new/appended images
 * - Reordering detection
 * - Building optimized image arrays
 * - Tracking which images were deleted (for cleanup)
 */

/**
 * Compute image diff between old and new image arrays.
 *
 * Returns detailed info about:
 * - Images to remove (not in newImages)
 * - Images to add (in newImages but not in oldImages)
 * - New image order
 *
 * @param {string[]} oldImages - Current images array
 * @param {string[]} newImages - Updated images array
 * @returns {object} { added, removed, reordered, newOrder }
 */
function diffImages(oldImages = [], newImages = []) {
  const oldSet = new Set(oldImages);
  const newSet = new Set(newImages);

  // Images that were removed (in old but not in new)
  const removed = oldImages.filter((img) => !newSet.has(img));

  // Images that were added (in new but not in old)
  const added = newImages.filter((img) => !oldSet.has(img));

  // Check if there was reordering
  const reordered =
    oldImages.length === newImages.length &&
    !oldImages.every((img, idx) => img === newImages[idx]);

  return {
    added,
    removed,
    reordered,
    newOrder: newImages,
    oldOrder: oldImages,
    hasChanges: added.length > 0 || removed.length > 0 || reordered,
  };
}

/**
 * Filter out invalid image paths (empty strings, nulls, etc.).
 *
 * @param {string[]} images - Image paths array
 * @returns {string[]} Cleaned array
 */
function sanitizeImages(images = []) {
  return images
    .filter((img) => img && typeof img === "string" && img.trim().length > 0)
    .map((img) => img.trim());
}

/**
 * Validate image paths format.
 * All images should be relative server paths (e.g., "/uploads/abc.webp").
 *
 * @param {string[]} images - Image paths to validate
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validateImagePaths(images = []) {
  const errors = [];

  if (!Array.isArray(images)) {
    return {
      valid: false,
      errors: ["تصاویر باید یک آرایه باشند"],
    };
  }

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    // Check if it's a string
    if (typeof img !== "string") {
      errors.push(`تصویر ${i}: باید یک رشته (string) باشد`);
      continue;
    }

    // Check if it's not empty
    if (!img.trim()) {
      errors.push(`تصویر ${i}: نمی‌تواند خالی باشد`);
      continue;
    }

    // Check if it starts with "/" (relative path)
    if (!img.startsWith("/")) {
      errors.push(`تصویر ${i}: باید با "/" شروع شود (مسیر نسبی سرور)`);
      continue;
    }

    // Check for basic path traversal attempts (security)
    if (img.includes("..")) {
      errors.push(`تصویر ${i}: نمی‌تواند "../" داشته باشد`);
      continue;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build an image tracking entry for audit/history.
 * Tracks what happened to images during an edit.
 *
 * @param {string[]} oldImages - Previous images
 * @param {string[]} newImages - Updated images
 * @returns {object} Tracking entry with details
 */
function buildImageTrackingEntry(oldImages = [], newImages = []) {
  const diff = diffImages(oldImages, newImages);

  return {
    timestamp: new Date(),
    before: oldImages,
    after: newImages,
    added: diff.added,
    removed: diff.removed,
    reordered: diff.reordered,
    changesCount: diff.added.length + diff.removed.length,
  };
}

/**
 * Merge old images with new/removed images.
 * Useful for applying partial updates to the image array.
 *
 * Use cases:
 * - Keep existing images and append new ones
 * - Remove specific images from the array
 * - Reorder images
 *
 * @param {string[]} currentImages - Current images on the document
 * @param {object} operations - { add?: string[], remove?: string[], reorder?: string[] }
 * @returns {string[]} Merged image array
 */
function applyImageOperations(currentImages = [], operations = {}) {
  let result = [...currentImages];

  // Remove specified images
  if (operations.remove && Array.isArray(operations.remove)) {
    const removeSet = new Set(operations.remove);
    result = result.filter((img) => !removeSet.has(img));
  }

  // Add new images
  if (operations.add && Array.isArray(operations.add)) {
    result = result.concat(operations.add);
  }

  // Apply full reorder if specified
  if (operations.reorder && Array.isArray(operations.reorder)) {
    result = operations.reorder;
  }

  // Clean up duplicates while preserving order
  const seen = new Set();
  result = result.filter((img) => {
    if (seen.has(img)) {
      return false;
    }
    seen.add(img);
    return true;
  });

  return result;
}

/**
 * Get image delta for frontend form response.
 * Returns minimal data needed for the frontend to update the form.
 *
 * @param {string[]} oldImages - Previous images
 * @param {string[]} newImages - Updated images
 * @returns {object} Delta for frontend { added, removed, current }
 */
function getImageDeltaForResponse(oldImages = [], newImages = []) {
  const diff = diffImages(oldImages, newImages);

  return {
    added: diff.added,
    removed: diff.removed,
    current: newImages,
    totalImages: newImages.length,
  };
}

module.exports = {
  diffImages,
  sanitizeImages,
  validateImagePaths,
  buildImageTrackingEntry,
  applyImageOperations,
  getImageDeltaForResponse,
};
