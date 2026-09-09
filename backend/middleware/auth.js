const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { createErrorResponse } = require("../utils/response");

/**
 * Fail-fast secret accessor.
 * Throws at call time if JWT_SECRET is missing so the server never verifies
 * tokens with an empty or default key.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is not set — " +
        "set it in backend/.env (see backend/.env.example).",
    );
  }
  return secret;
}

/**
 * Resolve the current user's real account state from the database.
 *
 * Security rationale: a JWT carries a snapshot of `{ id, role }` at issue time.
 * A role change, a block, or an account deletion must take effect immediately,
 * so every protected request re-validates the account from MongoDB instead of
 * trusting the token payload alone.
 *
 * Returns the fresh user document, or throws an error object that the caller
 * can turn into the canonical error envelope.
 */
async function resolveCurrentUser(userId, req, payload) {
  const user = await User.findById(userId)
    .select("id role isBlocked tokenVersion")
    .lean();

  if (!user) {
    const err = new Error("کاربر یافت نشد");
    err.statusCode = 401;
    err.code = "UNAUTHORIZED";
    err.response = true;
    return { user: null, error: err };
  }

  if (user.isBlocked) {
    const err = new Error("حساب کاربری شما مسدود شده است");
    err.statusCode = 403;
    err.code = "FORBIDDEN";
    err.response = true;
    return { user: null, error: err };
  }

  // A token signed before a logout-all / block / role change carries an older
  // `ver`. Old tokens without the claim are treated as version 0 (backward
  // compatible with sessions minted before this feature landed).
  if (
    payload &&
    payload.id &&
    Number(payload.ver ?? 0) !== Number(user.tokenVersion ?? 0)
  ) {
    const err = new Error("نشست شما بسته شده است");
    err.statusCode = 401;
    err.code = "UNAUTHORIZED";
    err.response = true;
    return { user: null, error: err };
  }

  return { user, error: null };
}

/**
 * Authentication middleware for protected routes
 * Validates JWT token and sets req.user with payload { id, role }
 * then re-checks the account state (existence + block) against the DB so a
 * stale-but-valid token can never bypass an active block.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {Promise<Object|void>} - Error response or calls next()
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res
      .status(401)
      .json(
        createErrorResponse(
          "UNAUTHORIZED",
          "Missing or invalid authorization token",
          null,
          req.id,
        ),
      );
  }

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch {
    return res
      .status(401)
      .json(createErrorResponse("UNAUTHORIZED", "Invalid or expired token", null, req.id));
  }

  try {
    const { user, error } = await resolveCurrentUser(payload.id, req, payload);
    if (error) {
      return res
        .status(error.statusCode)
        .json(createErrorResponse(error.code, error.message, null, req.id));
    }

    req.user = { id: user._id.toString(), role: user.role };
    next();
  } catch (dbError) {
    return res
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_ERROR",
          "خطای داخلی سرور",
          null,
          req.id,
        ),
      );
  }
}

/**
 * Role-based authorization middleware
 * Checks the CURRENT DB role (never the JWT role alone) against the required
 * roles. A blocked account or a role change is therefore reflected
 * immediately, even while an old JWT is still valid.
 *
 * @param {...string} roles - Required roles
 * @returns {Function} - Express middleware function
 */
function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json(
          createErrorResponse(
            "UNAUTHORIZED",
            "Authentication required",
            null,
            req.id,
          ),
        );
    }

    // Re-validate account state authentically from the DB. `requireAuth` also
    // does this, but a route stack that mounts requireRole directly (without
    // requireAuth) must still derive role from the database.
    try {
      const { user, error } = await resolveCurrentUser(req.user.id, req);
      if (error) {
        return res
          .status(error.statusCode)
          .json(createErrorResponse(error.code, error.message, null, req.id));
      }

      if (!roles.includes(user.role)) {
        return res.status(403).json(
          createErrorResponse(
            "FORBIDDEN",
            "دسترسی مجاز نیست",
            { requiredRoles: roles },
            req.id,
          ),
        );
      }

      req.user = { id: user._id.toString(), role: user.role };
      next();
    } catch (dbError) {
      return res
        .status(500)
        .json(
          createErrorResponse(
            "INTERNAL_ERROR",
            "خطای داخلی سرور",
            null,
            req.id,
          ),
        );
    }
  };
}

module.exports = { requireAuth, requireRole };