/**
 * geoValidator.test.js — Unit tests for geoValidator utility
 *
 * Tests:
 * - Individual field validation (lat, lng, radius, pagination, price, etc.)
 * - Enum validation for category, type, status
 * - Text query validation and sanitization
 * - ObjectId validation
 * - Comprehensive parameter validation
 */

const geoValidator = require("../utils/geoValidator");
const mongoose = require("mongoose");

describe("geoValidator", () => {
  describe("validateLatitude", () => {
    test("should accept valid latitude", () => {
      const result = geoValidator.validateLatitude(35.6892);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(35.6892);
    });

    test("should reject latitude < -90", () => {
      const result = geoValidator.validateLatitude(-91);
      expect(result.valid).toBe(false);
    });

    test("should reject latitude > 90", () => {
      const result = geoValidator.validateLatitude(91);
      expect(result.valid).toBe(false);
    });

    test("should accept boundary values", () => {
      expect(geoValidator.validateLatitude(-90).valid).toBe(true);
      expect(geoValidator.validateLatitude(90).valid).toBe(true);
    });

    test("should handle string input", () => {
      const result = geoValidator.validateLatitude("35.6892");
      expect(result.valid).toBe(true);
      expect(result.value).toBe(35.6892);
    });
  });

  describe("validateLongitude", () => {
    test("should accept valid longitude", () => {
      const result = geoValidator.validateLongitude(51.389);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(51.389);
    });

    test("should reject longitude < -180", () => {
      const result = geoValidator.validateLongitude(-181);
      expect(result.valid).toBe(false);
    });

    test("should reject longitude > 180", () => {
      const result = geoValidator.validateLongitude(181);
      expect(result.valid).toBe(false);
    });

    test("should accept boundary values", () => {
      expect(geoValidator.validateLongitude(-180).valid).toBe(true);
      expect(geoValidator.validateLongitude(180).valid).toBe(true);
    });
  });

  describe("validateCoordinates", () => {
    test("should validate coordinate pair", () => {
      const result = geoValidator.validateCoordinates(35.6892, 51.389);
      expect(result.valid).toBe(true);
      expect(result.lat).toBe(35.6892);
      expect(result.lng).toBe(51.389);
    });

    test("should reject invalid pair", () => {
      const result = geoValidator.validateCoordinates(91, 181);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });
  });

  describe("validateRadius", () => {
    test("should accept valid radius", () => {
      const result = geoValidator.validateRadius(5);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(5);
    });

    test("should return default if not provided", () => {
      const result = geoValidator.validateRadius(null);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(5); // Default
    });

    test("should respect custom min/max", () => {
      let result = geoValidator.validateRadius(0.05, { min: 0.1 });
      expect(result.valid).toBe(false);

      result = geoValidator.validateRadius(100, { max: 50 });
      expect(result.valid).toBe(false);
    });
  });

  describe("validatePagination", () => {
    test("should accept valid pagination", () => {
      const result = geoValidator.validatePagination(50, 10);
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(50);
      expect(result.skip).toBe(10);
    });

    test("should enforce limit bounds", () => {
      let result = geoValidator.validatePagination(0, 0);
      expect(result.valid).toBe(false);

      result = geoValidator.validatePagination(1000, 0);
      expect(result.valid).toBe(false);
    });

    test("should reject negative skip", () => {
      const result = geoValidator.validatePagination(50, -1);
      expect(result.valid).toBe(false);
    });
  });

  describe("validatePriceRange", () => {
    test("should accept valid price range", () => {
      const result = geoValidator.validatePriceRange(100, 5000);
      expect(result.valid).toBe(true);
      expect(result.min).toBe(100);
      expect(result.max).toBe(5000);
    });

    test("should reject min > max", () => {
      const result = geoValidator.validatePriceRange(5000, 100);
      expect(result.valid).toBe(false);
    });

    test("should reject negative prices", () => {
      const result = geoValidator.validatePriceRange(-100, 5000);
      expect(result.valid).toBe(false);
    });

    test("should allow optional params", () => {
      const result = geoValidator.validatePriceRange(undefined, undefined);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateEnum", () => {
    test("should accept valid enum value", () => {
      const result = geoValidator.validateEnum("post", [
        "post",
        "tour",
        "academy",
      ]);
      expect(result.valid).toBe(true);
    });

    test("should reject invalid enum value", () => {
      const result = geoValidator.validateEnum("invalid", ["post", "tour"]);
      expect(result.valid).toBe(false);
    });

    test("should skip validation if empty", () => {
      const result = geoValidator.validateEnum("", ["post", "tour"]);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateRating", () => {
    test("should accept valid rating", () => {
      const result = geoValidator.validateRating(4.5);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(4.5);
    });

    test("should reject rating < 0", () => {
      const result = geoValidator.validateRating(-1);
      expect(result.valid).toBe(false);
    });

    test("should reject rating > 5", () => {
      const result = geoValidator.validateRating(6);
      expect(result.valid).toBe(false);
    });

    test("should be optional", () => {
      const result = geoValidator.validateRating(null);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateTextQuery", () => {
    test("should accept valid text query", () => {
      const result = geoValidator.validateTextQuery("carpet");
      expect(result.valid).toBe(true);
      expect(result.value).toBe("carpet");
    });

    test("should enforce max length", () => {
      const longText = "a".repeat(300);
      const result = geoValidator.validateTextQuery(longText, {
        maxLength: 200,
      });
      expect(result.valid).toBe(false);
    });

    test("should trim whitespace", () => {
      const result = geoValidator.validateTextQuery("  carpet  ");
      expect(result.value).toBe("carpet");
    });

    test("should block regex by default", () => {
      const result = geoValidator.validateTextQuery(".*", {
        allowRegex: false,
      });
      expect(result.valid).toBe(false);
    });

    test("should allow regex when enabled", () => {
      const result = geoValidator.validateTextQuery(".*", { allowRegex: true });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateObjectId", () => {
    test("should accept valid ObjectId string", () => {
      const validId = "507f1f77bcf86cd799439011";
      const result = geoValidator.validateObjectId(validId);
      expect(result.valid).toBe(true);
      expect(result.value).toBeInstanceOf(mongoose.Types.ObjectId);
    });

    test("should reject invalid ObjectId", () => {
      const result = geoValidator.validateObjectId("invalid");
      expect(result.valid).toBe(false);
    });

    test("should skip validation if empty", () => {
      const result = geoValidator.validateObjectId("");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateQueryParams", () => {
    test("should validate complete params object", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
        radiusKm: 5,
        limit: 100,
        skip: 0,
        category: "pottery",
        type: "post",
        status: "published",
        minPrice: 100,
        maxPrice: 5000,
      };

      const result = geoValidator.validateQueryParams(params);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBeDefined();
    });

    test("should reject missing coordinates", () => {
      const params = { radiusKm: 5 };
      const result = geoValidator.validateQueryParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("should apply all individual validations", () => {
      const params = {
        lat: 91, // Invalid
        lng: 51.389,
        radiusKm: 100, // Out of range
        limit: 1000, // Out of range
        minPrice: 5000,
        maxPrice: 100, // Inverted
      };

      const result = geoValidator.validateQueryParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    test("should use defaults", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
      };

      const result = geoValidator.validateQueryParams(params);
      expect(result.normalized.radiusKm).toBe(5);
      expect(result.normalized.limit).toBe(100);
      expect(result.normalized.skip).toBe(0);
      expect(result.normalized.status).toBe("published");
    });

    test("should validate all filter types", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
        type: "invalid", // Should fail
      };

      const result = geoValidator.validateQueryParams(params);
      expect(result.valid).toBe(false);
    });

    test("should normalize string boolean fields", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
        verified: "true",
      };

      const result = geoValidator.validateQueryParams(params);
      expect(result.valid).toBe(true);
      expect(result.normalized.verified).toBe(true);
    });
  });
});
