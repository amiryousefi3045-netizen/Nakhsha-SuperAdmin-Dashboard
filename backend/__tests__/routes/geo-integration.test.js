/**
 * geo-integration.test.js — Integration tests for geospatial API endpoints.
 *
 * Tests the complete flow:
 * - Request validation and error handling
 * - Route handlers response formatting
 * - Integration with GeoService
 * - Correct HTTP status codes and error envelopes
 *
 * Mock data is used; no actual MongoDB connections needed.
 *
 * Run with: npm test -- geo-integration.test.js
 */

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

// Import route handlers
const listingsNearRoutes = require("../../routes/listings.near");
const listingsHeatmapRoutes = require("../../routes/listings.heatmap");
const listingsClusterRoutes = require("../../routes/listings.clusters");
const listingsWithinBoundaryRoutes = require("../../routes/listings.within-boundary");

// Mock middleware and utilities
jest.mock("../../middleware/rateLimiter", () => ({
  heavyLimiter: (req, res, next) => next(),
}));

jest.mock("../../utils/response", () => ({
  createSuccessResponse: (data, metadata, reqId) => ({
    success: true,
    data,
    metadata,
    reqId,
  }),
  createErrorResponse: (code, message, details, reqId) => ({
    success: false,
    error: { code, message, details },
    reqId,
  }),
}));

jest.mock("../../utils/logger", () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

// Mock GeoValidator
jest.mock("../../utils/geoValidator", () => ({
  validateGeoPoint: (lat, lng) => {
    if (!lat || !lng) {
      return {
        valid: false,
        error: "مختصات جغرافیایی الزامی هستند",
      };
    }
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return { valid: false, error: "مختصات نامعتبر" };
    }
    return { valid: true };
  },
  validateRadius: (radiusKm) => {
    const radius = parseFloat(radiusKm);
    if (radius < 0.1 || radius > 50) {
      return { valid: false, error: "شعاع نامعتبر" };
    }
    return { valid: true };
  },
  validateQueryParams: (params) => {
    const geoValidation = require("../../utils/geoValidator").validateGeoPoint(
      params.lat,
      params.lng,
    );
    const radiusValidation = require("../../utils/geoValidator").validateRadius(
      params.radiusKm,
    );

    if (!geoValidation.valid) {
      return { valid: false, errors: [geoValidation.error] };
    }
    if (!radiusValidation.valid) {
      return { valid: false, errors: [radiusValidation.error] };
    }

    return {
      valid: true,
      errors: [],
      normalized: {
        lat: parseFloat(params.lat),
        lng: parseFloat(params.lng),
        radiusKm: parseFloat(params.radiusKm) || 5,
        limit: parseInt(params.limit) || 100,
        skip: parseInt(params.skip) || 0,
        category: params.category,
        type: params.type,
        status: params.status || "published",
      },
    };
  },
}));

// Create test app
let app;

beforeEach(() => {
  app = express();
  app.use(express.json());

  // Add request ID middleware
  app.use((req, res, next) => {
    req.id = `test-${Date.now()}`;
    next();
  });

  // Mount routes
  app.use("/api/listings", listingsNearRoutes);
  app.use("/api/listings", listingsHeatmapRoutes);
  app.use("/api/listings", listingsClusterRoutes);
  app.use("/api/listings", listingsWithinBoundaryRoutes);
});

describe("Geospatial Routes", () => {
  describe("GET /api/listings/near", () => {
    test("should reject missing latitude", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lng: "51.389", radiusKm: "5" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    test("should reject missing longitude", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: "35.6892", radiusKm: "5" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should reject invalid latitude (> 90)", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: "95", lng: "51.389", radiusKm: "5" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should reject invalid longitude (> 180)", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: "35.6892", lng: "185", radiusKm: "5" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should reject invalid radius (< 0.1)", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: "35.6892", lng: "51.389", radiusKm: "0.05" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should reject invalid radius (> 50)", async () => {
      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: "35.6892", lng: "51.389", radiusKm: "60" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should accept valid query parameters", async () => {
      // Mock GeoService response
      const GeoService = require("../../services/GeoService");
      GeoService.findNearbyListings = jest.fn().mockResolvedValue({
        success: true,
        data: [],
        pagination: { limit: 100, skip: 0, totalCount: 0, hasMore: false },
        metadata: { executionTime: 50, queryRadius: 5 },
      });

      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: "35.6892", lng: "51.389", radiusKm: "5" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test("should forward filters to GeoService", async () => {
      const GeoService = require("../../services/GeoService");
      const mockFn = jest.fn().mockResolvedValue({
        success: true,
        data: [],
        pagination: { limit: 100, skip: 0, totalCount: 0, hasMore: false },
        metadata: { executionTime: 50, queryRadius: 5 },
      });
      GeoService.findNearbyListings = mockFn;

      await request(app).get("/api/listings/near").query({
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
        category: "pottery",
        type: "post",
        minPrice: "100",
        maxPrice: "5000",
      });

      expect(mockFn).toHaveBeenCalled();
      const call = mockFn.mock.calls[0];
      expect(call[2]).toEqual(
        expect.objectContaining({
          category: "pottery",
          type: "post",
          minPrice: "100",
          maxPrice: "5000",
        }),
      );
    });
  });

  describe("GET /api/listings/heatmap", () => {
    test("should reject missing latitude", async () => {
      const res = await request(app)
        .get("/api/listings/heatmap")
        .query({ lng: "51.389", radiusKm: "5" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should reject invalid grid size (< 5)", async () => {
      const res = await request(app).get("/api/listings/heatmap").query({
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
        gridSize: "3",
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("INVALID_GRID_SIZE");
    });

    test("should reject invalid grid size (> 50)", async () => {
      const res = await request(app).get("/api/listings/heatmap").query({
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
        gridSize: "60",
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should reject invalid aggregateBy value", async () => {
      const res = await request(app).get("/api/listings/heatmap").query({
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
        aggregateBy: "invalid",
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_AGGREGATION");
    });

    test("should accept valid aggregateBy values", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.generateHeatmapData = jest.fn().mockResolvedValue({
        success: true,
        data: {
          grid: [],
          bounds: { north: 35.7, south: 35.67, east: 51.4, west: 51.38 },
          center: { lat: 35.6892, lng: 51.389 },
        },
        metadata: { executionTime: 100, queryRadius: 5 },
      });

      for (const agg of ["count", "avgPrice", "avgRating"]) {
        const res = await request(app).get("/api/listings/heatmap").query({
          lat: "35.6892",
          lng: "51.389",
          radiusKm: "5",
          aggregateBy: agg,
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });

    test("should return correct heatmap response structure", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.generateHeatmapData = jest.fn().mockResolvedValue({
        success: true,
        data: {
          grid: [
            { lat: 35.69, lng: 51.39, value: 5, cellCount: 5 },
            { lat: 35.7, lng: 51.4, value: 3, cellCount: 3 },
          ],
          bounds: { north: 35.7, south: 35.68, east: 51.4, west: 51.38 },
          center: { lat: 35.6892, lng: 51.389 },
          gridSize: 10,
          aggregateBy: "count",
        },
        metadata: { executionTime: 100, queryRadius: 5 },
      });

      const res = await request(app).get("/api/listings/heatmap").query({
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
      });

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("grid");
      expect(res.body.data).toHaveProperty("bounds");
      expect(res.body.data).toHaveProperty("center");
      expect(Array.isArray(res.body.data.grid)).toBe(true);
    });
  });

  describe("GET /api/listings/clusters", () => {
    test("should reject missing latitude", async () => {
      const res = await request(app)
        .get("/api/listings/clusters")
        .query({ lng: "51.389", radiusKm: "5" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should reject invalid zoom level (< 0)", async () => {
      const res = await request(app).get("/api/listings/clusters").query({
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
        zoomLevel: "-1",
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ZOOM_LEVEL");
    });

    test("should reject invalid zoom level (> 20)", async () => {
      const res = await request(app).get("/api/listings/clusters").query({
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
        zoomLevel: "21",
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ZOOM_LEVEL");
    });

    test("should reject invalid pagination limit", async () => {
      const res = await request(app).get("/api/listings/clusters").query({
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
        limit: "0",
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_PAGINATION");
    });

    test("should accept valid zoom levels (0-20)", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.clusterNearbyByGeohash = jest.fn().mockResolvedValue({
        success: true,
        data: {
          clusters: [],
          center: { lat: 35.6892, lng: 51.389 },
          zoomLevel: 12,
          zoomRecommendation: "optimal",
        },
        metadata: { executionTime: 75, queryRadius: 5 },
      });

      for (const zoom of [0, 5, 10, 12, 15, 20]) {
        const res = await request(app).get("/api/listings/clusters").query({
          lat: "35.6892",
          lng: "51.389",
          radiusKm: "5",
          zoomLevel: zoom.toString(),
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });

    test("should return correct cluster response structure", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.clusterNearbyByGeohash = jest.fn().mockResolvedValue({
        success: true,
        data: {
          clusters: [
            {
              geohash: "swu4rxz",
              bounds: { north: 35.7, south: 35.68, east: 51.4, west: 51.38 },
              count: 5,
              sample: {
                id: "507f1f77bcf86cd799439011",
                title: "تابلو خوشنویسی",
                coordinates: [51.39, 35.69],
                price: 500000,
              },
            },
          ],
          center: { lat: 35.6892, lng: 51.389 },
          zoomLevel: 12,
          zoomRecommendation: "Current zoom level is optimal",
        },
        metadata: { executionTime: 75, queryRadius: 5 },
      });

      const res = await request(app).get("/api/listings/clusters").query({
        lat: "35.6892",
        lng: "51.389",
        radiusKm: "5",
        zoomLevel: "12",
      });

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("clusters");
      expect(res.body.data).toHaveProperty("center");
      expect(res.body.data).toHaveProperty("zoomLevel");
      expect(Array.isArray(res.body.data.clusters)).toBe(true);
    });
  });

  describe("POST /api/listings/within-boundary", () => {
    test("should reject missing request body", async () => {
      const res = await request(app).post("/api/listings/within-boundary");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("INVALID_REQUEST");
    });

    test("should reject missing polygon field", async () => {
      const res = await request(app)
        .post("/api/listings/within-boundary")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("should reject non-array polygon", async () => {
      const res = await request(app)
        .post("/api/listings/within-boundary")
        .send({ polygon: "invalid" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REQUEST");
    });

    test("should accept valid polygon request", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.findWithinPolygon = jest.fn().mockResolvedValue({
        success: true,
        data: {
          items: [],
          polygon: { type: "Polygon", coordinates: [] },
          bounds: { north: 35.75, south: 35.65, east: 51.5, west: 51.3 },
          pagination: { limit: 100, skip: 0, totalCount: 0, hasMore: false },
        },
        metadata: { executionTime: 120, polygonPointCount: 5 },
      });

      const polygon = [
        [51.3, 35.65],
        [51.5, 35.65],
        [51.5, 35.75],
        [51.3, 35.75],
        [51.3, 35.65],
      ];

      const res = await request(app)
        .post("/api/listings/within-boundary")
        .send({ polygon });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test("should include filters in request body", async () => {
      const GeoService = require("../../services/GeoService");
      const mockFn = jest.fn().mockResolvedValue({
        success: true,
        data: {
          items: [],
          polygon: { type: "Polygon", coordinates: [] },
          bounds: { north: 35.75, south: 35.65, east: 51.5, west: 51.3 },
          pagination: { limit: 100, skip: 0, totalCount: 0, hasMore: false },
        },
        metadata: { executionTime: 120, polygonPointCount: 5 },
      });
      GeoService.findWithinPolygon = mockFn;

      const polygon = [
        [51.3, 35.65],
        [51.5, 35.65],
        [51.5, 35.75],
        [51.3, 35.75],
        [51.3, 35.65],
      ];

      await request(app)
        .post("/api/listings/within-boundary")
        .send({
          polygon,
          filters: {
            category: "pottery",
            type: "post",
            minPrice: 100,
          },
        });

      expect(mockFn).toHaveBeenCalled();
      const call = mockFn.mock.calls[0];
      expect(call[1]).toEqual(
        expect.objectContaining({
          category: "pottery",
          type: "post",
          minPrice: 100,
        }),
      );
    });

    test("should return correct polygon search response structure", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.findWithinPolygon = jest.fn().mockResolvedValue({
        success: true,
        data: {
          items: [
            {
              id: "507f1f77bcf86cd799439011",
              title: "تابلو خوشنویسی",
              coordinates: [51.35, 35.7],
            },
          ],
          polygon: {
            type: "Polygon",
            coordinates: [
              [
                [51.3, 35.65],
                [51.5, 35.65],
                [51.5, 35.75],
                [51.3, 35.75],
                [51.3, 35.65],
              ],
            ],
          },
          bounds: { north: 35.75, south: 35.65, east: 51.5, west: 51.3 },
          pagination: { limit: 100, skip: 0, totalCount: 1, hasMore: false },
        },
        metadata: { executionTime: 120, polygonPointCount: 5 },
      });

      const polygon = [
        [51.3, 35.65],
        [51.5, 35.65],
        [51.5, 35.75],
        [51.3, 35.75],
        [51.3, 35.65],
      ];

      const res = await request(app)
        .post("/api/listings/within-boundary")
        .send({ polygon });

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("items");
      expect(res.body.data).toHaveProperty("polygon");
      expect(res.body.data).toHaveProperty("bounds");
      expect(res.body.data).toHaveProperty("pagination");
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("should return 500 for internal server errors in /near", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.findNearbyListings = jest
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: "35.6892", lng: "51.389", radiusKm: "5" });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("SERVER_ERROR");
    });

    test("should return 500 for internal server errors in /heatmap", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.generateHeatmapData = jest
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      const res = await request(app)
        .get("/api/listings/heatmap")
        .query({ lat: "35.6892", lng: "51.389", radiusKm: "5" });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    test("should return 500 for internal server errors in /clusters", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.clusterNearbyByGeohash = jest
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      const res = await request(app)
        .get("/api/listings/clusters")
        .query({ lat: "35.6892", lng: "51.389", radiusKm: "5" });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    test("should return 500 for internal server errors in /within-boundary", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.findWithinPolygon = jest
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      const res = await request(app)
        .post("/api/listings/within-boundary")
        .send({
          polygon: [
            [51.3, 35.65],
            [51.5, 35.65],
            [51.5, 35.75],
            [51.3, 35.75],
            [51.3, 35.65],
          ],
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Request ID Tracking", () => {
    test("should include reqId in all responses", async () => {
      const GeoService = require("../../services/GeoService");
      GeoService.findNearbyListings = jest.fn().mockResolvedValue({
        success: true,
        data: [],
        pagination: { limit: 100, skip: 0, totalCount: 0, hasMore: false },
        metadata: { executionTime: 50, queryRadius: 5 },
      });

      const res = await request(app)
        .get("/api/listings/near")
        .query({ lat: "35.6892", lng: "51.389", radiusKm: "5" });

      expect(res.body).toHaveProperty("reqId");
      expect(res.body.reqId).toMatch(/^test-/);
    });
  });
});
