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
  return project(EXCHANGE_STATUS_KEYS, status, t);
}

export function visibilityFilterLabel(value, t) {
  return project(VISIBILITY_FILTER_KEYS, value, t);
}

export function contactLabel(canonical, t) {
  if (canonical === "Основной") return typeof t === "function" ? t("shared.address.primary") : canonical;
  if (canonical === "Дополнительный") return typeof t === "function" ? t("shared.address.extra") : canonical;
  return canonical || "";
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
  if (label === "Заказ создан" && typeof t === "function") return t("shared.orderCreated");
  return label || "";
}

export function promoStatusLabel(status, t) {
  return project(PROMO_STATUS_KEYS, status, t);
}
