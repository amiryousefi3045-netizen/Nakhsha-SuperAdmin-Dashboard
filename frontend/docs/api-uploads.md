# API — Image Uploads (`/api/uploads`)

## Endpoint

```
POST /api/uploads
Content-Type: multipart/form-data
```

### Field

| Field  | Type   | Required | Description        |
| ------ | ------ | -------- | ------------------ |
| `file` | `File` | ✅       | Single image file. |

### Accepted formats

`image/jpeg`, `image/png`, `image/webp`

### Limits

| Constraint | Default       | Override via                    |
| ---------- | ------------- | ------------------------------- |
| File size  | 5 MB          | `MAX_FILE_SIZE` env var (bytes) |
| Count      | 1 per request | —                               |

---

## Response — Legacy clients (no special header)

Returned when the `X-Client` header is absent or has any value other than `nakhsha-web`.

```json
HTTP/1.1 201 Created

{
  "success": true,
  "data": {
    "url": "/uploads/photo-1700000000000-ab12cd34ef56.webp",
    "filename": "photo-1700000000000-ab12cd34ef56.webp"
  },
  "message": "تصویر با موفقیت آپلود و پردازش شد",
  "reqId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
}
```

---

## Response — nakhsha-web clients (enriched envelope)

Set the header `X-Client: nakhsha-web` to opt into the enriched, stable response shape.

```
POST /api/uploads
X-Client: nakhsha-web
Content-Type: multipart/form-data
```

```json
HTTP/1.1 201 Created

{
  "success": true,
  "data": {
    "files": [
      {
        "url": "https://api.nakhsha.ir/uploads/photo-1700000000000-ab12cd34ef56.webp",
        "path": "/uploads/photo-1700000000000-ab12cd34ef56.webp",
        "width": 1200,
        "height": 800,
        "size": 48210,
        "mime": "image/webp"
      }
    ]
  },
  "reqId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
}
```

### `data.files[]` fields

| Field    | Type     | Description                                                                         |
| -------- | -------- | ----------------------------------------------------------------------------------- |
| `url`    | `string` | Absolute URL (uses `PUBLIC_BASE_URL` env var if set, or derived from request host). |
| `path`   | `string` | Relative path as stored on the server (`/uploads/…`).                               |
| `width`  | `number` | Output image width in pixels (after resize).                                        |
| `height` | `number` | Output image height in pixels (after resize).                                       |
| `size`   | `number` | File size in bytes on disk.                                                         |
| `mime`   | `string` | Always `"image/webp"` (files are always converted).                                 |

---

## Image processing guarantees

1. **Format conversion** — every accepted input is converted to **WebP** (quality 85).
2. **Metadata / EXIF stripped** — GPS coordinates and all EXIF tags are removed in the Sharp pipeline.
3. **Max dimension resize** — images larger than 1 600 × 1 600 px are scaled down (`fit: inside`, `withoutEnlargement`). Smaller images are not upscaled.
4. **Magic-byte validation** — file signature (JPEG `0xFF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF…WEBP`) is checked on disk after upload to prevent MIME-type spoofing.
5. **Path traversal prevention** — filenames are sanitized and resolved paths are verified to stay inside the `uploads/` directory.

---

## Error responses

All error responses follow the canonical envelope regardless of the `X-Client` header.

```json
{
  "success": false,
  "error": {
    "code": "<CODE>",
    "message": "<human-readable Persian message>"
  },
  "reqId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
}
```

| HTTP | `error.code`       | Cause                                     |
| ---- | ------------------ | ----------------------------------------- |
| 400  | `NO_FILE`          | No `file` field in the request body.      |
| 400  | `UPLOAD_ERROR`     | Too many parts / fields in multipart.     |
| 400  | `INVALID_FILE`     | File signature does not match MIME type.  |
| 400  | `INVALID_PATH`     | Filename failed path-traversal check.     |
| 413  | `FILE_TOO_LARGE`   | File exceeds the configured size limit.   |
| 415  | `UPLOAD_ERROR`     | MIME type or file extension not allowed.  |
| 500  | `PROCESSING_ERROR` | Unexpected error during Sharp processing. |

---

## Frontend helper

Use `uploadImages(files)` from `src/services/uploads.ts`:

```ts
import { uploadImages } from "@/services/uploads";

const urls = await uploadImages(selectedFiles, {
  onFileProgress: (i, pct) => console.log(`File ${i}: ${pct}%`),
});
// urls → string[]  (absolute URLs, already normalized via toAbsoluteMediaUrl)
```

- Uploads with **max 3 concurrent** requests.
- Automatically sets `X-Client: nakhsha-web`.
- Normalizes returned paths to absolute URLs via `toAbsoluteMediaUrl`.
- Per-file error suppression available via the `onError` callback.
