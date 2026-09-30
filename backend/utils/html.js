/**
 * HTML escaping for the email channel (Phase 36).
 *
 * Why this module exists: the invoice email interpolates seller-controlled data
 * (a product title), buyer-controlled data (a customer name) and store data
 * (the store name) into an HTML document that is delivered to a *third party* —
 * the buyer — from the platform's own sending domain. Unescaped, a single
 * product title is enough to inject a phishing block or a remote tracking pixel
 * into a message the buyer has every reason to trust.
 *
 * The rule is deliberately blunt: escape on the way into the template, not on
 * the way out. Anything that is not authored here is untrusted.
 */

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape a value for interpolation into HTML text or a quoted attribute.
 *
 * Non-string input is coerced rather than dropped: a missing value rendering as
 * the literal "undefined" inside a customer's receipt is a support ticket, and
 * silently producing an empty string would hide a real data bug.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

module.exports = { escapeHtml };
