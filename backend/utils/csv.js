/**
 * Minimal RFC-4180 CSV helpers shared by row-level export endpoints.
 *
 * `toCsv` quotes every field that contains `"`, `,`, `\r` or `\n` (and always
 * escapes embedded double quotes). Row delimiters are CRLF so the file opens
 * cleanly in Excel on all platforms. Values render with a leading `=` prefix
 * stripped to blunt CSV-injection (a cell starting with `=`, `+`, `-` or `@`
 * is re-quoted with a single quote).
 */

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (/^[=+\-@]/.test(raw)) {
    return `"'${raw}"`;
  }
  return `"${raw.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  return rows.map((cells) => cells.map(csvCell).join(",")).join("\r\n");
}

function sendCsv(res, filename, csv) {
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}-${date}.csv"`);
  res.write("\uFEFF");
  res.end(csv);
}

module.exports = { toCsv, sendCsv };