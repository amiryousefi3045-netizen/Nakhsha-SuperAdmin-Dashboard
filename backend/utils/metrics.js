"use strict";

/**
 * Nakhsha — Metrics Registry (Prometheus text exposition format)
 * ===============================================================
 * Zero-dependency implementation of the three Prometheus metric types
 * (counter / gauge / histogram) so that production observability does not
 * require pulling `prom-client` (and its transitive deps) into the runtime
 * image for the sake of a few hundred lines of arithmetic.
 *
 * Two design rules matter far more than the exposition format itself:
 *
 * 1. CARDINALITY IS A SECURITY BOUNDARY, NOT A STYLE CHOICE.
 *    Every distinct label combination is a distinct time series held in
 *    memory forever. An endpoint that labels metrics with `req.originalUrl`
 *    lets an attacker mint unbounded series with a trivial GET loop:
 *
 *        for i in $(seq 1 1000000); do curl /api/x/$i; done
 *
 *    That is a remote memory-exhaustion DoS that needs no auth, no bug in
 *    business logic, and no unusual traffic pattern. Therefore:
 *      - route labels come from the ROUTE TEMPLATE (`req.route.path`,
 *        e.g. `/seller/returns/:id`), never from the raw URL;
 *      - unmatched routes collapse to a single `unmatched` series;
 *      - every metric additionally hard-caps its series count and folds the
 *        overflow into one `__overflow__` series.
 *
 * 2. METRICS MUST NEVER CARRY PII OR HIGH-ENTROPY IDENTIFIERS.
 *    No user ids, phone numbers, emails, tokens, or raw request paths.
 *    Anything that varies per-user is a cardinality bomb and a privacy
 *    incident at the same time.
 *
 * The registry is process-local, which is the correct scope for a single
 * Node process. Horizontal scaling is handled by the scraper (each replica
 * is a separate target); see docs/runbooks/OBSERVABILITY.md.
 */

// ---------------------------------------------------------------------------
// Exposition helpers
// ---------------------------------------------------------------------------

/** Prometheus label values must escape backslash, double-quote and newline. */
const escapeLabelValue = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

const EMPTY_LABELS = Object.freeze({});

/**
 * Serialise a label set into `{a="1",b="2"}`.
 * Label order is derived from the metric's declared labelNames (not from
 * Object.keys of the value object) so the output is byte-stable, which keeps
 * scraper diffs and snapshot assertions meaningful.
 */
const formatLabels = (labelNames, labels) => {
  if (labelNames.length === 0) return "";
  const parts = labelNames.map(
    (name) => `${name}="${escapeLabelValue(labels?.[name] ?? "")}"`,
  );
  return `{${parts.join(",")}}`;
};

/**
 * Append one more label pair to an already-rendered label set.
 *
 * Histogram buckets need a `le` label, and the cardinality-overflow marker
 * needs a `__overflow__` label, yet neither appears in the metric's declared
 * `labelNames`. Rendering through `formatLabels` alone would silently drop
 * them, so they are appended to the rendered text directly.
 *
 * @param {string} base rendered label set, e.g. `{method="GET"}` or "".
 * @param {string} name
 * @param {unknown} value
 * @returns {string}
 */
const appendLabel = (base, name, value) => {
  const pair = `${name}="${escapeLabelValue(value)}"`;
  if (!base) return `{${pair}}`;
  return `${base.slice(0, -1)},${pair}}`;
};

// ---------------------------------------------------------------------------
// Series store shared by all metric types
// ---------------------------------------------------------------------------

/**
 * A bounded key→value map keyed by the rendered label set.
 *
 * `limit` exists purely as a memory-exhaustion guard (see rule 1 above).
 * Once the limit is reached, further distinct label sets are folded into a
 * single well-known `__overflow__` series so that:
 *   - total counts stay correct (an operator still sees the traffic);
 *   - memory stays bounded (the process cannot be wedged);
 *   - the degradation is visible in the output instead of silent.
 */
class SeriesStore {
  constructor(limit) {
    this.limit = limit;
    this.series = new Map();
    this.overflowCount = 0;
  }

