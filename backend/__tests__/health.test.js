const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");

/**
 * NOTE ON THE `ok` ASSERTION
 * -------------------------
 * This suite previously asserted `expect(res.body.ok).toBe(true)` unconditionally.
 * That assertion encoded the very bug stage 34 fixed: `ok` was hard-coded to
 * `true`, so a completely disconnected MongoDB still reported a healthy
 * system. The expectation below is now self-consistent with the real
 * connection state — which is the property that actually matters.
 */
describe("GET /api/health (enhanced)", () => {
  it("reports ok truthfully and keeps the legacy field shape", async () => {
    const res = await request(app).get("/api/health").expect(200);

    const dbUp = mongoose.connection.readyState === 1;

    // Truthful, not hard-coded.
    expect(res.body.ok).toBe(dbUp);
    expect(res.body.db).toBe(dbUp ? "up" : "down");
    expect(["ok", "degraded", "draining"]).toContain(res.body.status);

    expect(["up", "down"]).toContain(res.body.db);
    expect(res.body.version).toBeDefined();
    expect(typeof res.body.timestamp).toBe("string");

    // ── SMS status block ────────────────────────────────────────────────
    expect(res.body.sms).toBeDefined();
    expect(typeof res.body.sms.configured).toBe("boolean");
    expect(typeof res.body.sms.mock).toBe("boolean");
    expect(["mock", "live", "disabled"]).toContain(res.body.sms.mode);
    expect(typeof res.body.sms.from).toBe("string");
    expect(typeof res.body.sms.toFormat).toBe("string");

    // ── Process / environment ───────────────────────────────────────────
    expect(typeof res.body.uptimeSeconds).toBe("number");
    expect(res.body.memory).toBeDefined();
    expect(typeof res.body.memory.rss).toBe("number");
    expect(typeof res.body.memory.heapUsed).toBe("number");
    expect(typeof res.body.memory.heapTotal).toBe("number");
    expect(typeof res.body.environment).toBe("string");
  });

  it("is also mounted at the /health alias", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body.ok).toBe(mongoose.connection.readyState === 1);
    expect(res.body.sms).toBeDefined();
  });
});
