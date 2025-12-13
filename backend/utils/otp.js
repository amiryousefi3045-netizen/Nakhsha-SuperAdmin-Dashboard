const crypto = require("crypto");

const OTP_SECRET = process.env.OTP_SECRET || "dev-otp-secret";
const OTP_MIN_LENGTH = 4;
const OTP_MAX_LENGTH = 8;

/**
 * Generate a cryptographically secure OTP code
 * @param {number} length - Length of the OTP (default 6, min 4, max 8)
 * @returns {string} Numeric OTP code
 */
function generateCode(length = 6) {
  // Validate length
  if (
    typeof length !== "number" ||
    length < OTP_MIN_LENGTH ||
    length > OTP_MAX_LENGTH
  ) {
    throw new Error(
      `OTP length must be between ${OTP_MIN_LENGTH} and ${OTP_MAX_LENGTH}`
    );
  }

  // Use crypto.randomInt for better randomness
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;

  try {
    const num = crypto.randomInt(min, max + 1);
    return String(num).padStart(length, "0");
  } catch (error) {
    // Fallback to Math.random if crypto.randomInt fails
    const num = Math.floor(Math.random() * (max - min + 1)) + min;
    return String(num).padStart(length, "0");
  }
}

/**
 * Create a secure hash of the OTP code with phone number as salt
 * @param {string} code - OTP code to hash
 * @param {string} phone - Phone number as salt
 * @returns {string} Hex hash
 */
function hashCode(code, phone) {
  if (
    !code ||
    !phone ||
    typeof code !== "string" ||
    typeof phone !== "string"
  ) {
    throw new Error("Code and phone must be non-empty strings");
  }

  // Use HMAC-SHA256 with a server secret and phone as contextual salt.
  // This prevents storing OTP plaintext in DB and ties the code to the phone.
  const h = crypto.createHmac("sha256", OTP_SECRET);
  h.update(`${code}|${phone}`);
  return h.digest("hex");
}

/**
 * Verify OTP code against stored hash using timing-safe comparison
 * @param {string} code - Code to verify
 * @param {string} phone - Phone number
 * @param {string} codeHash - Stored hash to compare against
 * @returns {boolean} True if code matches
 */
function verifyHash(code, phone, codeHash) {
  try {
    if (
      !code ||
      !phone ||
      !codeHash ||
      typeof code !== "string" ||
      typeof phone !== "string" ||
      typeof codeHash !== "string"
    ) {
      return false;
    }

    const expectedHash = hashCode(code, phone);
    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const actualBuffer = Buffer.from(codeHash, "hex");

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (e) {
    return false;
  }
}

module.exports = {
  generateCode,
  hashCode,
  verifyHash,
  OTP_MIN_LENGTH,
  OTP_MAX_LENGTH,
};
