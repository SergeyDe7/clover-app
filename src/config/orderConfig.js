export const UNIT_CONFIG = {
  piece: { label: "штука", shortLabel: "шт." },
  pair: { label: "пара", shortLabel: "пар." },
  meter: { label: "метр", shortLabel: "м" },
  roll: { label: "рулон", shortLabel: "рул." },
  pack: { label: "упаковка", shortLabel: "уп." },
  bundle: { label: "пачка", shortLabel: "пач." },
  box: { label: "коробка", shortLabel: "кор." },
};

/** Слева → справа: от меньшей ед. измерения к большей. */
export const UNIT_ORDER = ["piece", "pair", "meter", "roll", "pack", "bundle", "box"];

export const ORDER_STATUSES = [
  "Новый",
  "Принят",
  "Собирается",
  "Готов к доставке",
  "Выполнен",
  "Отменён",
];

/** Совпадает с server/src/orderStatus.js: прямые переходы вперёд по цепочке. */
export const ORDER_STATUS_TRANSITIONS = {
  Новый: ["Принят", "Собирается", "Готов к доставке", "Выполнен", "Отменён"],
  Принят: ["Собирается", "Готов к доставке", "Выполнен", "Отменён"],
  Собирается: ["Готов к доставке", "Выполнен", "Отменён"],
  "Готов к доставке": ["Выполнен", "Отменён"],
  Выполнен: [],
  Отменён: [],
};

export function allowedNextOrderStatuses(from) {
  const current = ORDER_STATUSES.includes(from) ? from : "Новый";
  const next = ORDER_STATUS_TRANSITIONS[current] || [];
  return [current, ...next.filter((status) => status !== current)];
}
