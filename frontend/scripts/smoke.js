#!/usr/bin/env node
/* eslint-env node */
/* global process */

/**
 * Smoke test for frontend build
 * Verifies that:
 * 1. dist/index.html exists and has content
 * 2. At least one JS chunk exists and is non-empty
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, "..", "dist");
const indexPath = path.join(distPath, "index.html");

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function error(msg) {
  console.error(`[smoke:error] ${msg}`);
  process.exit(1);
}

try {
  // Check if dist directory exists
  if (!fs.existsSync(distPath)) {
    error("dist/ directory not found. Did you run 'npm run build:prod'?");
  }
  log("✓ dist/ directory exists");

  // Check if index.html exists
  if (!fs.existsSync(indexPath)) {
    error(`${indexPath} not found`);
  }
  log("✓ dist/index.html exists");

  // Check if index.html has content
  const indexContent = fs.readFileSync(indexPath, "utf-8");
  if (!indexContent || indexContent.trim().length === 0) {
    error("dist/index.html is empty");
  }
  if (!indexContent.includes("<html") && !indexContent.includes("<HTML")) {
    error("dist/index.html does not look like valid HTML");
  }
  log(`✓ dist/index.html has valid content (${indexContent.length} bytes)`);

  // Check for at least one JS chunk
  const files = fs.readdirSync(distPath, { recursive: true });
  const jsFiles = files.filter(
    (f) =>
      typeof f === "string" && f.endsWith(".js") && !f.includes("source-map")
  );

  if (jsFiles.length === 0) {
    error("No .js files found in dist/");
  }
  log(`✓ Found ${jsFiles.length} JS chunk(s)`);

  // Verify at least one chunk is non-empty
  const nonEmptyJs = jsFiles.filter((f) => {
    const fullPath = path.join(distPath, f);
    const stat = fs.statSync(fullPath);
    return stat.size > 0;
  });

  if (nonEmptyJs.length === 0) {
    error("All JS chunks are empty");
  }
  log(`✓ All JS chunks have content (smallest: ${nonEmptyJs.length})`);

  log("===== Smoke test PASSED =====");
  process.exit(0);
} catch (err) {
  error(`Unexpected error: ${err.message}`);
}
