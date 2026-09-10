import {
  normalizeGlossaryPhrase,
  ALLOWED_GLOSSARY_CONTEXTS,
} from "../../src/shared/i18n/productLocalization.js";

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;
const IDENTITY_KEYS = ["code", "oneCCode", "oneCId"];
const ID_TOKEN_RE = /(?:^|[^\p{L}\p{N}])(НФ-\d+|NF-\d+|CL-\d+)(?=$|[^\p{L}\p{N}])/gu;
const MODEL_TOKEN_RE =
  /(?:^|[^\p{L}\p{N}])((?=[\p{L}\p{N}-]*\d)(?=[\p{L}\p{N}-]*\p{L})[\p{L}\p{N}-]+)/gu;
const DIMENSION_RE = /(\d+(?:[.,]\d+)?)(?:\s*[x×XхХ]\s*(\d+(?:[.,]\d+)?)){1,2}/g;
const RATIO_RE = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/g;
const MEASURE_RE =
  /(\d+(?:[.,]\d+)?)\s*(г\/м²|г\/м2|gsm|мм|mm|см|cm|мл|ml|кг|kg|шт\.?|pcs?|dona|даана|дона|件|قطعة|lbl|эт|гр|мкм|um|µm|м|m|л|l|г|g)(?=$|[^\p{L}\p{N}])/giu;

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
  "шт.": "pcs",
  эт: "lbl",
  lbl: "lbl",
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
  dona: "pcs",
  даана: "pcs",
  дона: "pcs",
  件: "pcs",
  قطعة: "pcs",
  m: "m",
});

/** Catalog-derived technical series that must survive all six targets exactly. */
export const CATALOG_TECHNICAL_SERIES = Object.freeze([
  "ПММ",
  "СПК",
  "ПРМС",
  "ПНД",
  "ПЭТ",
  "СТП",
  "СЛБ",
  "ХПП",
  "БОПП",
  "ПВХ",
  "ВЗЛП",
  "РКС",
  "МОП",
  "НФ",
  "ВВ",
  "КП",
  "ПП",
  "УК",
  "ФА",
  "ЦВ",
  "ЖС",
  "ПВА",
  "БОС",
  "ЮТ",
  "ИП",
  "КР",
  "ЕСО",
  "ДОРЕМИ",
  "ФОКУС",
  "НИКА",
]);

export const PRODUCT_GLOSSARY_CONTEXTS = Object.freeze({
  name: "product.name",
  description: "product.description",
  composition: "product.composition",
  characteristics: "product.characteristics",
});

export { ALLOWED_GLOSSARY_CONTEXTS };

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

function collectWholeToken(haystack, token) {
  if (!token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(haystack);
}

export function extractImmutableIdentityTokens(source, product) {
  const text = asText(source);
  const tokens = [];
  const push = (value) => {
    const token = String(value || "").trim();
    if (token && !tokens.includes(token)) tokens.push(token);
  };
  for (const key of IDENTITY_KEYS) {
    const value = String(product?.[key] || "").trim();
    if (value && text.includes(value)) push(value);
  }
  for (const match of text.matchAll(ID_TOKEN_RE)) push(match[1]);
  for (const match of text.matchAll(MODEL_TOKEN_RE)) {
    const token = match[1];
    if (/^(?:м2|м²|gsm)$/i.test(token)) continue;
    if (/^[мm][²2]$/i.test(token)) continue;
    if (/^\d+(?:[.,]\d+)?(?:мм|см|мл|кг|шт\.?|гр|эт|г|л|м|мкм)$/i.test(token)) continue;
    if (/^[dDhHдД]\d+(?:[.,]\d+)?(?:мм|см|мл|мкм)$/i.test(token)) continue;
    if (/^\d+(?:[.,]\d+)?-\d+(?:[.,]\d+)?(?:мм|см|мл|кг|мкм)?$/i.test(token)) continue;
    if (/^\d+-?(?:[хxХ]-?)?(?:сл|секц)\.?$/i.test(token)) continue;
    if (/^\d+(?:рул|куб|эт)\.?$/i.test(token)) continue;
    if (/^\d+(?:[.,]\d+)?(?:[хxХ×]\d+(?:[.,]\d+)?)+(?:мм|см|м)?$/i.test(token)) continue;
    push(token);
  }
  for (const match of text.matchAll(/\b[АA]4\b/g)) push(match[0]);
  for (const match of text.matchAll(/\d+[А-ЯЁ]\b/g)) push(match[0]);
  for (const series of CATALOG_TECHNICAL_SERIES) {
    if (collectWholeToken(text, series)) push(series);
  }
  if (text.includes("Д-Полимер")) push("Д-Полимер");
  return tokens;
}

function normalizeUnit(raw) {
  const trimmed = String(raw || "").trim();
  const key = trimmed.toLowerCase().replace("м2", "м²").replace(/\.$/, "");
  return UNIT_CANON[key] || UNIT_CANON[trimmed] || UNIT_CANON[trimmed.toLowerCase()] || "";
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
        protected: Number(entry.protected) === 1 || entry.protected === true,
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

/** One non-overlapping winner set used by both apply and protected validation. */
export function selectGlossaryMatches(sourceRu, languageEntries, context = "") {
  const selected = [];
  for (const match of collectGlossaryMatches(sourceRu, languageEntries, context)) {
    const overlaps = selected.some((span) => match.start < span.end && match.end > span.start);
    if (overlaps) continue;
    selected.push(match);
  }
  return selected;
}

export function applyGlossaryPhrases(sourceRu, languageEntries, context = "") {
  const source = asText(sourceRu);
  if (!source) return source;
  const selected = selectGlossaryMatches(source, languageEntries, context);
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

  const winners = selectGlossaryMatches(source, glossaryEntries, context).filter(
    (match) => match.protected
  );
  for (const match of winners) {
    if (!target.includes(match.target)) {
      return {
        ok: false,
        code: "GLOSSARY_PROTECTED_MISMATCH",
        message: "Translation is missing a protected glossary term.",
      };
    }
  }

  return { ok: true };
}
