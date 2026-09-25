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
 * Send an SMS via MeliPayamak service. The generic sender for every channel:
 * OTP messages (sendOtpSms), order status notifications, and future surfaces.
 *
 * In mock/dev/test mode the send is simulated (no network) so the pipeline is
 * fully hermetic without real credentials.
 *
 * @param {string} phone - Recipient phone number (normalized 09xxxxxxxxx)
 * @param {string} message - Plain-text Persian message body
 * @param {object} [meta] - Optional context for logs (e.g. { kind: "order-status" })
 * @returns {Promise<void>}
 * @throws {Error} If SMS sending fails (outside mock/dev/test mode)
 */
async function sendSms(phone, message, meta = {}) {
  if (!phone || !message) {
    throw new Error("Phone number and message are required");
  }

  const kind = meta.kind || "generic";

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
    kind,
  });

  // In mock/dev/test mode, simulate success (no network, no credentials).
  // Tests keep the pipeline hermetic just like getSmsStatus() does.
  if (
    process.env.SMS_MOCK === "true" ||
    process.env.NODE_ENV === "test" ||
    (process.env.NODE_ENV === "development" &&
      (!MELIPAYAMAK_USERNAME || !MELIPAYAMAK_PASSWORD))
  ) {
    logger.info("SMS mocked (development/testing mode)", {
      phone: formattedPhone,
      kind,
      message: "SMS would be sent in production with valid credentials",
    });
    // Test-only seam: force a simulated delivery failure so the outbound
    // pipeline's failure branch (error accounting, no throw) is fully legible.
    if (process.env.SMS_MOCK_FAIL === "true") {
      throw new Error("SMS delivery failed (simulated)");
    }
    // Simulate API delay; skip in tests for speed.
    if (process.env.NODE_ENV !== "test") {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return;
  }

  // Check credentials only when not in mock mode
  if (!MELIPAYAMAK_USERNAME || !MELIPAYAMAK_PASSWORD) {
    logger.error("SMS send error recorded", {
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

// ---------------------------------------------------------------------------
// Service status / credit probe
// ---------------------------------------------------------------------------

// Short-lived cache so /api/health and the admin panel do not hammer the
// provider's GetCredit endpoint on every poll.  Keyed on wall-clock time.
let creditCache = null;
const CREDIT_CACHE_TTL_MS = 60 * 1000;

/**
 * Non-intrusive status of the SMS pipeline.  Never throws.
 *
 * - `configured` – credentials present.
 * - `mock`       – SMS_MOCK=true (or dev-without-credentials).
 * - `mode`       – "mock" | "live" | "disabled".
 * - `credit`     – provider balance when reachable and configured; null when
 *                  disabled/mocked/probe-failed (credit is cached 60s).
 *
 * The provider is never dialed from the test environment.
 *
 * @returns {Promise<object>}
 */
async function getSmsStatus() {
  const configured = Boolean(MELIPAYAMAK_USERNAME && MELIPAYAMAK_PASSWORD);
  const mock =
    process.env.SMS_MOCK === "true" ||
    (process.env.NODE_ENV === "development" && !configured);

  const base = {
    configured,
    mock,
    mode: mock ? "mock" : configured ? "live" : "disabled",
    from: MELIPAYAMAK_FROM,
    toFormat: MELIPAYAMAK_TO_FORMAT,
    hasUsername: Boolean(MELIPAYAMAK_USERNAME),
    hasPassword: Boolean(MELIPAYAMAK_PASSWORD),
    lastCheckAt: null,
    credit: null,
  };

  if (!configured || mock || process.env.NODE_ENV === "test") return base;

  const now = Date.now();
  if (creditCache && now - creditCache.at < CREDIT_CACHE_TTL_MS) {
    return { ...base, credit: creditCache.value, lastCheckAt: creditCache.at };
  }

  try {
    const api = new MelipayamakApi(MELIPAYAMAK_USERNAME, MELIPAYAMAK_PASSWORD);
    const sms = api.sms();
    const credit = await withTimeout(
      () => sms.getCredit(),
      2000,
      "GetCredit probe",
    );
    const value =
      credit && typeof credit === "object" ? credit.Value : credit ?? null;
    creditCache = { at: Date.now(), value };
    return { ...base, credit: value, lastCheckAt: Date.now() };
  } catch (err) {
    logger.warn("SMS credit probe failed", { error: err.message });
    return { ...base, credit: null, lastCheckAt: Date.now() };
  }
}

module.exports = {
  sendSms,
  sendOtpSms,
  testConfiguration,
  getSmsStatus,
};

/**
 * Send an OTP SMS — thin wrapper over sendSms with the fixed Persian template.
 * Kept as a public API for the auth flow; the generic sender serves everything
 * else (order notifications, future channels).
 */
async function sendOtpSms(phone, code) {
  if (!phone || !code) {
    throw new Error("Phone number and code are required");
  }

  const message = `کد تایید نخشا:
Code: ${code}
برای دیگران نفرستید.`;

  return sendSms(phone, message, { kind: "otp" });
}
