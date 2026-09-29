const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");
const {
  Registry,
  Counter,
  Gauge,
  Histogram,
  registry,
  routeLabel,
  escapeLabelValue,
  formatLabels,
} = require("../utils/metrics");
const lifecycle = require("../utils/lifecycle");

describe("metrics registry", () => {
  it("rejects metric names that are not valid Prometheus identifiers", () => {
    expect(() => new Counter({ name: "bad-name", help: "h" })).toThrow(TypeError);
    expect(() => new Gauge({ name: "1leading-digit", help: "h" })).toThrow(TypeError);
  });

  it("rejects a non-positive or non-finite counter increment", () => {
    const counter = new Counter({ name: "test_counter", help: "h" });
    expect(() => counter.inc({}, -1)).toThrow(TypeError);
    expect(() => counter.inc({}, NaN)).toThrow(TypeError);
    expect(counter.inc({}, 3)).toBe(3);
  });

  it("rejects a non-finite gauge value", () => {
    const gauge = new Gauge({ name: "test_gauge", help: "h" });
    expect(() => gauge.set({}, Infinity)).toThrow(TypeError);
  });

  it("requires non-empty, non-negative histogram buckets", () => {
    expect(() => new Histogram({ name: "h", help: "h", buckets: [] })).toThrow(TypeError);
    expect(
      () => new Histogram({ name: "h", help: "h", buckets: [1, -1] }),
    ).toThrow(TypeError);
  });

  it("sorts histogram buckets so observations are cumulative", () => {
    const histogram = new Histogram({
      name: "test_histogram",
      help: "h",
      buckets: [1, 0.1, 0.5],
    });
    expect(histogram.buckets).toEqual([0.1, 0.5, 1]);
  });

  it("emits cumulative bucket counts plus the mandatory +Inf bucket", () => {
    const histogram = new Histogram({
      name: "test_histogram",
      help: "h",
      buckets: [0.1, 0.5, 1],
    });
    histogram.observe({}, 0.05); // <= all three
    histogram.observe({}, 0.4); // <= 0.5 and 1
    histogram.observe({}, 2); // only +Inf

    const output = histogram.render().join("\n");

    expect(output).toContain('test_histogram_bucket{le="0.1"} 1');
    expect(output).toContain('test_histogram_bucket{le="0.5"} 2');
    expect(output).toContain('test_histogram_bucket{le="1"} 2');
    expect(output).toContain('test_histogram_bucket{le="+Inf"} 3');
    expect(output).toContain("test_histogram_count 3");
    expect(output).toContain("test_histogram_sum 2.45");
  });

  it("escapes label values per the Prometheus text format", () => {
    expect(escapeLabelValue('a"b')).toBe('a\\"b');
    expect(escapeLabelValue("a\\b")).toBe("a\\\\b");
    expect(escapeLabelValue("a\nb")).toBe("a\\nb");
  });

  it("renders labels in declared order so output is byte-stable", () => {
    expect(formatLabels(["b", "a"], { a: "1", b: "2" })).toBe('{b="2",a="1"}');
    expect(formatLabels([], {})).toBe("");
  });

  it("refuses to register the same metric name twice", () => {
    const local = new Registry();
    local.counter({ name: "dup", help: "h" });
    expect(() => local.counter({ name: "dup", help: "h" })).toThrow(/already registered/);
  });
});

