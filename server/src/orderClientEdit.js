/**
 * Клиент может менять состав/условия только у заказа «Новый»,
 * пока включено allowClientEdit и заказ не в очереди/документе 1С.
 */

const LOCKED_EXCHANGE = new Set(["ready", "sending", "sent", "draft"]);

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
