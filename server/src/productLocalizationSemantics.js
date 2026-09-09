import { normalizeGlossaryPhrase } from "../../src/shared/i18n/productLocalization.js";

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;
const QUOTED_RE = /«[^»]+»/g;
const IDENTITY_KEYS = ["code", "oneCCode", "oneCId"];

function asText(value) {
  return typeof value === "string" ? value : String(value || "");
}

export function extractNumericTokens(text) {
  return [...asText(text).matchAll(NUMBER_RE)].map((match) => match[0].replace(",", "."));
}

export function extractQuotedTokens(text) {
  return [...asText(text).matchAll(QUOTED_RE)].map((match) => match[0]);
}

export function extractImmutableIdentityTokens(source, product) {
  const text = asText(source);
  const tokens = [];
  for (const key of IDENTITY_KEYS) {
    const value = String(product?.[key] || "").trim();
    if (value && text.includes(value)) tokens.push(value);
  }
  return tokens;
}

export function sortGlossaryForApply(entries) {
  return [...(Array.isArray(entries) ? entries : [])].sort((a, b) => {
    const aSource = asText(a.source_ru || a.sourceRu);
    const bSource = asText(b.source_ru || b.sourceRu);
    const sourceDelta = bSource.length - aSource.length;
    if (sourceDelta) return sourceDelta;
    const aContext = asText(a.context);
    const bContext = asText(b.context);
    return bContext.length - aContext.length;
  });
}

export function applyGlossaryPhrases(sourceRu, languageEntries) {
  let output = asText(sourceRu);
  if (!output) return output;
  const used = [];
  for (const entry of sortGlossaryForApply(languageEntries)) {
    const phrase = asText(entry.source_ru || entry.sourceRu).trim();
    const target = asText(entry.target_value || entry.targetValue).trim();
    if (!phrase || !target) continue;
    const index = output.toLowerCase().indexOf(phrase.toLowerCase());
    if (index < 0) continue;
    const overlaps = used.some(
      (span) => index < span.end && index + phrase.length > span.start
    );
    if (overlaps) continue;
    output = `${output.slice(0, index)}${target}${output.slice(index + phrase.length)}`;
    used.push({ start: index, end: index + target.length });
  }
  return output;
}

function missingTokens(required, haystack) {
  const remaining = asText(haystack);
  const missing = [];
  for (const token of required) {
    if (!token) continue;
    if (!remaining.includes(token)) missing.push(token);
  }
  return missing;
}

export function validateProductTranslationSemantics({
  sourceRu,
  targetValue,
  product,
  glossaryEntries = [],
} = {}) {
  const source = asText(sourceRu);
  const target = asText(targetValue);
  if (!target.trim()) {
    return { ok: false, code: "EMPTY_VALUE", message: "Translation value cannot be empty." };
  }

  const sourceNumbers = extractNumericTokens(source);
  const targetNumbers = extractNumericTokens(target);
  const leftover = [...sourceNumbers];
  for (const token of targetNumbers) {
    const index = leftover.indexOf(token);
    if (index >= 0) leftover.splice(index, 1);
  }
  if (leftover.length) {
    return {
      ok: false,
      code: "NUMERIC_MISMATCH",
      message: "Translation is missing source numbers, dimensions, or quantities.",
    };
  }

  const immutable = [
    ...extractImmutableIdentityTokens(source, product),
    ...extractQuotedTokens(source),
  ];
  const missingImmutable = missingTokens(immutable, target);
  if (missingImmutable.length) {
    return {
      ok: false,
      code: "PROTECTED_TOKEN_MISMATCH",
      message: "Translation is missing a protected product token.",
    };
  }

  const sourceNorm = normalizeGlossaryPhrase(source);
  for (const entry of Array.isArray(glossaryEntries) ? glossaryEntries : []) {
    if (!entry || Number(entry.protected) !== 1 && entry.protected !== true) continue;
    const phrase = normalizeGlossaryPhrase(entry.source_ru || entry.sourceRu);
    const expected = asText(entry.target_value || entry.targetValue).trim();
    if (!phrase || !expected) continue;
    if (!sourceNorm.includes(phrase)) continue;
    if (!target.includes(expected)) {
      return {
        ok: false,
        code: "GLOSSARY_PROTECTED_MISMATCH",
        message: "Translation is missing a protected glossary term.",
      };
    }
  }

  return { ok: true };
}
