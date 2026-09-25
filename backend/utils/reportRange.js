/**
 * reportRange — shared period parsing/normalisation for period reports.
 *
 * Both the sales report (SalesReportService) and the settlement report
 * (FinanceService) use this single implementation so windows, chart axes and
 * validation behave identically across domains.
 *
 * Conventions:
 *   - Default window is the last `DEFAULT_DAYS` (30) calendar days.
 *   - `from`/`to` are normalised to whole UTC days (startOfDayUtc / endOfDayUtc)
 *     so the aggregate $match, the JS day axis and the validation guard all
 *     agree on the same inclusive UTC-calendar range.
 *   - Any violation throws `ReportRangeError` (code VALIDATION_ERROR) which the
 *     controller maps to HTTP 400.
 */

const DEFAULT_DAYS = 30;
const MAX_RANGE_DAYS = 366;

class ReportRangeError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** Midnight (UTC) of the given date — the inclusive lower edge of its day. */
function startOfDayUtc(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Last millisecond (UTC) of the given date — the inclusive upper edge. */
function endOfDayUtc(d) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );
}

/** Add whole days in UTC (safe across DST-free UTC arithmetic). */
function addDaysUtc(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** "YYYY-MM-DD" (UTC) key for the given date. */
function dayKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Parse and normalise a report window.
 *
 * @param {object} [opts]
 * @param {string|Date} [opts.from] inclusive lower bound (ISO date/datetime)
 * @param {string|Date} [opts.to] inclusive upper bound (ISO date/datetime)
 * @returns {{start: Date, end: Date}} whole-UTC-day inclusive edges
 * @throws {ReportRangeError} on invalid/inverted/oversized ranges
 */
function resolveRange({ from, to } = {}) {
  const now = new Date();
  let start = from ? new Date(from) : new Date(now.getTime() - DEFAULT_DAYS * 86400000);
  let end = to ? new Date(to) : new Date(now.getTime());

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ReportRangeError("VALIDATION_ERROR", "بازه زمانی نامعتبر است", {
      field: "from/to",
    });
  }
  if (start > end) {
    throw new ReportRangeError(
      "VALIDATION_ERROR",
      "تاریخ شروع باید قبل از تاریخ پایان باشد",
      { field: "from" },
    );
  }
  const rangeDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new ReportRangeError(
      "VALIDATION_ERROR",
      `بازه زمانی نمی‌تواند بیش از ${MAX_RANGE_DAYS} روز باشد`,
      { field: "from/to" },
    );
  }

  return { start: startOfDayUtc(start), end: endOfDayUtc(end) };
}

module.exports = {
  ReportRangeError,
  DEFAULT_DAYS,
  MAX_RANGE_DAYS,
  resolveRange,
  startOfDayUtc,
  endOfDayUtc,
  addDaysUtc,
  dayKey,
};