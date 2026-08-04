export const UNIT_CONFIG = {
  piece: { label: "Штука", shortLabel: "шт." },
  bundle: { label: "Пачка", shortLabel: "пач." },
  pack: { label: "Упаковка", shortLabel: "уп." },
  box: { label: "Коробка", shortLabel: "кор." },
  pair: { label: "Пара", shortLabel: "пар." },
  roll: { label: "Рулон", shortLabel: "рул." },
};

export const UNIT_ORDER = ["piece", "bundle", "pack", "box", "pair", "roll"];

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
