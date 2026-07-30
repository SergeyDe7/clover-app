const UNIT_LABELS = {
  piece: "Штука",
  pack: "Упаковка",
  bundle: "Пачка",
};

export const EXCHANGE_STATUSES = {
  not_sent: "Не отправлен",
  ready: "В очереди 1С TEST",
  sending: "Передаётся в 1С TEST",
  sent: "Создан в 1С TEST",
  draft: "Черновик создан в 1С",
  error: "Ошибка",
};

/** Пока 1С не прислала ACK, заказ удерживается в sending. После таймаута снова ready. */
export const ONEC_CLAIM_LEASE_MS = 15 * 60 * 1000;

export function isOneCClaimExpired(exchange = {}, nowMs = Date.now()) {
  const state = normalizeExchangeState(exchange);
  if (state.status !== "sending") return false;
  const startedAt = Date.parse(String(state.lastAttemptAt || state.checkedAt || ""));
  if (!Number.isFinite(startedAt)) return true;
  return nowMs - startedAt >= ONEC_CLAIM_LEASE_MS;
}

/** Интервал фонового requeue истёкших claim (не только на pull). */
export const ONEC_CLAIM_REQUEUE_INTERVAL_MS = 30 * 1000;

export const ONEC_CLAIM_EXPIRED_REQUEUE_MESSAGE =
  "Повторная очередь: предыдущая выдача 1С истекла без ACK.";

/**
 * Если claim истёк — возвращает exchange со status ready.
 * Активный claim не трогает (null).
 */
export function releaseExpiredClaimExchange(exchange = {}, nowMs = Date.now()) {
  const state = normalizeExchangeState(exchange);
  if (!isOneCClaimExpired(state, nowMs)) return null;
  return {
    ...state,
    status: "ready",
    message: ONEC_CLAIM_EXPIRED_REQUEUE_MESSAGE,
  };
}

export function normalizeExchangeState(value = {}) {
  const status = Object.hasOwn(EXCHANGE_STATUSES, value?.status)
    ? value.status
    : "not_sent";

  return {
    status,
    attempts: Math.max(0, Number(value?.attempts) || 0),
    checkedAt: value?.checkedAt || "",
    lastAttemptAt: value?.lastAttemptAt || "",
    sentAt: value?.sentAt || "",
    remoteDocument: value?.remoteDocument || null,
    channel: value?.channel || "",
    message: value?.message || "",
    receipt: value?.receipt || "",
    payloadVersion: value?.payloadVersion || "1.0",
  };
}

const QUEUE_EXCHANGE_STATUSES = new Set(["ready", "sending", "sent", "draft"]);

/**
 * Клиент не управляет очередью 1С. Менеджер меняет exchange только
 * через dedicated endpoints; bulk PUT /api/state/orders не должен
 * ставить ready/sent и не затирает уже подтверждённый обмен.
 */
export function sanitizeOrderExchangeForSave(order, previousOrder, role) {
  const previousExchange = previousOrder
    ? normalizeExchangeState(previousOrder.exchange)
    : null;

  if (role === "client") {
    return {
      ...order,
      exchange: previousExchange || normalizeExchangeState({ status: "not_sent" }),
    };
  }

  if (previousExchange) {
    return {
      ...order,
      exchange: previousExchange,
    };
  }

  const incoming = normalizeExchangeState(order?.exchange);
  if (QUEUE_EXCHANGE_STATUSES.has(incoming.status)) {
    return {
      ...order,
      exchange: normalizeExchangeState({
        ...incoming,
        status: "not_sent",
        message:
          incoming.message ||
          "Статус обмена сброшен: очередь 1С только через «Передать в 1С TEST».",
      }),
    };
  }

  return {
    ...order,
    exchange: incoming,
  };
}

/**
 * Защита от случайного wipe: неполный локальный snapshot менеджера
 * не должен удалить все существующие заказы одним PUT.
 */
