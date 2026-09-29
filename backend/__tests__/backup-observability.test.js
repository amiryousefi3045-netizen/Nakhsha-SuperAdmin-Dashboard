const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const backup = require("../scripts/mongo-backup");
const restore = require("../scripts/mongo-restore");
const uptime = require("../scripts/uptime-check");

describe("mongo-backup: URI redaction", () => {
  it("removes credentials from a Mongo URI before it reaches a log", () => {
    expect(backup.redactUri("mongodb://admin:sup3rs3cret@db.internal:27017/nakhsha")).toBe(
      "mongodb://***@db.internal:27017/nakhsha",
    );
  });

  it("leaves a credential-free URI untouched", () => {
    expect(backup.redactUri("mongodb://127.0.0.1:27017/nakhsha")).toBe(
      "mongodb://127.0.0.1:27017/nakhsha",
    );
  });

  it("returns an empty string for missing input rather than throwing", () => {
    expect(backup.redactUri(undefined)).toBe("");
    expect(backup.redactUri("")).toBe("");
  });
});

describe("mongo-backup: database name extraction", () => {
  it("reads the database from the URI path", () => {
    expect(backup.databaseNameFromUri("mongodb://127.0.0.1:27017/nakhsha")).toBe("nakhsha");
  });

  it("falls back to nakhsha when the URI has no database path", () => {
    expect(backup.databaseNameFromUri("mongodb://127.0.0.1:27017")).toBe("nakhsha");
    expect(backup.databaseNameFromUri("not a uri at all")).toBe("nakhsha");
  });
});

describe("mongo-backup: archive naming", () => {
  const date = new Date("2026-09-29T04:05:06.789Z");

  it("builds a sortable, filesystem-safe name", () => {
    const name = backup.buildArchiveName(date, "nakhsha");
    expect(name).toBe("nakhsha-nakhsha-20260929T040506.archive.gz");
  });

  it("sanitises a database name that contains unsafe characters", () => {
    expect(backup.buildArchiveName(date, "my/db:name")).toBe(
      "nakhsha-my_db_name-20260929T040506.archive.gz",
    );
  });

  it("round-trips through parseArchiveName", () => {
    const name = backup.buildArchiveName(date, "nakhsha");
    const parsed = backup.parseArchiveName(name);
    expect(parsed.dbName).toBe("nakhsha");
    expect(parsed.timestamp.toISOString()).toBe("2026-09-29T04:05:06.000Z");
  });

  it("refuses to parse a file that is not one of our archives", () => {
    // This is what stops the retention job from deleting an unrelated file
    // that happens to sit in the backup directory.
    expect(backup.parseArchiveName("important-report.csv")).toBeNull();
    expect(backup.parseArchiveName(".mongodump-ab12.conf")).toBeNull();
    expect(backup.parseArchiveName("nakhsha-nakhsha-notadate.archive.gz")).toBeNull();
  });
});

