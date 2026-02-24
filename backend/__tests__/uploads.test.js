/**
 * Unit / integration tests for POST /api/uploads
 *
 * What is verified:
 *   1. Without X-Client header → legacy response shape preserved.
 *   2. With X-Client: nakhsha-web → enriched envelope returned.
 *   3. Enriched response contains a .webp file (format conversion).
 *   4. Returned metadata has width / height / size / mime.
 *   5. EXIF metadata is stripped (GPS coords not echoed back).
 *   6. Files exceeding size limit are rejected with 413.
 *   7. Invalid MIME types are rejected with 415.
 *   8. Missing file returns 400.
 */

"use strict";

const request = require("supertest");
const mongoose = require("mongoose");
const path = require("path");
const sharp = require("sharp");
const app = require("../server");

// ── Test image factories ───────────────────────────────────────────────────

/**
 * Build a minimal valid JPEG buffer (1×1 px) with optional EXIF GPS data.
 * Sharp is used so the buffer has a real JPEG signature.
 */
async function makeJpegBuffer({ withExif = false } = {}) {
  const img = sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  });

  if (withExif) {
    // Embed fake GPS EXIF data — the upload route must strip this
    img.withExif({
      IFD0: { Copyright: "Test" },
      GPS: { GPSLatitude: "35/1 42/1 0/1", GPSLongitude: "51/1 24/1 0/1" },
    });
  }

  return img.jpeg({ quality: 80 }).toBuffer();
}

/**
 * Build a PNG buffer whose pixel size is realistic (8×8).
 */
async function makePngBuffer() {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

// ── Test setup ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  if (mongoose.connection.readyState === 0) {
    const uri =
      process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
    await mongoose.connect(uri);
  }
  app.locals.dbReady = true;
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function postImage(fileBuffer, opts = {}) {
  const {
    filename = "test.jpg",
    mime = "image/jpeg",
    asNewClient = false,
  } = opts;
  const req = request(app)
    .post("/api/uploads")
    .attach("file", fileBuffer, { filename, contentType: mime });

  if (asNewClient) req.set("X-Client", "nakhsha-web");
  return req;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/uploads", () => {
  // ── 1. Legacy response shape (no X-Client header) ────────────────────────
  describe("legacy clients (no X-Client header)", () => {
    it("returns 201 with legacy data.url and data.filename", async () => {
      const buf = await makeJpegBuffer();
      const res = await postImage(buf);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.url).toBe("string");
      expect(typeof res.body.data.filename).toBe("string");
      // Must NOT include files array (that is the new shape)
      expect(res.body.data.files).toBeUndefined();
    });
  });

  // ── 2. Enriched envelope (X-Client: nakhsha-web) ─────────────────────────
  describe("nakhsha-web clients (X-Client: nakhsha-web)", () => {
    it("returns 201 with enriched envelope: success/data/reqId", async () => {
      const buf = await makeJpegBuffer();
      const res = await postImage(buf, { asNewClient: true });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("reqId");
      expect(res.body.reqId).toMatch(UUID_RE);
      expect(Array.isArray(res.body.data.files)).toBe(true);
      expect(res.body.data.files.length).toBe(1);
    });

    // ── 3. Converts to WebP ──────────────────────────────────────────────
    it("converts the uploaded image to WebP format", async () => {
      const buf = await makeJpegBuffer();
      const res = await postImage(buf, { asNewClient: true });

      const file = res.body.data.files[0];
      expect(file.mime).toBe("image/webp");
      expect(file.url).toMatch(/\.webp$/i);
      expect(file.path).toMatch(/\.webp$/i);
    });

    // ── 3b. PNG input also converted ────────────────────────────────────
    it("converts PNG input to WebP", async () => {
      const buf = await makePngBuffer();
      const res = await postImage(buf, {
        filename: "test.png",
        mime: "image/png",
        asNewClient: true,
      });

      expect(res.status).toBe(201);
      const file = res.body.data.files[0];
      expect(file.mime).toBe("image/webp");
    });

    // ── 4. Metadata fields ───────────────────────────────────────────────
    it("returns width, height, size, mime in the file entry", async () => {
      const buf = await makeJpegBuffer();
      const res = await postImage(buf, { asNewClient: true });

      const file = res.body.data.files[0];
      expect(typeof file.width).toBe("number");
      expect(typeof file.height).toBe("number");
      expect(typeof file.size).toBe("number");
      expect(file.size).toBeGreaterThan(0);
      expect(file.mime).toBe("image/webp");
    });

    // ── 5. EXIF stripped ─────────────────────────────────────────────────
    it("strips EXIF / GPS metadata from the processed image", async () => {
      const buf = await makeJpegBuffer({ withExif: true });
      const res = await postImage(buf, { asNewClient: true });
      expect(res.status).toBe(201);

      // Verify the stored file has no GPS EXIF. Re-read via sharp.
      const file = res.body.data.files[0];
      const storedPath = path.join(__dirname, "..", file.path);
      const meta = await sharp(storedPath).metadata();
      // Sharp strips all EXIF during .webp() conversion when no withExif()
      // is chained — exif should be absent or empty.
      expect(meta.exif).toBeUndefined();
    });
  });

  // ── 6. Size limit enforced ───────────────────────────────────────────────
  describe("file size limit", () => {
    it("rejects files larger than MAX_FILE_SIZE with 413", async () => {
      const maxBytes = parseInt(
        process.env.MAX_FILE_SIZE || "5242880", // 5 MB default
        10,
      );
      // Build a buffer slightly over the limit by wrapping in a fake JPEG
      // envelope (signature bytes + padding)
      const oversize = Buffer.alloc(maxBytes + 1024);
      // JPEG magic bytes
      oversize[0] = 0xff;
      oversize[1] = 0xd8;
      oversize[2] = 0xff;

      const res = await request(app)
        .post("/api/uploads")
        .set("Content-Type", "multipart/form-data")
        .attach("file", oversize, {
          filename: "big.jpg",
          contentType: "image/jpeg",
        });

      expect(res.status).toBe(413);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FILE_TOO_LARGE");
    });
  });

  // ── 7. Invalid MIME type ────────────────────────────────────────────────
  describe("invalid file types", () => {
    it("rejects non-image MIME type with 415", async () => {
      const res = await request(app)
        .post("/api/uploads")
        .attach("file", Buffer.from("hello world"), {
          filename: "test.txt",
          contentType: "text/plain",
        });

      expect(res.status).toBe(415);
      expect(res.body.success).toBe(false);
    });
  });

  // ── 8. Missing file ─────────────────────────────────────────────────────
  describe("missing file", () => {
    it("returns 400 when no file is attached", async () => {
      const res = await request(app).post("/api/uploads").send();

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("NO_FILE");
    });
  });
});
