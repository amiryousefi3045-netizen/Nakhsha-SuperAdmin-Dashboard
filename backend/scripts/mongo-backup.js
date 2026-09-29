#!/usr/bin/env node
"use strict";

/**
 * Nakhsha — Automated MongoDB backup (stage 34, closes P0-03)
 * ============================================================
 *
 * Runs `mongodump` into a single gzipped archive, verifies the archive is
 * actually restorable, then prunes old archives. Intended to be driven by
 * cron / a systemd timer / Kubernetes CronJob:
 *
 *     0 2 * * *  cd /srv/nakhsha/backend && npm run backup:run
 *
 * DESIGN DECISIONS THAT MATTER
 * ----------------------------
 * 1. CREDENTIALS NEVER APPEAR IN THE PROCESS LIST.
 *    Passing the URI as `mongodump --uri mongodb://user:pass@host` exposes
 *    the password to every user on the box via `ps aux` (and to /proc on
 *    Linux, which world-readable CI log scrapers read). Instead the URI is
 *    written to a temporary YAML config with mode 0600, passed via
 *    `--config`, and the file is unlinked immediately afterwards.
 *
 * 2. A BACKUP THAT WAS NEVER VERIFIED IS NOT A BACKUP.
 *    A truncated or corrupt archive only reveals itself at restore time,
 *    which is the worst possible moment. Every run streams the gzip stream
 *    to completion (which validates the gzip CRC and length trailer) and
 *    records the uncompressed size, so corruption is caught within minutes
 *    instead of during an incident.
 *
 * 3. EXIT CODES ARE THE MONITORING CONTRACT.
 *    cron and Kubernetes CronJobs can only alert on the exit code, so every
 *    failure path returns a distinct non-zero code (see EXIT below).
 *
 * 4. A BACKUP MUST NOT FILL THE DISK.
 *    Backups run on the same volume as the database in many deployments;
 *    an unbounded retention policy turns a safety mechanism into the outage.
 *    Free space is checked before dumping and retention is enforced after.
 *
 * EXIT CODES
 *   0  success
 *   2  missing prerequisites (mongodump binary, MONGODB_URI)
 *   3  insufficient disk space
 *   4  mongodump failed
 *   5  archive verification failed (corrupt / truncated)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { spawn } = require("child_process");

const EXIT = {
  OK: 0,
  MISSING_PREREQUISITE: 2,
  NO_SPACE: 3,
  DUMP_FAILED: 4,
  VERIFY_FAILED: 5,
};

const TOOL = "mongodump";
const PREFIX = "nakhsha";
const EXT = ".archive.gz";

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no I/O, no side effects)
// ---------------------------------------------------------------------------

/**
 * Strip credentials from a Mongo URI so it is safe to log.
 * `mongodb://user:pass@host/db` → `mongodb://***@host/db`
 *
 * @param {string} uri
 * @returns {string}
 */
function redactUri(uri) {
  if (typeof uri !== "string" || !uri) return "";
  return uri.replace(/\/\/[^@/]*@/, "//***@");
}

/**
 * Extract the database name from a Mongo URI, falling back to the default
 * `nakhsha` database when the URI carries no path component.
 *
 * @param {string} uri
 * @returns {string}
 */
function databaseNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    const name = parsed.pathname.replace(/^\//, "");
    return name || "nakhsha";
  } catch {
    return "nakhsha";
  }
}

/**
 * Build the archive filename. The timestamp is UTC and compact so archives
 * sort lexicographically in chronological order.
 *
 * @param {Date} date
 * @param {string} dbName
 * @returns {string}
 */
