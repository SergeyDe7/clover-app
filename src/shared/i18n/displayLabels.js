/** Display projections for canonical Russian business identities. Maps stay RU. */

const ORDER_STATUS_KEYS = {
  Новый: "manager.orderStatus.new",
  Принят: "manager.orderStatus.accepted",
  "Обработан вручную": "manager.orderStatus.manual",
  Собирается: "manager.orderStatus.picking",
  "Готов к доставке": "manager.orderStatus.ready",
  Доставляется: "manager.orderStatus.delivering",
  Выполнен: "manager.orderStatus.done",
  Отменён: "manager.orderStatus.cancelled",
};

const REQUEST_STATUS_KEYS = {
  "Новый запрос": "manager.customStatus.newRequest",
  Уточняется: "manager.customStatus.clarifying",
  Согласован: "manager.customStatus.agreed",
  "Добавлен в каталог": "manager.customStatus.addedToCatalog",
  Отклонён: "manager.customStatus.rejected",
};

const EXCHANGE_STATUS_KEYS = {
  not_sent: "manager.exchangeStatus.notSent",
  ready: "manager.exchangeStatus.queued",
  sending: "manager.exchangeStatus.sending",
  sent: "manager.exchangeStatus.accepted",
  draft: "manager.exchangeStatus.draft",
  error: "manager.exchangeStatus.error",
};

const VISIBILITY_FILTER_KEYS = {
  Все: "shared.filter.all",
  Активные: "shared.filter.active",
  Скрытые: "manager.hidden2",
  "На витрине сайта": "manager.onTheWebsiteStorefront",
  "Не на витрине": "manager.storefront.off",
  "Связанные с 1С": "manager.linkedTo1c2",
  "Без связи с 1С": "manager.notLinkedTo1c",
  "Есть варианты": "manager.hasVariants",
  "На витрине": "manager.storefront.on",
};

const PROMO_STATUS_KEYS = {
  active: "manager.promo.status.active",
  scheduled: "manager.promo.status.scheduled",
  completed: "manager.promo.status.completed",
  disabled: "manager.promo.status.disabled",
};

const RECONCILIATION_STATUS_KEYS = {
  new: "manager.customStatus.newRequest",
  processing: "shared.reconciliation.status.processing",
  ready: "shared.reconciliation.status.ready",
  rejected: "manager.customStatus.rejected",
};

const RECONCILIATION_PERIOD_KEYS = {
  q1: "shared.reconciliation.period.q1",
  q2: "shared.reconciliation.period.q2",
  q3: "shared.reconciliation.period.q3",
  q4: "shared.reconciliation.period.q4",
  all: "shared.reconciliation.period.all",
  custom: "shared.reconciliation.period.custom",
};

const ORDER_HISTORY_LABEL_KEYS = {
  "Заказ создан": "shared.orderCreated",
  "Заказ создан с сайта": "shared.orderHistory.createdFromSite",
  "Клиент добавил позиции (дозаказ)": "shared.orderHistory.clientAddendum",
  "Клиент изменил состав или условия заказа": "shared.orderHistory.clientEdit",
  "Передача в 1С отменена: заказ обработан вручную": "shared.orderHistory.exchangeCancelledManual",
};

const ORDER_HISTORY_STATUS_CHANGED_ONEC = /^Статус изменён: (.+) → (.+) \(1С: (.+)\)$/;
const ORDER_HISTORY_STATUS_CHANGED = /^Статус изменён: (.+) → (.+)$/;
const ORDER_HISTORY_STATUS_BULK = /^Статус массово изменён: (.+) → (.+)$/;

const BACKUP_REASON_KEYS = {
  "Ручная копия из кабинета менеджера": "manager.manualCopyFromTheManagerCabinet",
  "Ручная резервная копия": "manager.backup.reason.manualDefault",
  "Автоматическая копия перед восстановлением": "manager.backup.reason.beforeRestore",
  "Автоматическая копия перед полным сбросом": "manager.backup.reason.beforeReset",
  "Автоматическая полная копия при первом запуске за день": "manager.backup.reason.dailyStart",
};

const CONTACT_ROLE_KEYS = {
  Директор: "client.director",
  Бухгалтер: "client.accountant",
  Склад: "client.warehouse",
  Закупки: "client.purchasing",
  "Приём товара": "client.goodsReceiving",
  Менеджер: "manager.manager",
};

const ROLE_KEYS = {
  client: "shared.role.client",
  manager: "shared.role.manager",
  admin: "shared.role.admin",
  system: "shared.role.system",
  Клиент: "shared.role.client",
  Менеджер: "shared.role.manager",
  Админ: "shared.role.admin",
  Система: "shared.role.system",
};

const TRANSLATION_STATE_KEYS = {
  AUTO: "admin.languages.state.auto",
  MANUAL: "admin.languages.state.manual",
  MISSING: "admin.languages.state.missing",
  STALE: "admin.languages.state.stale",
};

