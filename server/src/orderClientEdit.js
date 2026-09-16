/**
 * Клиент может менять состав/условия только у заказа «Новый»,
 * пока включено allowClientEdit и заказ не в очереди/документе 1С.
 *
 * S2-NEW-001: omit на PUT /api/state/orders не должен удалять
 * заказы, которые клиент не может удалять явно (trash rules).
 */

import { canTrashOrder } from "../../src/shared/orderTrash.js";

const LOCKED_EXCHANGE = new Set(["ready", "sending", "sent", "draft"]);

/**
 * Заказ с уже существующим id в БД должен принадлежать тому же client userId.
 * Новый id (stored отсутствует) — ok; чужой user_id — запрет.
 */
export function assertClientOrderOwnership({
  orderId,
  storedUserId,
  clientUserId,
}) {
  if (!orderId || storedUserId == null || storedUserId === "") {
    return { ok: true };
  }
  if (String(storedUserId) !== String(clientUserId)) {
    return {
      ok: false,
      statusCode: 403,
      code: "ORDER_OWNERSHIP_FORBIDDEN",
      error: "Нельзя изменять чужой заказ.",
    };
  }
  return { ok: true };
}

export function assertClientMayEditExistingOrder({
  previous,
  incoming,
  settings = {},
  compositionChanged,
}) {
  if (!previous || !compositionChanged) {
    return { ok: true };
  }

  const status = String(previous.status || "").trim() || "Новый";
  if (status !== "Новый") {
    return {
      ok: false,
      statusCode: 409,
      code: "CLIENT_ORDER_EDIT_LOCKED",
      error:
        "Заказ уже принят менеджером. Дозаказ и изменение состава недоступны.",
    };
  }

  if (settings.allowClientEdit === false) {
    return {
      ok: false,
      statusCode: 403,
      code: "CLIENT_ORDER_EDIT_DISABLED",
      error: "Редактирование заказов отключено администратором.",
    };
  }

  const exchangeStatus = String(previous.exchange?.status || "not_sent").trim();
  if (LOCKED_EXCHANGE.has(exchangeStatus)) {
    return {
      ok: false,
      statusCode: 409,
      code: "CLIENT_ORDER_EXCHANGE_LOCKED",
      error:
        "Заказ уже передан или передаётся в 1С. Изменить состав нельзя.",
    };
  }

  // incoming не используется — статус на сервере уже зафиксирован policy.
  void incoming;
  return { ok: true };
}

/**
 * Можно ли удалить заказ клиента пропуском из PUT /api/state/orders.
 * Использует те же правила, что и явный trash + allowClientDelete.
 */
export function isClientOrderDeletableByOmission(order, settings = {}) {
  if (!order?.id) return false;
  if (settings.allowClientDelete === false) return false;
  return canTrashOrder(order, "client").ok === true;
}

/**
 * Можно ли менять существующий заказ клиента (состав/цены/доставка).
 * Probe через edit-gate с compositionChanged=true.
 */
export function isClientOrderMutable(previous, settings = {}) {
  if (!previous) return true;
  return assertClientMayEditExistingOrder({
    previous,
    incoming: previous,
    settings,
    compositionChanged: true,
  }).ok;
}

/**
 * Собирает итоговый список заказов клиента для replace:
 * - дубликаты входящих id → reject;
 * - omitted protected → server-authoritative previous object;
 * - omitted deletable NEW draft → действительно удаляется;
 * - incoming без изменений к protected остаётся на дальнейших gate'ах.
 *
 * @returns {{ ok: true, orders: object[] } | { ok: false, statusCode: number, code: string, error: string, orderId?: string }}
 */
export function mergeClientOrdersPreservingProtected({
  previousOrders,
  incomingOrders,
  settings = {},
}) {
  const previous = Array.isArray(previousOrders) ? previousOrders : [];
  const incoming = Array.isArray(incomingOrders) ? incomingOrders : [];

  const seen = new Set();
  for (const order of incoming) {
    const id = String(order?.id || "").trim();
    if (!id) {
      return {
        ok: false,
        statusCode: 400,
        code: "ORDER_ID_REQUIRED",
        error: "У каждого заказа должен быть id.",
      };
    }
    if (seen.has(id)) {
      return {
        ok: false,
        statusCode: 400,
        code: "ORDER_ID_DUPLICATE",
        error: "Повторяющийся id заказа в запросе.",
        orderId: id,
      };
    }
    seen.add(id);
  }

  const incomingIds = seen;
  const merged = [...incoming];

  for (const prior of previous) {
    const id = String(prior?.id || "").trim();
    if (!id || incomingIds.has(id)) continue;
    if (isClientOrderDeletableByOmission(prior, settings)) {
      continue;
    }
    // Byte-for-field preserve: deep copy so later sanitize/delivery
    // pipelines cannot mutate the authoritative previousById entry.
    merged.push(JSON.parse(JSON.stringify(prior)));
  }

  return { ok: true, orders: merged };
}
