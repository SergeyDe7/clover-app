import { normalizeGlossaryPhrase } from "../../src/shared/i18n/productLocalization.js";

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;
const IDENTITY_KEYS = ["code", "oneCCode", "oneCId"];
const ID_TOKEN_RE = /\b(?:НФ-\d+|NF-\d+|CL-\d+)\b/gi;
const DIMENSION_RE = /(\d+(?:[.,]\d+)?)(?:\s*[x×XхХ]\s*(\d+(?:[.,]\d+)?)){1,2}/g;
const RATIO_RE = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/g;
const MEASURE_RE = /(\d+(?:[.,]\d+)?)\s*(г\/м²|г\/м2|gsm|мм|mm|см|cm|мл|ml|кг|kg|шт|pcs?|эт|гр|мкм|um|µm|м|m|л|l|г|g)(?=$|[^\p{L}\p{N}])/giu;

const UNIT_CANON = Object.freeze({
  мм: "mm",
  см: "cm",
  мл: "ml",
  л: "l",
  г: "g",
  кг: "kg",
  "г/м²": "gsm",
  "г/м2": "gsm",
  шт: "pcs",
  эт: "lbl",
  гр: "g",
  мкм: "um",
  um: "um",
  "µm": "um",
  м: "m",
  mm: "mm",
  cm: "cm",
  ml: "ml",
  l: "l",
  g: "g",
  kg: "kg",
  gsm: "gsm",
  pcs: "pcs",
  pc: "pcs",
  m: "m",
});

export const PRODUCT_GLOSSARY_CONTEXTS = Object.freeze({
  name: "product.name",
  description: "product.description",
  composition: "product.composition",
  characteristics: "product.characteristics",
});

function asText(value) {
  return typeof value === "string" ? value : String(value || "");
}

export function normalizeNumericToken(value) {
  return String(value || "").replace(",", ".").replace(/^\./, "0.");
}

export function extractNumericTokens(text) {
  const stripped = asText(text)
    .replace(/г\/м[²2]/gi, "gsm")
    .replace(/g\/m[²2]/gi, "gsm");
  return [...stripped.matchAll(NUMBER_RE)].map((match) => normalizeNumericToken(match[0]));
}

export function extractImmutableIdentityTokens(source, product) {
  const text = asText(source);
  const tokens = [];
  for (const key of IDENTITY_KEYS) {
    const value = String(product?.[key] || "").trim();
    if (value && text.includes(value)) tokens.push(value);
  }
  for (const match of text.matchAll(ID_TOKEN_RE)) {
    if (!tokens.includes(match[0])) tokens.push(match[0]);
  }
  return tokens;
}

function normalizeUnit(raw) {
  const key = String(raw || "").trim().toLowerCase().replace("м2", "м²");
  return UNIT_CANON[key] || UNIT_CANON[String(raw || "").trim()] || "";
}

export function extractMeasurementPairs(text) {
  const pairs = [];
  for (const match of asText(text).matchAll(MEASURE_RE)) {
    const unit = normalizeUnit(match[2]);
    if (!unit) continue;
    pairs.push(`${normalizeNumericToken(match[1])}|${unit}`);
  }
  return pairs.sort();
}

export function extractDimensionTuples(text) {
  const tuples = [];
  for (const match of asText(text).matchAll(DIMENSION_RE)) {
    const raw = match[0];
    const parts = raw.split(/[x×XхХ]/).map((part) => normalizeNumericToken(part.trim()));
    if (parts.length >= 2) tuples.push(parts.join("x"));
  }
  return tuples;
}

export function extractRatioTuples(text) {
  const tuples = [];
  for (const match of asText(text).matchAll(RATIO_RE)) {
    tuples.push(`${normalizeNumericToken(match[1])}/${normalizeNumericToken(match[2])}`);
  }
  return tuples;
}

function sameMultiset(left, right) {
  if (left.length !== right.length) return false;
  const remaining = [...right];
  for (const token of left) {
    const index = remaining.indexOf(token);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

export function glossaryEntryApplies(entry, context) {
  const wanted = normalizeGlossaryPhrase(context);
  const entryContext = normalizeGlossaryPhrase(entry?.context);
  if (!entryContext) return true;
  return Boolean(wanted) && entryContext === wanted;
}

function collectGlossaryMatches(sourceRu, languageEntries, context) {
  const source = asText(sourceRu);
  const lower = source.toLowerCase();
  const matches = [];
  for (const entry of Array.isArray(languageEntries) ? languageEntries : []) {
    if (!glossaryEntryApplies(entry, context)) continue;
    const phrase = asText(entry.source_ru || entry.sourceRu).trim();
    const target = asText(entry.target_value || entry.targetValue);
    if (!phrase || !target) continue;
    const needle = phrase.toLowerCase();
    let from = 0;
    while (from <= lower.length - needle.length) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      matches.push({
        start: index,
        end: index + phrase.length,
        phrase,
        target,
        exactContext: Boolean(normalizeGlossaryPhrase(entry.context)),
        length: phrase.length,
      });
      from = index + 1;
    }
  }
  matches.sort((a, b) => {
    if (a.exactContext !== b.exactContext) return a.exactContext ? -1 : 1;
    if (b.length !== a.length) return b.length - a.length;
    return a.start - b.start;
  });
  return matches;
}

export function applyGlossaryPhrases(sourceRu, languageEntries, context = "") {
  const source = asText(sourceRu);
  if (!source) return source;
  const selected = [];
  for (const match of collectGlossaryMatches(source, languageEntries, context)) {
    const overlaps = selected.some((span) => match.start < span.end && match.end > span.start);
    if (overlaps) continue;
    selected.push(match);
  }
  selected.sort((a, b) => b.start - a.start);
  let output = source;
  for (const match of selected) {
    output = `${output.slice(0, match.start)}${match.target}${output.slice(match.end)}`;
  }
  return output;
}

function missingTokens(required, haystack) {
  const remaining = asText(haystack);
  return required.filter((token) => token && !remaining.includes(token));
}

export function validateProductTranslationSemantics({
  sourceRu,
  targetValue,
  product,
  glossaryEntries = [],
  context = "",
} = {}) {
  const source = asText(sourceRu);
  const target = asText(targetValue);
  if (!target.trim()) {
    return { ok: false, code: "EMPTY_VALUE", message: "Translation value cannot be empty." };
  }

  if (!sameMultiset(extractNumericTokens(source), extractNumericTokens(target))) {
    return {
      ok: false,
      code: "NUMERIC_MISMATCH",
      message: "Translation numbers must match the Russian source exactly.",
    };
  }
  if (!sameMultiset(extractDimensionTuples(source), extractDimensionTuples(target))) {
    return {
      ok: false,
      code: "NUMERIC_MISMATCH",
      message: "Dimension order and values must be preserved.",
    };
  }
  if (!sameMultiset(extractRatioTuples(source), extractRatioTuples(target))) {
    return {
      ok: false,
      code: "NUMERIC_MISMATCH",
      message: "Quantity ratios must be preserved.",
    };
  }
  if (!sameMultiset(extractMeasurementPairs(source), extractMeasurementPairs(target))) {
    return {
      ok: false,
      code: "NUMERIC_MISMATCH",
      message: "Measurement values and units must be preserved.",
    };
  }

  const immutable = extractImmutableIdentityTokens(source, product);
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
    if (!entry || (Number(entry.protected) !== 1 && entry.protected !== true)) continue;
    if (!glossaryEntryApplies(entry, context)) continue;
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
