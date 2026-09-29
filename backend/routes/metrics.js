const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { registry } = require("../utils/metrics");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

/**
 * Nakhsha — Prometheus scrape endpoint
 * =====================================
 *
 * WHY THIS ENDPOINT IS LOCKED DOWN
 * --------------------------------
 * A `/metrics` endpoint is an intelligence report about the running system:
 * request volume, error rates, latency percentiles, the route inventory, and
 * database connectivity. Exposed publicly it tells an attacker which routes
 * exist, how much traffic each receives, which ones are throwing 5xx (i.e.
 * where to aim), and whether the database is reachable — reconnaissance for
 * free. It is a well-known mistake, so it is closed here by default.
 *
 * A request is served only when EITHER:
 *   - `METRICS_TOKEN` is configured and a matching bearer token is presented
 *     (the standard Prometheus `bearer_token_file` setup, compared in
 *     constant time), OR
 *   - the caller is an authenticated super admin. `requireRole` re-reads the
 *     role from the database rather than trusting the JWT claim, matching the
 *     policy already documented in middleware/auth.js.
 *
 * Response codes are chosen to avoid confirming the endpoint's existence to a
 * scanner: with no token configured and no valid session, the response is
 * 401/403 from the shared auth middleware — identical to any other protected
 * route. When `METRICS_ENABLED=false` the route is never mounted at all.
 */

const timingSafeEqualString = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const hasTokenAccess = (req) => {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return false;

  const header = (req.get("authorization") || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;

  return timingSafeEqualString(match[1], expected);
};

const adminOnly = [requireAuth, requireRole("super_admin")];

/**
 * @type {import("express").RequestHandler}
 */
function guard(req, res, next) {
  if (hasTokenAccess(req)) return next();
  if (process.env.METRICS_TOKEN) {
    // A token is configured, so presenting a wrong one is a genuine auth
    // failure rather than a probe from an anonymous scanner.
    return res.status(401).json({ message: "دسترسی به متریک مجاز نیست" });
  }
  return adminOnly[0](req, res, () => adminOnly[1](req, res, next));
}

// ---------------------------------------------------------------------------
// GET /metrics
// ---------------------------------------------------------------------------

router.get("/", guard, (req, res) => {
  // Refresh the dependency gauge at scrape time so its value is never staler
  // than the scrape interval.
  registry.get("nakhsha_db_ready")?.set({}, mongoose.connection.readyState === 1 ? 1 : 0);

  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  // Scrapes must never be served from an intermediary cache.
  res.set("Cache-Control", "no-store");
  res.status(200).send(registry.render());
});

module.exports = router;
