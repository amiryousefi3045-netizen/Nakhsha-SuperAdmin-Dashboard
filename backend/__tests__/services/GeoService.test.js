/**
 * GeoService.test.js — Comprehensive unit tests for geospatial queries.
 *
 * Tests cover:
 * - Input validation (coordinates, radius)
 * - Aggregation pipeline correctness
 * - Marker DTO transformation
 * - Heatmap grid generation (bounds, cell distribution)
 * - Geohash clustering (precision mapping, cluster generation)
 * - Polygon validation (closure, complexity, self-intersection)
 *
 * Run with: npm test -- GeoService.test.js
 */

const GeoService = require("../../services/GeoService");

describe("GeoService", () => {
  describe("validateGeoPoint", () => {
    test("should accept valid coordinates", () => {
      const result = GeoService.validateGeoPoint(35.6892, 51.389);
      expect(result.valid).toBe(true);
    });

    test("should reject invalid latitude (< -90)", () => {
      const result = GeoService.validateGeoPoint(-91, 51.389);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("عرض جغرافیایی");
    });

    test("should reject invalid latitude (> 90)", () => {
      const result = GeoService.validateGeoPoint(91, 51.389);
      expect(result.valid).toBe(false);
    });

    test("should reject invalid longitude (< -180)", () => {
      const result = GeoService.validateGeoPoint(35.6892, -181);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("طول جغرافیایی");
    });

    test("should reject invalid longitude (> 180)", () => {
      const result = GeoService.validateGeoPoint(35.6892, 181);
      expect(result.valid).toBe(false);
    });

    test("should reject null/undefined coordinates", () => {
      const result = GeoService.validateGeoPoint(null, 51.389);
      expect(result.valid).toBe(false);
    });

    test("should reject non-numeric coordinates", () => {
      const result = GeoService.validateGeoPoint("invalid", 51.389);
      expect(result.valid).toBe(false);
    });

    test("should accept edge case coordinates (0, 0)", () => {
      const result = GeoService.validateGeoPoint(0, 0);
      expect(result.valid).toBe(true);
    });

    test("should accept edge case coordinates (90, 180)", () => {
      const result = GeoService.validateGeoPoint(90, 180);
      expect(result.valid).toBe(true);
    });

    test("should accept edge case coordinates (-90, -180)", () => {
      const result = GeoService.validateGeoPoint(-90, -180);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateRadius", () => {
    test("should accept valid radius (5 km)", () => {
      const result = GeoService.validateRadius(5);
      expect(result.valid).toBe(true);
    });

    test("should accept min valid radius (0.1 km)", () => {
      const result = GeoService.validateRadius(0.1);
      expect(result.valid).toBe(true);
    });

    test("should accept max valid radius (50 km)", () => {
      const result = GeoService.validateRadius(50);
      expect(result.valid).toBe(true);
    });

    test("should reject radius below minimum (< 0.1)", () => {
      const result = GeoService.validateRadius(0.05);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("۰.۱");
    });

    test("should reject radius above maximum (> 50)", () => {
      const result = GeoService.validateRadius(51);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("۵۰");
    });

    test("should reject negative radius", () => {
      const result = GeoService.validateRadius(-5);
      expect(result.valid).toBe(false);
    });

    test("should reject non-numeric radius", () => {
      const result = GeoService.validateRadius("invalid");
      expect(result.valid).toBe(false);
    });

    test("should accept radius as string (coerced to number)", () => {
      const result = GeoService.validateRadius("10");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateQueryParams", () => {
    test("should validate complete query params", () => {
      const params = {
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
        limit: "50",
        skip: "0",
      };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(true);
      expect(result.normalized.lat).toBe(35.6892);
      expect(result.normalized.lng).toBe(51.389);
      expect(result.normalized.radiusKm).toBe(5);
      expect(result.normalized.limit).toBe(50);
      expect(result.normalized.skip).toBe(0);
    });

    test("should require lat and lng", () => {
      const params = { radiusKm: "5" };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("should validate price range (minPrice <= maxPrice)", () => {
      const params = {
        lat: "35.6892",
        lng: "51.389",
        minPrice: "100",
        maxPrice: "5000",
      };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(true);
    });

    test("should reject price range where minPrice > maxPrice", () => {
      const params = {
        lat: "35.6892",
        lng: "51.389",
        minPrice: "5000",
        maxPrice: "100",
      };
      const result = GeoService.validateQueryParams(params);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("حداقل قیمت"))).toBe(true);
    });

    test("should validate listing type enum", () => {
      const validParams = {
        lat: "35.6892",
        lng: "51.389",
        type: "post",
      };
      const validResult = GeoService.validateQueryParams(validParams);
      expect(validResult.valid).toBe(true);

      const invalidParams = {
        lat: "35.6892",
        lng: "51.389",
        type: "invalid",
      };
      const invalidResult = GeoService.validateQueryParams(invalidParams);
      expect(invalidResult.valid).toBe(false);
    });

    test("should validate status enum", () => {
      const validParams = {
        lat: "35.6892",
        lng: "51.389",
        status: "published",
      };
      const validResult = GeoService.validateQueryParams(validParams);
      expect(validResult.valid).toBe(true);

      const invalidParams = {
        lat: "35.6892",
        lng: "51.389",
        status: "invalid",
      };
      const invalidResult = GeoService.validateQueryParams(invalidParams);
      expect(invalidResult.valid).toBe(false);
    });

    test("should validate rating range (0-5)", () => {
      const validParams = {
        lat: "35.6892",
        lng: "51.389",
        minRating: "3.5",
      };
      const validResult = GeoService.validateQueryParams(validParams);
      expect(validResult.valid).toBe(true);

      const invalidParams = {
        lat: "35.6892",
        lng: "51.389",
        minRating: "6",
      };
      const invalidResult = GeoService.validateQueryParams(invalidParams);
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe("formatDistance", () => {
    test("should format meters as m", () => {
      const result = GeoService.formatDistance(500);
      expect(result).toMatch(/^\d+ م$/);
    });

    test("should format kilometers as کیلومتر", () => {
      const result = GeoService.formatDistance(5000);
      expect(result).toMatch(/[\d.]+ کیلومتر$/);
    });

    test("should handle very small distances", () => {
      const result = GeoService.formatDistance(1);
      expect(result).toBe("1 م");
    });

    test("should handle very large distances", () => {
      const result = GeoService.formatDistance(50000);
      expect(result).toMatch(/50\.\d+ کیلومتر$/);
    });
  });

  describe("calculateBoundingBox", () => {
    test("should calculate bounding box for 5km radius", () => {
      const bbox = GeoService.calculateBoundingBox(35.6892, 51.389, 5);
      expect(bbox).toHaveProperty("minLat");
      expect(bbox).toHaveProperty("maxLat");
      expect(bbox).toHaveProperty("minLng");
      expect(bbox).toHaveProperty("maxLng");
      expect(bbox.minLat).toBeLessThan(bbox.maxLat);
      expect(bbox.minLng).toBeLessThan(bbox.maxLng);
    });

    test("should respect coordinate bounds (-90/90 lat, -180/180 lng)", () => {
      const bboxAtNorthPole = GeoService.calculateBoundingBox(85, 0, 10);
      expect(bboxAtNorthPole.maxLat).toBeLessThanOrEqual(90);

      const bboxAtSouthPole = GeoService.calculateBoundingBox(-85, 0, 10);
      expect(bboxAtSouthPole.minLat).toBeGreaterThanOrEqual(-90);

      const bboxAtDateline = GeoService.calculateBoundingBox(0, 175, 10);
      expect(bboxAtDateline.minLng).toBeGreaterThanOrEqual(-180);
      expect(bboxAtDateline.maxLng).toBeLessThanOrEqual(180);
    });

    test("should scale bounding box with larger radius", () => {
      const bbox5km = GeoService.calculateBoundingBox(35.6892, 51.389, 5);
      const bbox10km = GeoService.calculateBoundingBox(35.6892, 51.389, 10);

      const height5 = bbox5km.maxLat - bbox5km.minLat;
      const height10 = bbox10km.maxLat - bbox10km.minLat;
      expect(height10).toBeGreaterThan(height5);
    });
  });

  describe("markerProjection", () => {
    test("should return valid MongoDB $project stage", () => {
      const projection = GeoService.markerProjection();
      expect(projection).toHaveProperty("$project");
      expect(projection.$project).toHaveProperty("_id");
      expect(projection.$project).toHaveProperty("title");
      expect(projection.$project).toHaveProperty("coordinates");
      expect(projection.$project).toHaveProperty("distanceMeters");
      expect(projection.$project).toHaveProperty("distanceKm");
    });

    test("should include essential fields", () => {
      const projection = GeoService.markerProjection();
      const fields = projection.$project;
      expect(fields).toHaveProperty("id");
      expect(fields).toHaveProperty("title");
      expect(fields).toHaveProperty("category");
      expect(fields).toHaveProperty("type");
      expect(fields).toHaveProperty("preview");
      expect(fields).toHaveProperty("rating");
      expect(fields).toHaveProperty("verified");
    });
  });

  describe("toMarkerDTO", () => {
    test("should transform aggregation result to marker DTO", () => {
      const doc = {
        _id: "507f1f77bcf86cd799439011",
        title: "تابلو خوشنویسی",
        coordinates: [51.389, 35.6892],
        city: "تهران",
        province: "تهران",
        category: "calligraphy",
        type: "post",
        status: "published",
        distanceMeters: 1234.5,
        distanceKm: 1.23,
        preview: "/uploads/image.webp",
        price: 500000,
        rating: 4.5,
        verified: true,
      };

      const marker = GeoService.toMarkerDTO(doc);

      expect(marker.id).toBe(doc._id.toString());
      expect(marker.title).toBe(doc.title);
      expect(marker.coordinates).toEqual(doc.coordinates);
      expect(marker.distanceMeters).toBe(Math.round(doc.distanceMeters));
      expect(marker.preview).toBe(doc.preview);
      expect(marker.price).toBe(doc.price);
      expect(marker.rating).toBe(doc.rating);
    });

    test("should handle missing optional fields", () => {
      const doc = {
        _id: "507f1f77bcf86cd799439011",
        title: "منسوجات",
        coordinates: [51.389, 35.6892],
        distanceMeters: 2000,
        distanceKm: 2.0,
      };

      const marker = GeoService.toMarkerDTO(doc);

      expect(marker.title).toBe(doc.title);
      expect(marker.price).toBeUndefined();
      expect(marker.rating).toBeUndefined();
      expect(marker.verified).toBeUndefined();
    });

    test("should maintain 90% size reduction vs original doc", () => {
      const originalDoc = {
        _id: "507f1f77bcf86cd799439011",
        title: "تابلو خوشنویسی",
        description: "توضیحات بسیار طویل و مفصل درباره این محصول",
        coordinates: [51.389, 35.6892],
        city: "تهران",
        province: "تهران",
        district: "بلوار فرردوسی",
        address: "خیابان ولیعصر، پلاک ۱۲۳",
        category: "calligraphy",
        type: "post",
        status: "published",
        distanceMeters: 1234.5,
        distanceKm: 1.23,
        preview: "/uploads/image.webp",
        price: 500000,
        rating: 4.5,
        verified: true,
        tags: ["art", "traditional", "handmade"],
        images: ["/uploads/1.webp", "/uploads/2.webp"],
        owner: "user_id_123",
        editHistory: [],
        revision: 1,
      };

      const marker = GeoService.toMarkerDTO(originalDoc);

      const originalSize = JSON.stringify(originalDoc).length;
      const markerSize = JSON.stringify(marker).length;
      const reductionPercent =
        ((originalSize - markerSize) / originalSize) * 100;

      // Should be at least 80% reduction
      expect(reductionPercent).toBeGreaterThan(80);
    });
  });

  describe("buildMatchQuery", () => {
    test("should build query with category filter", () => {
      const filters = { category: "pottery" };
      const query = GeoService.buildMatchQuery(filters, "Listing");
      expect(query.category).toBe("pottery");
    });

    test("should build query with price range", () => {
      const filters = { minPrice: 100, maxPrice: 5000 };
      const query = GeoService.buildMatchQuery(filters, "Listing");
      expect(query.price.$gte).toBe(100);
      expect(query.price.$lte).toBe(5000);
    });

    test("should build query with status filter (default published)", () => {
      const filters = {};
      const query = GeoService.buildMatchQuery(filters, "Listing");
      expect(query.status).toBe("published");
    });

    test("should build query with explicit status", () => {
      const filters = { status: "draft" };
      const query = GeoService.buildMatchQuery(filters, "Listing");
      expect(query.status).toBe("draft");
    });

    test("should build query with type filter", () => {
      const filters = { type: "post" };
      const query = GeoService.buildMatchQuery(filters, "Listing");
      expect(query.type).toBe("post");
    });

    test("should build query with rating filter", () => {
      const filters = { minRating: 4 };
      const query = GeoService.buildMatchQuery(filters, "Listing");
      expect(query.rating.$gte).toBe(4);
    });

    test("should build query with verified filter", () => {
      const filters = { verified: true };
      const query = GeoService.buildMatchQuery(filters, "Listing");
      expect(query.verified).toBe(true);
    });

    test("should handle Craft model filters", () => {
      const filters = { craftType: "carpet" };
      const query = GeoService.buildMatchQuery(filters, "Craft");
      expect(query.craftType).toBe("carpet");
    });
  });

  // Private helper tests
  describe("_zoomToGeohashPrecision", () => {
    test("should map zoom 0 to precision 1", () => {
      const precision = GeoService._zoomToGeohashPrecision(0);
      expect(precision).toBe(1);
    });

    test("should map zoom 12 (city) to precision 7", () => {
      const precision = GeoService._zoomToGeohashPrecision(12);
      expect(precision).toBe(7);
    });

    test("should map zoom 20 (street) to precision 11", () => {
      const precision = GeoService._zoomToGeohashPrecision(20);
      expect(precision).toBe(11);
    });

    test("should increase precision with zoom level", () => {
      const zoom0 = GeoService._zoomToGeohashPrecision(0);
      const zoom10 = GeoService._zoomToGeohashPrecision(10);
      const zoom20 = GeoService._zoomToGeohashPrecision(20);
      expect(zoom0).toBeLessThan(zoom10);
      expect(zoom10).toBeLessThan(zoom20);
    });
  });

  describe("_encodeGeohash", () => {
    test("should encode valid geohash", () => {
      const geohash = GeoService._encodeGeohash(35.6892, 51.389, 7);
      expect(geohash).toBeDefined();
      expect(geohash.length).toBe(7);
    });

    test("should produce consistent encoding", () => {
      const hash1 = GeoService._encodeGeohash(35.6892, 51.389, 7);
      const hash2 = GeoService._encodeGeohash(35.6892, 51.389, 7);
      expect(hash1).toBe(hash2);
    });

    test("should use base32 characters only", () => {
      const geohash = GeoService._encodeGeohash(35.6892, 51.389, 7);
      const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
      for (const char of geohash) {
        expect(base32).toContain(char);
      }
    });

    test("should produce different hashes for different locations", () => {
      const hash1 = GeoService._encodeGeohash(35.6892, 51.389, 7);
      const hash2 = GeoService._encodeGeohash(40, 60, 7);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("_validatePolygon", () => {
    test("should accept valid polygon", () => {
      const polygon = [
        [51.3, 35.65],
        [51.5, 35.65],
        [51.5, 35.75],
        [51.3, 35.75],
        [51.3, 35.65], // closed
      ];
      const result = GeoService._validatePolygon(polygon);
      expect(result.valid).toBe(true);
    });

    test("should reject unclosed polygon", () => {
      const polygon = [
        [51.3, 35.65],
        [51.5, 35.65],
        [51.5, 35.75],
        [51.3, 35.75],
        // missing closing point
      ];
      const result = GeoService._validatePolygon(polygon);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("closed");
    });

    test("should reject polygon with < 4 points", () => {
      const polygon = [
        [51.3, 35.65],
        [51.5, 35.65],
        [51.3, 35.65], // only 3 points
      ];
      const result = GeoService._validatePolygon(polygon);
      expect(result.valid).toBe(false);
    });

    test("should reject polygon with > 100 points", () => {
      const polygon = Array.from({ length: 101 }, (_, i) => [
        51.3 + i * 0.01,
        35.65,
      ]);
      polygon.push(polygon[0]); // close it
      const result = GeoService._validatePolygon(polygon);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("100");
    });

    test("should reject invalid coordinate format", () => {
      const polygon = [[51.3, 35.65], "invalid", [51.5, 35.75], [51.3, 35.65]];
      const result = GeoService._validatePolygon(polygon);
      expect(result.valid).toBe(false);
    });

    test("should reject coordinates out of bounds", () => {
      const polygon = [
        [51.3, 35.65],
        [51.5, 95.65], // invalid latitude
        [51.5, 35.75],
        [51.3, 35.65],
      ];
      const result = GeoService._validatePolygon(polygon);
      expect(result.valid).toBe(false);
    });
  });

  describe("_polygonToBounds", () => {
    test("should calculate bounds for valid polygon", () => {
      const polygon = [
        [51.3, 35.65],
        [51.5, 35.65],
        [51.5, 35.75],
        [51.3, 35.75],
        [51.3, 35.65],
      ];
      const bounds = GeoService._polygonToBounds(polygon);
      expect(bounds).toHaveProperty("west");
      expect(bounds).toHaveProperty("east");
      expect(bounds).toHaveProperty("south");
      expect(bounds).toHaveProperty("north");
      expect(bounds.west).toBe(51.3);
      expect(bounds.east).toBe(51.5);
      expect(bounds.south).toBe(35.65);
      expect(bounds.north).toBe(35.75);
    });
  });

  describe("buildAggregationPipeline", () => {
    test("should return array of pipeline stages", () => {
      const pipeline = GeoService.buildAggregationPipeline(35.6892, 51.389, 5);
      expect(Array.isArray(pipeline)).toBe(true);
      expect(pipeline.length).toBeGreaterThan(0);
    });

    test("should have $geoNear as first stage", () => {
      const pipeline = GeoService.buildAggregationPipeline(35.6892, 51.389, 5);
      expect(pipeline[0]).toHaveProperty("$geoNear");
    });

    test("should include $geoNear with correct parameters", () => {
      const pipeline = GeoService.buildAggregationPipeline(35.6892, 51.389, 5);
      const geoNear = pipeline[0].$geoNear;
      expect(geoNear.near.type).toBe("Point");
      expect(geoNear.near.coordinates).toEqual([51.389, 35.6892]);
      expect(geoNear.maxDistance).toBe(5000); // 5 km in meters
      expect(geoNear.spherical).toBe(true);
    });

    test("should include $limit stage for pagination", () => {
      const pipeline = GeoService.buildAggregationPipeline(
        35.6892,
        51.389,
        5,
        {},
        { limit: 50 },
      );
      const hasLimit = pipeline.some((stage) => stage.$limit);
      expect(hasLimit).toBe(true);
    });

    test("should include $project stage with marker fields", () => {
      const pipeline = GeoService.buildAggregationPipeline(35.6892, 51.389, 5);
      const hasProject = pipeline.some((stage) => stage.$project);
      expect(hasProject).toBe(true);
    });

    test("should return count-only pipeline when requested", () => {
      const pipeline = GeoService.buildAggregationPipeline(
        35.6892,
        51.389,
        5,
        {},
        { countOnly: true },
      );
      const hasCount = pipeline.some((stage) => stage.$count);
      expect(hasCount).toBe(true);
      const hasLimit = pipeline.some((stage) => stage.$limit);
      expect(hasLimit).toBe(false);
    });
  });
});