  /**
   * Resolve (creating if needed) the record for a label set.
   *
   * @returns {{ labels: object, overflow: boolean }}
   */
  resolve(labelNames, labels) {
    const key = formatLabels(labelNames, labels);

    const existing = this.series.get(key);
    if (existing) return existing;

    if (this.series.size >= this.limit) {
      this.overflowCount += 1;
      const overflowKey = '{__overflow__="true"}';
      let overflow = this.series.get(overflowKey);
      if (!overflow) {
        overflow = {
          labels: { __overflow__: "true" },
          labelText: overflowKey,
          overflow: true,
        };
        this.series.set(overflowKey, overflow);
      }
      return overflow;
    }

    const record = {
      labels: { ...(labels ?? EMPTY_LABELS) },
      // Cache the rendered form so metric renderers never have to re-derive it
      // (and so the overflow marker survives rendering).
      labelText: key,
      overflow: false,
    };
    this.series.set(key, record);
    return record;
  }

  values() {
    return [...this.series.values()];
  }

  clear() {
    this.series.clear();
    this.overflowCount = 0;
  }
}

// ---------------------------------------------------------------------------
// Metric types
// ---------------------------------------------------------------------------

const assertName = (name, type) => {
  if (typeof name !== "string" || !/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) {
    throw new TypeError(
      `Invalid metric name for ${type}: ${String(name)} (must match /^[a-zA-Z_:][a-zA-Z0-9_:]*$/)`,
    );
  }
};

class Counter {
  constructor({ name, help, labelNames = [], limit = 500 }) {
    assertName(name, "counter");
    this.name = name;
    this.help = help;
    this.type = "counter";
    this.labelNames = labelNames;
    this.store = new SeriesStore(limit);
  }

  /** @param {number} delta must be >= 0; counters only ever increase. */
  inc(labels = EMPTY_LABELS, delta = 1) {
    if (!Number.isFinite(delta) || delta < 0) {
      throw new TypeError(
        `Counter ${this.name} can only be incremented by a non-negative finite delta, got ${delta}`,
      );
    }
    const record = this.store.resolve(this.labelNames, labels);
    record.value = (record.value ?? 0) + delta;
    return record.value;
  }

  reset() {
    for (const record of this.store.values()) delete record.value;
  }

  render() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const record of this.store.values()) {
      lines.push(`${this.name}${record.labelText} ${record.value ?? 0}`);
    }
    if (this.store.overflowCount > 0) {
      lines.push(
        `# WARNING nakhsha_metrics_series_overflow_total{metric="${this.name}"} ${this.store.overflowCount} label sets were folded into __overflow__ (cardinality cap ${this.store.limit})`,
      );
    }
    return lines;
  }
}

class Gauge {
  constructor({ name, help, labelNames = [], limit = 500 }) {
    assertName(name, "gauge");
    this.name = name;
    this.help = help;
    this.type = "gauge";
    this.labelNames = labelNames;
    this.store = new SeriesStore(limit);
  }

  set(labels = EMPTY_LABELS, value) {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Gauge ${this.name} requires a finite value, got ${value}`);
    }
    this.store.resolve(this.labelNames, labels).value = value;
  }

  inc(labels = EMPTY_LABELS, delta = 1) {
    const record = this.store.resolve(this.labelNames, labels);
    record.value = (record.value ?? 0) + delta;
    return record.value;
  }

  dec(labels = EMPTY_LABELS, delta = 1) {
    return this.inc(labels, -delta);
  }

  reset() {
    this.store.clear();
  }

  render() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const record of this.store.values()) {
      lines.push(`${this.name}${record.labelText} ${record.value ?? 0}`);
    }
    if (this.store.overflowCount > 0) {
      lines.push(
        `# WARNING nakhsha_metrics_series_overflow_total{metric="${this.name}"} ${this.store.overflowCount} label sets were folded into __overflow__ (cardinality cap ${this.store.limit})`,
      );
    }
    return lines;
  }
}

/**
 * Histogram with cumulative Prometheus buckets.
 * Buckets are upper bounds in seconds and MUST be declared in ascending order.
 */
class Histogram {
  constructor({ name, help, labelNames = [], buckets, limit = 500 }) {
    assertName(name, "histogram");
    if (!Array.isArray(buckets) || buckets.length === 0) {
      throw new TypeError(`Histogram ${this.name} requires a non-empty buckets array`);
    }
    const sorted = [...buckets].sort((a, b) => a - b);
    if (sorted.some((b) => !Number.isFinite(b) || b < 0)) {
      throw new TypeError(`Histogram ${this.name} buckets must be finite and non-negative`);
    }
    this.name = name;
    this.help = help;
    this.type = "histogram";
    this.labelNames = labelNames;
    this.buckets = sorted;
    this.store = new SeriesStore(limit);
  }

