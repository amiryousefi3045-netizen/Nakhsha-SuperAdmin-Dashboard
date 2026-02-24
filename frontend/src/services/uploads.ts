/**
 * Uploads Service — Nakhsha
 *
 * Wraps POST /api/uploads for image files.
 * - Uploads files with max 3 concurrent requests (concurrency pool).
 * - Normalizes returned paths to absolute URLs via toAbsoluteMediaUrl.
 * - Sends X-Client: nakhsha-web so the backend returns the enriched envelope.
 */

import type { AxiosProgressEvent } from "axios";
import { apiClient } from "../lib/apiClient";
import { toAbsoluteMediaUrl } from "./media";

// ── Types ──────────────────────────────────────────────────────────────────

/** One file entry returned inside the enriched envelope. */
export interface UploadedFile {
  /** Fully-qualified absolute URL ready for use in <img src> */
  url: string;
  /** Stored relative path as saved on the server, e.g. "/uploads/img.webp" */
  path: string;
  width?: number;
  height?: number;
  size?: number;
  mime?: string;
}

/** Shape of the enriched success envelope's `data` property. */
interface UploadEnvelopeData {
  files: UploadedFile[];
}

/** Full success envelope returned when X-Client header is sent. */
interface UploadEnvelope {
  success: true;
  data: UploadEnvelopeData;
  reqId: string | null;
}

/** Error envelope shape. */
interface UploadErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
  reqId?: string | null;
}

// ── Internal helpers ───────────────────────────────────────────────────────

const NAKHSHA_CLIENT_HEADER = { "X-Client": "nakhsha-web" } as const;
const MAX_CONCURRENCY = 3;

/**
 * Upload a single File to /api/uploads.
 * Returns the normalized UploadedFile on success.
 * Throws a descriptive Error on failure.
 */
async function uploadSingleFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file, file.name);

  const { data } = await apiClient.axios.post<
    UploadEnvelope | UploadErrorEnvelope
  >("/uploads", form, {
    headers: {
      "Content-Type": "multipart/form-data",
      ...NAKHSHA_CLIENT_HEADER,
    },
    onUploadProgress: (evt: AxiosProgressEvent) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    },
  });

  if (!data.success) {
    // Narrowed to error envelope
    const errEnv = data as UploadErrorEnvelope;
    throw new Error(errEnv.error?.message || "خطا در آپلود تصویر");
  }

  const successEnv = data as UploadEnvelope;
  const first = successEnv.data?.files?.[0];
  if (!first) throw new Error("پاسخ سرور نامعتبر است: فایلی بازگردانده نشد");

  return {
    ...first,
    url: toAbsoluteMediaUrl(first.url || first.path),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Upload an array of image files to the backend.
 *
 * Files are uploaded with max {@link MAX_CONCURRENCY} requests in parallel.
 * Returns a flat array of absolute URLs in the same order as the input files.
 *
 * @param files    Array of File objects (browser File API).
 * @param options  Optional callbacks:
 *   - onFileProgress(index, percent) — progress for each individual file.
 *   - onError(index, message)        — called for each failed file (instead of rejecting).
 *                                      If omitted the whole call rejects on first error.
 *
 * @throws When a file fails and no `onError` handler is provided.
 */
export async function uploadImages(
  files: File[],
  options?: {
    onFileProgress?: (index: number, percent: number) => void;
    /** If supplied, failures are collected here instead of throwing. */
    onError?: (index: number, message: string) => void;
  },
): Promise<string[]> {
  if (!files.length) return [];

  const results: Array<string | null> = new Array(files.length).fill(null);

  // Process in batches of MAX_CONCURRENCY
  for (let start = 0; start < files.length; start += MAX_CONCURRENCY) {
    const batch = files.slice(start, start + MAX_CONCURRENCY);

    await Promise.all(
      batch.map(async (file, batchIdx) => {
        const globalIdx = start + batchIdx;
        try {
          const uploaded = await uploadSingleFile(file, (pct) =>
            options?.onFileProgress?.(globalIdx, pct),
          );
          results[globalIdx] = uploaded.url;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "خطا در آپلود تصویر";
          if (options?.onError) {
            options.onError(globalIdx, message);
          } else {
            throw err;
          }
        }
      }),
    );
  }

  // Filter out any nulls (from suppressed errors via onError)
  return results.filter((u): u is string => u !== null);
}

/**
 * Convenience wrapper — upload a single file.
 * Returns its absolute URL string.
 */
export async function uploadImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const uploaded = await uploadSingleFile(file, onProgress);
  return uploaded.url;
}
