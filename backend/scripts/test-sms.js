#!/usr/bin/env node
/**
 * Test script for MeliPayamak SMS service configuration
 * Usage: node scripts/test-sms.js [phone_number]
 */

require("dotenv").config();
const { testConfiguration } = require("../services/sms/melipayamakSms");
const {
  normalizePhone,
  isValidIranianPhone,
  formatForProvider,
} = require("../utils/phone");

async function testSmsConfig() {
  console.log("🧪 Testing SMS Configuration...\n");

  // Test environment variables
  console.log("📋 Environment Variables:");
  console.log(
    "- MELIPAYAMAK_USERNAME:",
    process.env.MELIPAYAMAK_USERNAME || "NOT SET"
  );
  console.log(
    "- MELIPAYAMAK_PASSWORD:",
    process.env.MELIPAYAMAK_PASSWORD ? "***HIDDEN***" : "NOT SET"
  );
  console.log("- MELIPAYAMAK_FROM:", process.env.MELIPAYAMAK_FROM || "NOT SET");
  console.log(
    "- MELIPAYAMAK_TO_FORMAT:",
    process.env.MELIPAYAMAK_TO_FORMAT || "09 (default)"
  );
  console.log(
    "- OTP_TTL_SECONDS:",
    process.env.OTP_TTL_SECONDS || "120 (default)"
  );
  console.log(
    "- OTP_RESEND_COOLDOWN_SECONDS:",
    process.env.OTP_RESEND_COOLDOWN_SECONDS || "120 (default)"
  );
  console.log("");

  // Test phone utilities
  console.log("📞 Phone Utility Tests:");
  const testPhones = [
    "09123456789",
    "۰۹۱۲۳۴۵۶۷۸۹", // Persian digits
    "٠٩١٢٣٤٥٦٧٨٩", // Arabic digits
    "+989123456789",
    "989123456789",
    "0098-912-345-6789",
    "invalid-phone",
  ];

  testPhones.forEach((phone) => {
    const normalized = normalizePhone(phone);
    const isValid = isValidIranianPhone(normalized);
    let formatted09, formatted98;

    try {
      formatted09 = isValid ? formatForProvider(normalized, "09") : "N/A";
      formatted98 = isValid ? formatForProvider(normalized, "98") : "N/A";
    } catch (e) {
      formatted09 = formatted98 = "ERROR";
    }

    console.log(
      `  ${phone} -> ${normalized} [${
        isValid ? "✅" : "❌"
      }] -> 09:${formatted09} 98:${formatted98}`
    );
  });

  console.log("");

  // Test SMS service configuration
  console.log("📡 SMS Service Configuration Test:");
  const configOk = await testConfiguration();
  console.log(`Configuration status: ${configOk ? "✅ Valid" : "❌ Invalid"}`);

  console.log("\n✅ SMS Configuration Test Complete");

  // Test with provided phone number
  const testPhone = process.argv[2];
  if (testPhone) {
    console.log(`\n📱 Testing with phone: ${testPhone}`);
    const normalized = normalizePhone(testPhone);
    const isValid = isValidIranianPhone(normalized);

    if (isValid) {
      console.log(`✅ Valid phone: ${normalized}`);
      console.log(
        `📤 Would send to: ${formatForProvider(
          normalized,
          process.env.MELIPAYAMAK_TO_FORMAT || "09"
        )}`
      );
      console.log(
        "⚠️  Note: This is a test script - no actual SMS will be sent"
      );
    } else {
      console.log(`❌ Invalid phone format: ${normalized}`);
    }
  } else {
    console.log("\n💡 Tip: Run with a phone number to test formatting:");
    console.log("   node scripts/test-sms.js 09123456789");
  }
}

if (require.main === module) {
  testSmsConfig().catch(console.error);
}

module.exports = { testSmsConfig };