  observe(labels = EMPTY_LABELS, value) {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(
        `Histogram ${this.name} requires a finite, non-negative observation, got ${value}`,
      );
    }
    const record = this.store.resolve(this.labelNames, labels);
    if (!record.bucketCounts) {
      record.bucketCounts = new Array(this.buckets.length).fill(0);
      record.sum = 0;
      record.count = 0;
    }
    for (let i = 0; i < this.buckets.length; i += 1) {
      if (value <= this.buckets[i]) record.bucketCounts[i] += 1;
    }
    record.sum += value;
    record.count += 1;
  }

  reset() {
    this.store.clear();
  }

  render() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const record of this.store.values()) {
      for (let i = 0; i < this.buckets.length; i += 1) {
        lines.push(
          `${this.name}_bucket${appendLabel(record.labelText, "le", this.buckets[i])} ${record.bucketCounts?.[i] ?? 0}`,
        );
      }
      // Prometheus requires the +Inf bucket to always be present.
      lines.push(
        `${this.name}_bucket${appendLabel(record.labelText, "le", "+Inf")} ${record.count ?? 0}`,
      );
      lines.push(`${this.name}_sum${record.labelText} ${record.sum ?? 0}`);
      lines.push(`${this.name}_count${record.labelText} ${record.count ?? 0}`);
    }
    if (this.store.overflowCount > 0) {
      lines.push(
        `# WARNING nakhsha_metrics_series_overflow_total{metric="${this.name}"} ${this.store.overflowCount} label sets were folded into __overflow__ (cardinality cap ${this.store.limit})`,
      );
    }
    return lines;
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Latency buckets in seconds — tuned for a JSON API, not for batch jobs. */
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

class Registry {
  constructor() {
    this.metrics = new Map();
  }

  register(metric) {
    if (this.metrics.has(metric.name)) {
      throw new Error(`Metric ${metric.name} is already registered`);
    }
    this.metrics.set(metric.name, metric);
    return metric;
  }

  counter(spec) {
    return this.register(new Counter(spec));
  }

  gauge(spec) {
    return this.register(new Gauge(spec));
  }

  histogram(spec) {
    return this.register(new Histogram(spec));
  }

  get(name) {
    return this.metrics.get(name);
  }

  reset() {
    for (const metric of this.metrics.values()) metric.reset();
  }

  /**
   * Render the whole registry in Prometheus text exposition format.
   * @returns {string}
   */
  render() {
    const lines = [];
    for (const metric of this.metrics.values()) lines.push(...metric.render());
    return `${lines.join("\n")}\n`;
  }
}

// ---------------------------------------------------------------------------
// Application registry
// ---------------------------------------------------------------------------

const registry = new Registry();

/**
 * Distinct routes tracked per metric. The cap is deliberately tight: the
 * application has ~16 seller pages and ~20 API route groups, so anything
 * approaching this number means labels are being derived from raw URLs.
 */
const ROUTE_SERIES_LIMIT = 300;

const httpRequestsTotal = registry.counter({
  name: "nakhsha_http_requests_total",
  help: "Total HTTP requests processed, by route template, method and response status.",
  labelNames: ["method", "route", "status"],
  limit: ROUTE_SERIES_LIMIT,
});

const httpRequestDuration = registry.histogram({
  name: "nakhsha_http_request_duration_seconds",
  help: "HTTP request duration in seconds, by route template and method.",
  labelNames: ["method", "route"],
  buckets: DEFAULT_BUCKETS,
  limit: ROUTE_SERIES_LIMIT,
});

const httpInFlight = registry.gauge({
  name: "nakhsha_http_requests_in_flight",
  help: "Number of HTTP requests currently being processed.",
  labelNames: [],
  limit: 1,
});

const httpErrorsTotal = registry.counter({
  name: "nakhsha_http_errors_total",
  help: "Total HTTP responses with a 5xx status, by route template.",
  labelNames: ["method", "route"],
  limit: ROUTE_SERIES_LIMIT,
});

const processStartTime = registry.gauge({
  name: "nakhsha_process_start_time_seconds",
  help: "Start time of the process since the Unix epoch.",
  labelNames: [],
  limit: 1,
});

