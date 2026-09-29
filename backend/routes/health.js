const express = require("express");
const mongoose = require("mongoose");
const { getSmsStatus } = require("../services/sms/melipayamakSms");
const { metrics } = require("../utils/metrics");
const { isDraining } = require("../utils/lifecycle");

const router = express.Router();

/**
 * Nakhsha — Liveness / Readiness / Diagnostic health
 * ==================================================
 *
 * Three distinct probes, because conflating them is what makes outages
 * invisible:
 *
 *   GET /health/live   — LIVENESS. 200 while the process can serve requests.
 *                        Must NOT check Mongo: a database blip must not
 *                        trigger an orchestrator killing an otherwise healthy
 *                        process (that converts a recoverable outage into a
 *                        crash-loop).
 *
 *   GET /health/ready  — READINESS. 503 unless this instance can actually
 *                        serve traffic. This is the endpoint a load balancer
 *                        or uptime monitor must poll. It reports Mongo
 *                        connectivity and the graceful-shutdown drain flag.
 *
 *   GET /health        — DIAGNOSTIC (legacy shape, always 200). The detailed
 *                        view for humans. `ok` is honest here: it is true
 *                        only when Mongo is actually connected.
 *
 * Historical bug this file fixes: `ok` was hard-coded to `true` regardless of
 * database state, so a fully disconnected Mongo still answered 200/ok:true.
 * Both the uptime monitor and the frontend `checkHealth()` helper therefore
 * reported a healthy system during a total outage. `ok` is now derived from
 * the real connection state.
 */

// ---------------------------------------------------------------------------
// Dependency probes
// ---------------------------------------------------------------------------

const MONGODB_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

const dbState = () => MONGODB_STATES[mongoose.connection.readyState] ?? "unknown";

const isDbReady = () => mongoose.connection.readyState === 1;

const getSmsBlock = async () => {
  try {
    return await getSmsStatus();
  } catch (err) {
    // The SMS provider being unreachable must not fail the health probe —
    // but it must be visible, so it is reported as an error mode.
    console.error("Health check SMS error:", err);
    return { configured: false, mock: false, mode: "error" };
  }
};

// ---------------------------------------------------------------------------
// GET /health/live
// ---------------------------------------------------------------------------

router.get("/live", (_req, res) => {
  res.status(200).json({
    status: "alive",
    pid: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
    draining: isDraining(),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// GET /health/ready
// ---------------------------------------------------------------------------

router.get("/ready", async (_req, res) => {
  const dbUp = isDbReady();
  const draining = isDraining();
  const ready = dbUp && !draining;

  metrics.dbReady.set({}, dbUp ? 1 : 0);
  metrics.readinessTotal.inc({ result: ready ? "ready" : "not_ready" });

  res.status(ready ? 200 : 503).json({
    ready,
    draining,
    checks: {
      db: { status: dbUp ? "up" : "down", state: dbState() },
      acceptingTraffic: !draining,
    },
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// GET /  (diagnostic, legacy-compatible)
// ---------------------------------------------------------------------------

router.get("/", async (_req, res) => {
  const dbUp = isDbReady();
  const sms = await getSmsBlock();
  const mem = process.memoryUsage();

  // Honest status: `ok` now genuinely means "Mongo is connected".
  // Consumers: scripts/api-smoke.js (HTTP code only) and the frontend
  // `checkHealth()` helper, which shows the online/offline badge.
  const draining = isDraining();
  const ok = dbUp && !draining;

  metrics.dbReady.set({}, dbUp ? 1 : 0);

  res.status(200).json({
    ok,
    status: draining ? "draining" : ok ? "ok" : "degraded",
    db: dbUp ? "up" : "down",
    dbState: dbState(),
    sms,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    environment: process.env.NODE_ENV || "development",
    version: process.env.COMMIT_SHA || "dev",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
