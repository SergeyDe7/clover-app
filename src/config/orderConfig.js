export const UNIT_CONFIG = {
  piece: {
    label: "Штука",
    shortLabel: "шт.",
  },
  pack: {
    label: "Упаковка",
    shortLabel: "уп.",
  },
  bundle: {
    label: "Пачка",
    shortLabel: "пач.",
  },
};

export const UNIT_ORDER = ["piece", "bundle", "pack"];

export const ORDER_STATUSES = [
  "Новый",
  "Принят",
  "Собирается",
  "Готов к доставке",
  "Выполнен",
  "Отменён",
];

export const ORDER_STATUS_TRANSITIONS = {
  Новый: ["Принят", "Отменён"],
  Принят: ["Собирается", "Отменён"],
  Собирается: ["Готов к доставке", "Отменён"],
  "Готов к доставке": ["Выполнен", "Отменён"],
  Выполнен: [],
  Отменён: [],
};

export function allowedNextOrderStatuses(from) {
  const current = ORDER_STATUSES.includes(from) ? from : "Новый";
  const next = ORDER_STATUS_TRANSITIONS[current] || [];
  return [current, ...next.filter((status) => status !== current)];
}
