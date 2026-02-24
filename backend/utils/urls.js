/**
 * URL helpers for Nakhsha backend.
 *
 * Converts stored relative upload paths (e.g. "/uploads/abc.webp") into
 * fully-qualified absolute URLs.
 *
 * Resolution order:
 *   1. If the value is already an absolute URL (starts with http:// or https://)
 *      → return it unchanged.
 *   2. If process.env.PUBLIC_BASE_URL is set
 *      → use it as the origin (trailing slash is stripped automatically).
 *   3. If an Express `req` object is provided
 *      → derive origin from req.protocol + req.get("host").
 *   4. Otherwise → return the original path unchanged (best-effort).
 */

/**
 * Convert a stored relative path to an absolute URL.
 *
 * @param {string}      path - Stored path, e.g. "/uploads/avatar.webp"
 * @param {object|null} [req] - Express request object (optional; used as
 *                              fallback when PUBLIC_BASE_URL is not set)
 * @returns {string} Absolute URL
 */
function toAbsoluteUrl(path, req = null) {
  if (!path || typeof path !== "string") return path;

  // 1. Already absolute → return as-is
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  // Normalise so it always starts with exactly one "/"
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // 2. PUBLIC_BASE_URL takes precedence over everything else
  const base = process.env.PUBLIC_BASE_URL;
  if (base) {
    return `${base.replace(/\/+$/, "")}${normalizedPath}`;
  }

  // 3. Derive from the incoming request
  if (req) {
    const proto = req.protocol || "http";
    const host = req.get("host") || "localhost";
    return `${proto}://${host}${normalizedPath}`;
  }

  // 4. Cannot resolve → return unchanged
  return path;
}

module.exports = { toAbsoluteUrl };
