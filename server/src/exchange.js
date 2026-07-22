const UNIT_LABELS = {
  piece: "Штука",
  pack: "Упаковка",
  bundle: "Пачка",
};

export const EXCHANGE_STATUSES = {
  not_sent: "Не отправлен",
  ready: "Готов к передаче",
  sent: "Передан в 1С",
  error: "Ошибка",
};

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
    message: value?.message || "",
    receipt: value?.receipt || "",
    payloadVersion: value?.payloadVersion || "1.0",
  };
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
    issues.push("Клиент не сопоставлен с контрагентом в 1С.");
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
      oneCName: String(link?.oneCName || ""),
      companyName: order?.customerName || "",
      contactName: order?.customerContact || "",
      phone: order?.customerPhone || "",
      email: order?.customerEmail || "",
      address: order?.address || "",
    },
    items: (order?.items || []).map((item, index) => {
      const product = productsById.get(String(item.productId ?? item.id));
      return {
        line: index + 1,
        cloverProductId: String(item.productId ?? item.id ?? ""),
        oneCId: String(item.oneCId || product?.oneCId || ""),
        code: item.code || product?.code || "",
        name: item.name || product?.name || "",
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
    error: 0,
    missingClientLinks: 0,
    missingProductLinks: 0,
  };

  const rows = orders.map((order) => {
    const exchange = normalizeExchangeState(order.exchange);
    const validation = validateOrderFor1C({ order, products, clientLinks });
    summary[exchange.status === "not_sent" ? "notSent" : exchange.status] += 1;
    if (validation.issues.some((issue) => issue.includes("Клиент не сопоставлен"))) {
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
