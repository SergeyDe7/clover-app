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
  "Доставляется",
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
    "Доставляется",
    "Выполнен",
    "Отменён",
  ],
  Принят: [
    "Обработан вручную",
    "Собирается",
    "Готов к доставке",
    "Доставляется",
    "Выполнен",
    "Отменён",
  ],
  "Обработан вручную": ["Принят", "Выполнен", "Отменён"],
  Собирается: [
    "Готов к доставке",
    "Доставляется",
    "Выполнен",
    "Отменён",
    "Обработан вручную",
  ],
  "Готов к доставке": ["Доставляется", "Выполнен", "Отменён", "Обработан вручную"],
  Доставляется: ["Выполнен", "Отменён", "Обработан вручную"],
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

function normalizeZoneId(value) {
  if (value == null) return "";
  return String(value).trim();
}

/** Client-safe zone list (enabled tariffs only). */
export function sanitizeClientDeliveryZones(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = normalizeZoneId(row.id);
    if (!id || seen.has(id)) continue;
    let freeFrom = null;
    if (row.freeFrom !== null && row.freeFrom !== undefined && row.freeFrom !== "") {
      const n = Number(row.freeFrom);
      if (!Number.isFinite(n) || n < 0) continue;
      freeFrom = n;
    }
    let fee = null;
    if (row.fee !== null && row.fee !== undefined && row.fee !== "") {
      const n = Number(row.fee);
      if (!Number.isFinite(n) || n < 0) continue;
      fee = n;
    }
    // Client projection may omit enabled/name; treat missing enabled as true.
    if (row.enabled === false) continue;
    seen.add(id);
    out.push({ id, freeFrom, fee });
  }
  return out;
}

export function resolveEffectiveDeliveryTariff(zone = null) {
  const global = {
    freeFrom: FREE_DELIVERY_MIN_TOTAL,
    fee: PAID_DELIVERY_FEE,
  };
  if (!zone || typeof zone !== "object") return global;

  let freeFrom = global.freeFrom;
  if (zone.freeFrom !== null && zone.freeFrom !== undefined && zone.freeFrom !== "") {
    const n = Number(zone.freeFrom);
    if (Number.isFinite(n) && n >= 0) freeFrom = n;
  }

  let fee = global.fee;
  if (zone.fee !== null && zone.fee !== undefined && zone.fee !== "") {
    const n = Number(zone.fee);
    if (Number.isFinite(n) && n >= 0) fee = n;
  }

  return { freeFrom, fee };
}

export function getDeliveryFeeForGoodsSubtotal(goodsSubtotal, zone = null) {
  const amount = Number(goodsSubtotal) || 0;
  const { freeFrom, fee } = resolveEffectiveDeliveryTariff(zone);
  if (amount <= 0) return fee;
  return amount >= freeFrom ? 0 : fee;
}

/** 0 = бесплатно (сумма ≥ порога), иначе платная доставка. Global fallback only. */
export function getSpbDeliveryFee(orderTotal) {
  return getDeliveryFeeForGoodsSubtotal(orderTotal, null);
}

export function resolveDeliveryZoneForAddress(address, deliveryZones = []) {
  const zones = sanitizeClientDeliveryZones(deliveryZones);
  const zoneId = normalizeZoneId(address?.deliveryZoneId);
  if (!zoneId) return null;
  return zones.find((row) => row.id === zoneId) || null;
}

export function resolveEffectiveDeliveryTariffForAddress(address, deliveryZones = []) {
  return resolveEffectiveDeliveryTariff(
    resolveDeliveryZoneForAddress(address, deliveryZones)
  );
}

/** UX preview mirror of server address→zone fee. Server remains authoritative. */
export function getDeliveryFeeForSelectedAddress(
  goodsSubtotal,
  address,
  deliveryZones = []
) {
  return getDeliveryFeeForGoodsSubtotal(
    goodsSubtotal,
    resolveDeliveryZoneForAddress(address, deliveryZones)
  );
}
