#!/usr/bin/env node
"use strict";

/**
 * Nakhsha — External uptime probe (stage 34, closes P0-03)
 * =======================================================
 *
 * The application cannot detect its own outage: by definition, the process
 * that would notice is the process that is down. Uptime monitoring therefore
 * has to originate from the outside. This script is the outside — point cron
 * (or a systemd timer, or a Kubernetes CronJob) at it and alert on the exit
 * code.
 *
 * It deliberately probes the READINESS endpoint, not the diagnostic one.
 * A process can be alive with its database disconnected; only
 * `/health/ready` distinguishes "up" from "up but unable to serve", and that
 * is the state a user actually cares about.
 *
 * Usage:
 *   UPTIME_URL=https://api.example.com/health/ready npm run uptime:check
 *
 * EXIT CODES
 *   0  healthy            1  probe failed (network error, timeout, non-2xx)
 */

const EXIT = { OK: 0, FAILED: 1 };

const DEFAULT_TIMEOUT_MS = 5000;

const isHealthyStatus = (status) => status >= 200 && status < 300;

/**
 * Perform one probe.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl] injectable for tests
 * @returns {Promise<{ ok: boolean, status: number|null, body: object|null, error: string|null, durationMs: number }>}
 */
async function probe(url, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;

  if (typeof doFetch !== "function") {
    return {
      ok: false,
      status: null,
      body: null,
      error: "global fetch is unavailable (Node 18+ required)",
      durationMs: 0,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await doFetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      // A non-JSON body is not itself a failure; the status code decides.
    }

    return {
      ok: isHealthyStatus(response.status),
      status: response.status,
      body,
      error: isHealthyStatus(response.status) ? null : `HTTP ${response.status}`,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      body: null,
      // AbortError means the timeout fired — say so, it is a different
      // operational problem than a refused connection.
      error: err.name === "AbortError" ? `timeout after ${timeoutMs}ms` : err.message,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main(env = process.env) {
  const url = env.UPTIME_URL;
  if (!url) {
    console.error("UPTIME_URL is not set — nothing to probe.");
    return EXIT.FAILED;
  }

  const result = await probe(url, {
    timeoutMs: Number(env.UPTIME_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  });

  // Structured single-line output so log shippers and alert rules can parse it.
  console.log(
    JSON.stringify({
      event: "uptime_probe",
      url,
      ok: result.ok,
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
      checks: result.body?.checks ?? null,
      timestamp: new Date().toISOString(),
    }),
  );

  return result.ok ? EXIT.OK : EXIT.FAILED;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(JSON.stringify({ event: "uptime_probe", ok: false, error: err.message }));
      process.exit(EXIT.FAILED);
    });
}

module.exports = { EXIT, isHealthyStatus, probe, main };