export function assertSafeManagerOrderReplace(previousOrders, incomingOrders) {
  const previous = Array.isArray(previousOrders) ? previousOrders : [];
  const incoming = Array.isArray(incomingOrders) ? incomingOrders : [];

  if (previous.length === 0) {
    return { ok: true };
  }

  if (incoming.length === 0) {
    if (previous.length === 1) {
      return { ok: true };
    }

    return {
      ok: false,
      status: 409,
      error:
        "Нельзя сохранить пустой список заказов поверх существующей базы. Обновите страницу.",
    };
  }

  const incomingIds = new Set(
    incoming.map((order) => String(order?.id || "")).filter(Boolean)
  );
  const retained = previous.filter((order) =>
    incomingIds.has(String(order.id))
  );

  if (previous.length >= 2 && retained.length === 0) {
    return {
      ok: false,
      status: 409,
      error:
        "Отказ записи: локальный список заказов неполный и затёр бы всю базу. Обновите страницу и повторите.",
    };
  }

  return { ok: true };
}

function productMap(products) {
  return new Map((products || []).map((product) => [String(product.id), product]));
}

export function validateOrderFor1C({ order, products, clientLinks }) {
  const issues = [];
  const warnings = [];
  const link = clientLinks?.[order?.clientId] || {};
  const productsById = productMap(products);

  if (!order?.id) issues.push("У заказа отсутствует системный ID.");
  if (!order?.number) issues.push("У заказа отсутствует номер.");
  if (!order?.clientId) issues.push("У заказа отсутствует ID клиента.");
  if (!order?.customerName) issues.push("Не заполнено название клиента.");
  if (!order?.address) issues.push("Не заполнен адрес доставки.");
  if (!order?.firstDeliveryDate) warnings.push("Не указана дата доставки.");

  if (!link?.matched1C || !String(link?.oneCId || "").trim()) {
    warnings.push(
      "Клиент ещё не связан с контрагентом 1С. При получении заказа 1С должна определить его по названию, телефону или email и вернуть найденный ID в подтверждении."
    );
  }

  const items = Array.isArray(order?.items) ? order.items : [];
  const customItems = Array.isArray(order?.customItems) ? order.customItems : [];

  if (!items.length && !customItems.length) {
    issues.push("В заказе нет товаров.");
  }

  for (const item of items) {
    const product = productsById.get(String(item.productId ?? item.id));
    const oneCId = String(item.oneCId || product?.oneCId || "").trim();

    if (!oneCId) {
      issues.push(`У товара «${item.name || item.code || "Без названия"}» не заполнен ID номенклатуры 1С.`);
    }
    if (!(Number(item.quantity) > 0)) {
      issues.push(`У товара «${item.name || item.code || "Без названия"}» указано неверное количество.`);
    }
    if (!item.unit) {
      issues.push(`У товара «${item.name || item.code || "Без названия"}» не указана единица продажи.`);
    }
  }

  for (const item of customItems) {
    if (!item.matchedProductId) {
      issues.push(`Товар вне матрицы «${item.name || "Без названия"}» ещё не сопоставлен с товаром каталога.`);
    }
  }

  return {
    ready: issues.length === 0,
    issues: [...new Set(issues)],
    warnings: [...new Set(warnings)],
    client1CId: String(link?.oneCId || "").trim(),
    client1CName: String(link?.oneCName || "").trim(),
    clientLookupRequired: !String(link?.oneCId || "").trim(),
  };
}