function project(map, canonical, t) {
  const key = map[canonical];
  if (!key || typeof t !== "function") return canonical;
  return t(key);
}

export function orderStatusLabel(status, t) {
  return project(ORDER_STATUS_KEYS, status, t);
}

export function requestStatusLabel(status, t) {
  return project(REQUEST_STATUS_KEYS, status, t);
}

export function exchangeStatusLabel(status, t) {
  const code = status && typeof status === "object" ? status.status : status;
  return project(EXCHANGE_STATUS_KEYS, code, t);
}

export function visibilityFilterLabel(value, t) {
  return project(VISIBILITY_FILTER_KEYS, value, t);
}

export function orderHistoryFilterLabel(status, t) {
  const fromFilter = visibilityFilterLabel(status, t);
  if (fromFilter !== status) return fromFilter;
  return orderStatusLabel(status, t);
}

export function contactLabel(canonical, t) {
  if (canonical === "Основной") return typeof t === "function" ? t("shared.address.primary") : canonical;
  if (canonical === "Дополнительный") return typeof t === "function" ? t("shared.address.extra") : canonical;
  return contactRoleLabel(canonical, t);
}

export function contactRoleLabel(canonical, t) {
  return project(CONTACT_ROLE_KEYS, canonical, t) || canonical || "";
}

export function addressLabel(canonical, t) {
  if (!canonical) return "";
  if (typeof t !== "function") return canonical;
  if (canonical === "Адрес из заказа") return t("manager.addressFromTheOrder");
  if (canonical === "Основной адрес") return t("manager.primaryAddress");
  const numbered = /^Адрес (\d+)$/.exec(canonical);
  if (numbered) return t("manager.addressNumbered", { n: numbered[1] });
  return contactLabel(canonical, t) || canonical;
}

export function orderHistoryLabel(label, t) {
  const raw = String(label || "");
  if (!raw) return "";
  const known = ORDER_HISTORY_LABEL_KEYS[raw];
  if (known && typeof t === "function") return t(known);
  const oneCChanged = ORDER_HISTORY_STATUS_CHANGED_ONEC.exec(raw);
  if (oneCChanged && typeof t === "function") {
    return t("shared.orderHistory.statusChangedOneC", {
      from: orderStatusLabel(oneCChanged[1], t),
      to: orderStatusLabel(oneCChanged[2], t),
      state: oneCChanged[3],
    });
  }
  const changed = ORDER_HISTORY_STATUS_CHANGED.exec(raw);
  if (changed && typeof t === "function") {
    return t("shared.orderHistory.statusChanged", {
      from: orderStatusLabel(changed[1], t),
      to: orderStatusLabel(changed[2], t),
    });
  }
  const bulk = ORDER_HISTORY_STATUS_BULK.exec(raw);
  if (bulk && typeof t === "function") {
    return t("shared.orderHistory.statusBulkChanged", {
      from: orderStatusLabel(bulk[1], t),
      to: orderStatusLabel(bulk[2], t),
    });
  }
  return raw;
}

export function historyActorLabel(actor, t) {
  return project(ROLE_KEYS, actor, t) || actor || "";
}

export function promoStatusLabel(status, t) {
  return project(PROMO_STATUS_KEYS, status, t);
}

export function reconciliationStatusLabel(status, t) {
  return project(RECONCILIATION_STATUS_KEYS, status, t);
}

export function reconciliationPeriodDisplayLabel(item, t) {
  const type = item?.periodType;
  if (type === "all") return project(RECONCILIATION_PERIOD_KEYS, "all", t);
  if (["q1", "q2", "q3", "q4"].includes(type)) {
    const period = project(RECONCILIATION_PERIOD_KEYS, type, t);
    return `${period} ${item?.year || ""}`.trim();
  }
  if (type === "custom" && !(item?.dateFrom || item?.dateTo)) {
    return project(RECONCILIATION_PERIOD_KEYS, "custom", t);
  }
  return `${item?.dateFrom || "—"} — ${item?.dateTo || "—"}`;
}

export function backupReasonLabel(reason, t) {
  return project(BACKUP_REASON_KEYS, reason, t);
}

export function roleLabel(role, t) {
  return project(ROLE_KEYS, role, t);
}

export function translationEditorStateLabel(state, t) {
  return project(TRANSLATION_STATE_KEYS, state, t);
}

export const DISPLAY_PROJECTION_MAPS = Object.freeze({
  ORDER_STATUS_KEYS,
  REQUEST_STATUS_KEYS,
  EXCHANGE_STATUS_KEYS,
  VISIBILITY_FILTER_KEYS,
  PROMO_STATUS_KEYS,
  RECONCILIATION_STATUS_KEYS,
  RECONCILIATION_PERIOD_KEYS,
  ORDER_HISTORY_LABEL_KEYS,
  BACKUP_REASON_KEYS,
  CONTACT_ROLE_KEYS,
  ROLE_KEYS,
  TRANSLATION_STATE_KEYS,
});
