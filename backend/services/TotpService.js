"use strict";

/**
 * Nakhsha — Dependency-free TOTP (RFC 6238 / RFC 4226) service.
 *
 * Implements time-based one-time passwords with the standard 6-digit / 30s
 * profile over HMAC-SHA1, using Node's built-in crypto only.  No external
 * package is required (the npm registry is unreachable in this environment),
 * and the code is small enough to be audited end-to-end.
 */

const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Base32 (RFC 4648) encode/decode — minimal, uppercase, padding-tolerant.
// ---------------------------------------------------------------------------

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const B32_LOOKUP = (() => {
  const map = new Map();
  for (let i = 0; i < B32_ALPHABET.length; i += 1) {
    map.set(B32_ALPHABET[i], i);
  }
  return map;
})();

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of clean) {
    const v = B32_LOOKUP.get(ch);
    if (v === undefined) {
      throw new Error(`Invalid base32 character: "${ch}"`);
    }
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// TOTP core
// ---------------------------------------------------------------------------

const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 1; // ±1 step (~±30s + clock drift tolerance)

/**
 * RFC 4226 dynamic truncation → 6-digit code for the given Unix millisecond.
 *
 * @param {string} secret - base32 secret
 * @param {number} [atMs] - timestamp in milliseconds (defaults to now)
 * @param {number} [periodSeconds]
 * @returns {string} padded 6-digit code
 */
function generateCode(secret, atMs = Date.now(), periodSeconds = DEFAULT_PERIOD_SECONDS) {
  const counter = Math.floor(atMs / 1000 / periodSeconds);
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter), 0);
  const digest = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** DEFAULT_DIGITS).padStart(DEFAULT_DIGITS, "0");
}

function safeEqualString(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Validate a TOTP code within ±windowSteps of the current step.
 *
 * @param {string} secret - base32 secret
 * @param {string} code - 6-digit code from the authenticator app
 * @param {object} [opts]
 * @param {number} [opts.windowSteps=1]
 * @param {number} [opts.periodSeconds=30]
 * @returns {boolean}
 */
function verifyCode(secret, code, { windowSteps = DEFAULT_WINDOW, periodSeconds = DEFAULT_PERIOD_SECONDS } = {}) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) return false;
  try {
    base32Decode(secret); // validates the secret is decodable
  } catch {
    return false;
  }
  const trimmed = code.trim();
  const now = Date.now();
  for (let i = -windowSteps; i <= windowSteps; i += 1) {
    const expected = generateCode(secret, now + i * periodSeconds * 1000, periodSeconds);
    if (safeEqualString(expected, trimmed)) return true;
  }
  return false;
}

/**
 * Generate a new random base32 secret (160 bits → 32 base32 chars).
 *
 * @returns {string}
 */
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/**
 * Build the standard otpauth:// URI for provisioning QR-based authenticators.
 *
 * @param {object} params
 * @param {string} params.secret - base32 secret
 * @param {string} params.account - e.g. the admin phone number
 * @param {string} [params.issuer="Nakhsha"]
 * @returns {string}
 */
function buildOtpAuthUri({ secret, account, issuer = "Nakhsha", periodSeconds = DEFAULT_PERIOD_SECONDS }) {
  const label = `${issuer}:${account}`;
  return (
    `otpauth://totp/${encodeURIComponent(label)}` +
    `?secret=${encodeURIComponent(secret)}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    "&algorithm=SHA1" +
    `&digits=${DEFAULT_DIGITS}` +
    `&period=${periodSeconds}`
  );
}

module.exports = {
  generateSecret,
  generateCode,
  verifyCode,
  buildOtpAuthUri,
  base32Encode,
  base32Decode,
};