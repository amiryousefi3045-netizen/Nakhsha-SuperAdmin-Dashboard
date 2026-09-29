"use strict";

/**
 * Nakhsha — Process lifecycle / graceful-shutdown state
 * ======================================================
 *
 * A single shared flag describing whether this process is draining.
 *
 * Why this exists: on SIGTERM the correct order is
 *   1. flip to "draining"  → readiness starts returning 503,
 *   2. keep serving in-flight requests,
 *   3. close the HTTP listener and the Mongo connection,
 *   4. exit.
 *
 * Without step 1 the load balancer keeps sending traffic to a process that
 * is about to stop accepting connections, and every deploy becomes a burst of
 * connection-refused errors. The flag lives in its own module so that both
 * the health route and the shutdown handler read the same source of truth
 * (and so it can be unit-tested without booting the server).
 */

let draining = false;
let drainStartedAt = null;

/** Flip the drain flag. Returns the new value. */
function setDraining(value, at = null) {
  draining = Boolean(value);
  drainStartedAt = draining ? at ?? new Date() : null;
  return draining;
}

function isDraining() {
  return draining;
}

function drainStartedAtMs() {
  return drainStartedAt ? drainStartedAt.getTime() : null;
}

/** Test helper — restores the pristine state. */
function resetLifecycle() {
  draining = false;
  drainStartedAt = null;
}

module.exports = {
  setDraining,
  isDraining,
  drainStartedAtMs,
  resetLifecycle,
};
