/**
 * GeoService.test.js — Unit tests for GeoService
 *
 * Tests:
 * - Coordinate validation (lat/lng ranges, types)
 * - Radius validation (min/max)
 * - Query parameter validation (comprehensive)
 * - Aggregation pipeline building
 * - Marker DTO transformation
 * - Distance calculations
 * - Bounding box calculations
 * - Match query building for various filters
 */

const GeoService = require("../services/GeoService");

describe("GeoService", () => {
  describe("validateGeoPoint", () => {
    test("should accept valid coordinates", () => {
      const result = GeoService.validateGeoPoint(35.6892, 51.389);
      expect(result.valid).toBe(true);
    });

    test("should reject latitude out of range", () => {
      const result = GeoService.validateGeoPoint(91, 51.389);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("عرض جغرافیایی");
    });

    test("should reject longitude out of range", () => {
      const result = GeoService.validateGeoPoint(35.6892, 181);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("طول جغرافیایی");
    });

    test("should reject null/undefined coordinates", () => {
      const result = GeoService.validateGeoPoint(null, 51);
      expect(result.valid).toBe(false);
    });

    test("should reject non-numeric coordinates", () => {
      const result = GeoService.validateGeoPoint("abc", 51);
      expect(result.valid).toBe(false);
    });

    test("should accept boundary values", () => {
      const result1 = GeoService.validateGeoPoint(-90, -180);
      const result2 = GeoService.validateGeoPoint(90, 180);
      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });
  });

  describe("validateRadius", () => {
    test("should accept valid radius", () => {
      const result = GeoService.validateRadius(5);
      expect(result.valid).toBe(true);
    });

    test("should reject radius < 0.1", () => {
      const result = GeoService.validateRadius(0.05);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("۰.۱");
    });

    test("should reject radius > 50", () => {
      const result = GeoService.validateRadius(51);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("۵۰");
    });

    test("should accept boundary values", () => {
      const result1 = GeoService.validateRadius(0.1);
      const result2 = GeoService.validateRadius(50);
      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });
  });

  describe("validateQueryParams", () => {
    test("should validate complete valid params", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
        radiusKm: 5,
        limit: 100,
        skip: 0,
        category: "pottery",
        type: "post",
        status: "published",
      };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBeDefined();
      expect(result.normalized.lat).toBe(35.6892);
      expect(result.normalized.lng).toBe(51.389);
    });

    test("should reject missing coordinates", () => {
      const params = { radiusKm: 5 };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("should reject invalid price range", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
        minPrice: 1000,
        maxPrice: 100, // max < min
      };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("قیمت"))).toBe(true);
    });

    test("should reject invalid type enum", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
        type: "invalid",
      };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(false);
    });

    test("should use default values", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
      };
      const result = GeoService.validateQueryParams(params);
      expect(result.normalized.radiusKm).toBe(5);
      expect(result.normalized.limit).toBe(100);
      expect(result.normalized.skip).toBe(0);
      expect(result.normalized.status).toBe("published");
    });

    test("should reject limit out of range", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
        limit: 1000,
      };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(false);
    });

    test("should reject negative skip", () => {
      const params = {
        lat: 35.6892,
        lng: 51.389,
        skip: -1,
      };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(false);
    });

    test("should validate rating in range 0-5", () => {
      let params = {
        lat: 35.6892,
        lng: 51.389,
        minRating: 3,
      };
      let result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(true);

      params.minRating = 6;
      result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(false);
    });
  });

  describe("buildMatchQuery", () => {
    test("should build query with category filter", () => {
      const query = GeoService.buildMatchQuery(
        { category: "pottery" },
        "Listing",
      );
      expect(query.category).toBe("pottery");
      expect(query.status).toBe("published"); // Default
    });

    test("should build query with type filter", () => {
      const query = GeoService.buildMatchQuery({ type: "post" }, "Listing");
      expect(query.type).toBe("post");
    });

    test("should build query with price range", () => {
      const query = GeoService.buildMatchQuery(
        { minPrice: 100, maxPrice: 5000 },
        "Listing",
      );
      expect(query.price.$gte).toBe(100);
      expect(query.price.$lte).toBe(5000);
    });

    test("should build query with status filter", () => {
      const query = GeoService.buildMatchQuery({ status: "draft" }, "Listing");
      expect(query.status).toBe("draft");
    });

    test("should build query with verified filter", () => {
      const query = GeoService.buildMatchQuery({ verified: true }, "Listing");
      expect(query.verified).toBe(true);
    });

    test("should handle Craft model field names", () => {
      const query = GeoService.buildMatchQuery(
        { craftType: "carpet" },
        "Craft",
      );
      expect(query.craftType).toBe("carpet");
    });
  });

  describe("markerProjection", () => {
    test("should return valid MongoDB projection stage", () => {
      const projection = GeoService.markerProjection();
      expect(projection).toHaveProperty("$project");
      expect(projection.$project).toHaveProperty("_id");
      expect(projection.$project).toHaveProperty("title");
      expect(projection.$project).toHaveProperty("coordinates");
      expect(projection.$project).toHaveProperty("distanceKm");
    });

    test("should project all marker DTO fields", () => {
      const projection = GeoService.markerProjection();
      const fields = projection.$project;
      expect(fields).toHaveProperty("category");
      expect(fields).toHaveProperty("type");
      expect(fields).toHaveProperty("price");
      expect(fields).toHaveProperty("preview");
      expect(fields).toHaveProperty("rating");
      expect(fields).toHaveProperty("verified");
    });
  });

  describe("toMarkerDTO", () => {
    test("should transform aggregation result to DTO", () => {
      const doc = {
        _id: "507f1f77bcf86cd799439011",
        title: "Beautiful Carpet",
        coordinates: [51.389, 35.6892],
        city: "تهران",
        province: "تهران",
        category: "carpet",
        type: "post",
        status: "published",
        distanceMeters: 5000,
        distanceKm: 5.0,
        preview: "/uploads/carpet1.webp",
        price: 250000,
        rating: 4.5,
        verified: true,
      };

      const marker = GeoService.toMarkerDTO(doc);

      expect(marker.id).toBe("507f1f77bcf86cd799439011");
      expect(marker.title).toBe("Beautiful Carpet");
      expect(marker.category).toBe("carpet");
      expect(marker.distanceKm).toBe(5.0);
      expect(marker.price).toBe(250000);
      expect(marker.rating).toBe(4.5);
    });

    test("should handle optional fields", () => {
      const doc = {
        _id: "507f1f77bcf86cd799439011",
        title: "Some Listing",
        coordinates: null,
        distanceMeters: 1000,
        distanceKm: 1.0,
      };

      const marker = GeoService.toMarkerDTO(doc);
      expect(marker.price).toBeUndefined();
      expect(marker.rating).toBeUndefined();
      expect(marker.verified).toBeUndefined();
      expect(marker.coordinates).toBeNull();
    });
  });

  describe("calculateBoundingBox", () => {
    test("should calculate bounding box for Tehran", () => {
      const bbox = GeoService.calculateBoundingBox(35.6892, 51.389, 5);

      expect(bbox.minLat).toBeLessThan(35.6892);
      expect(bbox.maxLat).toBeGreaterThan(35.6892);
      expect(bbox.minLng).toBeLessThan(51.389);
      expect(bbox.maxLng).toBeGreaterThan(51.389);
    });

    test("should respect lat/lng boundaries", () => {
      // Poles
      const bboxNorth = GeoService.calculateBoundingBox(85, 0, 1000);
      expect(bboxNorth.maxLat).toBeLessThanOrEqual(90);

      // Antimeridian
      const bboxAntimeridian = GeoService.calculateBoundingBox(0, 179, 1000);
      expect(bboxAntimeridian.maxLng).toBeLessThanOrEqual(180);
    });

    test("should scale with radius", () => {
      const bbox1 = GeoService.calculateBoundingBox(35.6892, 51.389, 5);
      const bbox2 = GeoService.calculateBoundingBox(35.6892, 51.389, 10);

      const range1 = bbox1.maxLat - bbox1.minLat;
      const range2 = bbox2.maxLat - bbox2.minLat;

      expect(range2).toBeGreaterThan(range1);
    });
  });

  describe("formatDistance", () => {
    test("should format meters for distances < 1km", () => {
      const formatted = GeoService.formatDistance(850);
      expect(formatted).toContain("850");
      expect(formatted).toContain("م");
    });

    test("should format kilometers for distances >= 1km", () => {
      const formatted = GeoService.formatDistance(5500);
      expect(formatted).toContain("کیلومتر");
      expect(formatted).toContain("5.5");
    });

    test("should round appropriately", () => {
      const formatted = GeoService.formatDistance(1234);
      expect(formatted).toBeDefined();
    });
  });

  describe("buildAggregationPipeline", () => {
    test("should build basic pipeline", () => {
      const pipeline = GeoService.buildAggregationPipeline(
        35.6892,
        51.389,
        5,
        {},
        { limit: 100, skip: 0 },
      );

      expect(pipeline).toHaveLength(5); // $geoNear, $match, $sort, $skip/$limit, $project
      expect(pipeline[0]).toHaveProperty("$geoNear");
      expect(pipeline[0].$geoNear.maxDistance).toBe(5000); // km to meters
    });

    test("should apply category filter", () => {
      const pipeline = GeoService.buildAggregationPipeline(
        35.6892,
        51.389,
        5,
        { category: "pottery" },
        { limit: 100 },
      );

      const matchStage = pipeline.find((stage) => stage.$match);
      expect(matchStage.$match.category).toBe("pottery");
    });

    test("should include text search stage if query provided", () => {
      const pipeline = GeoService.buildAggregationPipeline(
        35.6892,
        51.389,
        5,
        { query: "carpet" },
        { limit: 100 },
      );

      const textSearchStage = pipeline.find((stage) => stage.$match?.$text);
      expect(textSearchStage).toBeDefined();
    });

    test("should count only mode", () => {
      const pipeline = GeoService.buildAggregationPipeline(
        35.6892,
        51.389,
        5,
        {},
        { countOnly: true },
      );

      const countStage = pipeline.find((stage) => stage.$count);
      expect(countStage).toBeDefined();
    });
  });
});
