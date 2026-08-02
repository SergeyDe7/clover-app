/** Статусы после принятия в 1С / в работе — удаление запрещено. */
export const ORDER_TRASH_BLOCKED_STATUSES = [
  "Принят",
  "Собирается",
  "Готов к доставке",
  "Выполнен",
];

/** Обмен в очереди или уже в 1С — удаление запрещено. */
export const ORDER_TRASH_BLOCKED_EXCHANGE = [
  "ready",
  "sending",
  "sent",
  "draft",
];

export function isOrderTrashed(order) {
  return Boolean(String(order?.deletedAt || "").trim());
}

function exchangeStatusOf(order) {
  const status = String(order?.exchange?.status || "not_sent").trim();
  return ORDER_TRASH_BLOCKED_EXCHANGE.includes(status) ||
    status === "not_sent" ||
    status === "error"
    ? status
    : "not_sent";
}

/**
 * Можно ли отправить заказ в корзину.
 * Клиент: только «Новый». Менеджер: не принят в 1С и не в очереди обмена.
 */
export function canTrashOrder(order, role = "manager") {
  if (!order?.id) {
    return { ok: false, code: "NOT_FOUND", error: "Заказ не найден." };
  }
  if (isOrderTrashed(order)) {
    return { ok: false, code: "ALREADY_TRASHED", error: "Заказ уже в корзине." };
  }

  const status = String(order.status || "Новый");
  const exchangeStatus = exchangeStatusOf(order);

  if (ORDER_TRASH_BLOCKED_STATUSES.includes(status)) {
    return {
      ok: false,
      code: "ORDER_ACCEPTED",
      error: `Заказ со статусом «${status}» удалить нельзя (принят или обработан в 1С).`,
    };
  }

  if (ORDER_TRASH_BLOCKED_EXCHANGE.includes(exchangeStatus)) {
    return {
      ok: false,
      code: "EXCHANGE_ACTIVE",
      error: "Заказ уже в обмене с 1С. Удаление запрещено.",
    };
  }

  if (role === "client" && status !== "Новый") {
    return {
      ok: false,
      code: "CLIENT_ONLY_NEW",
      error: "Клиент может удалить только заказ со статусом «Новый».",
    };
  }

  return { ok: true };
}

export function canRestoreOrder(order) {
  if (!order?.id) {
    return { ok: false, code: "NOT_FOUND", error: "Заказ не найден." };
  }
  if (!isOrderTrashed(order)) {
    return { ok: false, code: "NOT_TRASHED", error: "Заказ не в корзине." };
  }
  return { ok: true };
}

export function canPurgeOrder(order) {
  if (!order?.id) {
    return { ok: false, code: "NOT_FOUND", error: "Заказ не найден." };
  }
  if (!isOrderTrashed(order)) {
    return {
      ok: false,
      code: "NOT_TRASHED",
      error: "Удалить навсегда можно только заказ из корзины.",
    };
  }
  return { ok: true };
}

/**
 * Soft-deleted заказы из previous, которых нет во входящем списке —
 * их нужно сохранить при replaceOrders.
 */
export function preserveTrashedOrders(previousOrders, incomingOrders) {
  const previous = Array.isArray(previousOrders) ? previousOrders : [];
  const incoming = Array.isArray(incomingOrders) ? incomingOrders : [];
  const incomingIds = new Set(
    incoming.map((order) => String(order?.id || "")).filter(Boolean)
  );
  const preserved = previous.filter(
    (order) => isOrderTrashed(order) && !incomingIds.has(String(order.id))
  );
  return [...incoming, ...preserved];
}

/**
 * deletedAt / deletedBy нельзя менять через PUT /state/orders —
 * только через dedicated trash / restore endpoints.
 * Для новых заказов входящий soft-delete сбрасывается.
 */
export function lockOrderTrashFields(orders, previousById) {
  const map =
    previousById instanceof Map
      ? previousById
      : new Map(
          (Array.isArray(previousById) ? previousById : []).map((order) => [
            String(order?.id || ""),
            order,
          ])
        );

  return (Array.isArray(orders) ? orders : []).map((order) => {
    const id = String(order?.id || "");
    const previous = id ? map.get(id) : null;
    if (!previous) {
      if (!isOrderTrashed(order) && order?.deletedBy == null) {
        return order;
      }
      return {
        ...order,
        deletedAt: "",
        deletedBy: null,
      };
    }
    return {
      ...order,
      deletedAt: String(previous.deletedAt || ""),
      deletedBy: previous.deletedBy ?? null,
    };
  });
}
