/**
 * Правила доставки СПб — зеркало src/config/orderConfig.js.
 * Клиентский deliveryFee на сохранении игнорируется: сервер пересчитывает
 * и материализует позицию «Доставка» в order.items (для UI и 1С).
 */

export const FREE_DELIVERY_MIN_TOTAL = 5000;
export const PAID_DELIVERY_FEE = 500;

/** Стабильный id служебной позиции доставки в заказе. */
export const CLOVER_DELIVERY_LINE_ID = "clover-delivery-spb";

export function isCloverDeliveryLine(item) {
  if (!item || typeof item !== "object") return false;
  if (item.isDelivery === true) return true;
  const id = String(item.productId ?? item.id ?? "").trim();
  return id === CLOVER_DELIVERY_LINE_ID;
}

/** 0 = бесплатно (сумма ≥ порога), иначе платная доставка. Global fallback only. */
export function getSpbDeliveryFee(orderTotal) {
  return getDeliveryFeeForGoodsSubtotal(orderTotal, null);
}

/**
 * Normalize settings.deliveryZones. Invalid rows are dropped (no crash).
 */
export function sanitizeDeliveryZones(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").trim();
    const name = String(row.name || "").trim();
    if (!id || !name || seen.has(id)) continue;

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

    seen.add(id);
    out.push({
      id,
      name,
      enabled: row.enabled === true,
      freeFrom,
      fee,
    });
  }
  return out;
}

/**
 * Effective freeFrom + fee for an optional zone object.
 * Missing / disabled / invalid zone → global constants.
 * null field on an enabled zone → that field falls back to global.
 */
export function resolveEffectiveDeliveryTariff(zone = null) {
  const global = {
    freeFrom: FREE_DELIVERY_MIN_TOTAL,
    fee: PAID_DELIVERY_FEE,
  };
  if (!zone || typeof zone !== "object" || zone.enabled !== true) {
    return global;
  }

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

/**
 * Delivery fee from goods subtotal + optional zone tariff.
 * goodsSubtotal must exclude the delivery line itself.
 */
export function getDeliveryFeeForGoodsSubtotal(goodsSubtotal, zone = null) {
  const amount = Number(goodsSubtotal) || 0;
  const { freeFrom, fee } = resolveEffectiveDeliveryTariff(zone);
  if (amount <= 0) return fee;
  return amount >= freeFrom ? 0 : fee;
}

/** Trimmed zone id; empty/null/missing → "". */
export function normalizeDeliveryZoneId(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Client-safe delivery zone projection for bootstrap.
 * Enabled zones only; id + nullable freeFrom/fee (no admin names / disabled rows).
 */
export function projectClientDeliveryZones(raw) {
  return sanitizeDeliveryZones(raw)
    .filter((zone) => zone.enabled === true)
    .map((zone) => ({
      id: zone.id,
      freeFrom: zone.freeFrom,
      fee: zone.fee,
    }));
}

/**
 * Client PUT /addresses must not escalate zone assignment.
 * Existing address → keep prior deliveryZoneId.
 * New address → empty zone.
 */
export function preserveClientAddressDeliveryZones(incoming, current = []) {
  const currentById = new Map(
    (Array.isArray(current) ? current : [])
      .filter((row) => row && typeof row === "object")
      .map((row) => [String(row.id || "").trim(), row])
  );
  return (Array.isArray(incoming) ? incoming : []).map((item) => {
    if (!item || typeof item !== "object") return item;
    const id = String(item.id || "").trim();
    const previous = id ? currentById.get(id) : null;
    const deliveryZoneId = previous
      ? normalizeDeliveryZoneId(previous.deliveryZoneId)
      : "";
    return { ...item, deliveryZoneId };
  });
}

/**
 * Resolve enabled zone for a saved address from settings.deliveryZones.
 * Unknown / disabled / empty id → null (global fallback).
 * Does NOT parse address text.
 */
export function resolveDeliveryZoneForAddress(address, settingsOrZones = []) {
  const zones = Array.isArray(settingsOrZones)
    ? sanitizeDeliveryZones(settingsOrZones)
    : sanitizeDeliveryZones(settingsOrZones?.deliveryZones);
  const zoneId = normalizeDeliveryZoneId(address?.deliveryZoneId);
  if (!zoneId) return null;
  const zone = zones.find((row) => row.id === zoneId);
  if (!zone || zone.enabled !== true) return null;
  return zone;
}

/**
 * Order → selected addressId → persisted deliveryZoneId → enabled zone.
 * Free-text order.address is never used for zone matching.
 */
export function resolveDeliveryZoneForOrder(
  order,
  { addresses = [], deliveryZones = [] } = {}
) {
  const addressId = String(order?.addressId || "").trim();
  if (!addressId) return null;
  const list = Array.isArray(addresses) ? addresses : [];
  const address = list.find((row) => String(row?.id || "").trim() === addressId);
  if (!address) return null;
  return resolveDeliveryZoneForAddress(address, deliveryZones);
}

function resolveZoneFromDeliveryOptions(order, options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "zone")) {
    return options.zone || null;
  }
  if (options.addresses != null || options.deliveryZones != null) {
    return resolveDeliveryZoneForOrder(order, {
      addresses: options.addresses,
      deliveryZones: options.deliveryZones,
    });
  }
  return null;
}

/** Сумма товарных позиций без доставки (порог бесплатной доставки). */
export function orderItemsMoneyTotal(order) {
  const itemsTotal = (Array.isArray(order?.items) ? order.items : [])
    .filter((item) => !isCloverDeliveryLine(item))
    .reduce((sum, item) => sum + (Number(item?.lineTotal) || 0), 0);
  const customTotal = (Array.isArray(order?.customItems) ? order.customItems : []).reduce(
    (sum, item) =>
      sum + (Number(item?.unitPrice) || 0) * (Number(item?.quantity) || 0),
    0
  );
  return itemsTotal + customTotal;
}

