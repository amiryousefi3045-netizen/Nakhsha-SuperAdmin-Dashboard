const MelipayamakApi = require("melipayamak");
const logger = require("../../utils/logger");
const { formatForProvider } = require("../../utils/phone");

// Environment variables
const MELIPAYAMAK_USERNAME = process.env.MELIPAYAMAK_USERNAME;
const MELIPAYAMAK_PASSWORD = process.env.MELIPAYAMAK_PASSWORD;
const MELIPAYAMAK_FROM = process.env.MELIPAYAMAK_FROM || "50004001854432";
const MELIPAYAMAK_TO_FORMAT = process.env.MELIPAYAMAK_TO_FORMAT || "09";

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
  const message = `*نخشا*
کد ورود شما: ${code}
لطفاً این کد را در اختیار دیگران قرار ندهید.
(مدت زمان اعتبار تا ۲ دقیقه)`;

  // In development mode, simulate success for faster testing
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
  });

  try {
    // Try REST API first with timeout
    const result = await Promise.race([
      new Promise((resolve, reject) => {
        sms.send(
          formattedPhone,
          MELIPAYAMAK_FROM,
          message,
          (response, error) => {
            if (error) {
              reject(new Error(`REST API error: ${error}`));
            } else {
              resolve(response);
            }
          }
        );
      }),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("REST API timeout after 10 seconds")),
          10000
        );
      }),
    ]);

    logger.info("SMS sent successfully via REST", {
      phone: formattedPhone,
      result: result,
    });

    return;
  } catch (restError) {
    logger.warn("REST API failed, trying SOAP fallback", {
      error: restError.message,
      phone: formattedPhone,
    });

    try {
      // Fallback to SOAP API if available with timeout
      if (typeof sms.sendByBaseNumber === "function") {
        const soapResult = await Promise.race([
          new Promise((resolve, reject) => {
            sms.sendByBaseNumber(
              message,
              formattedPhone,
              MELIPAYAMAK_FROM,
              (response, error) => {
                if (error) {
                  reject(new Error(`SOAP API error: ${error}`));
                } else {
                  resolve(response);
                }
              }
            );
          }),
          new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error("SOAP API timeout after 10 seconds")),
              10000
            );
          }),
        ]);

        logger.info("SMS sent successfully via SOAP", {
          phone: formattedPhone,
          result: soapResult,
        });

        return;
      } else {
        throw new Error("SOAP method not available");
      }
    } catch (soapError) {
      logger.error("Both REST and SOAP APIs failed", {
        phone: formattedPhone,
        restError: restError.message,
        soapError: soapError.message,
      });

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
