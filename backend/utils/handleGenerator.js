/**
 * Handle generation utilities for Nakhsha users
 */

const User = require("../models/User");

/**
 * Generate random alphanumeric characters
 * @param {number} length - Number of characters to generate
 * @returns {string} Random characters
 */
function generateRandomChars(length = 3) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique user handle based on phone number
 * Format: u + last 6 digits of phone + 3 random characters
 * @param {string} phone - User's phone number (normalized format: 09xxxxxxxxx)
 * @returns {Promise<string>} - Unique handle
 */
async function generateUniqueHandle(phone) {
  // Extract last 6 digits from phone number
  const phoneDigits = phone.replace(/\D/g, ""); // Remove non-digits
  const lastSixDigits = phoneDigits.slice(-6);

  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    // Generate random 3 characters
    const randomChars = generateRandomChars(3);

    // Create handle: u + last6digits + random3chars
    const handle = `u${lastSixDigits}${randomChars}`;

    // Check if handle already exists
    try {
      const existingUser = await User.findOne({ handle });
      if (!existingUser) {
        return handle;
      }
    } catch (error) {
      // If error checking uniqueness, try next attempt
      console.error("Error checking handle uniqueness:", error);
    }

    attempts++;
  }

  // Fallback: if all attempts failed, use timestamp
  const timestamp = Date.now().toString().slice(-6);
  const fallbackHandle = `u${lastSixDigits}${timestamp.slice(-3)}`;

  // Final check for fallback handle
  try {
    const existingUser = await User.findOne({ handle: fallbackHandle });
    if (!existingUser) {
      return fallbackHandle;
    }

    // Ultimate fallback with full timestamp
    return `u${Date.now()}`;
  } catch (error) {
    // Ultimate fallback
    return `u${Date.now()}`;
  }
}

module.exports = {
  generateUniqueHandle,
  generateRandomChars,
};
