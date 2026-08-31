/**
 * Дозаказ в ЛК: позиции из корзины → в последний открытый заказ («Новый»),
 * пока менеджер не принял и заказ не ушёл в обмен с 1С.
 */
import { isCloverDeliveryLine } from "../config/orderConfig.js";

const LOCKED_EXCHANGE = new Set(["ready", "sending", "sent", "draft"]);

export function orderLineKey(item) {
  const productId = String(item?.productId ?? item?.id ?? "").trim();
  const unit = String(item?.unit || "piece").trim() || "piece";
  return `${productId}::${unit}`;
}

export function orderGoodsMoneyTotal(order) {
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

/** Можно ли дописывать позиции в заказ (UI + та же логика на клиенте перед save). */
export function canOrderAcceptAddendum(order, settings = {}) {
  if (!order || typeof order !== "object") return false;
  if (String(order.status || "").trim() !== "Новый") return false;
  if (settings.allowClientEdit === false) return false;
  const exchangeStatus = String(order.exchange?.status || "not_sent").trim();
  if (LOCKED_EXCHANGE.has(exchangeStatus)) return false;
  return true;
}

function orderCreatedMs(order) {
  const raw = order?.createdAt || order?.updatedAt || "";
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : 0;
}

/** Последний по дате создания заказ, в который ещё можно сделать дозаказ. */
export function findLatestAddendumOrder(orders, settings = {}) {
  const list = (Array.isArray(orders) ? orders : [])
    .filter((order) => canOrderAcceptAddendum(order, settings))
    .sort((a, b) => orderCreatedMs(b) - orderCreatedMs(a));
  return list[0] || null;
}

/** Слияние товарных позиций (без служебной доставки); qty суммируется по productId+unit. */
export function mergeOrderCatalogItems(existing = [], incoming = []) {
  const map = new Map();
  for (const item of Array.isArray(existing) ? existing : []) {
    if (isCloverDeliveryLine(item)) continue;
    const key = orderLineKey(item);
    if (!key.startsWith("::")) map.set(key, { ...item });
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (isCloverDeliveryLine(item)) continue;
    const key = orderLineKey(item);
    if (key.startsWith("::")) continue;
    const prev = map.get(key);
    if (prev) {
      const quantity = (Number(prev.quantity) || 0) + (Number(item.quantity) || 0);
      const unitPrice = Number(item.unitPrice) || Number(prev.unitPrice) || 0;
      map.set(key, {
        ...prev,
        ...item,
        quantity,
        unitPrice,
        lineTotal: quantity * unitPrice,
      });
    } else {
      map.set(key, { ...item });
    }
  }
  return [...map.values()];
}

export function mergeOrderCustomItems(existing = [], incoming = []) {
  const base = Array.isArray(existing) ? existing.map((item) => ({ ...item })) : [];
  const add = Array.isArray(incoming) ? incoming.map((item) => ({ ...item })) : [];
  return [...base, ...add];
}
