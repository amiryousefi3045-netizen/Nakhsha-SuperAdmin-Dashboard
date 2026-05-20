/**
 * Token Service
 * Handles JWT generation, refresh token lifecycle, and token rotation
 *
 * Architecture:
 * 1. Access Token: Short-lived (15 minutes), used for API requests
 * 2. Refresh Token: Long-lived (30 days), used to get new access tokens
 * 3. Rotation: Each refresh creates a new refresh token (old one revoked)
 */

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/RefreshToken");
const logger = require("../utils/logger");

class TokenService {
  /**
   * Generate access token (short-lived, for API requests)
   * @param {string} userId - User MongoDB ID
   * @param {string} role - User role
   * @returns {string} Signed JWT
   */
  static generateAccessToken(userId, role) {
    const payload = {
      id: userId,
      role,
      type: "access",
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_LIFETIME || "15m",
      algorithm: "HS256",
    });

    logger.debug("Access token generated", {
      userId,
      expiresIn: process.env.JWT_LIFETIME || "15m",
    });

    return token;
  }

  /**
   * Create refresh token and store in database
   * Enables rotation, revocation, and device tracking
   */
  static async createRefreshToken(userId, deviceId, deviceInfo, req) {
    try {
      // Generate cryptographically secure token
      const refreshTokenValue = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshTokenValue)
        .digest("hex");

      // Calculate expiry (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Create refresh token document
      const refreshToken = new RefreshToken({
        userId,
        tokenHash,
        deviceId,
        deviceInfo: {
          userAgent:
            deviceInfo?.userAgent || req.get("user-agent") || "unknown",
          ipAddress: deviceInfo?.ipAddress || req.ip || "unknown",
          lastUsedAt: new Date(),
        },
        expiresAt,
      });

      // Save to database
      await refreshToken.save();

      logger.info("Refresh token created", {
        userId,
        tokenId: refreshToken._id,
        expiresIn: "30 days",
      });

      // Return the unhashed value (only this value can be used to refresh)
      return {
        token: refreshTokenValue,
        expiresAt,
        tokenId: refreshToken._id,
      };
    } catch (error) {
      logger.error("Failed to create refresh token", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Verify refresh token validity
   * Checks expiry, revocation, and replay attacks
   */
  static async verifyRefreshToken(refreshTokenValue, userId) {
    try {
      // Hash the provided token
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshTokenValue)
        .digest("hex");

      // Find token in database
      const tokenDoc = await RefreshToken.findOne({
        userId,
        tokenHash,
      });

      if (!tokenDoc) {
        logger.warn("Refresh token not found", { userId });
        return { valid: false, reason: "TOKEN_NOT_FOUND" };
      }

      // Check if revoked
      if (tokenDoc.revokedAt) {
        logger.warn("Refresh token was revoked", {
          userId,
          revokedAt: tokenDoc.revokedAt,
          reason: tokenDoc.revocationReason,
        });
        return { valid: false, reason: "TOKEN_REVOKED" };
      }

      // Check if expired
      if (tokenDoc.expiresAt < new Date()) {
        logger.warn("Refresh token expired", { userId });
        return { valid: false, reason: "TOKEN_EXPIRED" };
      }

      return { valid: true, tokenDoc };
    } catch (error) {
      logger.error("Error verifying refresh token", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Rotate refresh token (issue new one, revoke old)
   * Called when user refreshes their access token
   * This prevents token reuse attacks
   */
  static async rotateRefreshToken(oldTokenValue, userId, req) {
    try {
      // Verify old token is valid
      const verification = await this.verifyRefreshToken(oldTokenValue, userId);
      if (!verification.valid) {
        logger.warn("Rotation attempt with invalid token", {
          userId,
          reason: verification.reason,
        });
        throw new Error(`Cannot rotate: ${verification.reason}`);
      }

      const oldTokenDoc = verification.tokenDoc;

      // Revoke old token
      oldTokenDoc.revokedAt = new Date();
      oldTokenDoc.revocationReason = "ROTATED";
      await oldTokenDoc.save();

      logger.info("Old refresh token revoked for rotation", {
        userId,
        oldTokenId: oldTokenDoc._id,
      });

      // Issue new refresh token
      const newRefreshToken = await this.createRefreshToken(
        userId,
        oldTokenDoc.deviceId,
        oldTokenDoc.deviceInfo,
        req,
      );

      return {
        refreshToken: newRefreshToken.token,
        expiresAt: newRefreshToken.expiresAt,
      };
    } catch (error) {
      logger.error("Refresh token rotation failed", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke all tokens for a user (logout all devices)
   * Used for security incidents or account lockout
   */
  static async revokeAllTokens(userId, reason = "ADMIN_REVOKE") {
    try {
      const result = await RefreshToken.updateMany(
        {
          userId,
          revokedAt: null, // Only non-revoked tokens
        },
        {
          revokedAt: new Date(),
          revocationReason: reason,
        },
      );

      logger.warn("All refresh tokens revoked for user", {
        userId,
        revokedCount: result.modifiedCount,
        reason,
      });

      return result.modifiedCount;
    } catch (error) {
      logger.error("Failed to revoke all tokens", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke single token (logout specific device)
   */
  static async revokeToken(refreshTokenValue, userId) {
    try {
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshTokenValue)
        .digest("hex");

      const result = await RefreshToken.updateOne(
        { userId, tokenHash },
        {
          revokedAt: new Date(),
          revocationReason: "LOGOUT",
        },
      );

      if (result.modifiedCount === 0) {
        logger.warn("Token not found for revocation", { userId });
        return false;
      }

      logger.info("Refresh token revoked", { userId });
      return true;
    } catch (error) {
      logger.error("Failed to revoke token", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get active sessions for user
   * Useful for "devices" view in settings
   */
  static async getActiveSessions(userId) {
    try {
      const sessions = await RefreshToken.find(
        {
          userId,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
        {
          tokenHash: 0, // Don't expose token hashes
        },
      ).sort({ "deviceInfo.lastUsedAt": -1 });

      return sessions;
    } catch (error) {
      logger.error("Failed to get active sessions", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update last used timestamp for session
   * Called on each token refresh
   */
  static async updateLastUsed(userId, tokenHash) {
    try {
      await RefreshToken.updateOne(
        { userId, tokenHash },
        {
          "deviceInfo.lastUsedAt": new Date(),
        },
      );
    } catch (error) {
      logger.error("Failed to update last used", {
        userId,
        error: error.message,
      });
      // Don't throw - this is non-critical
    }
  }

  /**
   * Cleanup expired refresh tokens
   * Can be run periodically via cron
   */
  static async cleanupExpiredTokens() {
    try {
      const result = await RefreshToken.deleteMany({
        expiresAt: { $lt: new Date() },
        revokedAt: { $exists: true },
      });

      logger.info("Expired tokens cleaned up", {
        deletedCount: result.deletedCount,
      });

      return result.deletedCount;
    } catch (error) {
      logger.error("Failed to cleanup expired tokens", {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = TokenService;
