const logger = require("../../utils/logger");

/**
 * Email transport for the buyer notification pipeline (Phase 21) — the
 * dependency-free counterpart of sendSms. Outbound email is delivered through
 * a configurable HTTP hook (MAIL_API_URL + MAIL_API_KEY, JSON POST), so the
 * backend never shipped an SMTP dependency; everything stays hermetic.
 *
 * In mock/dev/test mode delivery is simulated (no network):
 *   - EMAIL_MOCK === "true"             → always mock
 *   - NODE_ENV === "test"               → always mock
 *   - NODE_ENV === "development" && no MAIL_API_URL → mock
 * EMAIL_MOCK_FAIL === "true" forces a simulated failure (test seam), so the
 * retry/error bookkeeping of the notification queue is fully exercisable.
 */

const EMAIL_TIMEOUT_MS = Number.parseInt(process.env.EMAIL_TIMEOUT_MS || "5000", 10);
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@nakhsha.local";

function isConfigured() {
  return Boolean(process.env.MAIL_API_URL && process.env.MAIL_API_KEY);
}

/**
 * @param {string} to      recipient address
 * @param {string} subject email subject
 * @param {string} body    plain-text Persian body
 * @param {object} [meta]  context for logs (e.g. { kind: "order-status" })
 * @returns {Promise<void>}
 * @throws {Error} if delivery fails outside mock/dev modes
 */
async function sendEmail(to, subject, body, meta = {}) {
  if (!to || !subject || !body) {
    throw new Error("Email recipient, subject and body are required");
  }

  const kind = meta.kind || "generic";

  if (
    process.env.EMAIL_MOCK === "true" ||
    process.env.NODE_ENV === "test" ||
    (process.env.NODE_ENV === "development" && !isConfigured())
  ) {
    logger.info("Email mocked (development/testing mode)", {
      to,
      subject,
      kind,
      body: "Email would be sent in production with a configured API hook",
    });
    if (process.env.EMAIL_MOCK_FAIL === "true") {
      throw new Error("Email delivery failed (simulated)");
    }
    return;
  }

  if (!isConfigured()) {
    logger.error("Email API not configured", {
      hint: "Set MAIL_API_URL and MAIL_API_KEY, or enable EMAIL_MOCK=true for testing",
    });
    throw new Error("Email API not configured");
  }

  logger.info("Attempting to send email", {
    to,
    from: EMAIL_FROM,
    subject,
    kind,
    hasApiKey: Boolean(process.env.MAIL_API_KEY),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
  try {
    const res = await fetch(process.env.MAIL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MAIL_API_KEY}`,
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, text: body, kind, meta }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Email API rejected (${res.status}): ${detail.slice(0, 300)}`);
    }
    logger.info("Email sent successfully", { to, subject, kind });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Email API timeout after ${EMAIL_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendEmail, EMAIL_FROM };