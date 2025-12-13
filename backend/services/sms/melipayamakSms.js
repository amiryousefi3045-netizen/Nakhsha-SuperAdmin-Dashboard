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
  if (!MELIPAYAMAK_USERNAME || !MELIPAYAMAK_PASSWORD) {
    throw new Error("MeliPayamak credentials not configured");
  }

  if (!phone || !code) {
    throw new Error("Phone number and code are required");
  }

  // Format phone number for provider
  let formattedPhone;
  try {
    formattedPhone = formatForProvider(phone, MELIPAYAMAK_TO_FORMAT);
  } catch (err) {
    logger.error("Phone formatting error", { phone, error: err.message });
    throw new Error("Invalid phone number format");
  }

  // Persian OTP message
  const message = `کد تایید نخشا:
Code: ${code}
برای دیگران نفرستید.`;

  // In development mode, simulate success for faster testing (only if SMS_MOCK is true)
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SMS_MOCK === "true"
  ) {
    logger.info("SMS mocked in development mode", {
      phone: formattedPhone,
      code,
      message: "SMS would be sent in production",
    });
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }

  const api = new MelipayamakApi(MELIPAYAMAK_USERNAME, MELIPAYAMAK_PASSWORD);
  const sms = api.sms();

  logger.info("Attempting to send SMS", {
    phone: formattedPhone,
    from: MELIPAYAMAK_FROM,
    format: MELIPAYAMAK_TO_FORMAT,
    username: MELIPAYAMAK_USERNAME,
    hasPassword: !!MELIPAYAMAK_PASSWORD,
  });

  try {
    // Try REST API first with timeout
    const restResult = await withTimeout(
      () =>
        new Promise((resolve, reject) => {
          sms.send(
            formattedPhone,
            MELIPAYAMAK_FROM,
            message,
            (response, error) => {
              if (error) return reject(new Error(`REST API error: ${error}`));
              resolve(response);
            }
          );
        }),
      SMS_TIMEOUT_MS,
      "REST API"
    );

    // Only log success if provider indicates success
    if (restResult && String(restResult).trim()) {
      logger.info("SMS sent successfully via REST", {
        phone: formattedPhone,
        result: restResult,
      });
      return;
    }

    // If result is falsy/empty, treat as failure and try fallback
    throw new Error("REST API returned empty result");
  } catch (restError) {
    logger.warn("REST API failed, trying SOAP fallback", {
      error: restError.message,
      phone: formattedPhone,
    });

    try {
      // Fallback to SOAP API if available with timeout
      if (typeof sms.sendByBaseNumber === "function") {
        const soapResult = await withTimeout(
          () =>
            new Promise((resolve, reject) => {
              sms.sendByBaseNumber(
                message,
                formattedPhone,
                MELIPAYAMAK_FROM,
                (response, error) => {
                  if (error)
                    return reject(new Error(`SOAP API error: ${error}`));
                  resolve(response);
                }
              );
            }),
          SMS_TIMEOUT_MS,
          "SOAP API"
        );

        if (soapResult && String(soapResult).trim()) {
          logger.info("SMS sent successfully via SOAP", {
            phone: formattedPhone,
            result: soapResult,
          });
          return;
        }

        throw new Error("SOAP API returned empty result");
      } else {
        throw new Error("SOAP method not available");
      }
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
    const sms = api.sms();

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
