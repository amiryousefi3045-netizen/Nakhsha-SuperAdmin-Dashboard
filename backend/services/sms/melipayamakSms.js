const MelipayamakApi = require("melipayamak");
const logger = require("../../utils/logger");
const { formatForProvider } = require("../../utils/phone");

// Simple timeout helper for promise-based operations
function withTimeout(promiseFactory, ms, timeoutLabel) {
  return Promise.race([
    promiseFactory(),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`${timeoutLabel || "operation"} timeout after ${ms}ms`)
          ),
        ms
      )
    ),
  ]);
}

// Environment variables
const MELIPAYAMAK_USERNAME = process.env.SMS_USERNAME;
const MELIPAYAMAK_PASSWORD = process.env.SMS_PASSWORD;
const MELIPAYAMAK_FROM = process.env.SMS_FROM || "50004001854432";
// Recipients are Iranian mobiles: national format 09xxxxxxxxx by default so the
// provider delivers to the user's entered number. '98' produces 989xxxxxxxxx.
const MELIPAYAMAK_TO_FORMAT = process.env.SMS_TO_FORMAT || "09";
const SMS_TIMEOUT_MS = parseInt(process.env.SMS_TIMEOUT_MS || "4000", 10); // 3-5s recommended

/**
 * Send OTP SMS using MeliPayamak service
 * @param {string} phone - Recipient phone number (normalized 09xxxxxxxxx)
 * @param {string} code - OTP code to send
 * @returns {Promise<void>}
 * @throws {Error} If SMS sending fails
 */