export function stripDeliveryLines(items) {
  return (Array.isArray(items) ? items : []).filter((item) => !isCloverDeliveryLine(item));
}

/**
 * ID 1С = UUID; код = НФ-…. Если в поле ID ошибочно ввели артикул — кладём в code.
 * Если есть каталог oneCProducts — подтягиваем UUID по коду (иначе claim-gate падает).
 */
export function resolveDeliveryOneCRefs(meta = {}, oneCProducts = null) {
  let oneCId = String(meta.deliveryOneCId || meta.oneCId || "").trim();
  let oneCCode = String(meta.deliveryOneCCode || meta.oneCCode || "").trim();
  const looksLikeUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      oneCId
    );
  if (oneCId && !looksLikeUuid) {
    if (!oneCCode) oneCCode = oneCId;
    oneCId = "";
  }

  if (!oneCId && oneCCode && Array.isArray(oneCProducts)) {
    const hit = oneCProducts.find(
      (row) => String(row?.code || row?.oneCCode || "").trim() === oneCCode
    );
    if (hit?.id) oneCId = String(hit.id).trim();
  }

  return {
    oneCId,
    oneCCode,
    name:
      String(meta.deliveryOneCName || meta.name || "Доставка").trim() ||
      "Доставка",
  };
}

/**
 * Позиция «Доставка» для заказа и выгрузки в 1С.
 */
export function buildDeliveryLineItem(fee, meta = {}, oneCProducts = null) {
  const amount = Math.max(0, Number(fee) || 0);
  const refs = resolveDeliveryOneCRefs(meta, oneCProducts);
  return {
    id: CLOVER_DELIVERY_LINE_ID,
    productId: CLOVER_DELIVERY_LINE_ID,
    isDelivery: true,
    name: refs.name,
    oneCName: refs.name,
    oneCId: refs.oneCId,
    oneCCode: refs.oneCCode,
    code: refs.oneCCode,
    unit: "piece",
    quantity: 1,
    multiplier: 1,
    unitPrice: amount,
    lineTotal: amount,
  };
}

/**
 * Синхронизирует items с deliveryFee: убрать старые линии, при fee>0 добавить одну.
 */
export function syncDeliveryLineFromFee(order, meta = {}, oneCProducts = null) {
  const fee = Math.max(0, Number(order?.deliveryFee) || 0);
  const items = stripDeliveryLines(order?.items);
  if (fee > 0) {
    items.push(buildDeliveryLineItem(fee, meta, oneCProducts));
  }
  return { ...order, items };
}

/**
 * Для клиента: fee и note по сумме позиций + позиция «Доставка» в items.
 * showPrices=false или пустая корзина → 0 (как в OrderEditor).
 * Zone: options.zone, or resolve from addresses + deliveryZones via order.addressId.
 */
export function resolveClientSpbDelivery(order, options = {}) {
  const { showPrices = true } = options;
  const itemsTotal = orderItemsMoneyTotal(order);
  if (!showPrices || itemsTotal <= 0) {
    return { deliveryFee: 0, deliveryNote: "" };
  }
  const zone = resolveZoneFromDeliveryOptions(order, options);
  const tariff = resolveEffectiveDeliveryTariff(zone);
  const deliveryFee = getDeliveryFeeForGoodsSubtotal(itemsTotal, zone);
  return {
    deliveryFee,
    deliveryNote:
      deliveryFee > 0
        ? `Доставка по СПб платная: ${tariff.fee} ₽ (заказ менее ${tariff.freeFrom} ₽)`
        : "Доставка по СПб бесплатная",
  };
}

/**
 * Пересчитать правило СПб по сумме товаров и материализовать строку «Доставка».
 * Нужно на claim/send: старые заказы витрины могли сохраниться без deliveryFee.
 * zoneOptions: { zone } | { addresses, deliveryZones } — omit for global fallback.
 */
export function ensureSpbDeliveryOnOrder(
  order,
  meta = {},
  oneCProducts = null,
  zoneOptions = {}
) {
  const delivery = resolveClientSpbDelivery(order, {
    showPrices: true,
    ...zoneOptions,
  });
  return syncDeliveryLineFromFee(
    {
      ...order,
      deliveryFee: delivery.deliveryFee,
      deliveryNote: delivery.deliveryNote,
    },
    meta,
    oneCProducts
  );
}

export function applyClientSpbDeliveryFees(orders, options = {}) {
  const {
    showPrices = true,
    oneCProducts = null,
    addresses,
    deliveryZones,
    zone,
    ...lineMeta
  } = options;
  const resolveOpts = { showPrices, addresses, deliveryZones };
  if (Object.prototype.hasOwnProperty.call(options, "zone")) {
    resolveOpts.zone = zone;
  }
  return (Array.isArray(orders) ? orders : []).map((order) => {
    const delivery = resolveClientSpbDelivery(order, resolveOpts);
    return syncDeliveryLineFromFee(
      {
        ...order,
        deliveryFee: delivery.deliveryFee,
        deliveryNote: delivery.deliveryNote,
      },
      lineMeta,
      oneCProducts
    );
  });
}

/** Для staff-save / claim: выровнять позицию под deliveryFee. */
export function applyDeliveryLineSync(orders, meta = {}, oneCProducts = null) {
  return (Array.isArray(orders) ? orders : []).map((order) =>
    syncDeliveryLineFromFee(order, meta, oneCProducts)
  );
}
