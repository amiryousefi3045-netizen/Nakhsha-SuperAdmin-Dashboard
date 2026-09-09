/**
 * Unit tests for Persian formatting helpers (public/adminFormat.ts).
 */
import { describe, it, expect } from "vitest";
import { faNumber, formatDate, formatDateTime } from "../adminFormat";

describe("faNumber", () => {
  it("converts ASCII digits to Persian digits", () => {
    expect(faNumber("1234567890")).toBe("۱۲۳۴۵۶۷۸۹۰");
  });

  it("accepts numbers", () => {
    expect(faNumber(42)).toBe("۴۲");
  });

  it("leaves non-digit characters untouched", () => {
    expect(faNumber("شماره 0912")).toBe("شماره ۰۹۱۲");
  });
});

describe("formatDate", () => {
  it("formats a Date as YYYY/MM/DD with Persian digits", () => {
    expect(formatDate(new Date(2026, 8, 8, 12, 0))).toBe("۲۰۲۶/۰۹/۰۸");
  });

  it("returns a dash for invalid input", () => {
    expect(formatDate("not-a-date")).toBe("-");
  });
});

describe("formatDateTime", () => {
  it("formats date and time with Persian digits", () => {
    expect(formatDateTime(new Date(2026, 8, 8, 14, 30))).toBe("۲۰۲۶/۰۹/۰۸ ۱۴:۳۰");
  });

  it("returns a dash for invalid input", () => {
    expect(formatDateTime("")).toBe("-");
  });
});