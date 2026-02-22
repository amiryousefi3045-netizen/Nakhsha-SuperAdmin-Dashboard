/**
 * Rate-Limit Tests — Heavy Endpoints
 *
 * These tests use a self-contained mini-Express app so they never share the
 * production MemoryStore with other test suites.  Each buildApp() call
 * creates a fresh ratelimit store, guaranteeing tests are independent.
 *
 * The limiter is constructed with:
 *   - max: 3  (tight limit so we only need 4 requests to hit 429)
 *   - skip: () => false  (override the NODE_ENV=test bypass intentionally)
 *
 * Endpoints covered:
 *   GET /api/listings/near  — geospatial search
 *   GET /api/crafts         — list / text search (?q=)
 *   GET /api/crafts/near    — geospatial search on crafts router
 */

"use strict";

const request = require("supertest");
const express = require("express");
const crypto = require("crypto");
const { createHeavyLimiter } = require("../middleware/rateLimiter");

// ---------------------------------------------------------------------------
// Helper: build an isolated test app
//   - Attaches req.id so the limiter handler can embed it in reqId.
//   - Mounts a stub route handler for each heavy endpoint so no DB call
//     is needed — the rate limiter fires before the route handler.
// ---------------------------------------------------------------------------
function buildApp(max = 3) {
  const app = express();

  // Mirror the req.id middleware from server.js
  app.use((req, _res, next) => {
    req.id = crypto.randomUUID();
    next();
  });

  // Fresh limiter per app instance → independent MemoryStore per test
  const limiter = createHeavyLimiter({
    max,
    skip: () => false, // intentionally override NODE_ENV=test bypass
  });

  // Stub handlers — rate limiter runs before these; they are never reached
  // once the limit is exceeded.
  app.get("/api/listings/near", limiter, (_req, res) =>
    res.json({ success: true, items: [] }),
  );
  app.get("/api/crafts", limiter, (_req, res) =>
    res.json({ success: true, data: [] }),
  );
  app.get("/api/crafts/near", limiter, (_req, res) =>
    res.json({ success: true, items: [] }),
  );

  return app;
}

// ---------------------------------------------------------------------------
// 429 payload shape — must match the canonical error envelope used app-wide:
//   { success: false, error: { code, message }, reqId }
// ---------------------------------------------------------------------------
function assert429Shape(body) {
  expect(body.success).toBe(false);
  expect(body.error).toBeDefined();
  expect(body.error.code).toBe("TOO_MANY_REQUESTS");
  expect(typeof body.error.message).toBe("string");
  expect(body.error.message.length).toBeGreaterThan(0);
  // reqId should be present (UUID string) — wired from req.id
  expect(typeof body.reqId).toBe("string");
  expect(body.reqId.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Shared helper: exhaust `max` requests then return the (max+1)th response
// ---------------------------------------------------------------------------
async function exhaustLimit(app, url, max = 3) {
  for (let i = 0; i < max; i++) {
    await request(app).get(url);
  }
  return request(app).get(url);
}

// ===========================================================================

describe("Heavy endpoint rate limiting", () => {
  // -------------------------------------------------------------------------
  // GET /api/listings/near
  // -------------------------------------------------------------------------
  describe("GET /api/listings/near", () => {
    let app;
    beforeEach(() => {
      app = buildApp(3);
    });

    it("allows requests under the limit (max 3)", async () => {
      for (let i = 0; i < 3; i++) {
        await request(app).get("/api/listings/near").expect(200);
      }
    });

    it("returns HTTP 429 on the (max+1)th request", async () => {
      const res = await exhaustLimit(app, "/api/listings/near");
      expect(res.status).toBe(429);
    });

    it("429 body matches canonical error envelope", async () => {
      const res = await exhaustLimit(app, "/api/listings/near");
      assert429Shape(res.body);
    });

    it("429 response includes RateLimit-Limit standard header", async () => {
      const res = await exhaustLimit(app, "/api/listings/near");
      // express-rate-limit v7 emits RateLimit-Limit (lowercase in supertest)
      const limitHeader =
        res.headers["ratelimit-limit"] ?? res.headers["x-ratelimit-limit"];
      expect(limitHeader).toBeDefined();
    });

    it("429 response includes Retry-After header", async () => {
      const res = await exhaustLimit(app, "/api/listings/near");
      expect(res.headers["retry-after"]).toBeDefined();
    });

    it("includes reqId in 429 body (not null)", async () => {
      const res = await exhaustLimit(app, "/api/listings/near");
      expect(res.body.reqId).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/crafts  (text search endpoint)
  // -------------------------------------------------------------------------
  describe("GET /api/crafts (text search with ?q=)", () => {
    let app;
    beforeEach(() => {
      app = buildApp(3);
    });

    it("returns HTTP 429 after limit with query param", async () => {
      const url = "/api/crafts?q=%D8%B3%D9%81%D8%A7%D9%84"; // "سفال"
      const res = await exhaustLimit(app, url);
      expect(res.status).toBe(429);
    });

    it("429 body matches canonical error envelope", async () => {
      const url = "/api/crafts?q=%D8%B3%D9%81%D8%A7%D9%84";
      const res = await exhaustLimit(app, url);
      assert429Shape(res.body);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/crafts/near  (geospatial search on crafts)
  // -------------------------------------------------------------------------
  describe("GET /api/crafts/near", () => {
    let app;
    beforeEach(() => {
      app = buildApp(3);
    });

    it("returns HTTP 429 after limit", async () => {
      const url = "/api/crafts/near?lng=51.389&lat=35.6892&radiusKm=5";
      const res = await exhaustLimit(app, url);
      expect(res.status).toBe(429);
    });

    it("429 body matches canonical error envelope", async () => {
      const url = "/api/crafts/near?lng=51.389&lat=35.6892&radiusKm=5";
      const res = await exhaustLimit(app, url);
      assert429Shape(res.body);
    });
  });

  // -------------------------------------------------------------------------
  // Store isolation — separate app instances have independent counters
  // -------------------------------------------------------------------------
  describe("Store isolation between app instances", () => {
    it("a fresh app has a clean counter (no pollution from previous tests)", async () => {
      const freshApp = buildApp(3);
      // A brand-new app should accept the first request
      await request(freshApp).get("/api/listings/near").expect(200);
    });
  });
});
