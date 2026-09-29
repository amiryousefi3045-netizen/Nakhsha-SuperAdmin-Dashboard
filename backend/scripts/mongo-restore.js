#!/usr/bin/env node
"use strict";

/**
 * Nakhsha — MongoDB restore drill (stage 34, closes P0-03)
 * =====================================================
 *
 * The counterpart to mongo-backup.js. Its real purpose is NOT disaster
 * recovery — it is proving, on a schedule, that the archives are restorable.
 * A backup whose restore path has never been executed is an assumption, not a
 * safeguard, and the industry-standard cadence is a drill on a schedule plus a
 * documented RTO rather than a hopeful restore during an incident.
 *
 * SAFE BY DEFAULT: this script REFUSES to write to a non-empty target unless
 * the target database name ends with an explicit drill suffix
 * (`-drill`) or `--yes-i-am-in-production` is passed. Restoring a stale
 * archive over live data is one of the most destructive mistakes available to
 * an operator, so it takes deliberate effort, not just a cron entry.
 *
 * Usage:
 *   node scripts/mongo-restore.js --archive ./backups/nakhsha-nakhsha-....archive.gz
 *   node scripts/mongo-restore.js --list
 *   node scripts/mongo-restore.js --archive <file> --target nakhsha-drill --drop
 *
 * EXIT CODES
 *   0  success            3  target safety check refused
 *   2  missing argument   4  mongorestore failed
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const EXIT = {
  OK: 0,
  MISSING_ARG: 2,
  UNSAFE_TARGET: 3,
  RESTORE_FAILED: 4,
};

const DRILL_SUFFIX = "-drill";

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const [flag, inlineValue] = token.slice(2).split("=");
    if (inlineValue !== undefined) {
      args[flag] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      args[flag] = argv[i + 1];
      i += 1;
    } else {
      args[flag] = true;
    }
  }
  return args;
};

/**
 * Decide whether a restore may proceed.
 *
 * @param {string} targetDb
 * @param {boolean} force production override flag
 * @returns {{ allowed: boolean, reason: string }}
 */
function checkTargetSafety(targetDb, force) {
  if (!targetDb) {
    return { allowed: false, reason: "no --target database was provided" };
  }
  if (force) {
    return { allowed: true, reason: "explicit production override given" };
  }
  if (!String(targetDb).endsWith(DRILL_SUFFIX)) {
    return {
      allowed: false,
      reason: `target "${targetDb}" does not end with "${DRILL_SUFFIX}"; ` +
        "restoring over a live database requires --yes-i-am-in-production",
    };
  }
  return { allowed: true, reason: "drill database suffix present" };
}

const buildRestoreConfig = (uri, dbName) => {
  const escaped = String(uri).replace(/'/g, "''");
  return `uri: '${escaped}'\ndb: '${String(dbName).replace(/'/g, "''")}'\n`;
};

const run = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr?.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", (err) => resolve({ code: null, stdout, stderr, spawnError: err }));
    child.on("close", (code) => resolve({ code, stdout, stderr, spawnError: null }));
  });

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);

  // ── List mode ──────────────────────────────────────────────────────────
  if (args.list) {
    const dir = path.resolve(env.BACKUP_DIR || "./backups");
    if (!fs.existsSync(dir)) {
      console.log(`No backup directory at ${dir}`);
      return EXIT.OK;
    }
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".archive.gz"))
      .sort();
    if (files.length === 0) {
      console.log(`No archives in ${dir} — nothing to restore from.`);
      return EXIT.MISSING_ARG;
    }
    console.log(`Archives in ${dir}:`);
    for (const name of files) {
      const { size } = fs.statSync(path.join(dir, name));
      console.log(`  ${name}  ${(size / 1024 / 1024).toFixed(2)} MB`);
    }
    return EXIT.OK;
  }

  // ── Argument validation ────────────────────────────────────────────────
  const uri = env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set.");
    return EXIT.MISSING_ARG;
  }
  if (!args.archive) {
    console.error("Usage: node scripts/mongo-restore.js --archive <file> [--target db-drill] [--drop]");
    return EXIT.MISSING_ARG;
  }
  if (!fs.existsSync(args.archive)) {
    console.error(`Archive not found: ${args.archive}`);
    return EXIT.MISSING_ARG;
  }

  // ── Target safety ──────────────────────────────────────────────────────
  const targetDb = args.target || "nakhsha-drill";
  const safety = checkTargetSafety(targetDb, args["yes-i-am-in-production"] === true);
  if (!safety.allowed) {
    console.error(`REFUSING TO RESTORE: ${safety.reason}`);
    return EXIT.UNSAFE_TARGET;
  }
  console.log(`Restore target check passed (${safety.reason}).`);

  // ── Restore, keeping the URI out of the process list ───────────────────
  const configPath = path.join(
    path.dirname(path.resolve(args.archive)),
    `.mongorestore-${crypto.randomBytes(8).toString("hex")}.conf`,
  );

  try {
    fs.writeFileSync(configPath, buildRestoreConfig(uri, targetDb), { mode: 0o600 });

    const restoreArgs = ["--config", configPath, "--archive", path.resolve(args.archive), "--gzip"];
    if (args.drop) restoreArgs.push("--drop");
    if (args.nopIndexRestore) restoreArgs.push("--noIndexRestore");
    if (args.nopOptionsRestore) restoreArgs.push("--noOptionsRestore");

    const result = await run(
      env.MONGORESTORE_PATH || "mongorestore",
      restoreArgs,
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    if (result.spawnError?.code === "ENOENT") {
      console.error("mongorestore binary not found on PATH.");
      return EXIT.MISSING_ARG;
    }
    if (result.code !== 0) {
      console.error("mongorestore failed", {
        exitCode: result.code,
        stderr: String(result.stderr).slice(-2000),
      });
      return EXIT.RESTORE_FAILED;
    }

    console.log(`Restore completed into "${targetDb}".`);
    console.log("Verify the data, then drop the drill database when finished.");
    return EXIT.OK;
  } finally {
    try {
      fs.unlinkSync(configPath);
    } catch {
      /* already removed */
    }
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("Restore crashed", { error: err.message });
      process.exit(EXIT.RESTORE_FAILED);
    });
}

module.exports = { EXIT, parseArgs, checkTargetSafety, buildRestoreConfig, main };
