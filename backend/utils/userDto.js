/**
 * UserDTO utility - Standardized user data transfer object for Nakhsha API
 */

const path = require("path");

/**
 * Get absolute URL for avatar
 * @param {string|null} avatarPath - Relative avatar path or null
 * @param {Object} req - Express request object for base URL
 * @returns {string} - Absolute avatar URL or default avatar URL
 */
function getAbsoluteAvatarUrl(avatarPath, req) {
  if (!avatarPath) {
    // Default avatar URL
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return `${baseUrl}/uploads/avatars/default-avatar.svg`;
  }

  // If already absolute URL, return as is
  if (avatarPath.startsWith("http://") || avatarPath.startsWith("https://")) {
    return avatarPath;
  }

  // Convert relative path to absolute URL
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const cleanPath = avatarPath.startsWith("/") ? avatarPath : `/${avatarPath}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Create standardized UserDTO from User document
 * @param {Object} user - Mongoose user document
 * @param {Object} req - Express request object for avatar URL
 * @returns {Object} - Standardized UserDTO
 */
function createUserDTO(user, req) {
  if (!user) return null;

  return {
    id: user._id || user.id,
    phone: user.phone,
    handle: user.handle || null,
    name: user.name || "",
    avatar: getAbsoluteAvatarUrl(user.avatar, req),
    bio: user.bio || "",
    location: {
      city: user.location?.city || "",
      neighborhood: user.location?.neighborhood || "",
      coordinates: {
        lat: user.location?.coordinates?.lat || null,
        lng: user.location?.coordinates?.lng || null,
      },
    },
    role: user.role || "user",
    creatorType: user.creatorType || "artisan",
    isVerified: Boolean(user.isVerified),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Create standardized error response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object|Array} details - Additional error details
 * @returns {Object} - Standardized error response
 */
function createErrorResponse(code, message, details = null) {
  const response = {
    error: {
      code,
      message,
    },
  };

  if (details !== null) {
    response.error.details = details;
  }

  return response;
}

module.exports = {
  createUserDTO,
  createErrorResponse,
  getAbsoluteAvatarUrl,
};
