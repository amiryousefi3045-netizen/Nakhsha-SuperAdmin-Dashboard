/**
 * Unit tests for backend utility helpers.
 *
 * Covers:
 *   - utils/response.js  (createSuccessResponse, codeFromStatus)
 *   - utils/urls.js      (toAbsoluteUrl)
 *
 * Note: createErrorResponse is already exercised thoroughly in
 *       __tests__/error-format.test.js, so only the untested surface is
 *       covered here to avoid duplication.
 */

const {
  createSuccessResponse,
  createErrorResponse,
  codeFromStatus,
} = require("../utils/response");

const { toAbsoluteUrl } = require("../utils/urls");

// ─── createSuccessResponse ────────────────────────────────────────────────────

describe("createSuccessResponse (utils/response.js)", () => {
  it("returns success:true with the data payload merged in", () => {
    const body = createSuccessResponse(
      { users: [], total: 0 },
      "req-success-1",
    );

    expect(body).toEqual({
      success: true,
      reqId: "req-success-1",
      users: [],
      total: 0,
    });
  });

  it("sets reqId to null when not provided", () => {
    const body = createSuccessResponse({ ok: true });
    expect(body.reqId).toBeNull();
  });

  it("accepts an empty data object", () => {
    const body = createSuccessResponse({}, "req-2");
    expect(body.success).toBe(true);
    expect(body.reqId).toBe("req-2");
  });

  it("does not include an 'error' key on success", () => {
    const body = createSuccessResponse({ item: "craft" }, "req-3");
    expect(body).not.toHaveProperty("error");
  });
});

// ─── codeFromStatus ───────────────────────────────────────────────────────────

describe("codeFromStatus (utils/response.js)", () => {
  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [422, "UNPROCESSABLE_ENTITY"],
    [429, "TOO_MANY_REQUESTS"],
    [500, "INTERNAL_ERROR"],
    [503, "SERVICE_UNAVAILABLE"],
  ])("maps HTTP %i → %s", (status, expected) => {
    expect(codeFromStatus(status)).toBe(expected);
  });

  it("falls back to INTERNAL_ERROR for unknown status codes", () => {
    expect(codeFromStatus(999)).toBe("INTERNAL_ERROR");
    expect(codeFromStatus(0)).toBe("INTERNAL_ERROR");
  });
});

// ─── toAbsoluteUrl ────────────────────────────────────────────────────────────

describe("toAbsoluteUrl (utils/urls.js)", () => {
  const ORIG_ENV = process.env;

  beforeEach(() => {
    // Isolate env mutations between tests
    process.env = { ...ORIG_ENV };
    delete process.env.PUBLIC_BASE_URL;
  });

  afterAll(() => {
    process.env = ORIG_ENV;
  });

  // ── Already-absolute paths ───────────────────────────────────────────────

  it("returns an https URL unchanged", () => {
    const url = "https://cdn.example.com/uploads/img.webp";
    expect(toAbsoluteUrl(url)).toBe(url);
  });

  it("returns an http URL unchanged", () => {
    const url = "http://localhost:5000/uploads/img.webp";
    expect(toAbsoluteUrl(url)).toBe(url);
  });

  // ── PUBLIC_BASE_URL takes priority ───────────────────────────────────────

  it("uses PUBLIC_BASE_URL when set", () => {
    process.env.PUBLIC_BASE_URL = "https://api.nakhsha.ir";
    expect(toAbsoluteUrl("/uploads/img.webp")).toBe(
      "https://api.nakhsha.ir/uploads/img.webp",
    );
  });

  it("strips trailing slash from PUBLIC_BASE_URL before joining", () => {
    process.env.PUBLIC_BASE_URL = "https://api.nakhsha.ir/";
    expect(toAbsoluteUrl("/uploads/img.webp")).toBe(
      "https://api.nakhsha.ir/uploads/img.webp",
    );
  });

  it("prepends / to path when missing and PUBLIC_BASE_URL is set", () => {
    process.env.PUBLIC_BASE_URL = "https://api.nakhsha.ir";
    expect(toAbsoluteUrl("uploads/img.webp")).toBe(
      "https://api.nakhsha.ir/uploads/img.webp",
    );
  });

  // ── Derive from req when no PUBLIC_BASE_URL ──────────────────────────────

  it("falls back to req.protocol + req.get('host')", () => {
    const mockReq = {
      protocol: "https",
      get: (h) => (h === "host" ? "nakhsha.ir" : null),
    };
    expect(toAbsoluteUrl("/uploads/avatar.webp", mockReq)).toBe(
      "https://nakhsha.ir/uploads/avatar.webp",
    );
  });

  it("PUBLIC_BASE_URL overrides req when both are present", () => {
    process.env.PUBLIC_BASE_URL = "https://static.nakhsha.ir";
    const mockReq = {
      protocol: "http",
      get: (h) => (h === "host" ? "localhost:5000" : null),
    };
    expect(toAbsoluteUrl("/uploads/img.jpg", mockReq)).toBe(
      "https://static.nakhsha.ir/uploads/img.jpg",
    );
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it("returns path unchanged when no PUBLIC_BASE_URL and no req", () => {
    expect(toAbsoluteUrl("/uploads/img.webp")).toBe("/uploads/img.webp");
  });

  it("returns the original value for falsy input", () => {
    expect(toAbsoluteUrl("")).toBe("");
    expect(toAbsoluteUrl(null)).toBe(null);
    expect(toAbsoluteUrl(undefined)).toBe(undefined);
  });
});
