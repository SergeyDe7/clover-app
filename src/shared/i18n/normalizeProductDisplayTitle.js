/**
 * Display-only first-letter polish for foreign product titles.
 * Never mutates stored translations or canonical RU names.
 */

function asLocale(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
}

/** Locales where this task must be an exact string no-op (incl. no trim). */
function isExactNoOpLocale(locale) {
  const code = asLocale(locale);
  return code === "ru" || code === "zh" || code === "zh-cn" || code === "ar";
}

function localeTagForCase(locale) {
  const code = asLocale(locale);
  if (code === "zh-cn") return "zh-CN";
  return code || "en";
}

function isLetter(ch) {
  return /\p{L}/u.test(ch);
}

function hasCaseDistinction(ch, tag) {
  return ch.toLocaleLowerCase(tag) !== ch.toLocaleUpperCase(tag);
}

function isUpperCasedLetter(ch, tag) {
  return hasCaseDistinction(ch, tag) && ch === ch.toLocaleUpperCase(tag);
}

function isLowerCasedLetter(ch, tag) {
  return hasCaseDistinction(ch, tag) && ch === ch.toLocaleLowerCase(tag);
}

/**
 * First letter-run token starting at the first Unicode letter.
 * Digits/punctuation before the letter are left untouched.
 */
function firstLetterTokenRange(chars) {
  let start = -1;
  for (let i = 0; i < chars.length; i += 1) {
    if (isLetter(chars[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = start + 1;
  while (end < chars.length && isLetter(chars[end])) end += 1;
  return { start, end };
}

function tokenIsMixedCase(tokenChars, tag) {
  if (!tokenChars.length) return false;
  // First letter lowercase, but a later letter in the same token is uppercase
  // (iPhone, eBay). Intentional brand/mixed casing — leave alone.
  if (!isLowerCasedLetter(tokenChars[0], tag)) return false;
  for (let i = 1; i < tokenChars.length; i += 1) {
    if (isUpperCasedLetter(tokenChars[i], tag)) return true;
  }
  return false;
}

/**
 * @param {unknown} value
 * @param {string} [locale] public or internal locale code (en, uz, ky, tg, zh, zh-CN, ar, ru)
 * @returns {string}
 */
export function normalizeProductDisplayTitle(value, locale) {
  if (value == null) return "";
  if (typeof value !== "string") return "";
  if (isExactNoOpLocale(locale)) return value;

  const trimmed = value.trim();
  if (!trimmed) return "";

  const tag = localeTagForCase(locale);
  const chars = [...trimmed];
  const range = firstLetterTokenRange(chars);
  if (!range) return trimmed;

  const first = chars[range.start];
  if (!hasCaseDistinction(first, tag)) return trimmed;
  if (isUpperCasedLetter(first, tag)) return trimmed;

  const tokenChars = chars.slice(range.start, range.end);
  if (tokenIsMixedCase(tokenChars, tag)) return trimmed;
  if (!isLowerCasedLetter(first, tag)) return trimmed;

  chars[range.start] = first.toLocaleUpperCase(tag);
  return chars.join("");
}