const dbReady = registry.gauge({
  name: "nakhsha_db_ready",
  help: "1 when the MongoDB connection is established, 0 otherwise.",
  labelNames: [],
  limit: 1,
});

const readinessTotal = registry.counter({
  name: "nakhsha_readiness_probes_total",
  help: "Readiness probe results.",
  labelNames: ["result"],
  limit: 2,
});

processStartTime.set(EMPTY_LABELS, Math.floor(Date.now() / 1000) - Math.floor(process.uptime()));
dbReady.set(EMPTY_LABELS, 0);

// ---------------------------------------------------------------------------
// Route labelling — the cardinality firewall
// ---------------------------------------------------------------------------

const HEX_ID = /^[0-9a-f]{12,}$/i;
const NUMERIC_ID = /^\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalise one path segment to a bounded placeholder.
 *
 * Any segment that is not a clearly-static word is replaced with `:id`. This
 * means that even if a caller bypasses the route-template path (a 404, a
 * mounted sub-app quirk, a hand-written route), the segment cannot become a
 * new time series.
 */
const normaliseSegment = (segment) => {
  if (!segment) return segment;
  if (NUMERIC_ID.test(segment) || UUID.test(segment) || HEX_ID.test(segment)) return ":id";
  if (segment.length > 24) return ":id";
  return segment.toLowerCase();
};

/**
 * Derive a LOW-CARDINALITY route label for a request.
 *
 * Order of preference:
 *   1. `req.route.path` — the Express route template (`:id` already
 *      parameterised). This is the correct, bounded source.
 *   2. A normalised `req.baseUrl + req.path` with every identifier-looking
 *      segment replaced by `:id`.
 *   3. `"unmatched"` — a single series for everything else.
 *
 * `req.originalUrl` is never used: it contains the raw, unbounded path.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
const routeLabel = (req) => {
  // `req.route` is only populated once a route has matched, and its `path` is
  // the template. Nested routers put the mount path in `req.baseUrl`.
  const template = req?.route?.path;
  if (typeof template === "string" && template) {
    const base = typeof req.baseUrl === "string" ? req.baseUrl : "";
    if (template === "/") return base || "/";
    return `${base}${template}`.replace(/\/{2,}/g, "/");
  }

  const path = typeof req?.path === "string" ? req.path : "";
  if (!path) return "unmatched";

  const normalised = path
    .split("/")
    .map(normaliseSegment)
    .join("/")
    .replace(/\/{2,}/g, "/");

  return normalised.length > 120 ? "unmatched" : normalised;
};

// ---------------------------------------------------------------------------
// HTTP instrumentation middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware recording request counts, latency and 5xx totals.
 *
 * Mount this BEFORE the routers so every request is observed, but AFTER the
 * `responseEnricher` if you want the final status code. It is safe to mount
 * globally; the metrics endpoint itself is excluded from observation so that
 * scraping cannot inflate the very series it reads.
 *
 * @type {import("express").RequestHandler}
 */
function httpMetricsMiddleware(req, res, next) {
  if (req.path === "/metrics" || req.path?.endsWith("/metrics")) {
    return next();
  }

  const route = routeLabel(req);
  const method = String(req.method || "GET").toUpperCase();
  const startNs = process.hrtime.bigint();

  httpInFlight.inc(EMPTY_LABELS, 1);

  let recorded = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    httpInFlight.dec(EMPTY_LABELS, 1);

    const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
    const status = String(res.statusCode || 0);

    try {
      httpRequestsTotal.inc({ method, route, status });
      httpRequestDuration.observe({ method, route }, durationSeconds);
      if (res.statusCode >= 500) httpErrorsTotal.inc({ method, route });
    } catch {
      // Metrics must never break the request path. If the registry is
      // misconfigured the request still has to succeed.
    }
  };

  res.on("finish", record);
  // A client that aborts mid-response never emits "finish"; without this the
  // in-flight gauge would leak upwards on every aborted upload.
  res.on("close", record);

  return next();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  registry,
  Registry,
  Counter,
  Gauge,
  Histogram,
  DEFAULT_BUCKETS,
  escapeLabelValue,
  formatLabels,
  appendLabel,
  routeLabel,
  httpMetricsMiddleware,
  metrics: {
    httpRequestsTotal,
    httpRequestDuration,
    httpInFlight,
    httpErrorsTotal,
    processStartTime,
    dbReady,
    readinessTotal,
  },
};