describe("mongo-backup: retention policy", () => {
  const now = new Date("2026-09-29T12:00:00.000Z");
  const entry = (name) => ({ name, sizeBytes: 1, mtimeMs: 0 });

  it("deletes archives older than the retention window", () => {
    const entries = [
      entry(backup.buildArchiveName(new Date("2026-09-29T02:00:00Z"), "nakhsha")),
      entry(backup.buildArchiveName(new Date("2026-09-20T02:00:00Z"), "nakhsha")),
      entry(backup.buildArchiveName(new Date("2026-08-01T02:00:00Z"), "nakhsha")),
    ];

    const expired = backup.selectExpiredBackups(entries, 7, now);
    expect(expired.map((e) => e.name)).toEqual([
      backup.buildArchiveName(new Date("2026-09-20T02:00:00Z"), "nakhsha"),
      backup.buildArchiveName(new Date("2026-08-01T02:00:00Z"), "nakhsha"),
    ]);
  });

  it("never deletes the newest archive, even if it is ancient", () => {
    // A long outage with a misconfigured retention value must not leave the
    // directory with zero restorable points.
    const only = entry(backup.buildArchiveName(new Date("2020-01-01T00:00:00Z"), "nakhsha"));
    expect(backup.selectExpiredBackups([only], 7, now)).toEqual([]);
  });

  it("ignores files that are not Nakhsha archives", () => {
    const entries = [
      entry(backup.buildArchiveName(new Date("2020-01-01T00:00:00Z"), "nakhsha")),
      entry("customer-upload-backup.tar"),
      entry("notes.txt"),
    ];
    expect(backup.selectExpiredBackups(entries, 1, now)).toEqual([]);
  });

  it("returns an empty list for an empty directory", () => {
    expect(backup.selectExpiredBackups([], 7, now)).toEqual([]);
  });

  it("treats the boundary as exclusive — an archive exactly at the cutoff is kept", () => {
    const exactlySevenDays = backup.buildArchiveName(
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      "nakhsha",
    );
    const older = backup.buildArchiveName(
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1000),
      "nakhsha",
    );
    const entries = [
      entry(backup.buildArchiveName(new Date("2026-09-29T11:00:00Z"), "nakhsha")),
      entry(exactlySevenDays),
      entry(older),
    ];
    const expired = backup.selectExpiredBackups(entries, 7, now);
    expect(expired.map((e) => e.name)).toEqual([older]);
  });
});

describe("mongo-backup: dump config file", () => {
  it("embeds the URI so it never appears in the process argument list", () => {
    const config = backup.buildDumpConfig("mongodb://u:p@h:27017/nakhsha", "nakhsha");
    expect(config).toContain("uri: 'mongodb://u:p@h:27017/nakhsha'");
    expect(config).toContain("db: 'nakhsha'");
  });

  it("escapes single quotes so the YAML stays valid", () => {
    const config = backup.buildDumpConfig("mongodb://u:p'q@h/nakhsha", "nakhsha");
    expect(config).toContain("p''q");
  });
});

describe("mongo-backup: configuration loading", () => {
  it("applies documented defaults", () => {
    const config = backup.loadConfig({});
    expect(config.backupDir).toBe("./backups");
    expect(config.retentionDays).toBe(7);
    expect(config.minFreeMb).toBe(512);
    expect(config.dryRun).toBe(false);
  });

  it("honours environment overrides", () => {
    const config = backup.loadConfig({
      MONGODB_URI: "mongodb://h/db",
      BACKUP_DIR: "/mnt/backups",
      BACKUP_RETENTION_DAYS: "30",
      BACKUP_MIN_FREE_MB: "2048",
      BACKUP_DRY_RUN: "true",
    });
    expect(config.backupDir).toBe("/mnt/backups");
    expect(config.retentionDays).toBe(30);
    expect(config.minFreeMb).toBe(2048);
    expect(config.dryRun).toBe(true);
  });
});

describe("mongo-backup: archive verification", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nakhsha-backup-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("accepts a valid gzip archive and reports the uncompressed size", async () => {
    const file = path.join(tmpDir, "good.archive.gz");
    fs.writeFileSync(file, zlib.gzipSync(Buffer.from("a".repeat(5000))));

    const result = await backup.verifyArchive(file);
    expect(result.ok).toBe(true);
    expect(result.uncompressedBytes).toBe(5000);
  });

  it("rejects a truncated archive — the exact failure a restore-time check would miss", async () => {
    const file = path.join(tmpDir, "truncated.archive.gz");
    const full = zlib.gzipSync(Buffer.from("b".repeat(20000)));
    fs.writeFileSync(file, full.subarray(0, Math.floor(full.length / 2)));

    const result = await backup.verifyArchive(file);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects a corrupted archive", async () => {
    const file = path.join(tmpDir, "corrupt.archive.gz");
    const buf = zlib.gzipSync(Buffer.from("c".repeat(4000)));
    // Flip bytes in the middle of the payload.
    buf[Math.floor(buf.length / 2)] ^= 0xff;
    fs.writeFileSync(file, buf);

    const result = await backup.verifyArchive(file);
    expect(result.ok).toBe(false);
  });

  it("rejects a file that is not gzip at all", async () => {
    const file = path.join(tmpDir, "notgzip.archive.gz");
    fs.writeFileSync(file, "this is plain text, not an archive");

    const result = await backup.verifyArchive(file);
    expect(result.ok).toBe(false);
  });

  it("rejects a zero-length archive", async () => {
    const file = path.join(tmpDir, "empty.archive.gz");
    fs.writeFileSync(file, zlib.gzipSync(Buffer.alloc(0)));

    const result = await backup.verifyArchive(file);
    expect(result.ok).toBe(false);
  });
});

