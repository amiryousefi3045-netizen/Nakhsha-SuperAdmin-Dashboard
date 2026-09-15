#!/usr/bin/env node
/**
 * Test script for the MeliPayamak («پیامک ملی» / ملی پیامک) SMS service.
 *
 * Usage:
 *   node scripts/test-sms.js                -> config & phone-format checks
 *   node scripts/test-sms.js 09123456789    -> same + formatting for a number
 *   node scripts/test-sms.js 09123456789 --probe -> also ATTEMPT a real send and
 *                                                   print the provider's exact
 *                                                   response + account credit
 */

require("dotenv").config();
const MelipayamakApi = require("melipayamak");
const { testConfiguration } = require("../services/sms/melipayamakSms");
const {
  normalizePhone,
  isValidIranianPhone,
  formatForProvider,
} = require("../utils/phone");

const SMS_USERNAME = process.env.SMS_USERNAME;
const SMS_PASSWORD = process.env.SMS_PASSWORD;
const SMS_FROM = process.env.SMS_FROM || "50004001854432";
const SMS_TO_FORMAT = process.env.SMS_TO_FORMAT || "09";

async function testSmsConfig() {
  console.log("🧪 Testing «پیامک ملی» (MeliPayamak) SMS Configuration...\n");

  // Test environment variables
  console.log("📋 Environment Variables:");
  console.log("- SMS_USERNAME:", SMS_USERNAME || "NOT SET");
  console.log("- SMS_PASSWORD:", SMS_PASSWORD ? "***HIDDEN***" : "NOT SET");
  console.log("- SMS_FROM:", SMS_FROM);
  console.log("- SMS_TO_FORMAT:", SMS_TO_FORMAT);
  console.log("- SMS_MOCK:", process.env.SMS_MOCK || "(unset)");
  console.log(
    "- OTP_TTL_SECONDS:",
    process.env.OTP_TTL_SECONDS || "120 (default)",
  );
  console.log(
    "- OTP_RESEND_SECONDS:",
    process.env.OTP_RESEND_SECONDS || "30 (default)",
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
    } catch {
      formatted09 = formatted98 = "ERROR";
    }

    console.log(
      `  ${phone} -> ${normalized} [${
        isValid ? "✅" : "❌"
      }] -> 09:${formatted09} 98:${formatted98}`,
    );
  });

  console.log("");

  // Test SMS service configuration
  console.log("📡 SMS Service Configuration Test:");
  const configOk = await testConfiguration();
  console.log(`Configuration status: ${configOk ? "✅ Valid" : "❌ Invalid"}`);

  // Live panel diagnostics (only if credentials are present)
  const testPhone = process.argv[2];
  const probe = process.argv.includes("--probe");
  if (SMS_USERNAME && SMS_PASSWORD) {
    const api = new MelipayamakApi(SMS_USERNAME, SMS_PASSWORD);
    const sms = api.sms();

    console.log("\n📡 Live MeliPayamak Panel Diagnostics:");
    try {
      const credit = await sms.getCredit();
      const creditNum = Number(credit && credit.Value);
      console.log(
        `  اعتبار پنل (GetCredit): ${Number.isFinite(creditNum) ? credit.Value : JSON.stringify(credit)}`,
      );

      const outbox = await sms.getMessages(2, 0, 3);
      const msgs = outbox && outbox.Data ? outbox.Data : [];
      if (msgs.length) {
        console.log(`  آخرین پیامک‌های خروجی (GetMessages):`);
        for (const m of msgs) {
          console.log(
            `    - ${m.SendDate} | به ${m.Receiver} | MsgID ${m.MsgID}`,
          );
        }
      } else {
        console.log(`  آخرین پیامک‌های خروجی (GetMessages): (خالی)`);
      }

      if (Number.isFinite(creditNum) && creditNum < 1) {
        console.log(
          `  ❌ اعتبار فعلی (${credit.Value}) برای ارسال OTP کافی نیست — این مشکل اصلی ارسال‌نشدن پیامک است.`,
        );
      }
    } catch (err) {
      console.log(`  ❌ خطا در استعلام پنل: ${err && err.message}`);
    }
  }

  // Test with provided phone number
  if (testPhone) {
    console.log(`\n📱 Testing with phone: ${testPhone}`);
    const normalized = normalizePhone(testPhone);
    const isValid = isValidIranianPhone(normalized);

    if (isValid) {
      const to = formatForProvider(normalized, SMS_TO_FORMAT);
      console.log(`✅ Valid phone: ${normalized}`);
      console.log(`📤 Recipient (${SMS_TO_FORMAT}): ${to}`);

      if (probe && SMS_USERNAME && SMS_PASSWORD) {
        console.log("\n📤 Attempting a REAL probe send...");
        try {
          const api = new MelipayamakApi(SMS_USERNAME, SMS_PASSWORD);
          const sms = api.sms();
          const result = await sms.send(
            to,
            SMS_FROM,
            "تست سامانه پیامک نخشا - کد: 111111",
          );
          const status = Number(result && result.RetStatus);
          console.log("  پاسخ دقیق سرویس‌دهنده:", JSON.stringify(result));
          if (status === 1) {
            console.log("  ✅ پیامک پذیرفته و ارسال شد (RetStatus=1).");
          } else {
            console.log(
              `  ❌ ارسال رد شد (RetStatus=${status}, ${result.StrRetStatus}).`,
            );
            console.log(
              "     احتمال اصلی: اعتبار پنل کافی نیست یا سهمیه ارسال فعال نیست.",
            );
          }
        } catch (err) {
          console.log(`  ❌ خطا در درخواست ارسال: ${err && err.message}`);
        }
      } else if (probe) {
        console.log("  ⚠️  برای probe دادن باید SMS_USERNAME/SMS_PASSWORD تنظیم باشند.");
      } else {
        console.log(
          "⚠️  بدون --probe پیامکی ارسال نمی‌شود. برای ارسال آزمایشی: node scripts/test-sms.js <شماره> --probe",
        );
      }
    } else {
      console.log(`❌ Invalid phone format: ${normalized}`);
    }
  } else {
    console.log("\n💡 Tip: Run with a phone number to test formatting:");
    console.log("   node scripts/test-sms.js 09123456789 --probe");
  }

  console.log("\n✅ SMS Configuration Test Complete");
}

if (require.main === module) {
  testSmsConfig().catch(console.error);
}

module.exports = { testSmsConfig };