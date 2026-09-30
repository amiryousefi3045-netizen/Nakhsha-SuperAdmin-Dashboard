/**
 * Iranian address reference data (Phase 36, P1-08).
 *
 * Why this is a module and not a dependency: a shipping zone can only be
 * validated against a real list of provinces, and shipping is the one part of
 * checkout where "just accept a string" is not good enough — a zone typed
 * against a province that does not exist is a silently unshippable order. 31
 * strings are cheaper and more auditable than a package.
 *
 * Postal codes: Iran uses a 10-digit code. The code is stored and matched by
 * PREFIX rather than validated against the official province table, because
 * sellers legitimately target delivery areas ("all 16xxxxxxx" = west Tehran)
 * rather than whole provinces, and a prefix list expresses that intent directly.
 * The province field is validated separately against the list below, so a
 * postal-only zone is still anchored to something real.
 */

const IRAN_PROVINCES = [
  "آذربایجان شرقی",
  "آذربایجان غربی",
  "اردبیل",
  "اصفهان",
  "البرز",
  "ایلام",
  "بوشهر",
  "تهران",
  "چهارمحال و بختیاری",
  "خراسان جنوبی",
  "خراسان رضوی",
  "خراسان شمالی",
  "خوزستان",
  "زنجان",
  "سمنان",
  "سیستان و بلوچستان",
  "فارس",
  "قزوین",
  "قم",
  "کردستان",
  "کرمان",
  "کرمانشاه",
  "کهگیلویه و بویراحمد",
  "گلستان",
  "گیلان",
  "لرستان",
  "مازندران",
  "مرکزی",
  "هرمزگان",
  "همدان",
  "یزد",
];

const PROVINCE_SET = new Set(IRAN_PROVINCES);

/**
 * Persian and Arabic letter variants of ی/ي and ک/ك are the same province to a
 * human but different strings to a validator, and Iranian users type both. A
 * rejected province here reads to the seller as "my store is broken".
 */
const LETTER_FIXES = [
  [/ي/g, "ی"],
  [/ك/g, "ک"],
  [/‌/g, " "], // ZWNJ → space
  [/\s+/g, " "],
];

function normalizeText(value) {
  if (typeof value !== "string") return "";
  let out = value.trim();
  for (const [pattern, replacement] of LETTER_FIXES) out = out.replace(pattern, replacement);
  // Trimmed again: the ZWNJ→space fix can leave a trailing space behind, and
  // "تهران‌" must normalize to "تهران" like the space-separated form does.
  return out.trim();
}

function isValidProvince(name) {
  return PROVINCE_SET.has(normalizeText(name));
}

function normalizeProvince(name) {
  const normalized = normalizeText(name);
  return PROVINCE_SET.has(normalized) ? normalized : "";
}

/**
 * Strip the formatting Iranian users type (spaces, hyphens, Persian/Arabic
 * digits) and return the 10-digit code, or "" if it is not one.
 *
 * Persian digits are the real case here: buyers paste their code from a Persian
 * keyboard, and a 10-digit check that only accepts ASCII rejects the majority of
 * real input.
 */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalizePostalCode(value) {
  if (typeof value === "number") value = String(value);
  if (typeof value !== "string") return "";
  let digits = "";
  for (const char of value) {
    const persian = PERSIAN_DIGITS.indexOf(char);
    if (persian >= 0) {
      digits += String(persian);
      continue;
    }
    const arabic = ARABIC_DIGITS.indexOf(char);
    if (arabic >= 0) {
      digits += String(arabic);
      continue;
    }
    if (char >= "0" && char <= "9") digits += char;
  }
  return digits.length === 10 ? digits : "";
}

module.exports = {
  IRAN_PROVINCES,
  isValidProvince,
  normalizeProvince,
  normalizePostalCode,
  normalizeText,
};