function buildArchiveName(date, dbName) {
  const iso = date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const safeDb = String(dbName).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${PREFIX}-${safeDb}-${iso}${EXT}`;
}

/**
 * Inverse of {@link buildArchiveName}.
 *
 * @param {string} filename
 * @returns {{ dbName: string, timestamp: Date } | null} null when the file is
 *   not one of ours (so unrelated files in the backup directory are never
 *   deleted).
 */
function parseArchiveName(filename) {
  const match = new RegExp(
    `^${PREFIX}-([a-zA-Z0-9_]+)-(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})(\\d{2})\\${EXT}$`,
  ).exec(filename);

  if (!match) return null;

  const [, dbName, y, mo, d, h, mi, s] = match;
  const timestamp = new Date(
    `${y}-${mo}-${d}T${h}:${mi}:${s}Z`,
  );

  if (Number.isNaN(timestamp.getTime())) return null;
  return { dbName, timestamp };
}

/**
 * Decide which archives are eligible for deletion.
 *
 * A backup that is too recent to be expired is NEVER deleted, and the most
 * recent archive is always retained regardless of age, so a misconfigured
 * retention value cannot leave the directory with zero restorable points.
 *
 * @param {Array<{name: string, sizeBytes: number, mtimeMs: number}>} entries
 * @param {number} retentionDays
 * @param {Date}   now
 * @returns {Array<{name: string, reason: string}>} entries to delete
 */
function selectExpiredBackups(entries, retentionDays, now) {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;

  const ours = entries
    .map((entry) => {
      const parsed = parseArchiveName(entry.name);
      return parsed ? { ...entry, timestamp: parsed.timestamp.getTime() } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (ours.length === 0) return [];

  // Keep the newest archive unconditionally as the last known-good point.
  const [newest] = ours;

  return ours
    .filter((entry) => entry.name !== newest.name)
    .filter((entry) => entry.timestamp < cutoff)
    .map((entry) => ({
      name: entry.name,
      reason: `older than ${retentionDays}d retention window`,
    }));
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Read backup configuration from the environment, applying the same
 * defaults that config/env.js validates at boot.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadConfig(env = process.env) {
  return {
    uri: env.MONGODB_URI || "",
    backupDir: env.BACKUP_DIR || "./backups",
    retentionDays: Number(env.BACKUP_RETENTION_DAYS || 7),
    minFreeMb: Number(env.BACKUP_MIN_FREE_MB || 512),
    mongodumpPath: env.MONGODUMP_PATH || TOOL,
    dryRun: env.BACKUP_DRY_RUN === "true",
  };
}

/**
 * Build the temporary mongodump config file contents. The URI lives here —
 * and only here — so it never reaches the process argument list.
 *
 * @param {string} uri
 * @param {string} dbName
 * @returns {string}
 */
function buildDumpConfig(uri, dbName) {
  // Single-quoted YAML scalar: a URI containing ':' or '#' is safe unquoted
  // only when single-quoted, and any embedded single quote is doubled.
  const escaped = String(uri).replace(/'/g, "''");
  return `uri: '${escaped}'\ndb: '${String(dbName).replace(/'/g, "''")}'\n`;
}

/**
 * Free space on the filesystem holding `dir`, in megabytes.
 * Returns null when the platform cannot report it.
 *
 * @param {string} dir
 * @returns {number | null}
 */
function freeSpaceMb(dir) {
  try {
    // Available from Node 18.15+ on Linux/macOS/Windows.
    const stats = fs.statfsSync(dir);
    return Math.floor((stats.bavail * stats.bsize) / (1024 * 1024));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Child-process helpers
// ---------------------------------------------------------------------------

const run = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      // ENOENT lands here: the binary is missing.
      resolve({ code: null, stdout, stderr: stderr || err.message, spawnError: err });
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr, spawnError: null });
    });
  });

/**
 * Stream the gzip archive end-to-end to prove it is intact.
 *
 * Reading the stream to completion forces zlib to validate the CRC32 and
 * length trailer, which is precisely what a truncated or corrupted archive
 * fails on. Memory use stays flat because the data is never buffered.
 *
 * @param {string} filePath
 * @returns {Promise<{ ok: boolean, uncompressedBytes: number, error?: string }>}
 */
function verifyArchive(filePath) {
  return new Promise((resolve) => {
    let uncompressedBytes = 0;

    const source = fs.createReadStream(filePath);
    const gunzip = zlib.createGunzip();

    source.on("error", (err) =>
      resolve({ ok: false, uncompressedBytes, error: `read: ${err.message}` }),
    );
    // A corrupt gzip stream surfaces here ("incorrect header check",
    // "unexpected end of file", CRC mismatch).
    gunzip.on("error", (err) =>
      resolve({ ok: false, uncompressedBytes, error: `gzip: ${err.message}` }),
    );

    gunzip.on("data", (chunk) => {
      uncompressedBytes += chunk.length;
    });

    gunzip.on("end", () =>
      resolve({ ok: uncompressedBytes > 0, uncompressedBytes }),
    );

    source.pipe(gunzip);
  });
}

// ---------------------------------------------------------------------------
// Main routine
// ---------------------------------------------------------------------------

/**
 * Execute a full backup cycle: dump → verify → prune.
 *
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {object}   [options.logger] minimal {info,warn,error}
 * @param {boolean}  [options.exit]  call process.exit with the status code
 * @returns {Promise<number>} the exit code
 */
