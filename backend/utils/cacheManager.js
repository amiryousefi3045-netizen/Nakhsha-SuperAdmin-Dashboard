/**
 * CacheManager — Redis-based caching layer for geospatial queries.
 *
 * Features:
 * - Cache key generation based on coordinates + filters
 * - TTL management (5 min for hot regions, 15 min for cold)
 * - Cache invalidation patterns
 * - Fallback to no-cache if Redis unavailable
 * - Performance metrics
 *
 * Environment Variables:
 * - REDIS_URL: Redis connection string (optional, disables cache if not set)
 * - GEO_CACHE_TTL: Cache TTL in seconds (default 300 = 5 minutes)
 *
 * Usage:
 *   const cache = require('./cacheManager');
 *   const key = cache.generateKey(lat, lng, radius, filters);
 *   const cached = await cache.get(key);
 *   if (!cached) {
 *     const result = await queryDatabase();
 *     await cache.set(key, result, 300);
 *   }
 *   await cache.invalidateRegion(lat, lng, 5); // Invalidate nearby regions
 */

const crypto = require("crypto");
let redis;

// Lazy-load redis only if REDIS_URL is set
try {
  if (process.env.REDIS_URL) {
    redis = require("redis");
  }
} catch (e) {
  console.warn("[CacheManager] Redis not installed — caching disabled");
}

