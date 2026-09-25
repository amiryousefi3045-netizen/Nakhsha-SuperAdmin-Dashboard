const logger = require("../../utils/logger");

/**
 * Telegram transport for the buyer notification pipeline (Phase 22) — the
 * third channel after SMS and email. Delivery goes through the Bot API
 * (sendMessage), so the bot must know the buyer's chat id in advance; the
 * buyer links it once (PATCH /api/users/me/telegram) and checkout tags orders
 * with it server-side.
 *
 * Mock/dev/test behavior mirrors the other senders:
 *   - TELEGRAM_MOCK === "true"           → always mock
 *   - NODE_ENV === "test"                → always mock
 *   - NODE_ENV === "development" && no TELEGRAM_BOT_TOKEN → mock
 * TELEGRAM_MOCK_FAIL === "true" forces a simulated failure (test seam) so the
 * retry bookkeeping of the notification queue is exercisable without a bot.
 */

const TELEGRAM_TIMEOUT_MS = Number.parseInt(process.env.TELEGRAM_TIMEOUT_MS || "5000", 10);

function isConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * @param {string} chatId numeric Telegram chat id of the buyer
 * @param {string} message Persian text body
 * @param {object} [meta] context for logs (e.g. { kind: "order-status" })
 * @returns {Promise<void>}
 * @throws {Error} if delivery fails outside mock/dev modes
 */
async function sendTelegram(chatId, message, meta = {}) {
  if (!chatId || !message) {
    throw new Error("Telegram chat id and message are required");
  }
  if (!/^\d{1,20}$/.test(String(chatId).trim())) {
    throw new Error("Telegram chat id must be numeric");
  }

  const kind = meta.kind || "generic";
  const to = String(chatId).trim();

  if (
    process.env.TELEGRAM_MOCK === "true" ||
    process.env.NODE_ENV === "test" ||
    (process.env.NODE_ENV === "development" && !isConfigured())
  ) {
    logger.info("Telegram mocked (development/testing mode)", {
      to,
      kind,
      message: "Telegram message would be sent in production with a configured bot token",
    });
    if (process.env.TELEGRAM_MOCK_FAIL === "true") {
      throw new Error("Telegram delivery failed (simulated)");
    }
    return;
  }

  if (!isConfigured()) {
    logger.error("Telegram bot not configured", {
      hint: "Set TELEGRAM_BOT_TOKEN, or enable TELEGRAM_MOCK=true for testing",
    });
    throw new Error("Telegram bot not configured");
  }

  logger.info("Attempting to send Telegram message", { to, kind });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: Number(to), text: message }),
        signal: controller.signal,
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok !== true) {
      const detail = body?.description || `HTTP ${res.status}`;
      throw new Error(`Telegram API rejected: ${String(detail).slice(0, 300)}`);
    }
    logger.info("Telegram message sent successfully", { to, kind });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Telegram API timeout after ${TELEGRAM_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendTelegram };