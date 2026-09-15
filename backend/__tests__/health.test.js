const request = require("supertest");
const app = require("../server");

describe("GET /api/health (enhanced)", () => {
  it("returns ok with db, sms, uptime, memory and environment fields", async () => {
    const res = await request(app).get("/api/health").expect(200);

    expect(res.body.ok).toBe(true);
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
    expect(typeof res.body.environment).toBe("string");
  });

  it("is also mounted at the /health alias", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.sms).toBeDefined();
  });
});