/**
 * Business order status FSM (не exchange.status).
 * Клиент не меняет статус (кроме создания «Новый»).
 * Менеджер/админ — только по разрешённым переходам.
 */

import { normalizeExchangeState } from "./exchange.js";

export const ORDER_STATUSES = Object.freeze([
  "Новый",
  "Принят",
  "Обработан вручную",
  "Собирается",
  "Готов к доставке",
  "Выполнен",
  "Отменён",
]);

const TERMINAL = new Set(["Выполнен", "Отменён"]);

/**
 * Разрешённые переходы: from → to.
 * Тот же статус всегда допустим.
 * Разрешены прямые переходы вперёд по цепочке (как «Новый»→«Принят»),
 * чтобы менеджер мог сразу поставить «Выполнен» без промежуточных шагов.
 * Назад по цепочке и выход из терминальных статусов — запрещены.
 */
export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  Новый: Object.freeze([
    "Принят",
    "Обработан вручную",
    "Собирается",
    "Готов к доставке",
    "Выполнен",
    "Отменён",
  ]),
  Принят: Object.freeze([
    "Обработан вручную",
    "Собирается",
    "Готов к доставке",
    "Выполнен",
    "Отменён",
  ]),
  "Обработан вручную": Object.freeze(["Принят", "Выполнен", "Отменён"]),
  Собирается: Object.freeze([
    "Готов к доставке",
    "Выполнен",
    "Отменён",
    "Обработан вручную",
  ]),
  "Готов к доставке": Object.freeze([
    "Выполнен",
    "Отменён",
    "Обработан вручную",
  ]),
  Выполнен: Object.freeze([]),
  Отменён: Object.freeze([]),
});

export function normalizeOrderStatus(value) {
  const status = String(value ?? "").trim();
  return ORDER_STATUSES.includes(status) ? status : "";
}

export function isKnownOrderStatus(value) {
  return Boolean(normalizeOrderStatus(value));
}

export function canTransitionOrderStatus(from, to) {
  const current = normalizeOrderStatus(from) || "Новый";
  const next = normalizeOrderStatus(to);
  if (!next) return false;
  if (current === next) return true;
  const allowed = ORDER_STATUS_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

export function allowedNextOrderStatuses(from) {
  const current = normalizeOrderStatus(from) || "Новый";
  const next = ORDER_STATUS_TRANSITIONS[current] || [];
  return [current, ...next.filter((status) => status !== current)];
}

/**
 * @param {object} params
 * @param {object|null} params.previous
 * @param {object} params.incoming
 * @param {string} params.role
 * @returns {{ ok: true, status: string } | { ok: false, statusCode: number, error: string, code: string }}
 */
export function enforceOrderStatusChange({ previous = null, incoming, role }) {
  const nextRaw = incoming?.status;
  const next = normalizeOrderStatus(nextRaw);

  if (nextRaw != null && String(nextRaw).trim() !== "" && !next) {
    return {
      ok: false,
      statusCode: 400,
      error: `Неизвестный статус заказа: «${String(nextRaw)}».`,
      code: "ORDER_STATUS_UNKNOWN",
    };
  }

  if (!previous) {
    // Новый заказ: только «Новый» (или пусто → Новый).
    const created = next || "Новый";
    if (created !== "Новый") {
      return {
        ok: false,
        statusCode: 400,
        error: "Новый заказ можно создать только со статусом «Новый».",
        code: "ORDER_STATUS_CREATE_FORBIDDEN",
      };
    }
    return { ok: true, status: created };
  }

  const previousRaw = String(previous.status ?? "").trim();
  const previousStatus = normalizeOrderStatus(previousRaw);

  // Legacy / грязный статус вне словаря: клиент не меняет; staff может один раз поставить известный.
  if (!previousStatus) {
    if (role === "client") {
      // Клиент не меняет статус — сохраняем как на сервере, не валим весь PUT.
      return { ok: true, status: previousRaw || "Новый" };
    }
    if (role !== "manager" && role !== "admin") {
      return {
        ok: false,
        statusCode: 403,
        error: "Недостаточно прав для смены статуса заказа.",
        code: "ORDER_STATUS_ROLE_FORBIDDEN",
      };
    }
    if (!next || next === previousRaw) {
      return { ok: true, status: previousRaw || "Новый" };
    }
    return { ok: true, status: next };
  }

  const resolvedNext = next || previousStatus;

  if (role === "client") {
    // Клиент не может менять статус. При рассинхроне UI (локально «Новый»,
    // на сервере уже «Принят» от 1С/менеджера) не отклоняем сохранение заказа —
    // оставляем серверный статус.
    return { ok: true, status: previousStatus };
  }

  if (role !== "manager" && role !== "admin") {
    return {
      ok: false,
      statusCode: 403,
      error: "Недостаточно прав для смены статуса заказа.",
      code: "ORDER_STATUS_ROLE_FORBIDDEN",
    };
  }

  if (!canTransitionOrderStatus(previousStatus, resolvedNext)) {
    return {
      ok: false,
      statusCode: 409,
      error: `Переход статуса «${previousStatus}» → «${resolvedNext}» запрещён.`,
      code: "ORDER_STATUS_TRANSITION_FORBIDDEN",
      from: previousStatus,
      to: resolvedNext,
      allowed: allowedNextOrderStatuses(previousStatus),
    };
  }

  if (TERMINAL.has(previousStatus) && resolvedNext !== previousStatus) {
    return {
      ok: false,
      statusCode: 409,
      error: `Статус «${previousStatus}» окончательный.`,
      code: "ORDER_STATUS_TERMINAL",
    };
  }

  return { ok: true, status: resolvedNext };
}

/**
 * Применяет FSM ко всему списку заказов перед сохранением.
 */
export function applyOrderStatusPolicy({ previousById, orders, role }) {
  const result = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    const previous = previousById.get(String(order?.id || ""));
    const check = enforceOrderStatusChange({ previous, incoming: order, role });
    if (!check.ok) {
      return {
        ok: false,
        statusCode: check.statusCode,
        error: check.error,
        code: check.code,
        orderId: String(order?.id || ""),
        from: check.from,
        to: check.to,
        allowed: check.allowed,
      };
    }
    result.push({ ...order, status: check.status });
  }
  return { ok: true, orders: result };
}

