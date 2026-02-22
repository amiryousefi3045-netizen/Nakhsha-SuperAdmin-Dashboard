"use strict";

/**
 * Nakhsha — Centralised Error Monitoring (Sentry)
 * ================================================
 * This module MUST be required and `init()` MUST be called before any other
 * module is loaded in server.js.  Sentry patches Node core APIs on init so
 * that it can track async context and capture uncaughtException /
 * unhandledRejection automatically.
 *
 * When SENTRY_DSN is absent every exported function is a no-op, so the app
 * behaves identically in plain local-dev setups without any configuration.
 */

const Sentry = require("@sentry/node");

// ---------------------------------------------------------------------------
// Secret scrubbing
// ---------------------------------------------------------------------------

/**
 * Field names (normalised: lower-case, no dashes/underscores) whose values
 * must NEVER leave this process.
 */
const SCRUB_KEYS = new Set([
  "password",
  "passwordconfirm",
  "confirmpassword",
  "newpassword",
  "currentpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "apikey",
  "authorization",
  "cookie",
  "creditcard",
  "cvv",
  "ssn",
  "otp",
  "otpsecret",
  "smssecret",
  "jwtsecret",
]);

/**
 * Returns a normalised version of a key for lookup purposes.
 * "JWT_SECRET" → "jwtsecret", "api-key" → "apikey"
 */
const normaliseKey = (key) => key.toLowerCase().replace(/[-_ ]/g, "");

/**
 * Recursively replace scrubbed fields with "[Filtered]".
 * Handles nested objects and arrays; leaves primitives untouched.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function scrub(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(scrub);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) =>
        SCRUB_KEYS.has(normaliseKey(k)) ? [k, "[Filtered]"] : [k, scrub(v)],
      ),
    );
  }
  return value;
}

/**
 * Sentry `beforeSend` hook — mutates the event in-place before transmission.
 *
 * @param {import("@sentry/node").ErrorEvent} event
 * @returns {import("@sentry/node").ErrorEvent | null}
 */
function beforeSend(event) {
  if (!event.request) return event;

  // -- Request body ---------------------------------------------------------
  if (event.request.data != null) {
    if (typeof event.request.data === "string") {
      try {
        event.request.data = scrub(JSON.parse(event.request.data));
      } catch {
        // Non-JSON body; leave as-is (no secret values expected in plain text)
      }
    } else {
      event.request.data = scrub(event.request.data);
    }
  }

  // -- Headers --------------------------------------------------------------
  if (event.request.headers) {
    if (event.request.headers.authorization)
      event.request.headers.authorization = "[Filtered]";
    if (event.request.headers.cookie)
      event.request.headers.cookie = "[Filtered]";
  }

  // -- Query string ---------------------------------------------------------
  if (event.request.query_string) {
    const qs = event.request.query_string;
    const asObj =
      typeof qs === "string" ? Object.fromEntries(new URLSearchParams(qs)) : qs;
    event.request.query_string = scrub(asObj);
  }

  return event;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise Sentry.  Call this as the FIRST statement in server.js so that
 * Node core HTTP, DNS, and other modules are patched before they are used.
 *
 * No-op when SENTRY_DSN env-var is absent.
 */
function init() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // Monitoring intentionally disabled

  let release;
  try {
    // eslint-disable-next-line
    const pkg = require("../package.json");
    release = `${pkg.name}@${pkg.version}`;
  } catch {
    // package.json not reachable — skip
  }

  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release,

    // Percentage of transactions to send for performance monitoring (0–1).
    // Configurable per environment without code changes.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),

    // Disable during automated test runs so test failures don't create noise.
    enabled: process.env.NODE_ENV !== "test",

    beforeSend,
  });
}

/**
 * Express middleware — attaches `reqId` to the Sentry scope for the current
 * request.  Mount immediately after the `req.id` middleware.
 *
 * Sentry v8 uses AsyncLocalStorage so `Sentry.setTag()` here only affects
 * events originating from this request's async context.
 *
 * @type {import("express").RequestHandler}
 */
function requestContextMiddleware(req, _res, next) {
  if (!process.env.SENTRY_DSN) return next();

  Sentry.setTag("reqId", req.id ?? "unknown");
  Sentry.setContext("request_meta", {
    reqId: req.id,
    method: req.method,
    url: req.originalUrl || req.url,
  });

  next();
}

/**
 * Capture a server-side error with full request context.
 *
 * - Only call for 5xx / unexpected errors; intentional 4xx client errors
 *   should NOT be reported to Sentry.
 * - Adds reqId, matched route, and userId (when authenticated) as Sentry
 *   tags so issues can be cross-referenced with application logs.
 *
 * @param {Error}   err - The original error object.
 * @param {object} [req] - Express request (may be undefined for process-level errors).
 */
function captureError(err, req) {
  if (!process.env.SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    if (req) {
      const route = req.route?.path ?? req.path ?? "unknown";
      const userId = req.user?.id ?? null;

      scope.setTag("reqId", req.id ?? "unknown");
      scope.setTag("route", route);

      if (userId) {
        // Only the id — never email, name, or any PII
        scope.setUser({ id: String(userId) });
      }

      scope.setContext("request_meta", {
        reqId: req.id,
        method: req.method,
        url: req.originalUrl || req.url,
        route,
        userId,
      });
    }

    scope.setLevel("error");
    Sentry.captureException(err);
  });
}

module.exports = { init, requestContextMiddleware, captureError };
