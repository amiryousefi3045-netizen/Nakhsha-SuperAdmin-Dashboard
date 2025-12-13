#!/usr/bin/env node

const axios = require("axios");
const readline = require("readline");

const BASE_URL = "http://localhost:5000/api";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function for colored output
const colors = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function getMetrics() {
  try {
    const response = await axios.get(`${BASE_URL}/auth/otp/metrics`);

    console.clear();
    log(colors.bold + colors.blue, "📊 نخشا - مانیتورینگ سیستم OTP");
    console.log("═".repeat(80));

    const data = response.data;

    // Summary
    log(colors.bold + colors.green, "\n📈 خلاصه آمار:");
    console.log(`🔹 تعداد درخواست‌های OTP: ${data.summary.totalOtpRequests}`);
    console.log(`🔹 تعداد کل تاییدیه‌ها: ${data.summary.totalVerifications}`);
    console.log(
      `🔹 نرخ موفقیت تاییدیه: ${data.summary.verificationSuccessRate}`
    );
    console.log(`🔹 نرخ موفقیت SMS: ${data.summary.smsSuccessRate}`);
    console.log(
      `🔹 میانگین زمان تاییدیه: ${data.summary.averageVerificationTime}`
    );
    console.log(`🔹 تعداد محدودیت‌های نرخ: ${data.summary.rateLimitHits}`);
    console.log(
      `🔹 تعداد فعالیت‌های مشکوک: ${data.summary.suspiciousActivityBlocks}`
    );
    console.log(`🔹 زمان فعالیت سرور: ${data.summary.uptime}`);

    // SMS Details
    log(colors.bold + colors.yellow, "\n📱 جزئیات SMS:");
    console.log(`🔹 تلاش‌ها: ${data.details.sms.attempts}`);
    console.log(`🔹 موفق: ${data.details.sms.successes}`);
    console.log(`🔹 ناموفق: ${data.details.sms.failures}`);
    console.log(`🔹 نرخ موفقیت: ${data.details.sms.successRate}`);

    // Verification Details
    log(colors.bold + colors.yellow, "\n✅ جزئیات تاییدیه:");
    console.log(`🔹 کل: ${data.details.verification.total}`);
    console.log(`🔹 موفق: ${data.details.verification.successful}`);
    console.log(`🔹 ناموفق: ${data.details.verification.failed}`);
    console.log(`🔹 نرخ موفقیت: ${data.details.verification.successRate}`);
    console.log(`🔹 میانگین زمان: ${data.details.verification.averageTime}`);
    console.log(
      `🔹 درخواست‌های کند: ${data.details.verification.slowRequests}`
    );

    // Security
    log(colors.bold + colors.red, "\n🔒 امنیت:");
    console.log(`🔹 محدودیت‌های نرخ: ${data.details.security.rateLimitHits}`);
    console.log(
      `🔹 فعالیت‌های مشکوک: ${data.details.security.suspiciousActivityBlocks}`
    );

    // Health Status
    const healthColor =
      data.health.status === "healthy"
        ? colors.green
        : data.health.status === "warning"
        ? colors.yellow
        : colors.red;
    log(
      colors.bold + healthColor,
      `\n💚 وضعیت سلامت: ${data.health.status.toUpperCase()}`
    );

    if (data.health.issues && data.health.issues.length > 0) {
      log(colors.red, "\n⚠️ مسائل تشخیص داده شده:");
      data.health.issues.forEach((issue) => {
        console.log(`  • ${issue.message} (شدت: ${issue.severity})`);
      });
    }

    // Daily Stats
    if (Object.keys(data.dailyStats).length > 0) {
      log(colors.bold + colors.blue, "\n📅 آمار روزانه:");
      Object.entries(data.dailyStats).forEach(([date, stats]) => {
        console.log(`  📅 ${date}:`);
        console.log(
          `    درخواست‌ها: ${stats.requests}, SMS موفق: ${stats.smsSuccess}, تاییدیه موفق: ${stats.verificationSuccess}`
        );
      });
    }

    console.log("\n" + "═".repeat(80));
    log(colors.blue, '💡 برای رفرش کردن Enter بزنید، برای خروج "q" تایپ کنید');
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      log(
        colors.red,
        "❌ خطا: سرور روشن نیست! لطفاً سرور را با npm run dev روشن کنید"
      );
    } else {
      log(colors.red, `❌ خطا در دریافت آمار: ${error.message}`);
    }
  }
}

async function testOtp() {
  return new Promise((resolve) => {
    rl.question(
      "شماره تلفن برای تست OTP (مثال: 09123456789): ",
      async (phone) => {
        try {
          log(colors.yellow, "📱 در حال ارسال OTP...");
          const response = await axios.post(`${BASE_URL}/auth/otp/start`, {
            phone,
          });

          if (response.data.success) {
            log(colors.green, "✅ OTP ارسال شد!");
            if (response.data.devCode) {
              log(colors.blue, `🔢 کد توسعه: ${response.data.devCode}`);

              rl.question("کد تاییدیه را وارد کنید: ", async (code) => {
                try {
                  const verifyResponse = await axios.post(
                    `${BASE_URL}/auth/otp/verify`,
                    { phone, code }
                  );
                  log(colors.green, "✅ تاییدیه موفق! توکن دریافت شد");
                  console.log("Token:", verifyResponse.data.token);
                } catch (verifyError) {
                  log(
                    colors.red,
                    `❌ خطا در تاییدیه: ${
                      verifyError.response?.data?.message || verifyError.message
                    }`
                  );
                }
                resolve();
              });
            } else {
              log(colors.blue, "SMS ارسال شد. کد را از پیامک دریافت کنید");
              resolve();
            }
          } else {
            log(colors.red, `❌ خطا در ارسال: ${response.data.message}`);
            resolve();
          }
        } catch (error) {
          log(
            colors.red,
            `❌ خطا: ${error.response?.data?.message || error.message}`
          );
          resolve();
        }
      }
    );
  });
}

async function main() {
  log(colors.bold + colors.green, "🚀 ابزار مانیتورینگ سیستم OTP نخشا");
  log(colors.blue, "مطمئن شوید که سرور با npm run dev روشن است\n");

  while (true) {
    await getMetrics();

    const input = await new Promise((resolve) => {
      rl.question("", resolve);
    });

    if (input.toLowerCase() === "q") {
      log(colors.green, "👋 خداحافظ!");
      break;
    } else if (input.toLowerCase() === "t") {
      await testOtp();
    }
  }

  rl.close();
}

if (require.main === module) {
  main().catch(console.error);
}