describe("mongo-backup: orchestration", () => {
  let tmpDir;
  let logs;

  const logger = () => logs;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nakhsha-backup-run-"));
    logs = [];
    for (const level of ["info", "warn", "error"]) {
      logger[level] = (message, meta) => logs.push({ level, message, meta });
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("refuses to run without MONGODB_URI", async () => {
    const code = await backup.runBackup({
      env: { BACKUP_DIR: tmpDir },
      logger,
    });
    expect(code).toBe(backup.EXIT.MISSING_PREREQUISITE);
    expect(logs.some((l) => /MONGODB_URI/.test(l.message))).toBe(true);
  });

  it("reports the plan and creates nothing in dry-run mode", async () => {
    const code = await backup.runBackup({
      env: {
        MONGODB_URI: "mongodb://u:secret@h:27017/nakhsha",
        BACKUP_DIR: tmpDir,
        BACKUP_DRY_RUN: "true",
      },
      logger,
    });

    expect(code).toBe(backup.EXIT.OK);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
    const plan = logs.find((l) => l.message.includes("DRY_RUN"));
    // Even in dry-run, the log must carry a redacted URI.
    expect(plan.meta.uri).toBe("mongodb://***@h:27017/nakhsha");
  });

  it("reports a missing mongodump binary instead of throwing", async () => {
    const code = await backup.runBackup({
      env: {
        MONGODB_URI: "mongodb://u:secret@h:27017/nakhsha",
        BACKUP_DIR: tmpDir,
        // A path that certainly does not exist.
        MONGODUMP_PATH: path.join(tmpDir, "no-such-mongodump"),
      },
      logger,
    });

    expect(code).toBe(backup.EXIT.MISSING_PREREQUISITE);
    expect(logs.some((l) => /not found on PATH/.test(l.message))).toBe(true);
  });

  it("leaves no credential file behind after a failed dump", async () => {
    // The temporary 0600 config holds the URI; it must be removed on every
    // path, success or failure, or the password sits on disk indefinitely.
    const code = await backup.runBackup({
      env: {
        MONGODB_URI: "mongodb://u:supersecret@h:27017/nakhsha",
        BACKUP_DIR: tmpDir,
        MONGODUMP_PATH: path.join(tmpDir, "no-such-mongodump"),
      },
      logger,
    });

    expect(code).toBe(backup.EXIT.MISSING_PREREQUISITE);
    expect(fs.readdirSync(tmpDir).filter((n) => n.includes("mongodump"))).toEqual([]);
  });

  it("prunes expired archives and leaves recent ones", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    const oldName = backup.buildArchiveName(old, "nakhsha");
    const recentName = backup.buildArchiveName(recent, "nakhsha");
    fs.writeFileSync(path.join(tmpDir, oldName), "old");
    fs.writeFileSync(path.join(tmpDir, recentName), "recent");

    const expired = backup.selectExpiredBackups(
      [oldName, recentName].map((name) => ({
        name,
        sizeBytes: 1,
        mtimeMs: 0,
      })),
      7,
      now,
    );

    expect(expired.map((e) => e.name)).toEqual([oldName]);
  });
});

