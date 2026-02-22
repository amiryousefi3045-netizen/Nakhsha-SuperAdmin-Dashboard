/**
 * Response Enricher Middleware
 *
 * Transparently upgrades every JSON error response that was produced by the
 * legacy `createErrorResponse()` helper in `utils/userDto.js` (which did not
 * yet include `success` or `reqId`) to the canonical Nakhsha error envelope:
 *
 *   { success: false, error: { code, message, details? }, reqId }
 *
 * This works by monkey-patching `res.json` on each request so that any
 * outgoing body that:
 *   1. has an `error` object with a `code` string property, AND
 *   2. is missing `success` or `reqId`
 * gets those fields filled in automatically from `req.id` and `req.id`.
 *
 * Effect on existing route handlers: zero code changes required.
 * The central errorHandler already writes the full envelope, but this
 * middleware serves as a safety net for inline res.json() calls in routes.
 */

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function responseEnricher(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function enrichedJson(body) {
    if (
      body !== null &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      body.error &&
      typeof body.error === "object" &&
      typeof body.error.code === "string"
    ) {
      // Ensure canonical envelope fields are present
      if (!("success" in body)) {
        body.success = false;
      }
      if (!("reqId" in body)) {
        body.reqId = req.id ?? null;
      }
    }
    return originalJson(body);
  };

  next();
}

module.exports = { responseEnricher };
