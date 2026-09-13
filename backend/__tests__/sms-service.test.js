/**
 * sms-service.test.js — Unit tests for the SMS service (melipayamak) and the
 * phone formatting used to deliver OTP messages to Iranian mobiles.
 *
 * Covers:
 * - formatForProvider: national 09xxxxxxxxx (default), 98xxxxxxxxx variant,
 *   and rejection of invalid numbers.
 * - sendOtpSms: mock-mode success, input validation failures.
 */

const {
  normalizePhone,
  formatForProvider,
} = require("../utils/phone");
const { sendOtpSms } = require("../services/sms/melipayamakSms");

describe("formatForProvider", () => {
  test("returns national 09xxxxxxxxx by default for every input variant", () => {
    const variants = [
      "09123456789",
      "9123456789",
      "+989123456789",
      "989123456789",
      "0098-912-345-6789",
    ];
    for (const input of variants) {
      expect(formatForProvider(input)).toBe("09123456789");
    }
  });

  test("returns 09xxxxxxxxx when format is explicitly '09'", () => {
    expect(formatForProvider("+989123456789", "09")).toBe("09123456789");
  });

  test("returns 989xxxxxxxxx for the '98' country-code variant", () => {
    expect(formatForProvider("09123456789", "98")).toBe("989123456789");
  });

  test("normalizes Persian/Arabic digits to national 09xxxxxxxxx", () => {
    expect(formatForProvider("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
    expect(formatForProvider("٠٩١٢٣٤٥٦٧٨٩")).toBe("09123456789");
  });

  test("throws on invalid phone numbers", () => {
    expect(() => formatForProvider("123abc")).toThrow(/Invalid/);
    expect(() => formatForProvider("091234567890123456")).toThrow(/Invalid/);
  });
});

describe("normalizePhone", () => {
  test("removes the +98 prefix and adds the leading 0", () => {
    expect(normalizePhone("+989123456789")).toBe("09123456789");
    expect(normalizePhone("989123456789")).toBe("09123456789");
  });

  test("adds the leading 0 to bare 9xxxxxxxxx numbers", () => {
    expect(normalizePhone("9123456789")).toBe("09123456789");
  });
});

describe("sendOtpSms (mock mode)", () => {
  const previousMock = process.env.SMS_MOCK;

  afterEach(() => {
    if (previousMock === undefined) {
      delete process.env.SMS_MOCK;
    } else {
      process.env.SMS_MOCK = previousMock;
    }
  });

  test("resolves when SMS_MOCK=true", async () => {
    process.env.SMS_MOCK = "true";
    await expect(sendOtpSms("09123456789", "123456")).resolves.toBeUndefined();
  });

  test("rejects when phone and code are missing", async () => {
    process.env.SMS_MOCK = "true";
    await expect(sendOtpSms()).rejects.toThrow(/required/);
  });

  test("rejects invalid phone numbers", async () => {
    process.env.SMS_MOCK = "true";
    await expect(sendOtpSms("123abc", "123456")).rejects.toThrow(
      /Invalid phone number format/,
    );
  });
});