/**
 * Точечное обновление статуса одного заказа (для PATCH).
 * @returns {{ ok: true, unchanged?: boolean, order: object } | { ok: false, statusCode, error, code, ... }}
 */
export function buildStatusUpdatedOrder(
  previous,
  nextStatus,
  { role, actor = "Менеджер", historyType = "status.changed", historyId = "" } = {}
) {
  if (!previous) {
    return {
      ok: false,
      statusCode: 404,
      error: "Заказ не найден.",
      code: "ORDER_NOT_FOUND",
    };
  }

  const check = enforceOrderStatusChange({
    previous,
    incoming: { status: nextStatus },
    role,
  });
  if (!check.ok) return check;

  const previousRaw = String(previous.status ?? "").trim() || "Новый";
  if (check.status === previousRaw || check.status === previous.status) {
    return { ok: true, unchanged: true, order: previous };
  }

  const type = historyType === "status.bulk" ? "status.bulk" : "status.changed";
  const label =
    type === "status.bulk"
      ? `Статус массово изменён: ${previousRaw} → ${check.status}`
      : `Статус изменён: ${previousRaw} → ${check.status}`;

  const history = Array.isArray(previous.history) ? [...previous.history] : [];
  history.push({
    id: String(historyId || `history-${Date.now()}`),
    type,
    label,
    actor,
    createdAt: new Date().toISOString(),
  });

  let exchange = previous.exchange;
  if (check.status === "Обработан вручную") {
    const cancelled = cancelExchangeForManualProcessing(previous.exchange);
    exchange = cancelled.exchange;
    if (cancelled.cancelled) {
      history.push({
        id: String(historyId ? `${historyId}-exchange` : `history-exchange-${Date.now()}`),
        type: "exchange.reset",
        label: "Передача в 1С отменена: заказ обработан вручную",
        actor,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return {
    ok: true,
    unchanged: false,
    order: {
      ...previous,
      status: check.status,
      exchange,
      history: history.slice(-100),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Снимает заказ с очереди 1С при ручной обработке (до ACK / документа).
 */
export function cancelExchangeForManualProcessing(previousExchange) {
  const exchange = normalizeExchangeState(previousExchange || {});

  if (exchange.status === "sent") {
    return { exchange, cancelled: false };
  }
  if (
    exchange.status === "draft" &&
    (String(exchange.receipt || "").trim() ||
      String(exchange.remoteDocument?.id || exchange.remoteDocument?.number || "").trim())
  ) {
    return { exchange, cancelled: false };
  }

  if (
    exchange.status !== "ready" &&
    exchange.status !== "sending" &&
    exchange.status !== "error" &&
    exchange.status !== "draft"
  ) {
    return { exchange, cancelled: false };
  }

  return {
    cancelled: true,
    exchange: {
      ...exchange,
      status: "not_sent",
      checkedAt: "",
      lastAttemptAt: "",
      sentAt: "",
      claimedAt: "",
      claimedBy: "",
      receipt: "",
      remoteDocument: null,
      channel: "",
      message: "Передача в 1С отменена: заказ обработан вручную.",
    },
  };
}

/**
 * Callback из 1С: ручная смена состояния документа → бизнес-статус «Принят».
 * Только из «Новый»; более поздние статусы не откатываем (идемпотентно).
 */
export function applyOneCAcceptedStatus(
  previous,
  { historyId = "", oneCState = "", actor = "1С" } = {}
) {
  if (!previous) {
    return {
      ok: false,
      statusCode: 404,
      error: "Заказ не найден.",
      code: "ORDER_NOT_FOUND",
    };
  }

  const current = normalizeOrderStatus(previous.status) || "Новый";
  if (current !== "Новый") {
    return { ok: true, unchanged: true, order: previous };
  }

  const built = buildStatusUpdatedOrder(previous, "Принят", {
    role: "admin",
    actor,
    historyType: "status.changed",
    historyId,
  });
  if (!built.ok || built.unchanged) return built;

  const stateNote = String(oneCState || "").trim();
  if (stateNote && Array.isArray(built.order.history) && built.order.history.length) {
    const history = [...built.order.history];
    const last = { ...history[history.length - 1] };
    last.label = `Статус изменён: Новый → Принят (1С: ${stateNote})`;
    history[history.length - 1] = last;
    return { ...built, order: { ...built.order, history } };
  }
  return built;
}
