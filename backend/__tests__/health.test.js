const request = require("supertest");
const mongoose = require("mongoose");

process.env.NODE_ENV = "test";
const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";

const app = require("../server");

/**
 * NOTE ON THE `ok` ASSERTION
 * -------------------------
 * This suite previously asserted `expect(res.body.ok).toBe(true)` unconditionally.
 * That assertion encoded the very bug stage 34 fixed: `ok` was hard-coded to
 * `true`, so a completely disconnected MongoDB still reported a healthy
 * system. The expectation below is now self-consistent with the real
 * connection state — which is the property that actually matters.
 *
 * It also waits for the connection to settle before asserting — see `beforeAll`.
 * Under `--runInBand` a neighbouring suite can close the shared connection, and
 * a connect landing *between* the endpoint's read of `readyState` and this
 * file's own read failed the suite for reasons unrelated to the code under test.
 * The assertion itself is unchanged, and therefore just as strict.
 */
describe("GET /api/health (enhanced)", () => {
  beforeAll(async () => {
    // server.js opens its MongoDB connection asynchronously at require() time,
    // and under `--runInBand` an earlier suite may have closed it outright. The
    // assertion below compares the endpoint's read of `readyState` against this
    // file's own read, so the connection has to be *settled* before the request
    // goes out — otherwise a connect landing between the two reads fails the
    // suite for reasons unrelated to the code under test.
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    } else if (mongoose.connection.readyState !== 1) {
      await mongoose.connection.asPromise();
    }
  });

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
