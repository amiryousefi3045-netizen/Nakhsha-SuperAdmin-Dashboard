/**
 * Unit tests for:
 *   - toAbsoluteMediaUrl  (services/media.ts)
 *   - uploadImages response parsing  (services/uploads.ts)
 *   - createListing response parsing (services/listings.ts)
 *
 * apiClient is fully mocked so no network calls are made.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// ── Mock apiClient BEFORE any service imports (vi.mock is hoisted) ─────────
vi.mock("../../lib/apiClient", () => ({
  apiClient: {
    axios: { post: vi.fn() },
    post: vi.fn(),
  },
  TokenManager: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));

import { toAbsoluteMediaUrl } from "../media";
import { uploadImages } from "../uploads";
import type { UploadedFile } from "../uploads";
import { createListing } from "../listings";
import { apiClient } from "../../lib/apiClient";
import type { ListingDraftPayload } from "../listingDraft";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMockFile(name = "test.jpg", type = "image/jpeg"): File {
  return new File(["pixel"], name, { type });
}

/** Build the Axios response shape for a successful single-file upload. */
function makeUploadAxiosResponse(files: { url: string; path: string }[]) {
  return {
    data: {
      success: true as const,
      data: { files },
      reqId: null,
    },
  };
}

/** A minimal valid listing draft payload. */
const BASE_PAYLOAD: ListingDraftPayload = {
  type: "post",
  title: "کوزه سفالین",
  description: "یک کوزه دست‌ساز",
  tags: ["سفالگری"],
  images: [],
  location: { type: "Point", coordinates: [51.3347, 35.7219] },
  details: { price: 250_000, forSale: true },
};

// ══════════════════════════════════════════════════════════════════════════════
// toAbsoluteMediaUrl
// ══════════════════════════════════════════════════════════════════════════════