export function build1CPayload({ order, products, clientLinks }) {
  const validation = validateOrderFor1C({ order, products, clientLinks });
  const link = clientLinks?.[order?.clientId] || {};
  const productsById = productMap(products);
  const exchange = normalizeExchangeState(order?.exchange);

  return {
    schema: "clover.order.1c",
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    testMode: true,
    validation,
    order: {
      id: String(order?.id || ""),
      externalId: String(order?.externalId || order?.id || ""),
      number: String(order?.number || ""),
      createdAt: order?.createdAt || "",
      updatedAt: order?.updatedAt || order?.createdAt || "",
      deliveryDate: order?.firstDeliveryDate || "",
      status: order?.status || "Новый",
      exchangeStatus: exchange.status,
      clientComment: order?.clientComment || "",
      managerComment: order?.managerComment || "",
    },
    client: {
      cloverId: String(order?.clientId || ""),
      oneCId: String(link?.oneCId || ""),
      oneCCode: String(link?.oneCCode || link?.oneCMatchCode || ""),
      oneCName: String(link?.oneCName || link?.oneCMatchName || ""),
      oneCInn: String(link?.oneCInn || link?.oneCMatchInn || ""),
      lookupRequired: !String(link?.oneCId || "").trim(),
      companyName: order?.customerName || "",
      contactName: order?.customerContact || "",
      phone: link?.oneCMatchPhone || order?.customerPhone || "",
      email: link?.oneCMatchEmail || order?.customerEmail || "",
      address: order?.address || "",
    },
    items: (order?.items || []).map((item, index) => {
      const product = productsById.get(String(item.productId ?? item.id));
      return {
        line: index + 1,
        cloverProductId: String(item.productId ?? item.id ?? ""),
        oneCId: String(item.oneCId || product?.oneCId || ""),
        code: item.oneCCode || product?.oneCCode || item.code || product?.code || "",
        name: item.oneCName || product?.oneCName || item.name || product?.name || "",
        displayName: item.name || product?.name || "",
        unit: item.unit || "piece",
        unitName: UNIT_LABELS[item.unit] || item.unit || "",
        quantity: Number(item.quantity) || 0,
        multiplier: Number(item.multiplier) || 1,
        totalPieces: (Number(item.quantity) || 0) * (Number(item.multiplier) || 1),
        unitPrice: Number(item.unitPrice) || 0,
        lineTotal: Number(item.lineTotal) || 0,
      };
    }),
    customItems: (order?.customItems || []).map((item, index) => ({
      line: index + 1,
      id: String(item.id || ""),
      name: item.name || "",
      details: item.details || "",
      unit: item.unit || "шт.",
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      matchedProductId: item.matchedProductId || "",
      requestStatus: item.requestStatus || "Новый запрос",
    })),
    totals: {
      positions: (order?.items || []).length + (order?.customItems || []).length,
      amount: [...(order?.items || []), ...(order?.customItems || [])].reduce(
        (sum, item) => sum + (Number(item.lineTotal) || (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)),
        0
      ),
    },
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function payloadToCsv(payload) {
  const header = [
    "Номер заказа",
    "Внешний ID",
    "ID клиента 1С",
    "Клиент",
    "Дата доставки",
    "ID товара 1С",
    "Код",
    "Товар",
    "Единица",
    "Количество",
    "Коэффициент",
    "Всего штук",
    "Цена",
    "Сумма",
  ];

  const rows = payload.items.map((item) => [
    payload.order.number,
    payload.order.externalId,
    payload.client.oneCId,
    payload.client.companyName,
    payload.order.deliveryDate,
    item.oneCId,
    item.code,
    item.name,
    item.unitName,
    item.quantity,
    item.multiplier,
    item.totalPieces,
    item.unitPrice,
    item.lineTotal,
  ]);

  if (!rows.length) {
    rows.push([
      payload.order.number,
      payload.order.externalId,
      payload.client.oneCId,
      payload.client.companyName,
      payload.order.deliveryDate,
      "",
      "",
      "",
      "",
      0,
      0,
      0,
      0,
      0,
    ]);
  }

  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}

export function summarizeExchange(orders, products, clientLinks) {
  const summary = {
    total: orders.length,
    notSent: 0,
    ready: 0,
    sent: 0,
    draft: 0,
    error: 0,
    missingClientLinks: 0,
    missingProductLinks: 0,
  };

  const rows = orders.map((order) => {
    const exchange = normalizeExchangeState(order.exchange);
    const validation = validateOrderFor1C({ order, products, clientLinks });
    summary[exchange.status === "not_sent" ? "notSent" : exchange.status] += 1;
    if (validation.clientLookupRequired) {
      summary.missingClientLinks += 1;
    }
    summary.missingProductLinks += validation.issues.filter((issue) => issue.includes("ID номенклатуры 1С")).length;

    return {
      id: order.id,
      number: order.number,
      customerName: order.customerName || "Клиент",
      createdAt: order.createdAt,
      deliveryDate: order.firstDeliveryDate || "",
      orderStatus: order.status || "Новый",
      exchange,
      validation,
    };
  });

  return { summary, rows };
}
