/** Статусы, которые обычный менеджер не удаляет (принят / в работе / выполнен). */
export const ORDER_TRASH_BLOCKED_STATUSES = [
  "Принят",
  "Обработан вручную",
  "Собирается",
  "Готов к доставке",
  "Выполнен",
];

/** Выполненные: только админ может убрать из Clover (1С не трогаем). */
export const ORDER_ADMIN_HARD_DELETE_STATUSES = ["Выполнен"];

/** Обмен в очереди — удаление запрещено. Уже переданный (`sent`) менеджер может убрать из Clover. */
export const ORDER_TRASH_BLOCKED_EXCHANGE = [
  "ready",
  "sending",
  "draft",
];

/** Клиент не удаляет заказ, который уже ушёл в 1С. */
const CLIENT_TRASH_BLOCKED_EXCHANGE = [
  ...ORDER_TRASH_BLOCKED_EXCHANGE,
  "sent",
];

export function isOrderTrashed(order) {
  return Boolean(String(order?.deletedAt || "").trim());
}

export function isAdminHardDeleteStatus(status) {
  return ORDER_ADMIN_HARD_DELETE_STATUSES.includes(String(status || "").trim());
}

function exchangeStatusOf(order) {
  const status = String(order?.exchange?.status || "not_sent").trim();
  if (
    CLIENT_TRASH_BLOCKED_EXCHANGE.includes(status) ||
    status === "not_sent" ||
    status === "error"
  ) {
    return status;
  }
  return "not_sent";
}

/**
 * Можно ли отправить заказ в корзину.
 * Клиент: только «Новый» и ещё не ушедший в 1С.
 * Менеджер: не принят / не в работе / не выполнен и не в очереди обмена
 *   (уже переданный `sent` можно убрать из Clover).
 * Админ: дополнительно может убрать «Выполнен» (документ в 1С не меняется).
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
    const adminCompleted =
      role === "admin" && isAdminHardDeleteStatus(status);
    if (!adminCompleted) {
      return {
        ok: false,
        code: "ORDER_ACCEPTED",
        error: isAdminHardDeleteStatus(status)
          ? "Выполненный заказ может удалить только администратор."
          : `Заказ со статусом «${status}» удалить нельзя (принят или обработан в 1С).`,
      };
    }
  }

  const blockedExchange =
    role === "client" ? CLIENT_TRASH_BLOCKED_EXCHANGE : ORDER_TRASH_BLOCKED_EXCHANGE;
  if (blockedExchange.includes(exchangeStatus)) {
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

/**
 * Удалить навсегда из корзины.
 * Выполненные — только администратор.
 */
export function canPurgeOrder(order, role = "manager") {
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
  if (isAdminHardDeleteStatus(order.status) && role !== "admin") {
    return {
      ok: false,
      code: "ADMIN_ONLY",
      error: "Удалить выполненный заказ навсегда может только администратор.",
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