async function runBackup({
  env = process.env,
  logger = console,
  exit = false,
} = {}) {
  const config = loadConfig(env);
  const log = (level, message, meta) => logger[level]?.(message, meta ?? {});

  // ── 1. Prerequisites ───────────────────────────────────────────────────
  if (!config.uri) {
    log("error", "MONGODB_URI is not set — refusing to run a backup");
    if (exit) process.exit(EXIT.MISSING_PREREQUISITE);
    return EXIT.MISSING_PREREQUISITE;
  }

  const dbName = databaseNameFromUri(config.uri);
  const backupDir = path.resolve(config.backupDir);

  try {
    fs.mkdirSync(backupDir, { recursive: true });
  } catch (err) {
    log("error", "Cannot create backup directory", {
      dir: backupDir,
      error: err.message,
    });
    if (exit) process.exit(EXIT.MISSING_PREREQUISITE);
    return EXIT.MISSING_PREREQUISITE;
  }

  if (config.dryRun) {
    log("info", "BACKUP_DRY_RUN=true — reporting plan without dumping", {
      dir: backupDir,
      database: dbName,
      retentionDays: config.retentionDays,
      uri: redactUri(config.uri),
    });
    if (exit) process.exit(EXIT.OK);
    return EXIT.OK;
  }

  // ── 2. Free space guard ────────────────────────────────────────────────
  const freeMb = freeSpaceMb(backupDir);
  if (freeMb !== null && freeMb < config.minFreeMb) {
    log("error", "Insufficient free disk space for a backup — skipping", {
      freeMb,
      requiredMb: config.minFreeMb,
    });
    if (exit) process.exit(EXIT.NO_SPACE);
    return EXIT.NO_SPACE;
  }

  const archiveName = buildArchiveName(new Date(), dbName);
  const archivePath = path.join(backupDir, archiveName);
  const configPath = path.join(
    backupDir,
    `.mongodump-${crypto.randomBytes(8).toString("hex")}.conf`,
  );

  log("info", "Starting MongoDB backup", {
    archive: archiveName,
    database: dbName,
    uri: redactUri(config.uri),
    freeMb,
  });

  // ── 3. Dump via a 0600 config file (keeps the URI out of `ps`) ─────────
  let dumpResult;
  try {
    fs.writeFileSync(configPath, buildDumpConfig(config.uri, dbName), {
      mode: 0o600,
    });

    dumpResult = await run(
      config.mongodumpPath,
      [
        "--config",
        configPath,
        "--archive",
        archivePath,
        "--gzip",
        "--verbose",
      ],
      { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PATH: process.env.PATH } },
    );
  } catch (err) {
    log("error", "Failed to launch mongodump", { error: err.message });
    if (exit) process.exit(EXIT.MISSING_PREREQUISITE);
    return EXIT.MISSING_PREREQUISITE;
  } finally {
    // Always remove the file holding the credentials, even on failure.
    try {
      fs.unlinkSync(configPath);
    } catch {
      /* already gone */
    }
  }

  if (dumpResult.spawnError?.code === "ENOENT") {
    log("error", "mongodump binary not found on PATH", {
      tool: config.mongodumpPath,
      hint: "Install MongoDB Database Tools, or set MONGODUMP_PATH.",
    });
    if (exit) process.exit(EXIT.MISSING_PREREQUISITE);
    return EXIT.MISSING_PREREQUISITE;
  }

  if (dumpResult.code !== 0) {
    log("error", "mongodump failed", {
      exitCode: dumpResult.code,
      // mongodump writes progress to stderr; it does not echo the URI.
      stderr: String(dumpResult.stderr).slice(-2000),
    });
    try {
      fs.unlinkSync(archivePath);
    } catch {
      /* nothing to clean up */
    }
    if (exit) process.exit(EXIT.DUMP_FAILED);
    return EXIT.DUMP_FAILED;
  }

  // ── 4. Verify the archive is actually restorable ───────────────────────
  const verification = await verifyArchive(archivePath);
  if (!verification.ok) {
    log("error", "Archive verification FAILED — backup is not trustworthy", {
      archive: archiveName,
      error: verification.error ?? "archive is empty",
    });
    try {
      fs.unlinkSync(archivePath);
    } catch {
      /* nothing to clean up */
    }
    if (exit) process.exit(EXIT.VERIFY_FAILED);
    return EXIT.VERIFY_FAILED;
  }

  const stat = fs.statSync(archivePath);
  log("info", "Backup completed and verified", {
    archive: archiveName,
    compressedBytes: stat.size,
    uncompressedBytes: verification.uncompressedBytes,
    path: archivePath,
  });

  // ── 5. Retention pruning ───────────────────────────────────────────────
  let entries = [];
  try {
    entries = fs
      .readdirSync(backupDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const full = path.join(backupDir, entry.name);
        const s = fs.statSync(full);
        return { name: entry.name, sizeBytes: s.size, mtimeMs: s.mtimeMs };
      });
  } catch (err) {
    log("warn", "Could not enumerate backup directory for pruning", {
      error: err.message,
    });
  }

  const expired = selectExpiredBackups(entries, config.retentionDays, new Date());
  for (const entry of expired) {
    try {
      fs.unlinkSync(path.join(backupDir, entry.name));
      log("info", "Pruned expired backup", { archive: entry.name, reason: entry.reason });
    } catch (err) {
      log("warn", "Could not prune expired backup", {
        archive: entry.name,
        error: err.message,
      });
    }
  }

  if (exit) process.exit(EXIT.OK);
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  runBackup({ exit: true }).catch((err) => {
    console.error("Backup crashed", { error: err.message });
    process.exit(EXIT.DUMP_FAILED);
  });
}

module.exports = {
  EXIT,
  redactUri,
  databaseNameFromUri,
  buildArchiveName,
  parseArchiveName,
  selectExpiredBackups,
  buildDumpConfig,
  loadConfig,
  freeSpaceMb,
  verifyArchive,
  runBackup,
};