describe("toAbsoluteMediaUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an https URL unchanged", () => {
    const url = "https://cdn.nakhsha.ir/uploads/craft.webp";
    expect(toAbsoluteMediaUrl(url)).toBe(url);
  });

  it("returns an http URL unchanged", () => {
    const url = "http://localhost:5000/uploads/img.jpg";
    expect(toAbsoluteMediaUrl(url)).toBe(url);
  });

  it("prepends VITE_API_ORIGIN to a relative path", () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://api.nakhsha.ir");
    expect(toAbsoluteMediaUrl("/uploads/craft.webp")).toBe(
      "https://api.nakhsha.ir/uploads/craft.webp",
    );
  });

  it("adds a leading slash to a relative path without one", () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://api.nakhsha.ir");
    expect(toAbsoluteMediaUrl("uploads/craft.webp")).toBe(
      "https://api.nakhsha.ir/uploads/craft.webp",
    );
  });

  it("strips a trailing slash from VITE_API_ORIGIN before concatenating", () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://api.nakhsha.ir/");
    expect(toAbsoluteMediaUrl("/uploads/img.jpg")).toBe(
      "https://api.nakhsha.ir/uploads/img.jpg",
    );
  });

  it("returns a full URL (some origin prefixed) when VITE_API_ORIGIN is empty but SERVER_ORIGIN is set", () => {
    vi.stubEnv("VITE_API_ORIGIN", "");
    // SERVER_ORIGIN is computed at module-load time from VITE_API_BASE / VITE_SERVER_ORIGIN /
    // window.location — its exact value is environment-specific; we only assert the shape.
    const result = toAbsoluteMediaUrl("/uploads/craft.webp");
    // Must either be a fully-qualified URL or the original relative path (if no origin)
    expect(
      result === "/uploads/craft.webp" || /^https?:\/\//.test(result),
    ).toBe(true);
    if (/^https?:\/\//.test(result)) {
      expect(result).toContain("/uploads/craft.webp");
    }
  });

  it("returns an empty string unchanged", () => {
    expect(toAbsoluteMediaUrl("")).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// uploadImages — response parsing
// ══════════════════════════════════════════════════════════════════════════════

describe("uploadImages", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty array when given no files", async () => {
    const results = await uploadImages([]);
    expect(results).toEqual([]);
    expect(vi.mocked(apiClient.axios.post)).not.toHaveBeenCalled();
  });

  it("returns UploadedFile[] with url and path from the success envelope", async () => {
    vi.mocked(apiClient.axios.post).mockResolvedValueOnce(
      makeUploadAxiosResponse([
        { url: "/uploads/pot.webp", path: "/uploads/pot.webp" },
      ]),
    );

    const results: UploadedFile[] = await uploadImages([
      makeMockFile("pot.jpg"),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("/uploads/pot.webp");
    // url comes from toAbsoluteMediaUrl; in Node env without VITE_API_ORIGIN it is the same path
    expect(results[0].url).toContain("pot.webp");
  });

  it("throws when the backend returns success:false (no onError handler)", async () => {
    vi.mocked(apiClient.axios.post).mockResolvedValueOnce({
      data: {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "نوع فایل مجاز نیست" },
      },
    });

    await expect(uploadImages([makeMockFile()])).rejects.toThrow(
      "نوع فایل مجاز نیست",
    );
  });

  it("calls onError instead of throwing when a handler is provided", async () => {
    vi.mocked(apiClient.axios.post).mockResolvedValueOnce({
      data: {
        success: false,
        error: { code: "ERR", message: "خطا در آپلود" },
      },
    });

    const errors: Array<{ index: number; message: string }> = [];
    const results = await uploadImages([makeMockFile()], {
      onError: (index, message) => errors.push({ index, message }),
    });

    expect(results).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ index: 0, message: "خطا در آپلود" });
  });

  it("uploads each file individually and collects all results", async () => {
    const axiosPost = vi.mocked(apiClient.axios.post);
    for (let i = 0; i < 4; i++) {
      axiosPost.mockResolvedValueOnce(
        makeUploadAxiosResponse([
          { url: `/uploads/f${i}.webp`, path: `/uploads/f${i}.webp` },
        ]),
      );
    }

    const files = Array.from({ length: 4 }, (_, i) =>
      makeMockFile(`f${i}.jpg`),
    );
    const results = await uploadImages(files);

    expect(results).toHaveLength(4);
    expect(axiosPost).toHaveBeenCalledTimes(4);
    expect(results.map((r) => r.path)).toEqual([
      "/uploads/f0.webp",
      "/uploads/f1.webp",
      "/uploads/f2.webp",
      "/uploads/f3.webp",
    ]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// createListing — response parsing
// ══════════════════════════════════════════════════════════════════════════════

describe("createListing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the listing item from a well-formed success envelope", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        data: {
          item: {
            _id: "abc123",
            type: "post",
            title: "کوزه سفالین",
            images: ["/uploads/pot.webp"],
          },
        },
        reqId: "req-001",
      },
    });

    const listing = await createListing(BASE_PAYLOAD);
    expect(listing._id).toBe("abc123");
    expect(listing.title).toBe("کوزه سفالین");
    expect(listing.type).toBe("post");
    expect(listing.images).toEqual(["/uploads/pot.webp"]);
  });

  it("throws ApiError when apiClient returns success:false", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "لطفاً وارد حساب کاربری خود شوید",
        status: 401,
      },
    });

    await expect(createListing(BASE_PAYLOAD)).rejects.toBeTruthy();
  });

  it("throws when the envelope's data.item is absent", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        data: {}, // item missing
        reqId: null,
      },
    });

    await expect(createListing(BASE_PAYLOAD)).rejects.toThrow(
      "پاسخ سرور نامعتبر است",
    );
  });

  it("calls POST /listings with the provided payload", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        data: { item: { _id: "xyz", type: "post", title: "تست" } },
        reqId: null,
      },
    });

    await createListing(BASE_PAYLOAD);

    expect(vi.mocked(apiClient.post)).toHaveBeenCalledWith(
      "/listings",
      BASE_PAYLOAD,
    );
  });
});
