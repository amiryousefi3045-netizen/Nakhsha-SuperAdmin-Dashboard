const { phoneDigest, networkOf, digest, normalisePhone } = require("../utils/pii");
const validateEnv = require("../config/env");

describe("pii: phone digests", () => {
  it("never returns the original number", () => {
    const phone = "09123456789";
    const hashed = phoneDigest(phone);
    expect(hashed).not.toContain(phone);
    expect(hashed).not.toContain("09123456789");
    expect(hashed).toHaveLength(12);
  });

  it("is stable for the same number so log lines remain correlatable", () => {
    expect(phoneDigest("09123456789")).toBe(phoneDigest("09123456789"));
  });

  it("normalises formatting so variants of one number hash identically", () => {
    const a = phoneDigest("0912 345 6789");
    const b = phoneDigest("0912-345-6789");
    const c = phoneDigest("(0912) 345 6789");
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("produces different digests for different numbers", () => {
    expect(phoneDigest("09123456789")).not.toBe(phoneDigest("09123456788"));
  });

  it("returns an empty string for empty input", () => {
    expect(phoneDigest("")).toBe("");
    expect(phoneDigest(undefined)).toBe("");
    expect(phoneDigest(null)).toBe("");
  });

  it("domain-separates digests so one value cannot be correlated across contexts", () => {
    // The same string used as a user id and as a phone number must not collide.
    expect(digest("12345", "phone")).not.toBe(digest("12345", "user"));
  });

  it("normalises Iranian national and international formats to one digest", () => {
    // Same person, two notations — they must correlate.
    const national = phoneDigest("09123456789");
    expect(phoneDigest("+989123456789")).toBe(national);
    expect(phoneDigest("00989123456789")).toBe(national);
    expect(phoneDigest("0912 345 6789")).toBe(national);
    expect(phoneDigest("0912-345-6789")).toBe(national);
  });

  it("normalises away formatting characters", () => {
    expect(normalisePhone("+98 (912) 345-6789")).toBe("989123456789");
  });
});

describe("pii: network coarsening", () => {
  it("coarsens an IPv4 address to a /24 network", () => {
    expect(networkOf("192.168.1.57")).toBe("192.168.1.0/24");
  });

  it("groups different hosts in the same /24 together", () => {
    expect(networkOf("10.0.0.5")).toBe(networkOf("10.0.0.200"));
  });

  it("coarsens an IPv6 address to a /48", () => {
    expect(networkOf("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3::/48");
  });

  it("never echoes an unparseable or empty value", () => {
    expect(networkOf("")).toBe("unknown");
    expect(networkOf(undefined)).toBe("unknown");
    expect(networkOf("not-an-ip")).toBe("unknown");
    expect(networkOf("1.2.3")).toBe("unknown");
  });
});

describe("config/env: observability validation", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  const withEnv = (patch) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  it("defaults METRICS_ENABLED to false so the endpoint stays dark", () => {
    withEnv({ METRICS_ENABLED: undefined, METRICS_TOKEN: undefined });
    const env = validateEnv();
    expect(env.METRICS_ENABLED).toBe(false);
    expect(env.METRICS_TOKEN).toBe("");
  });

  it("refuses to boot with metrics enabled and no token", () => {
    // An unauthenticated /metrics is a reconnaissance leak. Fail fast rather
    // than serving it.
    withEnv({ METRICS_ENABLED: "true", METRICS_TOKEN: undefined });
    expect(() => validateEnv()).toThrow(/METRICS_TOKEN/);
  });

  it("accepts metrics enabled with a token", () => {
    withEnv({ METRICS_ENABLED: "true", METRICS_TOKEN: "a-real-token" });
    const env = validateEnv();
    expect(env.METRICS_ENABLED).toBe(true);
    expect(env.METRICS_TOKEN).toBe("a-real-token");
  });

  it("rejects an out-of-range Sentry trace sample rate", () => {
    withEnv({ SENTRY_DSN: "https://key@example.ingest.sentry.io/1", SENTRY_TRACES_SAMPLE_RATE: "5" });
    expect(() => validateEnv()).toThrow(/SENTRY_TRACES_SAMPLE_RATE/);

    withEnv({ SENTRY_TRACES_SAMPLE_RATE: "-1" });
    expect(() => validateEnv()).toThrow(/SENTRY_TRACES_SAMPLE_RATE/);
  });

  it("ignores the sample rate when Sentry is not configured", () => {
    withEnv({ SENTRY_DSN: undefined, SENTRY_TRACES_SAMPLE_RATE: "5" });
    expect(() => validateEnv()).not.toThrow();
  });

  it("exposes backup and uptime defaults", () => {
    withEnv({
      METRICS_ENABLED: undefined,
      METRICS_TOKEN: undefined,
      BACKUP_DIR: undefined,
      BACKUP_RETENTION_DAYS: undefined,
      BACKUP_MIN_FREE_MB: undefined,
      UPTIME_URL: undefined,
      UPTIME_TIMEOUT_MS: undefined,
    });
    const env = validateEnv();
    expect(env.BACKUP_DIR).toBe("./backups");
    expect(env.BACKUP_RETENTION_DAYS).toBe(7);
    expect(env.BACKUP_MIN_FREE_MB).toBe(512);
    expect(env.UPTIME_TIMEOUT_MS).toBe(5000);
  });
});

describe("lifecycle drain flag", () => {
  const lifecycle = require("../utils/lifecycle");

  afterEach(() => {
    lifecycle.resetLifecycle();
  });

  it("starts not draining", () => {
    expect(lifecycle.isDraining()).toBe(false);
    expect(lifecycle.drainStartedAtMs()).toBeNull();
  });

  it("records when the drain began so the shutdown can be timed", () => {
    const at = new Date("2026-09-29T10:00:00.000Z");
    lifecycle.setDraining(true, at);
    expect(lifecycle.isDraining()).toBe(true);
    expect(lifecycle.drainStartedAtMs()).toBe(at.getTime());
  });

  it("clears the timestamp when the drain is reversed", () => {
    lifecycle.setDraining(true);
    lifecycle.setDraining(false);
    expect(lifecycle.isDraining()).toBe(false);
    expect(lifecycle.drainStartedAtMs()).toBeNull();
  });
});