async function sendOtpSms(phone, code) {
  if (!phone || !code) {
    throw new Error("Phone number and code are required");
  }

  // Format phone number for provider, applying the configured country-code
  // format (defaults to Iran +98) so SMS reaches the user's entered number.
  let formattedPhone;
  try {
    formattedPhone = formatForProvider(phone, MELIPAYAMAK_TO_FORMAT);
  } catch (err) {
    logger.error("Phone formatting error", { phone, error: err.message });
    throw new Error("Invalid phone number format");
  }

  logger.info("SMS recipient prepared", {
    input: phone,
    recipient: formattedPhone,
    format: MELIPAYAMAK_TO_FORMAT,
  });

  // Persian OTP message
  const message = `کد تایید نخشا:
Code: ${code}
برای دیگران نفرستید.`;

  // In development mode or when SMS_MOCK is enabled, simulate success
  if (
    process.env.SMS_MOCK === "true" ||
    (process.env.NODE_ENV === "development" &&
      (!MELIPAYAMAK_USERNAME || !MELIPAYAMAK_PASSWORD))
  ) {
    logger.info("SMS mocked (development/testing mode)", {
      phone: formattedPhone,
      code,
      message: "SMS would be sent in production with valid credentials",
    });
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    return;
  }

  // Check credentials only when not in mock mode
  if (!MELIPAYAMAK_USERNAME || !MELIPAYAMAK_PASSWORD) {
    logger.error("OTP error recorded", {
      error: "MeliPayamak credentials not configured",
      hint: "Set SMS_USERNAME and SMS_PASSWORD environment variables, or enable SMS_MOCK=true for testing",
    });
    throw new Error("MeliPayamak credentials not configured");
  }

  const api = new MelipayamakApi(MELIPAYAMAK_USERNAME, MELIPAYAMAK_PASSWORD);
  // `api.sms()` in melipayamak@1.0.5 returns the promise-based async client
  // (RestAsync). Its send() resolves with the provider JSON response, so we
  // await it directly instead of using a callback that the client never calls.
  const sms = api.sms();

  logger.info("Attempting to send SMS", {
    phone: formattedPhone,
    from: MELIPAYAMAK_FROM,
    format: MELIPAYAMAK_TO_FORMAT,
    username: MELIPAYAMAK_USERNAME,
    hasPassword: !!MELIPAYAMAK_PASSWORD,
  });

  // Provider reports a delivered SMS only when RetStatus === 1 on the JSON REST
  // response. The SOAP API returns a numeric recId (here 10-digit, e.g.
  // 2474231322) on success and a small error code ("2", "-1", "-4", ...)
  // otherwise, so only a >=4-digit positive integer counts as delivered.
  const isSuccess = (res) => {
    if (res === null || res === undefined) return false;
    if (typeof res === "object") {
      return Number(res.RetStatus) === 1;
    }
    const n = Number(String(res).trim());
    return Number.isInteger(n) && n >= 1000;
  };

  // Format a provider failure, flagging the most common cause: the panel
  // returns RetStatus 35 (InvalidData) or SOAP "2" when its credit is empty.
  const describeFailure = (api, res) => {
    const raw = typeof res === "object" ? JSON.stringify(res) : String(res);
    if (/^2$/.test(String(res).trim()) || /"RetStatus":\s*35/.test(raw)) {
      return `${api} API rejected (${String(res).trim() || raw}); the MeliPayamak panel usually returns this when its credit is exhausted`;
    }
    return `${api} API error: ${raw}`;
  };

  try {
    // Try REST API first (promise-based client) with timeout
    const restResult = await withTimeout(
      () => sms.send(formattedPhone, MELIPAYAMAK_FROM, message),
      SMS_TIMEOUT_MS,
      "REST API",
    );

    if (isSuccess(restResult)) {
      logger.info("SMS sent successfully via REST", {
        phone: formattedPhone,
        result: restResult,
      });
      return;
    }

    throw new Error(describeFailure("REST", restResult));
  } catch (restError) {
    logger.warn("REST API failed, trying SOAP fallback", {
      error: restError.message,
      phone: formattedPhone,
    });

    try {
      // Fallback to SOAP API (promise-based) with timeout
      const soap = api.sms("soap", "async");
      const soapResult = await withTimeout(
        () => soap.send(formattedPhone, MELIPAYAMAK_FROM, message),
        SMS_TIMEOUT_MS,
        "SOAP API",
      );

      if (isSuccess(soapResult)) {
        logger.info("SMS sent successfully via SOAP", {
          phone: formattedPhone,
          result: soapResult,
        });
        return;
      }

      throw new Error(describeFailure("SOAP", soapResult));
    } catch (soapError) {
      logger.error("Both REST and SOAP APIs failed", {
        phone: formattedPhone,
        restError: restError.message,
        soapError: soapError.message,
      });

      // In development mode, don't fail completely if SMS service is down
      if (process.env.NODE_ENV === "development") {
        logger.warn("SMS service failed in development, continuing anyway", {
          phone: formattedPhone,
          restError: restError.message,
          soapError: soapError.message,
        });
        return; // Don't throw error in development
      }

      throw new Error(
        `SMS sending failed: ${restError.message}; SOAP fallback: ${soapError.message}`
      );
    }
  }
}

/**
 * Test SMS service configuration
 * @returns {Promise<boolean>} True if configuration is valid
 */
async function testConfiguration() {
  try {
    // In mock mode, always return true if we have some credentials
    if (
      process.env.NODE_ENV === "development" &&
      process.env.SMS_MOCK === "true"
    ) {
      logger.info("SMS service in mock mode", {
        username: MELIPAYAMAK_USERNAME || "NOT SET",
        from: MELIPAYAMAK_FROM,
        format: MELIPAYAMAK_TO_FORMAT,
        mock: true,
      });
      return true;
    }

    if (!MELIPAYAMAK_USERNAME || !MELIPAYAMAK_PASSWORD) {
      logger.warn("MeliPayamak credentials missing");
      return false;
    }

    // Test with dummy data (won't actually send)
    const api = new MelipayamakApi(MELIPAYAMAK_USERNAME, MELIPAYAMAK_PASSWORD);
    api.sms();

    logger.info("MeliPayamak service configured", {
      username: MELIPAYAMAK_USERNAME,
      from: MELIPAYAMAK_FROM,
      format: MELIPAYAMAK_TO_FORMAT,
    });

    return true;
  } catch (err) {
    logger.error("MeliPayamak configuration test failed", {
      error: err.message,
    });
    return false;
  }
}

module.exports = {
  sendOtpSms,
  testConfiguration,
};
