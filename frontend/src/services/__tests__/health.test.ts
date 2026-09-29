import { describe, it, expect } from "vitest";
import { classifyHealth, type HealthResponse } from "../health";

describe("health service classification", () => {
  it("treats a missing payload as offline", () => {
    expect(classifyHealth(null)).toBe("offline");
    expect(classifyHealth(undefined)).toBe("offline");
  });

  it("reports online when the database is connected", () => {
    expect(
      classifyHealth({ ok: true, status: "ok", db: "up" } as HealthResponse),
    ).toBe("online");
  });

  it("reports degraded when the API answers but Mongo is disconnected", () => {
    // This is the case the stage-34 backend fix made detectable: previously
    // the endpoint answered ok:true, so the UI showed a healthy site during a
    // full database outage.
    expect(
      classifyHealth({ ok: false, status: "degraded", db: "down" } as HealthResponse),
    ).toBe("degraded");
  });

  it("reports degraded for ok:false even without an explicit db field", () => {
    expect(classifyHealth({ ok: false } as HealthResponse)).toBe("degraded");
  });

  it("reports degraded while the server is draining", () => {
    expect(
      classifyHealth({ ok: false, status: "draining", db: "up" } as HealthResponse),
    ).toBe("degraded");
  });

  it("does not treat a healthy payload as degraded", () => {
    expect(
      classifyHealth({ ok: true, status: "ok", db: "up", uptimeSeconds: 10 }),
    ).toBe("online");
  });
});