describe("mongo-restore: target safety", () => {
  it("allows a drill database", () => {
    const result = restore.checkTargetSafety("nakhsha-drill", false);
    expect(result.allowed).toBe(true);
  });

  it("refuses to overwrite a live database without an explicit override", () => {
    // Restoring a stale archive over production data is one of the most
    // destructive operator errors available; it must require deliberate action.
    const result = restore.checkTargetSafety("nakhsha", false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/yes-i-am-in-production/);
  });

  it("allows an explicit production override", () => {
    expect(restore.checkTargetSafety("nakhsha", true).allowed).toBe(true);
  });

  it("refuses when no target is given", () => {
    expect(restore.checkTargetSafety("", false).allowed).toBe(false);
    expect(restore.checkTargetSafety(undefined, false).allowed).toBe(false);
  });
});

describe("mongo-restore: argument parsing", () => {
  it("parses both --flag value and --flag=value forms", () => {
    expect(restore.parseArgs(["--archive", "a.gz", "--target=nakhsha-drill", "--drop"])).toEqual({
      archive: "a.gz",
      target: "nakhsha-drill",
      drop: true,
    });
  });

  it("treats a trailing flag as boolean true", () => {
    expect(restore.parseArgs(["--list"])).toEqual({ list: true });
  });

  it("ignores non-flag tokens", () => {
    expect(restore.parseArgs(["noise", "--drop"])).toEqual({ drop: true });
  });
});

describe("mongo-restore: restore config", () => {
  it("embeds the URI so it stays out of the process argument list", () => {
    const config = restore.buildRestoreConfig("mongodb://u:p@h/nakhsha-drill", "nakhsha-drill");
    expect(config).toContain("uri: 'mongodb://u:p@h/nakhsha-drill'");
    expect(config).toContain("db: 'nakhsha-drill'");
  });
});

describe("uptime-check: probe", () => {
  it("treats only 2xx as healthy", () => {
    expect(uptime.isHealthyStatus(200)).toBe(true);
    expect(uptime.isHealthyStatus(204)).toBe(true);
    expect(uptime.isHealthyStatus(302)).toBe(false);
    expect(uptime.isHealthyStatus(404)).toBe(false);
    // Readiness must return 503 when the database is down.
    expect(uptime.isHealthyStatus(503)).toBe(false);
  });

  it("reports ok for a 2xx readiness response", async () => {
    const fetchImpl = async () => ({
      status: 200,
      json: async () => ({ ready: true, checks: { db: { status: "up" } } }),
    });

    const result = await uptime.probe("https://x.test/health/ready", { fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.error).toBeNull();
    expect(result.body.ready).toBe(true);
  });

  it("reports failure for a 503 readiness response", async () => {
    const fetchImpl = async () => ({
      status: 503,
      json: async () => ({ ready: false, checks: { db: { status: "down" } } }),
    });

    const result = await uptime.probe("https://x.test/health/ready", { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("HTTP 503");
  });

  it("reports failure when the request throws", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await uptime.probe("https://x.test/health/ready", { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ECONNREFUSED");
  });

  it("distinguishes a timeout from a refused connection", async () => {
    const fetchImpl = async (_url, { signal }) => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };
    const result = await uptime.probe("https://x.test/health/ready", {
      fetchImpl,
      timeoutMs: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout after 10ms/);
  });

  it("survives a non-JSON body", async () => {
    const fetchImpl = async () => ({
      status: 200,
      json: async () => {
        throw new Error("Unexpected token <");
      },
    });
    const result = await uptime.probe("https://x.test/health/ready", { fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.body).toBeNull();
  });
});

describe("uptime-check: main", () => {
  it("fails when UPTIME_URL is not configured", async () => {
    const code = await uptime.main({});
    expect(code).toBe(uptime.EXIT.FAILED);
  });
});
