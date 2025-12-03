const crypto = require("crypto");

const OTP_SECRET = process.env.OTP_SECRET || "dev-otp-secret";

function generateCode(length = 6) {
  // Generate a numeric code of requested length (default 6)
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  const num = Math.floor(Math.random() * (max - min + 1)) + min;
  return String(num);
}

function hashCode(code, phone) {
  // Use HMAC-SHA256 with a server secret and phone as contextual salt.
  // This prevents storing OTP plaintext in DB and ties the code to the phone.
  const h = crypto.createHmac("sha256", OTP_SECRET);
  h.update(code + "|" + (phone || ""));
  return h.digest("hex");
}

function verifyHash(code, phone, codeHash) {
  try {
    const expected = Buffer.from(hashCode(code, phone), "hex");
    const actual = Buffer.from(codeHash, "hex");
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch (e) {
    return false;
  }
}

module.exports = { generateCode, hashCode, verifyHash };
