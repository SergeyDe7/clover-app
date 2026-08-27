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
  "Обработан вручную",
  "Собирается",
  "Готов к доставке",
  "Выполнен",
  "Отменён",
];

/** Статусы в массовых действиях менеджера. */
export const MANAGER_BULK_ORDER_STATUSES = [
  "Новый",
  "Принят",
  "Обработан вручную",
  "Выполнен",
  "Отменён",
];

/** Совпадает с server/src/orderStatus.js: прямые переходы вперёд по цепочке. */
export const ORDER_STATUS_TRANSITIONS = {
  Новый: [
    "Принят",
    "Обработан вручную",
    "Собирается",
    "Готов к доставке",
    "Выполнен",
    "Отменён",
  ],
  Принят: [
    "Обработан вручную",
    "Собирается",
    "Готов к доставке",
    "Выполнен",
    "Отменён",
  ],
  "Обработан вручную": ["Принят", "Выполнен", "Отменён"],
  Собирается: ["Готов к доставке", "Выполнен", "Отменён", "Обработан вручную"],
  "Готов к доставке": ["Выполнен", "Отменён", "Обработан вручную"],
  Выполнен: [],
  Отменён: [],
};

export function allowedNextOrderStatuses(from) {
  const current = ORDER_STATUSES.includes(from) ? from : "Новый";
  const next = ORDER_STATUS_TRANSITIONS[current] || [];
  return [current, ...next.filter((status) => status !== current)];
}

/** Можно отозвать передачу в 1С, пока нет ACK / документа. */
export function canCancelOneCTransfer(exchange = {}) {
  const status = String(exchange?.status || "not_sent").trim();
  return status === "ready" || status === "sending";
}

/** Порог бесплатной доставки по СПб (руб.). Зеркало: server/src/deliveryFee.js */
export const FREE_DELIVERY_MIN_TOTAL = 5000;

/** Стоимость доставки по СПб, если заказ ниже порога (руб.). Зеркало: server/src/deliveryFee.js */
export const PAID_DELIVERY_FEE = 500;

/** Служебная позиция доставки в order.items. Зеркало: server/src/deliveryFee.js */
export const CLOVER_DELIVERY_LINE_ID = "clover-delivery-spb";

export function isCloverDeliveryLine(item) {
  if (!item || typeof item !== "object") return false;
  if (item.isDelivery === true) return true;
  const id = String(item.productId ?? item.id ?? "").trim();
  return id === CLOVER_DELIVERY_LINE_ID;
}

/** 0 = бесплатно (сумма ≥ порога), иначе платная доставка. */
export function getSpbDeliveryFee(orderTotal) {
  const amount = Number(orderTotal) || 0;
  if (amount <= 0) return PAID_DELIVERY_FEE;
  return amount >= FREE_DELIVERY_MIN_TOTAL ? 0 : PAID_DELIVERY_FEE;
}
