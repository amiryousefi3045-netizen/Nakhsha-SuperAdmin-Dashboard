/**
 * Phone number utility functions for Iranian phone numbers
 */

/**
 * Normalizes phone number digits by converting Persian/Arabic numerals to English
 * @param {string} phone - Phone number string
 * @returns {string} Normalized phone number
 */
function normalizeDigits(phone) {
  if (typeof phone !== "string") return phone;

  // Persian/Arabic to English digit mapping
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const englishDigits = "0123456789";

  let normalized = phone;

  // Replace Persian digits
  for (let i = 0; i < persianDigits.length; i++) {
    normalized = normalized.replace(
      new RegExp(persianDigits[i], "g"),
      englishDigits[i]
    );
  }

  // Replace Arabic digits
  for (let i = 0; i < arabicDigits.length; i++) {
    normalized = normalized.replace(
      new RegExp(arabicDigits[i], "g"),
      englishDigits[i]
    );
  }

  // Remove spaces, dashes, and other non-digit characters except +
  normalized = normalized.replace(/[\s\-\(\)]/g, "");

  return normalized;
}

/**
 * Normalizes Iranian phone number to standard 09xxxxxxxxx format
 * @param {string} phone - Phone number string
 * @returns {string} Normalized phone number
 */
function normalizePhone(phone) {
  if (typeof phone !== "string") return phone;

  // First normalize digits
  let normalized = normalizeDigits(phone);

  // Remove any leading +98 or 0098
  if (normalized.startsWith("+98")) {
    normalized = normalized.substring(3);
  } else if (normalized.startsWith("0098")) {
    normalized = normalized.substring(4);
  } else if (normalized.startsWith("98")) {
    normalized = normalized.substring(2);
  }

  // If starts with 9 (missing the leading 0), add it
  if (/^9\d{9}$/.test(normalized)) {
    normalized = "0" + normalized;
  }

  return normalized.trim();
}

/**
 * Validates Iranian phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid Iranian mobile number
 */
function isValidIranianPhone(phone) {
  if (typeof phone !== "string") return false;
  const normalized = normalizePhone(phone);
  // Iranian mobile numbers: 09xxxxxxxxx (11 digits total)
  return /^09\d{9}$/.test(normalized);
}

/**
 * Formats phone number for SMS provider based on configuration
 * @param {string} phone - Normalized phone number (09xxxxxxxxx)
 * @param {string} format - Format type: '09' or '98'
 * @returns {string} Formatted phone number
 */
function formatForProvider(phone, format = "09") {
  if (!isValidIranianPhone(phone)) {
    throw new Error("Invalid Iranian phone number");
  }

  const normalized = normalizePhone(phone);

  if (format === "98") {
    // Convert 09xxxxxxxxx to 989xxxxxxxxx
    return "98" + normalized.substring(1);
  } else {
    // Keep as 09xxxxxxxxx (default)
    return normalized;
  }
}

module.exports = {
  normalizeDigits,
  normalizePhone,
  isValidIranianPhone,
  formatForProvider,
};