class CacheManager {
  constructor() {
    this.client = null;
    this.connected = false;
    this.coordinateRoundingDecimals = 3; // ~111m accuracy
    this.defaultTTL = parseInt(process.env.GEO_CACHE_TTL) || 300; // 5 minutes
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection.
   * Gracefully handles missing Redis (cache disabled).
   */
  initializeRedis() {
    if (!process.env.REDIS_URL || !redis) {
      console.log(
        "[CacheManager] REDIS_URL not set or redis not installed — caching disabled",
      );
      return;
    }

    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500),
        },
      });

      this.client.on("error", (err) => {
        console.error("[CacheManager] Redis error:", err);
        this.connected = false;
      });

      this.client.on("connect", () => {
        console.log("[CacheManager] Connected to Redis");
        this.connected = true;
      });

      this.client.on("disconnect", () => {
        console.log("[CacheManager] Disconnected from Redis");
        this.connected = false;
      });

      // Non-blocking connect
      this.client.connect().catch((err) => {
        console.error("[CacheManager] Failed to connect to Redis:", err);
      });
    } catch (error) {
      console.error("[CacheManager] Redis initialization error:", error);
      this.connected = false;
    }
  }

  /**
   * Check if cache is available.
   * @returns {boolean}
   */
  isAvailable() {
    return this.connected && this.client !== null;
  }

  /**
   * Generate cache key from query parameters.
   * Uses rounded coordinates to maximize cache hits.
   *
   * Key format: geo:listings:{rounded_lat}:{rounded_lng}:{radius}:{filter_hash}
   *
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusKm
   * @param {object} filters - { category, type, status, minPrice, maxPrice, owner, minRating, query, verified }
   * @returns {string} Cache key
   */
  generateKey(latitude, longitude, radiusKm, filters = {}) {
    // Round coordinates to 3 decimals (~111m accuracy)
    const roundedLat =
      Math.round(latitude * Math.pow(10, this.coordinateRoundingDecimals)) /
      Math.pow(10, this.coordinateRoundingDecimals);
    const roundedLng =
      Math.round(longitude * Math.pow(10, this.coordinateRoundingDecimals)) /
      Math.pow(10, this.coordinateRoundingDecimals);

    // Create filter hash (only non-pagination filters)
    const filterObj = {
      category: filters.category,
      type: filters.type,
      status: filters.status || "published",
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      minRating: filters.minRating,
      verified: filters.verified,
      query: filters.query,
      // owner not cached (user-specific)
      // skip/limit not cached (pagination-specific)
    };

    // Remove undefined values
    Object.keys(filterObj).forEach((key) => {
      if (filterObj[key] === undefined || filterObj[key] === null) {
        delete filterObj[key];
      }
    });

    const filterHash = crypto
      .createHash("md5")
      .update(JSON.stringify(filterObj))
      .digest("hex")
      .substring(0, 8);

    return `geo:listings:${roundedLat}:${roundedLng}:${radiusKm}:${filterHash}`;
  }

  /**
   * Get value from cache.
   *
   * @param {string} key
   * @returns {Promise<object|null>}
   */
  async get(key) {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const cached = await this.client.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      console.error("[CacheManager] Error getting cache:", error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL.
   *
   * @param {string} key
   * @param {object} value
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttlSeconds = this.defaultTTL) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("[CacheManager] Error setting cache:", error);
      return false;
    }
  }

  /**
   * Delete specific cache key.
   *
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error("[CacheManager] Error deleting cache:", error);
      return false;
    }
  }

  /**
   * Invalidate all geo cache keys matching a region.
   * Uses coordinate rounding to find affected keys.
   *
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusKm - Region size to invalidate
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateRegion(latitude, longitude, radiusKm = 5) {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      // Calculate bounding box with rounding
      const latDelta = radiusKm / 111; // 1 degree latitude ≈ 111 km
      const lngDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

      const minLat =
        Math.round(
          (latitude - latDelta) * Math.pow(10, this.coordinateRoundingDecimals),
        ) / Math.pow(10, this.coordinateRoundingDecimals);
      const maxLat =
        Math.round(
          (latitude + latDelta) * Math.pow(10, this.coordinateRoundingDecimals),
        ) / Math.pow(10, this.coordinateRoundingDecimals);
      const minLng =
        Math.round(
          (longitude - lngDelta) *
            Math.pow(10, this.coordinateRoundingDecimals),
        ) / Math.pow(10, this.coordinateRoundingDecimals);
      const maxLng =
        Math.round(
          (longitude + lngDelta) *
            Math.pow(10, this.coordinateRoundingDecimals),
        ) / Math.pow(10, this.coordinateRoundingDecimals);

      // Find and delete all matching keys
      const pattern = `geo:listings:*`;
      const keys = await this.client.keys(pattern);

      let deleted = 0;
      for (const key of keys) {
        // Extract coordinates from key
        // Format: geo:listings:{lat}:{lng}:{radius}:{hash}
        const parts = key.split(":");
        if (parts.length >= 4) {
          const keyLat = parseFloat(parts[2]);
          const keyLng = parseFloat(parts[3]);

          // Check if key is in bounding box
          if (
            keyLat >= minLat &&
            keyLat <= maxLat &&
            keyLng >= minLng &&
            keyLng <= maxLng
          ) {
            await this.client.del(key);
            deleted++;
          }
        }
      }

      console.log(`[CacheManager] Invalidated ${deleted} cache keys in region`);
      return deleted;
    } catch (error) {
      console.error("[CacheManager] Error invalidating region:", error);
      return 0;
    }
  }

  /**
   * Clear all geo cache keys.
   *
   * @returns {Promise<number>} Number of keys deleted
   */
  async clearAll() {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const pattern = `geo:listings:*`;
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      console.log(`[CacheManager] Cleared ${keys.length} cache keys`);
      return keys.length;
    } catch (error) {
      console.error("[CacheManager] Error clearing cache:", error);
      return 0;
    }
  }

  /**
   * Get cache statistics.
   *
   * @returns {Promise<object>}
   */
  async getStats() {
    if (!this.isAvailable()) {
      return { available: false };
    }

    try {
      const info = await this.client.info("stats");
      const keys = await this.client.keys(`geo:listings:*`);

      return {
        available: true,
        totalGeoKeys: keys.length,
        redisInfo: info,
      };
    } catch (error) {
      console.error("[CacheManager] Error getting stats:", error);
      return { available: false };
    }
  }

  /**
   * Close Redis connection gracefully.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

module.exports = new CacheManager();
