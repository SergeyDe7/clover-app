/**
 * Защита заказов клиента от правки после того, как заказ ушёл в работу.
 *
 * PUT /api/state/orders — исторически полная замена состояния: клиент
 * присылает весь свой список заказов, сервер стирает прежние строки и
 * записывает присланные. Отсюда две дыры:
 *
 *   1. Заказ со статусом не «Новый» не переоценивается сервером
 *      (repriceClientOrders пропускает такие), поэтому присланные клиентом
 *      цены записывались как есть — вплоть до price: 1 на уже принятом заказе.
 *   2. Заказ, просто отсутствующий в присланном списке, удалялся — в обход
 *      настройки allowClientDelete и проверки canTrashOrder.
 *
 * Интерфейс клиента и так разрешает правку только при status === "Новый"
 * (ClientScreen.jsx) и корзину только для «Новый» (shared/orderTrash.js),
 * поэтому серверная проверка повторяет уже действующее правило и легитимный
 * сценарий не задевает. Заблокированный заказ не отвергается с ошибкой, а
 * молча заменяется на сохранённую версию: так же ведёт себя preserveTrashedOrders,
 * и полная замена состояния остаётся рабочей.
 */

import { normalizeExchangeState } from "./exchange.js";

/**
 * Заказ закрыт для правки клиентом, если он уже не «Новый» либо уже уехал
 * в 1С. Предикат намеренно совпадает с условием пропуска переоценки в
 * repriceClientOrders — закрыто ровно то, что сервер перестаёт пересчитывать.
 */
export function isClientEditableOrder(order) {
  if (!order) return true;
  const status = String(order.status || "Новый").trim();
  if (status !== "Новый") return false;
  const exchangeStatus = normalizeExchangeState(order.exchange).status;
  return !["sent", "sending"].includes(exchangeStatus);
}

/**
 * Возвращает список заказов для записи и перечень отклонённых изменений.
 *
 * @param {Array} previousOrders заказы клиента, как они лежат в БД
 * @param {Array} incomingOrders то, что прислал клиент
 */
export function freezeLockedClientOrders(previousOrders, incomingOrders) {
  const previous = Array.isArray(previousOrders) ? previousOrders : [];
  const incoming = Array.isArray(incomingOrders) ? incomingOrders : [];

  const lockedById = new Map();
  for (const order of previous) {
    if (isClientEditableOrder(order)) continue;
    lockedById.set(String(order.id), order);
  }

  if (lockedById.size === 0) {
    return { orders: incoming, rejectedEdits: [], restoredDeletions: [] };
  }

  const rejectedEdits = [];
  const seen = new Set();

  const orders = incoming.map((order) => {
    const id = String(order?.id || "");
    const locked = lockedById.get(id);
    if (!locked) return order;

    seen.add(id);
    if (JSON.stringify(order) !== JSON.stringify(locked)) {
      rejectedEdits.push({ orderId: id, status: locked.status || "" });
    }
    return locked;
  });

  const restoredDeletions = [];
  for (const [id, locked] of lockedById) {
    if (seen.has(id)) continue;
    restoredDeletions.push({ orderId: id, status: locked.status || "" });
    orders.push(locked);
  }

  return { orders, rejectedEdits, restoredDeletions };
}
