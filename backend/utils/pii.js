"use strict";

/**
 * Nakhsha — PII-safe identifiers
 * ==============================
 *
 * Phone numbers, emails and user ids must never be written to logs verbatim.
 * A log stream is copied into SIEM, Datadog, Sentry, support tickets and
 * third-party log aggregators; plaintext contact data in that stream is a
 * data-protection breach that no amount of log retention policy fixes.
 *
 * But operators legitimately need to correlate events ("all failures for
 * this number in the last hour"), which is impossible if the number is
 * dropped entirely. The resolution used here — and the same one used by the
 * big payment providers — is a keyed hash: correlation is preserved,
 * reversibility is not, and a leaked log becomes a set of opaque digests.
 *
 * The key is the JWT secret, so digests are stable within a deployment and
 * not comparable across environments or installations (an attacker cannot
 * mount a rainbow table against a value taken from another system's logs).
 */

const crypto = require("crypto");

/**
 * Normalise a phone number to a canonical E.164-style digit string.
 *
 * This matters more than it looks: the same person is routinely recorded in
 * this system as `09123456789` (Iranian national format) in one code path
 * and as `+989123456789` in another. Without canonicalisation those two values
 * hash differently, the same number produces two unrelated digests, and the
 * entire point of keeping a correlatable identifier instead of dropping it is
 * lost. So national and international notations of one number MUST collapse
 * to the same digest.
 */
const normalisePhone = (phone) => {
  let digits = String(phone ?? "")
    .replace(/[\s()\-.]/g, "")
    .replace(/^\+/, "");

  // 0098912... (IDD) -> 98912...
  if (digits.startsWith("0098")) digits = digits.slice(2);

  // 0912... (national) -> 98912... (E.164)
  if (/^0\d{10}$/.test(digits)) digits = `98${digits.slice(1)}`;

  return digits;
};

/**
 * Keyed, truncated digest of an identifier.
 * 12 hex chars is 48 bits — ample for correlation, and short enough to keep
 * logs readable.
 *
 * @param {unknown} value
 * @param {string}  [purpose] domain separator, so the same value in different
 *   contexts (e.g. a user id vs a phone number) does not collide.
 * @returns {string}
 */
function digest(value, purpose = "generic") {
  const raw = normalisePhone(value);
  if (!raw) return "";
  try {
    return crypto
      .createHmac("sha256", process.env.JWT_SECRET || "nakhsha-dev-digest-key")
      .update(`${purpose}:${raw}`)
      .digest("hex")
      .slice(0, 12);
  } catch {
    return "";
  }
}

/** Digest specifically for a phone number. */
const phoneDigest = (phone) => digest(phone, "phone");

/**
 * Reduce an IP address to a coarse network for logging. Full IPs are personal
 * data in several jurisdictions and are rarely needed — an operator needs
 * "which subnet is misbehaving", not "which user".
 *
 * IPv4 → /24, IPv6 → /48. Anything unparseable is returned as "unknown"
 * rather than echoed.
 *
 * @param {string} ip
 * @returns {string}
 */
function networkOf(ip) {
  const value = String(ip ?? "").trim();
  if (!value) return "unknown";

  if (value.includes(":")) {
    // IPv6: keep the first 3 hextets (/48).
    const hextets = value.split(":").filter(Boolean).slice(0, 3);
    return hextets.length ? `${hextets.join(":")}::/48` : "unknown";
  }

  const octets = value.split(".");
  if (octets.length !== 4 || octets.some((o) => !/^\d{1,3}$/.test(o))) {
    return "unknown";
  }
  return `${octets.slice(0, 3).join(".")}.0/24`;
}

module.exports = { normalisePhone, digest, phoneDigest, networkOf };
