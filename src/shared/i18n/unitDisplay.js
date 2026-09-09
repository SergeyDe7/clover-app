/** Frontend UOM display labels. Unit codes stay canonical. */

export const UNIT_DISPLAY_ORDER = Object.freeze([
  "piece",
  "pair",
  "meter",
  "roll",
  "pack",
  "bundle",
  "box",
]);

export const UNIT_DISPLAY_KEYS = Object.freeze({
  piece: Object.freeze({ label: "shared.unit.piece", short: "shared.unit.pieceShort" }),
  pair: Object.freeze({ label: "shared.unit.pair", short: "shared.unit.pairShort" }),
  meter: Object.freeze({ label: "shared.unit.meter", short: "shared.unit.meterShort" }),
  roll: Object.freeze({ label: "shared.unit.roll", short: "shared.unit.rollShort" }),
  pack: Object.freeze({ label: "shared.unit.pack", short: "shared.unit.packShort" }),
  bundle: Object.freeze({ label: "shared.unit.bundle", short: "shared.unit.bundleShort" }),
  box: Object.freeze({ label: "shared.unit.box", short: "shared.unit.boxShort" }),
});

export const UNIT_DISPLAY_FALLBACK_RU = Object.freeze({
  piece: Object.freeze({ label: "штука", shortLabel: "шт." }),
  pair: Object.freeze({ label: "пара", shortLabel: "пар." }),
  meter: Object.freeze({ label: "метр", shortLabel: "м" }),
  roll: Object.freeze({ label: "рулон", shortLabel: "рул." }),
  pack: Object.freeze({ label: "упаковка", shortLabel: "уп." }),
  bundle: Object.freeze({ label: "пачка", shortLabel: "пач." }),
  box: Object.freeze({ label: "коробка", shortLabel: "кор." }),
});

function fallback(unit, short) {
  const row = UNIT_DISPLAY_FALLBACK_RU[unit];
  if (!row) return short ? String(unit || "") : String(unit || "");
  return short ? row.shortLabel : row.label;
}

export function unitDisplayLabel(unit, t, { short = false } = {}) {
  const code = String(unit || "");
  const keys = UNIT_DISPLAY_KEYS[code];
  const ru = fallback(code, short);
  if (!keys || typeof t !== "function") return ru;
  const key = short ? keys.short : keys.label;
  const translated = t(key);
  if (!translated || translated === key) return ru;
  return translated;
}

export function unitDisplayShort(unit, t) {
  return unitDisplayLabel(unit, t, { short: true });
}