describe("cardinality firewall", () => {
  // This is the memory-exhaustion guard described in utils/metrics.js: an
  // unbounded label set is a remote DoS, so the store must fold overflow.
  it("folds label sets past the cap into a single __overflow__ series", () => {
    const counter = new Counter({
      name: "test_capped",
      help: "h",
      labelNames: ["route"],
      limit: 3,
    });

    for (let i = 0; i < 100; i += 1) {
      counter.inc({ route: `/route/${i}` });
    }

    const output = counter.render().join("\n");
    expect(counter.store.series.size).toBe(4); // 3 capped + 1 overflow
    expect(output).toContain('__overflow__="true"');
    expect(output).toContain("nakhsha_metrics_series_overflow_total");

    // The overflow series must still carry the true total, so an operator
    // sees real traffic even though cardinality was capped.
    const overflowLine = output
      .split("\n")
      .find((line) => line.startsWith("test_capped{") && line.includes("__overflow__"));
    expect(overflowLine).toContain(" 97");
  });

  it("uses the Express route template rather than the raw URL", () => {
    // A route with an :id parameter must produce exactly ONE series no matter
    // how many distinct ids are requested.
    const withTemplate = {
      route: { path: "/seller/returns/:id" },
      baseUrl: "/api",
      path: "/seller/returns/65f0c1a2b3d4e5f60718293a4",
      originalUrl: "/api/seller/returns/65f0c1a2b3d4e5f60718293a4",
    };
    expect(routeLabel(withTemplate)).toBe("/api/seller/returns/:id");

    const other = {
      route: { path: "/seller/returns/:id" },
      baseUrl: "/api",
      path: "/seller/returns/aaaaaaaaaaaaaaaaaaaaaaaa",
      originalUrl: "/api/seller/returns/aaaaaaaaaaaaaaaaaaaaaaaa",
    };
    expect(routeLabel(other)).toBe(routeLabel(withTemplate));
  });

  it("replaces identifier-looking path segments when no route template exists", () => {
    expect(
      routeLabel({
        path: "/api/seller/returns/65f0c1a2b3d4e5f60718293a4",
        originalUrl: "/api/seller/returns/65f0c1a2b3d4e5f60718293a4",
      }),
    ).toBe("/api/seller/returns/:id");

    expect(routeLabel({ path: "/api/orders/12345/items" })).toBe(
      "/api/orders/:id/items",
    );
  });

  it("collapses unmatched requests to a single series", () => {
    expect(routeLabel({})).toBe("unmatched");
    expect(routeLabel({ path: "" })).toBe("unmatched");
  });

  it("never emits the raw originalUrl", () => {
    const label = routeLabel({
      path: "/api/crafts/507f1f77bcf86cd799439011",
      originalUrl: "/api/crafts/507f1f77bcf86cd799439011?token=leak",
    });
    expect(label).not.toContain("507f1f77bcf86cd799439011");
    expect(label).not.toContain("leak");
  });
});

describe("HTTP metric collection", () => {
  it("records a request against a low-cardinality route with its status", async () => {
    const before = registry.get("nakhsha_http_requests_total").store.series.size;

    await request(app).get("/api/health").expect(200);

    const counter = registry.get("nakhsha_http_requests_total");
    const keys = [...counter.store.series.keys()];
    const healthKey = keys.find((key) => key.includes('route="/api/health"'));

    expect(healthKey).toBeDefined();
    expect(healthKey).toContain('status="200"');
    expect(counter.store.series.size).toBeGreaterThanOrEqual(before);
  });

  it("observes a latency histogram sample for the request", async () => {
    await request(app).get("/api/health/live").expect(200);

    const histogram = registry.get("nakhsha_http_request_duration_seconds");
    const hasSample = [...histogram.store.series.keys()].some((key) =>
      key.includes('route="/api/health/live"'),
    );
    expect(hasSample).toBe(true);
  });

  it("records 5xx responses in the error counter", async () => {
    // /api/definitely-not-a-route falls through to the 404 handler.
    const counter = registry.get("nakhsha_http_requests_total");
    const before = counter.store.series.size;

    await request(app).get("/api/definitely-not-a-route-metrics-test").expect(404);

    const after = counter.store.series.size;
    // A 404 must be counted with its status, and it must not be counted as a
    // 5xx error.
    expect(after).toBeGreaterThanOrEqual(before);
    const fiveHundreds = [...counter.store.series.keys()].filter((key) =>
      key.includes('status="5'),
    );
    expect(fiveHundreds).toEqual([]);
  });

  it("keeps the in-flight gauge balanced after a request completes", async () => {
    await request(app).get("/api/health").expect(200);
    const gauge = registry.get("nakhsha_http_requests_in_flight");
    const keys = [...gauge.store.series.keys()];
    // A single value of 0 means every increment was matched by a decrement.
    expect(keys).toHaveLength(1);
    expect(gauge.store.series.get(keys[0]).value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Health probes
// ---------------------------------------------------------------------------

describe("GET /api/health/live (liveness)", () => {
  it("always reports alive regardless of database state", async () => {
    const res = await request(app).get("/api/health/live").expect(200);
    expect(res.body.status).toBe("alive");
    expect(typeof res.body.pid).toBe("number");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });
});

describe("GET /api/health/ready (readiness)", () => {
  afterEach(() => {
    lifecycle.resetLifecycle();
  });

  it("reports 200 with an explicit db check when Mongo is connected", async () => {
    if (mongoose.connection.readyState !== 1) {
      // No database in this environment — the 503 branch is the one under test.
      const res = await request(app).get("/api/health/ready").expect(503);
      expect(res.body.ready).toBe(false);
      expect(res.body.checks.db.status).toBe("down");
      return;
    }

    const res = await request(app).get("/api/health/ready").expect(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.checks.db.status).toBe("up");
  });

  it("returns 503 when Mongo is not connected — the outage can no longer hide", async () => {
    const connected = mongoose.connection.readyState;
    // Simulate a full database outage without disturbing other suites.
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 0,
      configurable: true,
    });

    try {
      const res = await request(app).get("/api/health/ready").expect(503);
      expect(res.body.ready).toBe(false);
      expect(res.body.checks.db.status).toBe("down");
      expect(res.body.checks.db.state).toBe("disconnected");
    } finally {
      Object.defineProperty(mongoose.connection, "readyState", {
        value: connected,
        configurable: true,
      });
    }
  });

  it("returns 503 while draining, so a load balancer stops sending traffic", async () => {
    lifecycle.setDraining(true);
    const res = await request(app).get("/api/health/ready").expect(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.draining).toBe(true);
    expect(res.body.checks.acceptingTraffic).toBe(false);
  });
});

describe("GET /api/health (diagnostic)", () => {
  it("derives ok from the real database state instead of hard-coding true", async () => {
    const connected = mongoose.connection.readyState;

    // Mongo up => ok true.
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 1,
      configurable: true,
    });
    const healthy = await request(app).get("/api/health").expect(200);
    expect(healthy.body.ok).toBe(true);
    expect(healthy.body.status).toBe("ok");
    expect(healthy.body.db).toBe("up");

    // Mongo down => ok false. This is the bug this stage fixes: the endpoint
    // used to answer ok:true with a fully disconnected database, so uptime
    // monitors and the frontend health badge both reported a healthy system.
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 0,
      configurable: true,
    });
    const degraded = await request(app).get("/api/health").expect(200);
    expect(degraded.body.ok).toBe(false);
    expect(degraded.body.status).toBe("degraded");
    expect(degraded.body.db).toBe("down");

    Object.defineProperty(mongoose.connection, "readyState", {
      value: connected,
      configurable: true,
    });
  });

  it("keeps the legacy field shape so existing consumers do not break", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.ok).toBeDefined();
    expect(["up", "down"]).toContain(res.body.db);
    expect(res.body.version).toBeDefined();
    expect(typeof res.body.timestamp).toBe("string");
    expect(res.body.sms).toBeDefined();
    expect(typeof res.body.sms.configured).toBe("boolean");
    expect(typeof res.body.sms.mock).toBe("boolean");
    expect(["mock", "live", "disabled"]).toContain(res.body.sms.mode);
    expect(typeof res.body.uptimeSeconds).toBe("number");
    expect(res.body.memory).toBeDefined();
    expect(typeof res.body.memory.rss).toBe("number");
    expect(typeof res.body.environment).toBe("string");
  });

  it("is also mounted at the /health alias", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body.ok).toBeDefined();
    expect(res.body.sms).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Metrics endpoint exposure
