/**
 * Standardized API response helpers for Nakhsha backend.
 *
 * Every error envelope follows the shape:
 *   { success: false, error: { code, message, details? }, reqId }
 *
 * Every success envelope follows the shape:
 *   { success: true, reqId, ...data }
 *
 * Usage in route handlers:
 *   return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "bad input", { field: "phone" }, req.id));
 *
 * Usage in central error middleware:
 *   return res.status(err.statusCode).json(createErrorResponse(deriveCode(err), err.message, err.details, req.id));
 */

/**
 * HTTP status → canonical error code mapping.
 * Used when an AppError (or native Error) does not carry its own `.code`.
 */
const HTTP_STATUS_CODES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  410: "GONE",
  422: "UNPROCESSABLE_ENTITY",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
  504: "GATEWAY_TIMEOUT",
};

/**
 * Return the canonical string error code for an HTTP status number.
 * Falls back to "INTERNAL_ERROR" for unknown codes.
 *
 * @param {number} statusCode
 * @returns {string}
 */
function codeFromStatus(statusCode) {
  return HTTP_STATUS_CODES[statusCode] || "INTERNAL_ERROR";
}

/**
 * Build a standardized error response envelope.
 *
 * @param {string}       code    - Machine-readable error code, e.g. "VALIDATION_ERROR"
 * @param {string}       message - Human-readable message (Persian or English)
 * @param {*}            details - Optional extra context (object, array, or null)
 * @param {string|null}  reqId   - Request correlation ID (req.id)
 * @returns {{ success: false, error: { code, message, details? }, reqId: string|null }}
 */
function createErrorResponse(code, message, details = null, reqId = null) {
  const envelope = {
    success: false,
    error: { code, message },
    reqId: reqId ?? null,
  };

  if (details !== null && details !== undefined) {
    envelope.error.details = details;
  }

  return envelope;
}

/**
 * Build a standardized success response envelope.
 *
 * Supports two calling styles for compatibility:
 *   createSuccessResponse(data, reqId)
 *   createSuccessResponse(data, metadata, reqId)
 *
 * @param {Object} data - Payload to merge into the envelope
 * @param {Object|string|null} metadataOrReqId - Optional metadata object or reqId string
 * @param {string|null} reqId - Request correlation ID (req.id)
 * @returns {{ success: true, reqId: string|null, ...data }}
 */
function createSuccessResponse(
  data = {},
  metadataOrReqId = null,
  reqId = null,
) {
  const envelope = {
    success: true,
    reqId: reqId ?? null,
    ...data,
  };

  if (reqId === null && typeof metadataOrReqId === "string") {
    envelope.reqId = metadataOrReqId;
  } else if (
    metadataOrReqId &&
    typeof metadataOrReqId === "object" &&
    !Array.isArray(metadataOrReqId)
  ) {
    envelope.metadata = metadataOrReqId;
  }

  return envelope;
}

module.exports = {
  createErrorResponse,
  createSuccessResponse,
  codeFromStatus,
  HTTP_STATUS_CODES,
};
