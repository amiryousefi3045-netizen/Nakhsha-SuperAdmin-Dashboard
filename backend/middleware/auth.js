const jwt = require("jsonwebtoken");
const { createErrorResponse } = require("../utils/userDto");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

/**
 * Authentication middleware for protected routes
 * Validates JWT token and sets req.user with payload { id, role }
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {Object|void} - Error response or calls next()
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res
      .status(401)
      .json(
        createErrorResponse(
          "UNAUTHORIZED",
          "Missing or invalid authorization token"
        )
      );
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    return res
      .status(401)
      .json(createErrorResponse("UNAUTHORIZED", "Invalid or expired token"));
  }
}

/**
 * Role-based authorization middleware
 * Checks if req.user.role matches any of the required roles
 *
 * @param {...string} roles - Required roles
 * @returns {Function} - Express middleware function
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json(createErrorResponse("UNAUTHORIZED", "Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json(
        createErrorResponse("FORBIDDEN", "Access denied", {
          requiredRoles: roles,
        })
      );
    }

    next();
  };
}

module.exports = { requireAuth, requireRole };