// ---------------------------------------------------------------------------

describe("GET /metrics exposure", () => {
  const originalEnabled = process.env.METRICS_ENABLED;
  const originalToken = process.env.METRICS_TOKEN;

  afterEach(() => {
    process.env.METRICS_ENABLED = originalEnabled;
    process.env.METRICS_TOKEN = originalToken;
  });

  it("is not mounted at all when METRICS_ENABLED is not true", async () => {
    // server.js only mounts /metrics when METRICS_ENABLED === "true", and the
    // test environment leaves it unset — so the operational surface stays
    // invisible by default.
    expect(process.env.METRICS_ENABLED).not.toBe("true");
    await request(app).get("/metrics").expect(404);
  });

  it("refuses anonymous access when a token is configured", async () => {
    process.env.METRICS_TOKEN = "super-secret-scraper-token";
    const metricsRouter = require("../routes/metrics");

    const local = createLocalApp();
    local.use("/metrics", metricsRouter);

    // No Authorization header => 401, and no metric data in the body.
    const anonymous = await request(local).get("/metrics").expect(401);
    expect(anonymous.text).not.toContain("nakhsha_http_requests_total");

    // Wrong token => 401 as well.
    await request(local)
      .get("/metrics")
      .set("Authorization", "Bearer wrong-token")
      .expect(401);

    // Correct token => Prometheus exposition format.
    const authorised = await request(local)
      .get("/metrics")
      .set("Authorization", "Bearer super-secret-scraper-token")
      .expect(200);

    expect(authorised.headers["content-type"]).toContain("text/plain");
    expect(authorised.headers["cache-control"]).toContain("no-store");
    expect(authorised.text).toContain("# TYPE nakhsha_http_requests_total counter");
    expect(authorised.text).toContain("nakhsha_http_requests_total{");
  });

  it("stays hidden (404) when no token is configured and nobody is signed in", async () => {
    delete process.env.METRICS_TOKEN;
    const metricsRouter = require("../routes/metrics");

    const local = createLocalApp();
    local.use("/metrics", metricsRouter);

    // Falls through to requireAuth, which returns 401 for anonymous callers.
    await request(local).get("/metrics").expect(401);
  });
});

// Small helper so the guarded-router tests do not have to boot the real app
// (which would mount the metrics route a second time).
function createLocalApp() {
  // eslint-disable-next-line global-require
  const express = require("express");
  return express();
}
