// Общие чистые хелперы и константы Clover.
// Не содержит React-компонентов — только данные и функции без побочных эффектов рендера.

import { assignCloverTaxonomy, canonicalizeProductCategory } from "../screens/storefront/productGroups.js";

export const MANAGER_ACTIVE_TAB_KEY = "clover-manager-active-tab-v1";

export const MANAGER_OPEN_CLIENT_KEY = "clover-manager-open-client-v1";

export const CLIENT_ACTIVE_TAB_KEY = "clover-client-active-tab-v1";

export const MANAGER_TABS = [
  ["orders", "Заказы"],
  ["products", "Товары"],
  ["storefront", "Витрина"],
  ["clients", "Клиенты"],
  ["acts", "Акты сверок"],
  ["exchange", "1С"],
  ["more", "Ещё"],
];

/** Вкладки внутри «Ещё» у менеджера. */
export const MANAGER_MORE_TABS = [
  ["access", "Доступы"],
  ["settings", "Настройки"],
  ["backup", "Резервные копии"],
  ["audit", "Журнал"],
];

/** Права разделов для ограничения менеджера. */
export const STAFF_FEATURE_OPTIONS = [
  ["orders", "Заказы"],
  ["clients", "Клиенты"],
  ["products", "Товары"],
  ["exchange", "1С"],
  ["acts", "Акты сверок"],
  ["access", "Доступы"],
  ["settings", "Настройки"],
  ["backup", "Резервные копии"],
  ["audit", "Журнал"],
];

export const STAFF_FEATURE_IDS = STAFF_FEATURE_OPTIONS.map(([id]) => id);

export function staffHasFeature(authUser, featureId) {
  if (!authUser) return false;
  const id = String(featureId || "");
  if (id === "storefront") return authUser.role === "admin";
  if (authUser.role === "admin") return true;
  const permissions = authUser.permissions;
  if (!permissions || permissions.fullAccess) return true;
  const tabs = Array.isArray(permissions.tabs) ? permissions.tabs : STAFF_FEATURE_IDS;
  if (id === "more") {
    return ["access", "settings", "backup", "audit"].some((item) => tabs.includes(item));
  }
  return tabs.includes(id);
}

export const MANAGER_MORE_TAB_KEY = "clover-manager-more-tab-v1";

export const CLIENT_TABS = [
  ["matrix", "Моя матрица"],
  ["catalog", "Добавить товары из каталога"],
  ["orders", "Мои заказы"],
  ["reconciliation", "Акт сверки"],
  ["cabinet", "Настройки"],
];

/** Подразделы «Настроек» на мобильном. */
export const CLIENT_CABINET_SECTIONS = [
  ["addresses", "Адреса"],
  ["settings", "Профиль"],
];

export const CLIENT_CABINET_SECTION_KEY = "clover-client-cabinet-section-v1";
export const CLIENT_SEEN_READY_ACTS_KEY = "clover-client-seen-ready-acts-v1";

/** Навигация/кабинет клиента (см. APP_STYLES @media 820px). */
export const CLIENT_NARROW_MQ = "(max-width: 820px)";

/** Корзина/каталог заказа (см. APP_STYLES @media 900px — скрыт .order-summary). */
export const CATALOG_NARROW_MQ = "(max-width: 900px)";

export function readClientSeenReadyActs() {
  try {
    const raw = localStorage.getItem(CLIENT_SEEN_READY_ACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function writeClientSeenReadyActs(ids) {
  try {
    const unique = [...new Set((ids || []).map(String))];
    localStorage.setItem(CLIENT_SEEN_READY_ACTS_KEY, JSON.stringify(unique));
  } catch (error) {
    console.error("Не удалось сохранить просмотренные акты сверки", error);
  }
}

export function readyReconciliationIds(requests = []) {
  return (requests || [])
    .filter((item) => item?.status === "ready" && (item.hasFile || item.fileName))
    .map((item) => String(item.id));
}

export function countUnseenReadyActs(requests = [], seenIds = readClientSeenReadyActs()) {
  const seen = new Set((seenIds || []).map(String));
  return readyReconciliationIds(requests).filter((id) => !seen.has(id)).length;
}

export function markReadyActsSeen(requests = []) {
  const readyIds = readyReconciliationIds(requests);
  if (!readyIds.length) return;
  const merged = [...new Set([...readClientSeenReadyActs(), ...readyIds])];
  writeClientSeenReadyActs(merged);
}

export function readManagerActiveTab() {
  try {
    const value = localStorage.getItem(MANAGER_ACTIVE_TAB_KEY) || "orders";
    const moreValue = localStorage.getItem(MANAGER_MORE_TAB_KEY) || "";
    if (value === "storefront" || (value === "more" && moreValue === "storefront")) {
      return "storefront";
    }
    if (value === "acts") return "acts";
    if (MANAGER_MORE_TABS.some(([id]) => id === value)) return "more";
    return MANAGER_TABS.some(([id]) => id === value) ? value : "orders";
  } catch {
    return "orders";
  }
}

/** Вернуть прокрутку окна после закрытия модалки/сохранения. */
export function restoreWindowScroll(scrollY) {
  if (typeof window === "undefined") return;
  const y = Number(scrollY);
  const top = Number.isFinite(y) ? y : 0;
  const apply = () => window.scrollTo(0, top);
  apply();
  requestAnimationFrame(apply);
}

export function writeManagerActiveTab(value) {
  try {
    localStorage.setItem(MANAGER_ACTIVE_TAB_KEY, value);
  } catch (error) {
    console.error("Не удалось сохранить раздел менеджера", error);
  }
}

export function readManagerMoreTab() {
  try {
    const value = localStorage.getItem(MANAGER_MORE_TAB_KEY) || "settings";
    return MANAGER_MORE_TABS.some(([id]) => id === value) ? value : "settings";
  } catch {
    return "settings";
  }
}

export function writeManagerMoreTab(value) {
  try {
    localStorage.setItem(MANAGER_MORE_TAB_KEY, value);
  } catch (error) {
    console.error("Не удалось сохранить подраздел «Ещё»", error);
  }
}

export function readClientActiveTab() {
  try {
    let value = localStorage.getItem(CLIENT_ACTIVE_TAB_KEY) || "matrix";
    if (value === "home" || value === "order") value = "matrix";
    return CLIENT_TABS.some(([id]) => id === value) ? value : "matrix";
  } catch {
    return "matrix";
  }
}

export function writeClientActiveTab(value) {
  try {
    localStorage.setItem(CLIENT_ACTIVE_TAB_KEY, value);
  } catch (error) {
    console.error("Не удалось сохранить раздел клиента", error);
  }
}

export function readClientCabinetSection() {
  try {
    let value = localStorage.getItem(CLIENT_CABINET_SECTION_KEY) || "settings";
    if (value === "profile") value = "settings";
    if (value === "history" || value === "reconciliation" || value === "matrix") value = "settings";
    return CLIENT_CABINET_SECTIONS.some(([id]) => id === value) ? value : "settings";
  } catch {
    return "settings";
  }
}

export function writeClientCabinetSection(value) {
  try {
    localStorage.setItem(CLIENT_CABINET_SECTION_KEY, value);
  } catch (error) {
    console.error("Не удалось сохранить подраздел кабинета", error);
  }
}

export function clientTabFromSection(section) {
  if (!section) return "";
  if (section === "reconciliation" || section === "acts") {
    return "reconciliation";
  }
  if (section === "matrix" || section === "products" || section === "home" || section === "order") {
    return "matrix";
  }
  if (section === "catalog" || section === "catalog-matrix") {
    return "catalog";
  }
  if (
    section === "addresses" ||
    section === "address" ||
    section === "settings" ||
    section === "profile" ||
    section === "security" ||
    section === "push" ||
    section === "cabinet"
  ) {
    return "cabinet";
  }
  if (section === "orders" || section === "history") return "orders";
  if (
    section === "home" ||
    section === "order"
  ) {
    return "matrix";
  }
  return "";
}

export function clientCabinetSectionFromQuery(section) {
  if (!section) return "";
  if (section === "addresses" || section === "address") return "addresses";
  if (
    section === "settings" ||
    section === "security" ||
    section === "push" ||
    section === "profile" ||
    section === "cabinet"
  ) {
    return "settings";
  }
  return "";
}

export function readOpenManagerClientId() {
  try {
    return localStorage.getItem(MANAGER_OPEN_CLIENT_KEY) || "";
  } catch {
    return "";
  }
}

export function writeOpenManagerClientId(value) {
  try {
    if (value) {
      localStorage.setItem(MANAGER_OPEN_CLIENT_KEY, String(value));
    } else {
      localStorage.removeItem(MANAGER_OPEN_CLIENT_KEY);
    }
  } catch (error) {
    console.error("Не удалось сохранить открытую карточку клиента", error);
  }
}

export const DEFAULT_PRODUCTS = [
  { id: 1, category: "Перчатки", name: "Перчатки нитриловые черные XL (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 2, category: "Упаковка", name: "Банка суповая 500 мл Перинт (50/400)", packSize: 400, pieceSize: 50, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 3, category: "Пакеты и пленка", name: "Пакеты для мусора 240 л, 65 мкм, 100×140 (50 шт.)", packSize: 50, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 4, category: "Упаковка", name: "Крышка к банкам Перинт (50/800)", packSize: 800, pieceSize: 50, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 5, category: "Перчатки", name: "Перчатки BEN FATTO нитриловые черные XL (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 6, category: "Пакеты и пленка", name: "Вакуумный пакет 300×400 мм, 70 мкм (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 7, category: "Пакеты и пленка", name: "Вакуумный пакет 200×300 мм, 60 мкм (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 8, category: "Упаковка", name: "Контейнер бумажный OneClick 800 крафт, дно (50/300)", packSize: 50, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 9, category: "Пакеты и пленка", name: "Вакуумный пакет 200×300 мм, 70 мкм (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 10, category: "Уборка", name: "Набор: щетка для пола и совок-ловушка с высокой ручкой", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 11, category: "Перчатки", name: "Перчатки BEN FATTO нитриловые черные L (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 12, category: "Пакеты и пленка", name: "Вакуумный пакет 160×250 мм, 60 мкм (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 13, category: "Упаковка", name: "Бутылка прозрачная круглая с пробкой 500 мл (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 14, category: "Уборка", name: "МОП плоский 40×13 см, ухо-карман, арт. BF30562", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 15, category: "Упаковка", name: "Крышка плоская к контейнеру OneClick 800 (50/300)", packSize: 50, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 16, category: "Уборка", name: "Пульверизатор ручной черный 500 мл", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 17, category: "Уборка", name: "Швабра: рукоять 130 см + держатель мопов 40×11 см, арт. 636234", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 18, category: "Упаковка", name: "Бутылка прозрачная с пробкой 2 л (48 шт.)", packSize: 48, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 19, category: "Пакеты и пленка", name: "Пергамент для выпечки силиконизированный 38 см × 50 м, крафт (15)", packSize: 15, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 20, category: "Одноразовая продукция", name: "Трубочки для коктейля толстые черные 8×240 мм (250 шт.)", packSize: 250, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 21, category: "Уборка", name: "Салфетка для стекол Эксперт 35×40 см HQ", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 22, category: "Канцтовары", name: "Кассовая лента 80×12×80 (5/120)", packSize: 5, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 23, category: "Пакеты и пленка", name: "Пленка пищевая 250 м × 45 см (12)", packSize: 12, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 24, category: "Перчатки", name: "Перчатки KOMFI резиновые сверхпрочные красно-белые M (12/144)", packSize: 12, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 25, category: "Бытовая химия", name: "ХЕЛП — средство для мытья посуды 5 л (4)", packSize: 4, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 26, category: "Одноразовая продукция", name: "Трубочки для мартини черные 5×125 мм (400 шт.)", packSize: 400, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 27, category: "Одноразовая продукция", name: "Трубочки для коктейля с изгибом 5×210 мм, черные (250 шт.)", packSize: 250, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 28, category: "Канцтовары", name: "Кассовая лента 57×12×27 (6/210)", packSize: 6, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 29, category: "Уборка", name: "Щетка-сметка бытовая 6-рядная 240×40 мм", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 30, category: "Канцтовары", name: "Бумага А4 (5)", packSize: 5, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 31, category: "Пакеты и пленка", name: "Пакеты для мусора 60 л (50 шт.) ПОЛИЭС (25)", packSize: 50, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 32, category: "Бытовая химия", name: "Санокс 750 мл (15)", packSize: 15, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 33, category: "Уборка", name: "Губка для посуды металлическая (3 шт.) (32)", packSize: 3, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 34, category: "Уборка", name: "Ведро хозяйственное 10 л", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 35, category: "Канцтовары", name: "Ручка шариковая синяя STAFF (12)", packSize: 12, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 36, category: "Канцтовары", name: "Степлер № 24/6", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 37, category: "Уборка", name: "Пипидастр", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 38, category: "Канцтовары", name: "Ножницы Workmate 188 мм, пластиковые прорезиненные черные ручки", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 39, category: "Бытовая химия", name: "Белизна, 1 л (15)", packSize: 15, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 40, category: "Уборка", name: "Губка «Мега» для посуды КонтинентПак (5 шт.)", packSize: 5, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 41, category: "Текстиль", name: "Вафельное полотно 45 см × 60 м, 140 г/м² (5)", packSize: 5, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 42, category: "Текстиль", name: "Вафельное полотно 40 см × 50 м, 110 г/м²", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
];

export const UNIT_CONFIG = {
  piece: {
    label: "штука",
    shortLabel: "шт.",
    sizeField: "pieceSize",
    priceField: "pricePiece",
    basePriceField: "basePricePiece",
  },
  pair: {
    label: "пара",
    shortLabel: "пар.",
    sizeField: "pairSize",
    priceField: "pricePair",
    basePriceField: "basePricePair",
  },
  meter: {
    label: "метр",
    shortLabel: "м",
    sizeField: "meterSize",
    priceField: "priceMeter",
    basePriceField: "basePriceMeter",
  },
  roll: {
    label: "рулон",
    shortLabel: "рул.",
    sizeField: "rollSize",
    priceField: "priceRoll",
    basePriceField: "basePriceRoll",
  },
  pack: {
    label: "упаковка",
    shortLabel: "уп.",
    sizeField: "packSize",
    priceField: "pricePack",
    basePriceField: "basePricePack",
  },
  bundle: {
    label: "пачка",
    shortLabel: "пач.",
    sizeField: "bundleSize",
    priceField: "priceBundle",
    basePriceField: "basePriceBundle",
  },
  box: {
    label: "коробка",
    shortLabel: "кор.",
    sizeField: "boxSize",
    priceField: "priceBox",
    basePriceField: "basePriceBox",
  },
};

export function unitSizeField(unit) {
  return UNIT_CONFIG[unit]?.sizeField || "pieceSize";
}

export function unitPriceField(unit) {
  return UNIT_CONFIG[unit]?.priceField || "pricePiece";
}

export function unitBasePriceField(unit) {
  return UNIT_CONFIG[unit]?.basePriceField || "basePricePiece";
}

export function emptyPurchasePrices() {
  return Object.fromEntries(Object.keys(UNIT_CONFIG).map((unit) => [unit, null]));
}

export const RUSSIAN_PHONE_PREFIX = "+7 ";

export function getRussianPhoneLocalDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("7") || digits.startsWith("8")) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
}

const CYR_TO_LAT = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Транслит кириллицы → латиница для поиска («Кореана» ≈ Koreana). */
export function translitRuToLat(value) {
  return String(value || "")
    .toLocaleLowerCase("ru-RU")
    .split("")
    .map((char) => (Object.prototype.hasOwnProperty.call(CYR_TO_LAT, char) ? CYR_TO_LAT[char] : char))
    .join("");
}

/** Цифровые варианты номера: 7… / 8… / локальные 10 цифр. */
export function phoneSearchDigitVariants(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return [];

  const variants = new Set([digits]);
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const local = digits.slice(1);
    variants.add(local);
    variants.add(`${digits.startsWith("7") ? "8" : "7"}${local}`);
  } else if (digits.length === 10) {
    variants.add(`7${digits}`);
    variants.add(`8${digits}`);
  }

  return [...variants];
}

/**
 * Поиск по тексту: регистр, телефон в разных форматах,
 * кириллица/латиница («Кореана» / Koreana).
 */
export function matchesTextSearch(haystack, needle) {
  const query = String(needle || "").trim().toLocaleLowerCase("ru-RU");
  if (!query) return true;

  const text = String(haystack || "").toLocaleLowerCase("ru-RU");
  if (text.includes(query)) return true;

  const queryLat = translitRuToLat(query);
  const textLat = translitRuToLat(text);
  if (queryLat && textLat.includes(queryLat)) return true;

  const queryDigits = query.replace(/\D/g, "");
  if (queryDigits.length < 3) return false;

  const hayDigits = String(haystack || "").replace(/\D/g, "");
  if (!hayDigits) return false;

  return phoneSearchDigitVariants(queryDigits).some((variant) =>
    hayDigits.includes(variant)
  );
}

function normalizeCatalogSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .trim();
}

function splitCatalogSearchTokens(value) {
  return normalizeCatalogSearchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Поиск каталога по началам слов: «ста бум» находит «Стакан бумажный».
 * Не подменяет matchesTextSearch (клиенты/заказы остаются подстрокой).
 */
export function matchesCatalogPrefixSearch(haystack, needle) {
  const tokens = splitCatalogSearchTokens(needle);
  if (!tokens.length) return true;
  const words = splitCatalogSearchTokens(haystack);
  const compact = normalizeCatalogSearchText(haystack).replace(/[^\p{L}\p{N}]+/gu, "");
  if (compact) words.push(compact);
  if (!words.length) return false;
  const wordsLat = words.map((word) => translitRuToLat(word)).filter(Boolean);
  return tokens.every((token) => {
    if (words.some((word) => word.startsWith(token))) return true;
    const tokenLat = translitRuToLat(token);
    return Boolean(tokenLat && wordsLat.some((word) => word.startsWith(tokenLat)));
  });
}

/** Поля клиента Clover + связь с 1С для поиска менеджера. */
export function buildClientSearchHaystack(client = {}, link = {}) {
  const addresses = Array.isArray(client.addresses)
    ? client.addresses
        .map((item) => (typeof item === "string" ? item : item?.address || item?.label || ""))
        .filter(Boolean)
        .join(" ")
    : "";
  return [
    client.companyName,
    client.contactName,
    client.phone,
    client.email,
    client.inn,
    client.managerNote,
    addresses,
    link.oneCId,
    link.oneCCode,
    link.oneCName,
    link.oneCInn,
    link.oneCMatchName,
    link.oneCMatchInn,
    link.oneCMatchCode,
    link.oneCMatchPhone,
    link.oneCMatchEmail,
    link.managerNote,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Поля заказа + название контрагента 1С по clientId. */
export function buildOrderSearchHaystack(order = {}, link = {}) {
  const exchange = normalizeOrderExchange(order?.exchange);
  return [
    order.number,
    order.id,
    order.externalId,
    order.customerName,
    order.customerContact,
    order.customerPhone,
    order.customerEmail,
    order.address,
    order.addressLabel,
    link.oneCId,
    link.oneCCode,
    link.oneCName,
    link.oneCInn,
    link.oneCMatchName,
    link.oneCMatchInn,
    link.oneCMatchCode,
    link.oneCMatchPhone,
    exchange.remoteDocument?.number,
    exchange.remoteDocument?.id,
    exchange.message,
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatRussianPhone(value) {
  const digits = getRussianPhoneLocalDigits(value);

  if (!digits) return RUSSIAN_PHONE_PREFIX;

  let result = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ")";
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;

  return result;
}

export function getManagerPhoneLinks(value) {
  const localDigits = getRussianPhoneLocalDigits(value);

  if (localDigits.length !== 10) {
    return {
      phone: "",
    };
  }

  const fullNumber = `7${localDigits}`;

  return {
    phone: `tel:+${fullNumber}`,
  };
}

export function getMaxLink(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) return "";
  if (/^https?:\/\/(?:www\.)?max\.ru\//i.test(rawValue)) return rawValue;
  if (/^(?:www\.)?max\.ru\//i.test(rawValue)) return `https://${rawValue}`;

  const profilePath = rawValue
    .replace(/^@/, "")
    .replace(/^\/+|\/+$/g, "");

  return /^(?:u\/)?[a-zA-Z0-9_-]+$/.test(profilePath)
    ? `https://max.ru/${profilePath}`
    : "";
}

export function getTelegramLink(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) return "";
  if (/^https?:\/\//i.test(rawValue)) return rawValue;

  const username = rawValue
    .replace(/^@/, "")
    .replace(/^t\.me\//i, "")
    .replace(/[^a-zA-Z0-9_]/g, "");

  return username ? `https://t.me/${username}` : "";
}

export function selectDefaultNumber(event) {
  const value = String(event.currentTarget.value ?? "");
  if (value === "0" || value === "1") {
    event.currentTarget.select();
  }
}

/** Слева → справа: от меньшей ед. измерения к большей. */
export const UNIT_ORDER = ["piece", "pair", "meter", "roll", "pack", "bundle", "box"];

export const DEMO_SESSION_KEY = "clover-demo-session";

export const STORAGE = {
  products: "clover-products",
  orders: "clover-orders",
  profile: "clover-client-profile",
  addresses: "clover-addresses",
  clientId: "clover-client-id",
  favorites: "clover-favorites",
  settings: "clover-manager-settings",
  clientLinks: "clover-client-links",
  draft: "clover-order-draft",
  catalogView: "clover-catalog-view",
};

export const DEFAULT_SETTINGS = {
  showPrices: true,
  allowCustomItems: false,
  allowClientEdit: true,
  allowClientDelete: true,
  allowRepeatOrder: true,
  requireProfile: true,
  requireAddress: true,
  managerCanDeleteOrders: true,
  showFavorites: true,
  enableDrafts: true,
  managerFullName: "",
  managerPhone: "+7 ",
  managerMax: "",
  managerTelegram: "",
  managerNotificationsEnabled: true,
  managerNotifyNewOrders: true,
  managerNotifyOrderChanges: true,
  managerNotifyCustomItems: true,
  managerNotifyReconciliation: true,
  managerNotifyRegistrations: true,
  managerNotifyOneCErrors: true,
  managerNotifyEmail: true,
  managerNotificationEmail: "clover-order@mail.ru",
  managerNotifyTelegram: false,
  managerTelegramChatId: "",
  managerNotifyPush: true,
};

export const EMPTY_PROFILE = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
  contacts: [],
};

function newContactId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const CONTACT_LABEL_PRIMARY = "Основной";
const CONTACT_LABEL_SECONDARY = "Дополнительный";

/** Служебные метки роли синхронизируем с isPrimary; кастомные («Директор») сохраняем. */
export function syncContactRoleLabel(label, isPrimary) {
  const trimmed = String(label || "").trim();
  if (
    !trimmed ||
    trimmed === CONTACT_LABEL_PRIMARY ||
    trimmed === CONTACT_LABEL_SECONDARY
  ) {
    return isPrimary ? CONTACT_LABEL_PRIMARY : CONTACT_LABEL_SECONDARY;
  }
  return trimmed;
}

/** Нормализует контакты профиля; держит legacy contactName/phone в синхроне с основным. */
export function normalizeProfileContacts(profile = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  const companyName = String(source.companyName || "").trim();
  const email = String(source.email || "").trim();
  const rawContacts = Array.isArray(source.contacts) ? source.contacts : [];

  let contacts = rawContacts
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || item.contactName || "").trim();
      const phone = String(item.phone || item.number || "").trim();
      const label = String(item.label || "").trim();
      if (!name && !phone && !label) return null;
      return {
        id: String(item.id || `contact-${index + 1}`),
        name,
        label,
        phone,
        isPrimary: Boolean(item.isPrimary),
      };
    })
    .filter(Boolean);

  if (!contacts.length) {
    const legacyName = String(source.contactName || "").trim();
    const legacyPhone = String(source.phone || "").trim();
    if (legacyName || legacyPhone) {
      contacts = [
        {
          id: "contact-primary",
          name: legacyName,
          label: CONTACT_LABEL_PRIMARY,
          phone: legacyPhone,
          isPrimary: true,
        },
      ];
    }
  }

  // До 5 контактов: основной + дополнительные номера.
  contacts = contacts.slice(0, 5);

  if (!contacts.length) {
    return {
      companyName,
      contactName: "",
      phone: "",
      email,
      contacts: [],
    };
  }

  let primaryIndex = contacts.findIndex((item) => item.isPrimary);
  if (primaryIndex < 0) primaryIndex = 0;
  contacts = contacts.map((item, index) => {
    const isPrimary = index === primaryIndex;
    return {
      ...item,
      isPrimary,
      label: syncContactRoleLabel(item.label, isPrimary),
    };
  });

  const primary = contacts[primaryIndex];
  return {
    companyName,
    contactName: primary.name || "",
    phone: primary.phone || "",
    email,
    contacts,
  };
}

export function createEmptyProfileContact({ isPrimary = false } = {}) {
  return {
    id: newContactId(),
    name: "",
    label: isPrimary ? "Основной" : "Дополнительный",
    phone: "",
    isPrimary: Boolean(isPrimary),
  };
}

export function isClientProfileComplete(profile = {}) {
  const normalized = normalizeProfileContacts(profile);
  if (!normalized.companyName || !normalized.email) return false;
  const primary =
    normalized.contacts.find((item) => item.isPrimary) || normalized.contacts[0];
  return Boolean(primary?.name && primary?.phone);
}

export const EMPTY_LINK = {
  matched1C: false,
  oneCId: "",
  oneCCode: "",
  oneCName: "",
  oneCInn: "",
  oneCMatchCode: "",
  oneCMatchName: "",
  oneCMatchInn: "",
  oneCMatchPhone: "",
  oneCMatchEmail: "",
  oneCSearchQuery: "",
  oneCLinkMode: "",
  oneCLinkedAt: "",
  managerNote: "",
  matrixMode: "selected",
  matrixProductIds: [],
  allowFullCatalog: false,
  defaultPricingMode: "base",
  defaultMarkupPercent: 0,
  oneCPriceTypeId: "",
  oneCPriceTypeName: "",
  personalPrices: {},
};

export const EXCHANGE_STATUS_LABELS = {
  not_sent: "Не отправлен",
  ready: "В очереди на передачу в 1С",
  sending: "Передаётся в 1С",
  sent: "Принят в 1С",
  draft: "Черновик создан в 1С",
  error: "Не удалось передать",
};

export function exchangeContourLabel(database) {
  const name = String(database || "TEST").trim().toLocaleUpperCase("ru-RU") || "TEST";
  // В UI не светим внутренние имена баз (VLAVKA и т.п.).
  return name === "TEST" ? "1С TEST" : "1С";
}

export function exchangeStatusLabel(exchange = {}) {
  const state = normalizeOrderExchange(exchange);
  const base = EXCHANGE_STATUS_LABELS[state.status] || EXCHANGE_STATUS_LABELS.not_sent;
  if (!["ready", "sending", "sent"].includes(state.status)) return base;
  const contour = exchangeContourLabel(state.database);
  if (state.status === "ready") return `В очереди ${contour}`;
  if (state.status === "sending") return `Передаётся в ${contour}`;
  return `Принят в ${contour}`;
}

export function normalizeOrderExchange(value = {}) {
  const status = Object.hasOwn(EXCHANGE_STATUS_LABELS, value?.status)
    ? value.status
    : "not_sent";
  const database = String(value?.database || "").trim().toLocaleUpperCase("ru-RU");

  return {
    status,
    database:
      database ||
      (["ready", "sending", "sent", "draft", "error"].includes(status) ? "TEST" : ""),
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

export function exchangeBadgeClass(status) {
  if (status === "sent" || status === "draft") return "exchange-sent";
  if (status === "ready" || status === "sending") return "exchange-ready";
  if (status === "error") return "exchange-error";
  return "exchange-pending";
}

export function downloadBlobFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function printOrderDocument(order, settings) {
  const printWindow = window.open("", "_blank", "width=960,height=760");
  if (!printWindow) {
    void import("./AppModal.jsx").then(({ appAlert }) =>
      appAlert({
        title: "Печать заблокирована",
        message: "Браузер заблокировал окно печати. Разрешите всплывающие окна для этого сайта.",
        tone: "warn",
      })
    );
    return;
  }

  const itemRows = (order.items || []).map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(item.name)}</strong>${productArticle(item) ? `<br><small>${escapeHtml(productArticle(item))}</small>` : ""}</td>
      <td>${escapeHtml(UNIT_CONFIG[item.unit]?.label || item.unit)}</td>
      <td>${Number(item.quantity) || 0}</td>
      <td>${settings.showPrices ? escapeHtml(formatMoney(Number(item.unitPrice) || 0)) : "—"}</td>
      <td>${settings.showPrices ? escapeHtml(formatMoney(Number(item.lineTotal) || 0)) : "—"}</td>
    </tr>`).join("");
  const customRows = (order.customItems || []).map((item, index) => `
    <tr>
      <td>${(order.items || []).length + index + 1}</td>
      <td><strong>${escapeHtml(item.name)}</strong><br><small>Товар вне матрицы · ${escapeHtml(item.details || "")}</small></td>
      <td>${escapeHtml(item.unit || "шт.")}</td>
      <td>${Number(item.quantity) || 0}</td>
      <td>${settings.showPrices ? escapeHtml(formatMoney(Number(item.unitPrice) || 0)) : "—"}</td>
      <td>${settings.showPrices ? escapeHtml(formatMoney((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0))) : "—"}</td>
    </tr>`).join("");

  printWindow.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Заказ ${escapeHtml(order.number)}</title><style>
    body{font-family:Arial,sans-serif;color:#263226;margin:32px} h1{margin:0 0 4px;color:#3f7c3d} .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:22px 0;padding:16px;background:#f3f7f1;border-radius:12px}.meta div{line-height:1.5} table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #dce6d9;padding:9px;text-align:left;vertical-align:top}th{background:#eef5eb}.total{margin-top:18px;text-align:right;font-size:20px;font-weight:700}.note{margin-top:18px;padding:12px;background:#fff8e8;border-radius:10px}.footer{margin-top:36px;color:#718071;font-size:12px}@media print{button{display:none}body{margin:12mm}}
  </style></head><body>
    <h1>Заказ № ${escapeHtml(order.number)}</h1>
    <div>Система Clover · ${escapeHtml(formatDateTime(order.createdAt))}</div>
    <div class="meta">
      <div><strong>Клиент:</strong><br>${escapeHtml(order.customerName || "")}<br>${escapeHtml(order.customerContact || "")}<br>${escapeHtml(order.customerPhone || "")}</div>
      <div><strong>Доставка:</strong><br>${escapeHtml(formatDate(order.firstDeliveryDate))}<br>${escapeHtml(order.address || "")}</div>
    </div>
    <table><thead><tr><th>№</th><th>Товар</th><th>Единица</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${itemRows}${customRows}</tbody></table>
    ${settings.showPrices ? `<div class="total">Итого: ${escapeHtml(formatMoney(getOrderTotal(order)))}</div>` : ""}
    ${order.clientComment ? `<div class="note"><strong>Комментарий клиента:</strong><br>${escapeHtml(order.clientComment)}</div>` : ""}
    ${order.managerComment ? `<div class="note"><strong>Комментарий менеджера:</strong><br>${escapeHtml(order.managerComment)}</div>` : ""}
    <div class="footer">Внешний ID: ${escapeHtml(order.externalId || order.id || "")}</div>
    <script>window.onload=()=>window.print();</script>
  </body></html>`);
  printWindow.document.close();
}

export const APP_STYLES = `
:root {
  font-family: "Manrope", "Segoe UI", system-ui, sans-serif;
  color: var(--clover-text, #293329);
  background: var(--clover-bg, #f4f8f2);
}

* { box-sizing: border-box; }
html {
  width: 100%;
  max-width: 100%;
}
body {
  width: 100%;
  max-width: 100%;
  margin: 0;
}
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
textarea { resize: vertical; }

.clover-app {
  min-height: 100vh;
  width: 100%;
  max-width: 100%;
  background: var(--clover-bg, #f4f8f2);
}
.muted { color: var(--clover-muted, #5f6b5f); }
.small { font-size: 12px; }
.danger-text { color: var(--clover-danger, #a54f4f); }
.success-text { color: var(--clover-green-mute, #4f8d4b); }
.nowrap { white-space: nowrap; }

.role-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 18px 0 20px;
  padding: 5px;
  border-radius: 14px;
  background: #eef4eb;
}
.role-switch button {
  min-height: 42px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #687268;
  font-weight: 700;
}
.role-switch button.active {
  background: #fff;
  color: #4f8d4b;
  box-shadow: 0 4px 14px rgba(65,105,61,.1);
}
.test-note {
  margin-top: 18px;
  padding: 12px;
  border-radius: 12px;
  background: #fff8e9;
  color: #806936;
  font-size: 12px;
  line-height: 1.5;
}

.login-card .logo {
  display: block;
  width: min(280px, 78%);
  max-width: 280px;
  height: auto;
  margin: 0 auto 18px;
  object-fit: contain;
}
.password-field {
  position: relative;
  display: block;
}
.password-field input {
  width: 100%;
  min-width: 0;
  padding-right: 48px;
  box-sizing: border-box;
}
.password-toggle {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #5f7260;
  cursor: pointer;
}
.password-toggle:hover {
  background: rgba(91, 157, 87, 0.12);
  color: #3f6f3d;
}
.password-toggle:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.password-toggle svg {
  display: block;
  pointer-events: none;
}

.loading-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--clover-bg, #f4f8f2);
  font-family: "Manrope", "Segoe UI", system-ui, sans-serif;
}
.loading-page-quiet {
  padding: 0;
  place-items: stretch;
}
.loading-quiet-bar {
  position: fixed;
  top: 0;
  left: 0;
  width: 40%;
  height: 3px;
  border-radius: 0 2px 2px 0;
  background: #5b9d57;
  animation: loading-quiet-slide 1.1s ease-in-out infinite;
}
@keyframes loading-quiet-slide {
  0% { transform: translateX(-120%); width: 30%; }
  50% { width: 55%; }
  100% { transform: translateX(340%); width: 30%; }
}
.loading-card {
  width: min(420px, 100%);
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 30px;
  border: 1px solid rgba(86, 156, 80, .16);
  border-radius: 26px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 24px 60px rgba(62, 110, 57, .14);
  text-align: center;
}
.loading-logo {
  display: block;
  width: 190px;
  max-width: 65vw;
  height: auto;
  margin: 0 auto 18px;
  object-fit: contain;
}
.loading-card h2 { margin: 0 0 8px; color: #386f37; }
.loading-card p { margin: 0; color: #6d786d; line-height: 1.5; }

.app-header {
  min-height: 48px;
  padding: 6px 4%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background-color: #ffffff;
  background-image: none;
  border-bottom: none;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
}
.app-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
/* Desktop: logo | tabs | actions. display:contents поднимает детей top в сетку шапки */
.app-header-with-nav {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 12px;
  row-gap: 8px;
  width: 100%;
  max-width: 100%;
}
.app-header-with-nav .app-header-top {
  display: contents;
}
.app-header-with-nav .app-header-logo-button {
  grid-column: 1;
  grid-row: 1;
}
.app-header-with-nav .app-header-nav {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
}
.app-header-with-nav .app-header-actions {
  grid-column: 3;
  grid-row: 1;
  min-width: 0;
}
.app-header-nav {
  display: flex;
  align-items: center;
  align-self: center;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.app-header-nav::-webkit-scrollbar { display: none; }
.app-header-nav .manager-nav,
.app-header-nav .client-nav {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  width: auto;
  max-width: none;
  margin: 0;
  padding: 0;
  background: transparent;
}
.app-header-nav .manager-nav button,
.app-header-nav .client-nav button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 42px;
  height: 42px;
  padding: 0 16px;
  font-size: 14px;
  line-height: 1;
  border-radius: 11px;
  box-sizing: border-box;
}
.app-header-nav .manager-nav button {
  min-height: 42px;
  height: 42px;
  padding: 0 16px;
  font-size: 14px;
}
/* Единый непрозрачный верх: логотип + вкладки в один ряд. Без линии. */
.app-top-chrome {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  z-index: 100;
  background-color: #ffffff;
  background-image: none;
  opacity: 1;
  border-bottom: none;
  box-shadow: 0 4px 14px rgba(40, 64, 40, 0.06);
  box-sizing: border-box;
}
.app-top-chrome-spacer {
  height: var(--clover-chrome-offset, 56px);
  width: 100%;
  flex-shrink: 0;
  pointer-events: none;
}
.app-top-chrome .app-header {
  position: relative;
  top: auto;
  left: auto;
  right: auto;
  width: 100%;
  background-color: #ffffff;
  background-image: none;
  border-bottom: none;
  box-shadow: none;
  min-height: 48px;
  padding: 6px 4%;
}
.app-top-chrome .app-header-logo {
  width: 110px;
  max-width: 110px;
  max-height: 44px;
}
.app-nav-bar {
  display: none;
}
.app-nav-bar .manager-nav,
.app-nav-bar .client-nav {
  width: min(1240px, 92%);
  max-width: 100%;
  margin: 0 auto;
  background-color: transparent;
}
.app-nav-bar-client .client-nav,
.app-top-chrome-client .app-nav-bar-client .client-nav {
  width: min(1440px, 90%);
}
.clover-app > .page-content {
  position: relative;
  z-index: 1;
}
.app-header-logo { display: block; width: 152px; max-width: 152px; max-height: 66px; height: auto; object-fit: contain; flex: 0 0 auto; }
.app-header-logo-button {
  display: block;
  flex: 0 0 auto;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  line-height: 0;
  cursor: pointer;
}
.app-header-logo-button:focus-visible {
  outline: 2px solid #5b9d57;
  outline-offset: 3px;
  border-radius: 8px;
}
.app-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #596359;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-end;
}
.app-header-titles {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  min-width: 0;
  text-align: right;
}
.header-logout {
  flex: 0 0 auto;
  align-self: center;
  min-height: 42px;
}
.manager-contact { position: relative; }
.manager-contact-trigger {
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid #d7e3d4;
  border-radius: 12px;
  background: #f7fbf5;
  color: #4f8d4b;
  font-weight: 800;
}
.manager-contact-label-short { display: none; }
.manager-contact-label-full { display: inline; }
.manager-contact-trigger:hover,
.manager-contact.open .manager-contact-trigger,
.manager-contact:focus-within .manager-contact-trigger {
  border-color: #5b9d57;
  background: #eef7eb;
}
.manager-contact-popover {
  position: absolute;
  top: calc(100% + 11px);
  right: 0;
  z-index: 80;
  display: none;
  width: 310px;
  padding: 18px;
  border: 1px solid #dbe6d8;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 18px 44px rgba(43, 72, 40, .18);
  text-align: left;
}
.manager-contact:hover .manager-contact-popover,
.manager-contact.open .manager-contact-popover,
.manager-contact:focus-within .manager-contact-popover { display: block; }
.manager-contact-popover::before {
  content: "";
  position: absolute;
  top: -7px;
  right: 28px;
  width: 13px;
  height: 13px;
  border-top: 1px solid #dbe6d8;
  border-left: 1px solid #dbe6d8;
  background: #fff;
  transform: rotate(45deg);
}
.manager-contact-popover .eyebrow { margin: 0 0 7px; }
.manager-contact-popover h3 { margin: 0 0 8px; color: #394639; font-size: 18px; }
.manager-contact-phone { display: block; margin-bottom: 13px; color: #596359; font-size: 14px; font-weight: 700; text-decoration: none; }
.manager-contact-note { margin: 0 0 13px; color: #7a847a; font-size: 12px; line-height: 1.45; }
.manager-contact-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.manager-contact-actions a {
  display: grid;
  min-height: 40px;
  padding: 9px 10px;
  border: 1px solid #d7e3d4;
  border-radius: 11px;
  background: #fff;
  color: #4f8d4b;
  font-size: 12px;
  font-weight: 800;
  place-items: center;
  text-decoration: none;
}
.manager-contact-actions a.primary { border-color: #5b9d57; background: #5b9d57; color: #fff; }
.manager-contact-actions a.wide { grid-column: 1 / -1; }
.manager-contact-empty { padding: 11px; border-radius: 10px; background: #fff8e9; color: #806936; font-size: 12px; line-height: 1.45; }
.header-button {
  padding: 10px 16px;
  border: 1px solid #5b9d57;
  border-radius: 12px;
  background: #fff;
  color: #4f8d4b;
  font-weight: 700;
}
.header-button.primary { background: #5b9d57; color: #fff; }

.page-content { width: min(1240px, 92%); margin: 0 auto; padding: 38px 0 72px; }
.page-content-client {
  width: min(1440px, 90%);
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
  box-sizing: border-box;
}
.page-content-client .embedded-catalog.catalog-content {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0 0 70px;
  box-sizing: border-box;
}
.page-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
.page-title-row h1 { margin: 5px 0 10px; color: #386f37; font-size: 36px; }
.page-title-row p { margin: 0; color: #697469; line-height: 1.55; }
.eyebrow { color: #5b9d57 !important; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
.primary-button {
  min-height: 44px;
  padding: 11px 18px;
  border: none;
  border-radius: 12px;
  background: #5b9d57;
  color: #fff;
  font-weight: 700;
}
.secondary-button {
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid #d5dfd2;
  border-radius: 12px;
  background: #fff;
  color: #515d51;
  font-weight: 600;
}
.danger-button {
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid #e6c7c7;
  border-radius: 12px;
  background: #fff;
  color: #a54f4f;
  font-weight: 600;
}
.icon-button {
  width: 38px;
  height: 38px;
  border: 1px solid #d9e4d6;
  border-radius: 11px;
  background: #fff;
  color: #5f715f;
  font-weight: 800;
}

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 26px; }
.stats-grid.manager-stats-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.stat-card {
  padding: 21px;
  border: 1px solid #e1e9de;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(56,97,52,.05);
}
.manager-home-notice { margin-bottom: 14px; }
.manager-home-notice-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.stat-card span { display: block; margin-bottom: 10px; color: #747e74; font-size: 12px; }
.stat-card strong { color: #386f37; font-size: 28px; }

.panel {
  margin-top: 22px;
  padding: 24px;
  border: 1px solid #e1e9de;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 10px 26px rgba(56,97,52,.05);
}
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
.panel-heading h2 { margin: 4px 0 7px; color: #394639; }
.panel-heading p { margin: 0; color: #737d73; line-height: 1.5; }
.client-orders-panel {
  position: relative;
  padding-bottom: 96px;
}
.client-new-order-fab {
  position: fixed;
  right: max(20px, calc((100vw - min(1440px, 90vw)) / 2 + 12px));
  bottom: 28px;
  z-index: 35;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 54px;
  padding: 14px 28px;
  border: none;
  border-radius: 999px;
  background: #3f8f3c;
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.01em;
  box-shadow: 0 14px 32px rgba(47, 125, 50, 0.42), 0 2px 0 rgba(255, 255, 255, 0.2) inset;
  cursor: pointer;
}
.client-new-order-fab:hover {
  background: #357a33;
}
.client-new-order-fab:focus-visible {
  outline: 3px solid rgba(63, 143, 60, 0.35);
  outline-offset: 3px;
}
@media (max-width: 820px) {
  .client-new-order-fab {
    right: 16px;
    bottom: 24px;
    min-height: 50px;
    padding: 12px 22px;
    font-size: 15px;
  }
}

.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
.field { display: grid; gap: 7px; color: #515d51; font-size: 12px; font-weight: 700; }
.field input, .field select, .field textarea, .toolbar input, .toolbar select {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid #e6eee3;
  border-radius: 11px;
  background: #fbfdfb;
  color: #394639;
  outline: none;
}
.field input:focus, .field select:focus, .field textarea:focus, .toolbar input:focus, .toolbar select:focus {
  border-color: rgba(91,157,87,.55);
  box-shadow: 0 0 0 2px rgba(91,157,87,.1);
  background: #fff;
}
.field.is-invalid {
  color: #b42318;
}
.field.is-invalid input,
.field.is-invalid select,
.delivery-date-trigger.is-invalid {
  border-color: #d92d20 !important;
  background: #fff5f4 !important;
  box-shadow: 0 0 0 3px rgba(217, 45, 32, 0.14) !important;
}
.delivery-date-trigger.is-invalid .delivery-date-day.is-empty {
  background: #fecdca;
  color: #b42318;
}
.delivery-date-trigger.is-invalid .delivery-date-text strong,
.delivery-date-trigger.is-invalid .delivery-date-action {
  color: #b42318;
}
.delivery-date-trigger.is-invalid .delivery-date-text small {
  color: #912018;
}
.field-error-hint {
  margin: 0;
  color: #b42318;
  font-size: 12px;
  font-weight: 700;
}
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }

.profile-summary { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
.profile-summary article, .address-card, .mini-card {
  padding: 15px;
  border: 1px solid #e4ebe1;
  border-radius: 14px;
  background: #f8fbf6;
}
.profile-summary span, .mini-label { display: block; margin-bottom: 6px; color: #7b857b; font-size: 11px; }
.profile-summary strong { display: block; overflow-wrap: anywhere; color: #3f4b3f; font-size: 14px; line-height: 1.45; }
.empty-box { padding: 28px 20px; border: 1px dashed #dce6d8; border-radius: 12px; background: #fff; color: #4a554a; text-align: center; line-height: 1.5; }
.warning-box { padding: 18px; border: 1px solid #ead9b5; border-radius: 12px; background: #fff6e5; color: #7a5c1e; }

.address-list { display: grid; gap: 12px; }
.address-card { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.address-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.address-title h3 { margin: 0; color: #3f4b3f; font-size: 16px; }
.badge { display: inline-flex; align-items: center; width: fit-content; padding: 5px 9px; border-radius: 13px; font-size: 11px; font-weight: 700; }
.badge.green { background: #dff0da; color: #2f6b32; }
.badge.yellow { background: #fff1d6; color: #7a5a14; }
.badge.blue { background: #e4eefc; color: #2f5f9a; }
.badge.gray { background: #eef1ee; color: #556055; }
.badge.red { background: #fdecec; color: #a54f4f; }
.badge.status-new, .status-new { background: #e8eef4; color: #3d5568; }
.badge.status-work, .status-work { background: #fff1d6; color: #7a5a14; }
.badge.status-ready, .status-ready { background: #e4eefc; color: #2f5f9a; }
.badge.status-done, .status-done { background: #dff0da; color: #2f6b32; }
.badge.status-cancel, .status-cancel { background: #f0eeee; color: #5c5c5c; }
.address-card p { margin: 7px 0 0; color: #697469; font-size: 13px; line-height: 1.5; }
.inline-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.inline-actions button { min-height: 36px; padding: 7px 10px; font-size: 11px; }

.toolbar { display: grid; grid-template-columns: minmax(200px,1fr) 190px 190px; gap: 12px; margin-bottom: 18px; }
.toolbar.two { grid-template-columns: minmax(220px,1fr) 220px; }
.toolbar.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.toolbar.four { grid-template-columns: minmax(220px,1fr) 180px 180px 180px; }
.products-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.products-filter-bar input[type="search"] {
  width: 420px;
  max-width: 100%;
  flex: 1 1 360px;
  min-height: 42px;
  padding: 10px 14px;
  font-size: 16px;
  box-sizing: border-box;
}
.products-filter-bar select {
  width: auto;
  min-width: 108px;
  max-width: 168px;
  flex: 0 0 auto;
  min-height: 34px;
  padding: 6px 8px;
  font-size: 13px;
  box-sizing: border-box;
}
.products-filter-bar .inline-actions {
  margin-left: auto;
}
.manager-orders-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.manager-bulk-panel {
  margin: 0 0 14px;
  padding: 12px;
  background: linear-gradient(180deg, #fbfdfb 0%, #f7faf5 100%);
  border: 1px solid #e4ebe1;
}
.manager-bulk-status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.manager-bulk-status-row > .manager-bulk-chip,
.manager-bulk-status-row > .manager-bulk-status-select {
  min-height: 36px;
  height: 36px;
  padding: 0 12px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  box-sizing: border-box;
}
.manager-bulk-status-select {
  -webkit-appearance: none;
  appearance: none;
  flex: 1 1 168px;
  max-width: 220px;
  min-width: 148px;
  padding: 0 30px 0 12px;
  border: 1px solid #d7e1d4;
  background-color: #fff;
  color: #394639;
  outline: none;
}
.manager-bulk-status-select:focus {
  border-color: rgba(91, 157, 87, 0.55);
  box-shadow: 0 0 0 3px rgba(91, 157, 87, 0.12);
  background-color: #fff;
}
.manager-bulk-apply {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 14px;
}
.manager-bulk-apply-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}
.manager-cancel-onec-button {
  min-height: 44px;
  padding: 11px 16px;
  font-weight: 800;
  box-sizing: border-box;
}
.manager-bulk-panel .exchange-actions > button {
  min-height: 44px;
  height: 44px;
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
  box-sizing: border-box;
}
.manager-orders-topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
}
.manager-orders-seg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  gap: 8px;
  min-width: 0;
  min-height: 46px;
  padding: 11px 17px;
  border: 1px solid #d7e1d4;
  border-radius: 13px;
  background: #fff;
  color: #5d695d;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  box-sizing: border-box;
  cursor: pointer;
}
.manager-orders-seg.active {
  border-color: #5b9d57;
  background: #5b9d57;
  color: #fff;
}
.manager-orders-seg .manager-nav-count {
  margin-left: 0;
}
.manager-orders-seg.active .manager-nav-count {
  background: #fff;
  color: #458542;
}
.manager-orders-filters { margin-bottom: 12px; }
.manager-send-onec-button {
  width: auto;
  min-width: 0;
  min-height: 32px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
}
.manager-order-exchange-note {
  margin: 0 0 10px;
  font-size: 12px;
}
.manager-order-card-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}
.manager-order-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  min-width: 0;
}
.manager-order-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}
.manager-order-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.manager-order-status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.manager-order-status-row .manager-send-onec-button,
.manager-order-status-row .manager-manual-processed-badge,
.manager-order-inline-action {
  min-height: 28px;
  height: 28px;
}
.manager-order-inline-action {
  padding: 0 10px;
  font-size: 12px;
  line-height: 1;
}
.manager-order-inline-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.manager-order-checkbox {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin: 4px 0 0;
  cursor: pointer;
  accent-color: #5b9d57;
}
.manager-order-card-header .exchange-status-line {
  margin: 0;
}
.manager-order-status-select {
  -webkit-appearance: none;
  appearance: none;
  border: 1px solid transparent;
  box-sizing: border-box;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  max-width: 100%;
  min-height: 28px;
  height: 28px;
  margin: 0;
  padding: 0 26px 0 10px;
  border-radius: 14px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
}
.manager-order-status-select:focus-visible {
  outline: 2px solid #5b9d57;
  outline-offset: 2px;
}
.manager-order-card-header h3.manager-order-client,
.manager-order-client {
  margin: 0;
  color: #2f3f2f;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.manager-order-card-header p {
  margin: 2px 0 0;
}
.manager-order-sum {
  color: #2f7d32;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
  white-space: nowrap;
}
.manager-order-card-item > .order-meta {
  margin: 12px 0;
}
.manager-order-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0 8px;
}
.manager-order-controls-compact {
  margin: 8px 0 0;
}
.manager-order-extra {
  margin: 4px 0 0;
}
.manager-order-extra > summary {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 0;
  color: #4f8d4b;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.manager-order-extra > summary::-webkit-details-marker {
  display: none;
}
.manager-order-extra > summary::before {
  content: "▸";
  color: #5f6b5f;
}
.manager-order-extra[open] > summary::before {
  content: "▾";
}
.manager-order-controls .exchange-actions {
  margin-top: 0;
  width: auto;
  flex-wrap: wrap;
}
.manager-order-contacts {
  margin: 2px 0 0 !important;
}
.manager-search-block {
  display: grid;
  gap: 6px;
  min-width: 0;
  align-content: start;
}
.manager-search-block input[type="search"] {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid #e6eee3;
  border-radius: 11px;
  background: #fbfdfb;
  color: #394639;
  outline: none;
  box-sizing: border-box;
}
.manager-search-block input[type="search"]:focus {
  border-color: rgba(91,157,87,.55);
  box-shadow: 0 0 0 2px rgba(91,157,87,.1);
  background: #fff;
}
.search-hint {
  margin: 0;
  color: #8a9688;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}

.order-list { display: grid; gap: 16px; }
.order-card {
  padding: 22px;
  border: 1px solid #e1e9de;
  border-radius: 19px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(56,97,52,.05);
}
.order-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.order-card-header h3 { margin: 7px 0 5px; color: #394639; font-size: 21px; }
.order-card-header p { margin: 4px 0 0; color: #7b857b; font-size: 13px; }
.order-meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 16px; margin: 18px 0; padding: 15px; border-radius: 14px; background: #f5f9f3; align-items: start; }
.order-meta > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.order-meta span { display: block; margin: 0; color: #7a847a; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; line-height: 1.3; min-height: 1.3em; }
.order-meta strong { color: #465146; font-size: 13px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.order-details { border-top: 1px solid #edf1eb; padding-top: 14px; }
.order-details summary { color: #4f8d4b; font-weight: 800; cursor: pointer; }
.order-products { display: grid; gap: 0; margin-top: 12px; }
.order-lines-table {
  width: auto;
  max-width: 100%;
  border-collapse: collapse;
  margin: 0;
  table-layout: auto;
}
.order-lines-table th,
.order-lines-table td {
  padding: 6px 12px 6px 0;
  vertical-align: top;
  border-bottom: 1px solid #edf1eb;
}
.order-lines-table th {
  color: #7a847a;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
}
.order-lines-table th:nth-child(1),
.order-lines-table td:nth-child(1) {
  padding-right: 20px;
}
.order-lines-table th:nth-child(2),
.order-lines-table td:nth-child(2) {
  text-align: right;
  white-space: nowrap;
  width: auto;
  padding-left: 8px;
  padding-right: 20px;
}
.order-lines-table th:nth-child(3),
.order-lines-table td:nth-child(3) {
  text-align: right;
  white-space: nowrap;
  width: auto;
  padding-left: 8px;
  padding-right: 0;
}
.order-lines-name { display: block; color: #394639; font-size: 13px; font-weight: 650; line-height: 1.35; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.order-lines-article { display: block; margin-top: 2px; color: #7a847a; font-size: 11px; font-weight: 500; }
.order-product { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 16px; padding: 11px 0; border-bottom: 1px solid #edf1eb; }
.order-product > span { color: #596359; line-height: 1.45; }
.order-product > strong { display: flex; align-items: flex-end; flex-direction: column; color: #386f37; white-space: nowrap; }
.order-product small { margin-top: 3px; color: #7a847a; font-size: 10px; font-weight: 500; }
.order-comments { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 15px; }
.comment-box { padding: 13px; border-radius: 12px; background: #f7faf5; }
.comment-box strong { display: block; margin-bottom: 6px; color: #4c5a4c; font-size: 12px; }
.comment-box p { margin: 0; color: #697469; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
.manager-client-comment {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 4px 0 0;
  box-sizing: border-box;
}
.comment-box-compact {
  padding: 8px 10px;
  border-radius: 10px;
}
.comment-box-compact strong {
  margin-bottom: 3px;
  font-size: 11px;
  line-height: 1.2;
}
.comment-box-compact p {
  font-size: 12px;
  line-height: 1.35;
}
.custom-line { margin-top: 6px; padding: 13px; border: 1px solid #ead9b5; border-radius: 12px; background: #fffaf0; }

.client-order-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 14px; }

.catalog-content { width: min(1440px, 90%); margin: 0 auto; padding: 34px 0 70px; box-sizing: border-box; }
.catalog-layout {
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(300px, 370px);
  gap: 24px;
  align-items: start;
  width: 100%;
  min-width: 0;
}
.catalog-layout > .order-summary {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  align-self: start;
  position: sticky;
  top: 105px;
  z-index: 15;
}
.catalog-layout > .catalog-main {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  display: grid;
  gap: 0;
  align-content: start;
}
.catalog-main > .page-title-row {
  margin-bottom: 18px;
}
.catalog-toolbar { margin-bottom: 20px; }
.catalog-filter-row { display: grid; grid-template-columns: minmax(220px,1fr) auto; gap: 10px; margin-bottom: 12px; align-items: center; }
.catalog-filter-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.catalog-view-toggle {
  display: inline-flex;
  flex-shrink: 0;
  align-items: stretch;
  align-self: center;
  gap: 0;
  height: 42px;
  min-height: 42px;
  border: 1px solid #d5dfd2;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-sizing: border-box;
}
.catalog-view-toggle button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 100%;
  min-height: 42px;
  min-width: 42px;
  padding: 0 12px;
  border: 0;
  border-right: 1px solid #d5dfd2;
  background: transparent;
  color: #5d695d;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-sizing: border-box;
}
.catalog-view-toggle button:last-child { border-right: 0; }
.catalog-view-toggle button.active {
  background: #5b9d57;
  color: #fff;
}
.catalog-view-toggle .view-toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  opacity: .9;
}
.catalog-view-toggle .view-toggle-label { font-size: 12px; line-height: 1; }
.catalog-search { width: 100%; padding: 12px 14px; border: 1px solid #e6eee3; border-radius: 12px; background: #fbfdfb; outline: none; }
.catalog-search:focus { border-color: rgba(91,157,87,.55); box-shadow: 0 0 0 2px rgba(91,157,87,.1); background: #fff; }
.category-list { display: flex; flex-wrap: wrap; gap: 8px; }
.category-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 10px 15px;
  border: 1px solid #d7e1d4;
  border-radius: 12px;
  background: #fff;
  color: #5d695d;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.2;
  box-sizing: border-box;
  cursor: pointer;
}
.category-button.active { border-color: #5b9d57; background: #5b9d57; color: #fff; }
.product-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap: 12px;
  align-items: stretch;
}
.product-grid.product-grid-list {
  grid-template-columns: 1fr;
  gap: 4px;
}
.product-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  min-width: 0;
  padding: 0 8px 8px;
  border: 1px solid #e1e9de;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(56,97,52,.04);
  box-sizing: border-box;
}
.product-card.product-card-list {
  min-height: 0;
  height: auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 10px;
  align-items: center;
  padding: 6px 10px;
  border-radius: 10px;
  box-shadow: none;
}
.product-card-list .product-card-top {
  grid-column: 1;
  grid-row: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.product-card-list .product-category {
  padding: 2px 6px;
  font-size: 10px;
  border-radius: 6px;
}
.product-card-list .favorite-button {
  width: 28px;
  height: 28px;
  min-width: 28px;
  font-size: 14px;
}
.product-card-list h2 {
  grid-column: 1;
  grid-row: 2;
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
  display: block;
  overflow: visible;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  -webkit-line-clamp: unset;
}
.product-card-list .product-code {
  display: none;
}
.product-card-list .product-price {
  grid-column: 1;
  grid-row: 3;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.product-card-list .product-card-controls {
  grid-column: 2;
  grid-row: 1 / span 3;
  align-self: center;
  gap: 4px;
  min-width: 168px;
}
.product-card-list .unit-choice,
.product-card-list .unit-choice.unit-choice-single {
  display: grid !important;
  grid-auto-flow: column !important;
  grid-auto-columns: minmax(0, 1fr) !important;
  grid-template-rows: 30px !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  gap: 0 !important;
  border: 1px solid #dfe7dc !important;
  border-radius: 10px !important;
  overflow: hidden !important;
}
.product-card-list .unit-choice button,
.product-card-list .unit-choice.unit-choice-single button {
  width: auto !important;
  min-width: 0 !important;
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  padding: 0 4px !important;
  border: 0 !important;
  border-right: 1px solid #dfe7dc !important;
  border-radius: 0 !important;
  background: #fff !important;
  color: #5f695f !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  box-sizing: border-box !important;
}
.product-card-list .unit-choice button:last-child,
.product-card-list .unit-choice.unit-choice-single button:last-child {
  border-right: 0 !important;
}
.product-card-list .unit-choice button.active,
.product-card-list .unit-choice.unit-choice-single button.active {
  background: #5b9d57 !important;
  color: #fff !important;
}
.product-card-list .quantity-control {
  gap: 4px;
}
.product-card-list .quantity-control > button {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border-radius: 8px;
  font-size: 16px;
}
.product-card-list .quantity-input-wrap {
  min-height: 30px;
  padding: 0 4px;
  border-radius: 8px;
}
.product-card-list .quantity-input {
  width: 40px;
  font-size: 13px;
}
.product-card-list .quantity-input-wrap small {
  font-size: 10px;
}
.product-image-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  height: auto;
  margin: 0 0 2px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid #e8eee6;
  background: #fff;
}
.mobile-checkout-bar { display: none; }
.delivery-date-trigger { display: none; }
.delivery-date-trigger-desktop {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 10px 12px;
  border: 1px solid #d6e0d3;
  border-radius: 14px;
  background: #fff;
  color: #394639;
  text-align: left;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(56, 97, 52, 0.04);
}
.delivery-date-trigger-desktop.is-selected {
  border-color: #b9d7b5;
  background: linear-gradient(180deg, #f4faf2 0%, #eef7eb 100%);
}
.delivery-date-trigger-desktop .delivery-date-day {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #5b9d57;
  color: #fff;
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}
.delivery-date-trigger-desktop .delivery-date-day.is-empty {
  background: #e8efe5;
  color: #8a9688;
  font-size: 18px;
}
.delivery-date-trigger-desktop .delivery-date-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.delivery-date-trigger-desktop .delivery-date-text strong {
  color: #394639;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.25;
}
.delivery-date-trigger-desktop .delivery-date-text small {
  color: #5f6f5f;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}
.delivery-date-trigger-desktop .delivery-date-action {
  color: #5b9d57;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.delivery-date-sheet {
  display: block;
  position: fixed;
  inset: 0;
  z-index: 500;
}
.delivery-date-sheet-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(30, 42, 30, 0.45);
  cursor: pointer;
  animation: clover-sheet-backdrop-in 0.28s ease-out both;
}
.delivery-date-sheet-panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, calc(100% - 32px));
  max-height: min(90vh, 640px);
  overflow: auto;
  padding: 18px 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(40, 64, 40, 0.22);
  animation: clover-sheet-center-in 0.38s cubic-bezier(0.2, 0.9, 0.2, 1) both;
}
.delivery-date-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.delivery-date-sheet-head strong { color: #394639; font-size: 16px; }
.delivery-date-sheet-submit {
  width: 100%;
  margin-top: 16px;
  min-height: 48px;
}
.delivery-date-sheet-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.15);
}
.delivery-date-preview {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid #b9d7b5;
  border-radius: 14px;
  background: linear-gradient(180deg, #f4faf2 0%, #eef7eb 100%);
}
.delivery-date-preview .delivery-date-day {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #5b9d57;
  color: #fff;
  font-size: 20px;
  font-weight: 800;
}
.delivery-date-preview .delivery-date-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.delivery-date-preview .delivery-date-text strong {
  color: #394639;
  font-size: 15px;
  font-weight: 800;
}
.delivery-date-preview .delivery-date-text small {
  color: #5f6f5f;
  font-size: 12px;
  font-weight: 600;
}
.delivery-calendar { display: grid; gap: 10px; }
.delivery-calendar-nav {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
}
.delivery-calendar-nav strong {
  text-align: center;
  color: #394639;
  font-size: 15px;
}
.delivery-calendar-weekdays,
.delivery-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}
.delivery-calendar-weekdays span {
  text-align: center;
  color: #7a8778;
  font-size: 11px;
  font-weight: 700;
}
.delivery-calendar-weekdays .is-sunday-label { color: #b56b6b; }
.delivery-calendar-cell {
  min-height: 42px;
  border: 1px solid #d8e2d5;
  border-radius: 12px;
  background: #fff;
  color: #394639;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}
.delivery-calendar-cell.is-empty {
  border: 0;
  background: transparent;
  pointer-events: none;
}
.delivery-calendar-cell.is-selected {
  border-color: #5b9d57;
  background: #5b9d57;
  color: #fff;
}
.delivery-calendar-cell.is-disabled,
.delivery-calendar-cell.is-sunday {
  border-color: #ececec;
  background: #f5f5f5;
  color: #a0a0a0;
  text-decoration: line-through;
  cursor: not-allowed;
}
.delivery-calendar-cell.is-disabled.is-selected,
.delivery-calendar-cell.is-sunday.is-selected {
  background: #f5f5f5;
  color: #a0a0a0;
  border-color: #ececec;
}
.delivery-calendar-note { margin: 0; }
.delivery-date-desktop-hint {
  margin: 2px 0 0;
  color: #5f6f5f;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}
.product-image { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center center; background: #fff; }
.product-image-placeholder { color: #9aaa98; font-size: 12px; font-weight: 700; text-align: center; padding: 0 8px; }
.fav-label-short { display: none; }
.product-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-height: 30px;
  height: 30px;
  margin: 0;
  padding: 0 2px;
  box-sizing: border-box;
}
.product-card-top-spacer { flex: 1; min-width: 0; }
.product-category { color: #5b9d57; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; }
.product-cert-link-top {
  flex-shrink: 0;
  margin-top: 0;
  min-height: 22px;
  height: 22px;
  padding: 0 7px;
  font-size: 9px;
  line-height: 1;
  box-sizing: border-box;
}
.favorite-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: #b1b8b1;
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
}
.favorite-button.active { color: #e0aa2c; }
.product-card h2 {
  margin: 4px 0 2px;
  color: #3f4b3f;
  font-size: 13px;
  line-height: 1.25;
  min-height: 0;
  display: block;
  overflow: visible;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.product-code { margin: 0 0 6px; color: #929a92; font-size: 10px; }
.product-card:not(.product-card-list) .product-code { display: none; }
.product-price { margin: 0 0 6px; color: #386f37; font-weight: 800; font-size: 13px; }
.product-price small { color: #6f7b6f; font-size: 10px; font-weight: 700; }
.product-card-controls {
  display: grid;
  gap: 5px;
  width: 100%;
  margin-top: auto;
  min-width: 0;
}
.unit-choice {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  grid-template-rows: 30px;
  gap: 0;
  width: 100%;
  height: 30px;
  min-height: 30px;
  max-height: 30px;
  margin-bottom: 0;
  overflow: hidden;
  border: 1px solid #dfe7dc;
  border-radius: 10px;
  box-sizing: border-box;
}
.unit-choice button {
  width: auto;
  min-width: 0;
  height: 30px;
  min-height: 30px;
  max-height: 30px;
  padding: 0 4px;
  border: 0;
  border-right: 1px solid #dfe7dc;
  border-radius: 0;
  background: #fff;
  color: #5f695f;
  font-size: 11px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
}
.unit-choice button.active,
.unit-choice.unit-choice-single button.active {
  border-color: #5b9d57;
  background: #5b9d57;
  color: #fff;
}
.unit-hint { min-height: 17px; margin: 0; color: #7a847a; font-size: 10px; }
.quantity-control {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 30px;
  align-items: center;
  width: 100%;
  border: 1px solid #dfe7dc;
  border-radius: 10px;
  overflow: hidden;
  box-sizing: border-box;
}
.quantity-control > button { height: 30px; border: none; background: #f3f8f1; color: #4f8d4b; font-size: 16px; font-weight: 800; }
.quantity-input-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  min-height: 30px;
  padding: 0 4px;
}
.quantity-input {
  width: 3rem;
  max-width: 100%;
  height: 28px;
  padding: 0 2px;
  border: none !important;
  background: transparent;
  color: #394639;
  font-weight: 800;
  text-align: center;
  outline: none;
  box-sizing: border-box;
  appearance: textfield;
  -moz-appearance: textfield;
}
.quantity-input::-webkit-inner-spin-button,
.quantity-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.quantity-input-wrap small {
  flex: 0 0 auto;
  min-width: 2em;
  color: #718071;
  font-size: 10px;
}
.cart-sheet {
  position: fixed;
  inset: 0;
  z-index: 500;
}
.cart-sheet-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(30, 42, 30, 0.45);
  cursor: pointer;
  animation: clover-sheet-backdrop-in 0.28s ease-out both;
}
.cart-sheet-panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  gap: 0;
  width: min(560px, calc(100% - 24px));
  max-height: min(88vh, 740px);
  overflow: hidden;
  padding: 18px 18px 0;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(28, 40, 28, 0.28);
}
.cart-sheet-head {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.cart-sheet-head strong { display: block; color: #394639; font-size: 18px; }
.cart-sheet-head p { margin: 4px 0 0; }
.cart-sheet-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  display: grid;
  align-content: start;
  gap: 12px;
  padding-bottom: 8px;
}
.cart-sheet-list { display: grid; gap: 10px; }
.cart-sheet-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 12px;
  border: 1px solid #e1e9de;
  border-radius: 14px;
  background: #f8fbf6;
}
.cart-sheet-item-main { display: grid; gap: 4px; min-width: 0; }
.cart-sheet-item-main strong {
  color: #394639;
  font-size: 14px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.cart-sheet-item-main small { color: #6f7b6f; font-size: 12px; line-height: 1.35; }
.cart-sheet-units { margin-top: 6px; }
.cart-sheet-qty { background: #fff; }
.cart-sheet-address { margin-top: 0; }
.cart-sheet-comment { margin-top: 0; }
.cart-sheet-date {
  display: grid;
  gap: 7px;
  margin-top: 4px;
}
.cart-sheet .delivery-date-trigger {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 10px 12px;
  border: 1px solid #d6e0d3;
  border-radius: 14px;
  background: #fff;
  color: #394639;
  text-align: left;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(56, 97, 52, 0.04);
}
.cart-sheet .delivery-date-trigger.is-selected {
  border-color: #b9d7b5;
  background: linear-gradient(180deg, #f4faf2 0%, #eef7eb 100%);
}
.cart-sheet .delivery-date-trigger .delivery-date-day {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #5b9d57;
  color: #fff;
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}
.cart-sheet .delivery-date-trigger .delivery-date-day.is-empty {
  background: #e8efe5;
  color: #8a9688;
}
.cart-sheet .delivery-date-trigger .delivery-date-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.cart-sheet .delivery-date-trigger .delivery-date-text strong {
  color: #394639;
  font-size: 14px;
  line-height: 1.25;
}
.cart-sheet .delivery-date-trigger .delivery-date-text small {
  color: #6f7b6f;
  font-size: 12px;
  line-height: 1.3;
}
.cart-sheet .delivery-date-trigger .delivery-date-action {
  color: #5b9d57;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.cart-sheet-footer {
  flex: 0 0 auto;
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 12px 18px calc(16px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid #e4ece1;
  background: #fff;
  box-shadow: 0 -10px 28px rgba(28, 40, 28, 0.08);
}
.cart-sheet-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #eef6eb;
}
.cart-sheet-total strong { color: #386f37; font-size: 18px; }
.order-summary-actions {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}
.order-summary-actions .primary-button,
.order-summary-actions .secondary-button,
.order-summary-actions .open-cart-button {
  width: 100%;
  min-height: 44px;
}
.order-summary { position: sticky; top: calc(var(--clover-chrome-offset, 140px) + 12px); z-index: 15; padding: 21px; border: 1px solid #e1e9de; border-radius: 19px; background: #fff; box-shadow: 0 10px 26px rgba(56,97,52,.07); }
.order-summary h2 { margin: 0 0 14px; color: #394639; }
.summary-list { display: grid; max-height: 320px; overflow: auto; gap: 8px; margin-bottom: 14px; }
.summary-item { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; padding: 10px; border-radius: 10px; background: #f7faf5; }
.summary-item span, .summary-item strong { display: flex; flex-direction: column; gap: 3px; }
.summary-item span { color: #596359; font-size: 11px; line-height: 1.4; }
.summary-item strong { align-items: flex-end; color: #386f37; font-size: 11px; white-space: nowrap; }
.summary-item small { color: #818a81; font-size: 9px; font-weight: 500; }
.summary-empty { padding: 16px; border-radius: 12px; background: #f7faf5; color: #7a847a; font-size: 12px; line-height: 1.5; }
.summary-total { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 14px 0; padding: 13px; border-radius: 12px; background: #eef6eb; }
.summary-total strong { color: #386f37; font-size: 18px; }
.summary-note { margin: 8px 0; color: #818a81; font-size: 10px; line-height: 1.45; }
.save-order-button { width: 100%; min-height: 48px; border: none; border-radius: 13px; background: #5b9d57; color: #fff; font-weight: 800; }
.custom-product-box { grid-column: 1 / -1; padding: 20px; border: 1px dashed #87ae82; border-radius: 18px; background: #f8fbf6; }
.custom-product-box h3 { margin: 7px 0; color: #394639; }
.custom-product-form { display: grid; gap: 12px; margin-top: 15px; }
.custom-row { display: grid; grid-template-columns: 1fr 140px; gap: 12px; }
.request-photo-picker input[type="file"] { padding: 9px; border: 1px dashed #a8c5a3; background: #fff; }
.request-photo-picker small { color: #7a847a; font-size: 10px; font-weight: 500; }
.request-photo-status { padding: 10px 12px; border-radius: 10px; background: #eef6eb; color: #4f7d4b; font-size: 11px; font-weight: 700; }
.request-photo-error { padding: 10px 12px; border-radius: 10px; background: #fdecec; color: #a45151; font-size: 11px; font-weight: 700; }
.request-photo-preview { display: grid; grid-template-columns: 120px minmax(0,1fr); gap: 12px; align-items: center; padding: 12px; border: 1px solid #dce7d9; border-radius: 13px; background: #fff; }
.request-photo-preview > div { display: grid; justify-items: start; gap: 6px; }
.request-photo-preview strong { color: #455245; font-size: 12px; overflow-wrap: anywhere; }
.request-photo-preview small { color: #7a847a; font-size: 10px; }
.custom-request-photo { display: block; overflow: hidden; padding: 0; border: 1px solid #dbe5d8; border-radius: 11px; background: #f2f6ef; cursor: zoom-in; appearance: none; }
.custom-request-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
.custom-photo-viewer { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 24px; background: rgba(18, 25, 18, 0.9); cursor: zoom-out; animation: clover-sheet-backdrop-in 0.28s ease-out both; }
.custom-photo-viewer > img { display: block; width: auto; height: auto; max-width: min(1200px, 94vw); max-height: 90vh; object-fit: contain; border-radius: 12px; background: #fff; box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45); cursor: default; animation: clover-sheet-center-in 0.38s cubic-bezier(0.2, 0.9, 0.2, 1) both; }
.custom-photo-viewer-close { position: fixed; top: max(14px, env(safe-area-inset-top)); right: max(14px, env(safe-area-inset-right)); z-index: 10001; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid rgba(255, 255, 255, 0.55); border-radius: 50%; background: rgba(255, 255, 255, 0.95); color: #345934; font-size: 30px; line-height: 1; font-weight: 500; cursor: pointer; animation: order-thankyou-text-in 0.45s ease-out 0.12s both; }

.order-thankyou {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  inset: 0;
  width: 100vw;
  width: 100dvw;
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  min-height: -webkit-fill-available;
  z-index: 2147483000;
  display: grid;
  place-items: center;
  padding: max(20px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(20px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
  box-sizing: border-box;
  background:
    radial-gradient(circle at 20% 18%, rgba(126, 196, 108, 0.45), transparent 42%),
    radial-gradient(circle at 82% 78%, rgba(74, 148, 78, 0.38), transparent 48%),
    linear-gradient(160deg, #eef7ea 0%, #d9ecd4 45%, #c7e0c2 100%);
  animation: none;
  cursor: pointer;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: auto;
  touch-action: none;
}
.order-thankyou-glow,
.order-thankyou-spark {
  display: none !important;
}
html.clover-thankyou-open,
body.clover-thankyou-open {
  overflow: hidden !important;
  overscroll-behavior: none !important;
  height: 100% !important;
}
html.clover-thankyou-open #root {
  visibility: hidden !important;
  pointer-events: none !important;
}
html.clover-thankyou-open .order-thankyou {
  visibility: visible !important;
  pointer-events: auto !important;
}
html.clover-thankyou-open .mobile-checkout-bar,
html.clover-thankyou-open .cart-sheet,
html.clover-thankyou-open .client-bottom-nav,
html.clover-thankyou-open .app-header,
html.clover-thankyou-open .app-nav-bar,
html.clover-thankyou-open .app-top-chrome {
  display: none !important;
  visibility: hidden !important;
}
.order-thankyou-glow {
  position: absolute;
  width: min(420px, 78vw);
  height: min(420px, 78vw);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 70%);
  animation: order-thankyou-pulse 2.4s ease-in-out infinite;
  pointer-events: none;
}
.order-thankyou-spark {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.55), rgba(111, 186, 99, 0.35) 55%, rgba(74, 148, 78, 0));
  opacity: 0;
  pointer-events: none;
  animation: order-thankyou-spark 4.6s ease-in-out infinite;
  filter: blur(0.2px);
}
/* Точки вокруг центра поздравления — разный диаметр, мягкая прозрачность */
.order-thankyou-spark-1 {
  top: 22%;
  left: 18%;
  width: 7px;
  height: 7px;
  animation-delay: 0.1s;
  animation-duration: 4.8s;
}
.order-thankyou-spark-2 {
  top: 16%;
  right: 22%;
  width: 12px;
  height: 12px;
  animation-delay: 0.55s;
  animation-duration: 5.2s;
}
.order-thankyou-spark-3 {
  top: 38%;
  left: 10%;
  width: 5px;
  height: 5px;
  animation-delay: 1.1s;
  animation-duration: 4.4s;
}
.order-thankyou-spark-4 {
  top: 34%;
  right: 12%;
  width: 9px;
  height: 9px;
  animation-delay: 0.8s;
  animation-duration: 5s;
}
.order-thankyou-spark-5 {
  bottom: 34%;
  left: 16%;
  width: 6px;
  height: 6px;
  animation-delay: 1.6s;
  animation-duration: 4.7s;
}
.order-thankyou-spark-6 {
  bottom: 30%;
  right: 18%;
  width: 14px;
  height: 14px;
  animation-delay: 0.35s;
  animation-duration: 5.4s;
}
.order-thankyou-spark-7 {
  bottom: 18%;
  left: 38%;
  width: 4px;
  height: 4px;
  animation-delay: 2s;
  animation-duration: 4.2s;
}
.order-thankyou-spark-8 {
  top: 48%;
  right: 8%;
  width: 8px;
  height: 8px;
  animation-delay: 1.35s;
  animation-duration: 4.9s;
}
.order-thankyou-card {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 10px;
  width: min(420px, 100%);
  padding: 28px 22px 24px;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  text-align: center;
  cursor: default;
  overflow: visible;
  animation: none;
}
.order-thankyou-mobile .order-thankyou-card {
  animation: none;
}
.order-thankyou-mobile .order-thankyou-logo-wrap {
  width: min(280px, 78vw);
}
.order-thankyou-mobile .order-thankyou-logo {
  width: 100%;
}
.order-thankyou-mobile .order-thankyou-title {
  font-size: clamp(24px, 7vw, 32px);
}
.order-thankyou-mobile .order-thankyou-button {
  width: min(280px, 100%);
  min-height: 52px;
}
.order-thankyou-mobile .app-modal-actions .order-thankyou-button,
.order-thankyou-mobile .app-modal-actions .secondary-button,
.order-thankyou-mobile .app-modal-actions .primary-button,
.order-thankyou-mobile .app-modal-actions .danger-button {
  width: 100%;
  min-width: 0;
  margin-top: 0;
}
.order-thankyou-logo-wrap {
  position: relative;
  display: grid;
  place-items: center;
  width: min(240px, 72vw);
  overflow: visible;
  padding: 18px;
  box-sizing: content-box;
}
.order-thankyou-logo {
  display: block;
  width: 100%;
  height: auto;
  transform-origin: center center;
  animation: none;
}
.order-thankyou-brand {
  margin: 4px 0 0;
  color: #2f7d32;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  animation: none;
}
.order-thankyou-title {
  margin: 0;
  color: #2f3f2f;
  font-size: clamp(22px, 5.5vw, 30px);
  font-weight: 800;
  line-height: 1.25;
  animation: none;
}
.order-thankyou-text {
  margin: 0;
  max-width: 28ch;
  color: #5f6f5f;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  animation: none;
}
.order-thankyou-button {
  margin-top: 8px;
  min-width: min(220px, 100%);
  min-height: 46px;
  animation: none;
}
@keyframes order-thankyou-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes order-thankyou-card-in {
  from { opacity: 0; transform: translateY(18px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes order-thankyou-text-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes order-thankyou-pulse {
  0%, 100% { transform: scale(0.92); opacity: 0.55; }
  50% { transform: scale(1.08); opacity: 0.9; }
}
@keyframes order-thankyou-spark {
  0%, 100% { opacity: 0; transform: translateY(0) scale(0.7); }
  30% { opacity: 0.28; transform: translateY(-8px) scale(1); }
  55% { opacity: 0.14; transform: translateY(-14px) scale(0.92); }
  80% { opacity: 0.05; transform: translateY(-18px) scale(0.8); }
}
@keyframes clover-sheet-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes clover-sheet-center-in {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 18px)) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes clover-sheet-up-in {
  from { opacity: 0; transform: translateY(28px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .order-thankyou,
  .order-thankyou-card,
  .order-thankyou-logo,
  .order-thankyou-logo-wrap,
  .order-thankyou-brand,
  .order-thankyou-title,
  .order-thankyou-text,
  .order-thankyou-button,
  .order-thankyou-glow,
  .order-thankyou-spark,
  .cart-sheet-backdrop,
  .cart-sheet-panel,
  .delivery-date-sheet-backdrop,
  .delivery-date-sheet-panel,
  .custom-photo-viewer,
  .custom-photo-viewer > img,
  .custom-photo-viewer-close {
    animation: none !important;
  }
}
.request-photo-preview .custom-request-photo { width: 120px; height: 90px; }
.custom-request-photo-small { width: 58px; height: 44px; margin-top: 5px; }
.custom-request-order-row { grid-template-columns: 74px minmax(0,1fr) auto; align-items: center; }
.custom-request-photo-order { width: 68px; height: 54px; }
.manager-request-photo-block { display: grid; justify-items: start; gap: 8px; margin: 0 0 12px; padding: 12px; border-radius: 12px; background: #fff; }
.manager-request-photo-block > strong { color: #596359; font-size: 11px; }
.custom-request-photo-manager { width: min(320px, 100%); aspect-ratio: 4 / 3; }


.manager-nav, .client-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 24px; padding: 0 0 2px; }
.manager-nav button, .client-nav button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 0;
  min-height: 42px;
  padding: 10px 15px;
  border: 1px solid #d7e1d4;
  border-radius: 12px;
  background: #fff;
  color: #5d695d;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  line-height: 1.2;
  box-sizing: border-box;
}
.manager-nav {
  gap: 12px;
}
.manager-nav button {
  min-height: 52px;
  padding: 14px 24px;
  font-size: 16px;
  border-radius: 13px;
}
.manager-nav button.active, .client-nav button.active {
  border-color: #458542;
  background: #458542;
  color: #fff;
}
.client-nav {
  position: static;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 20px;
}
.client-bottom-nav { display: none !important; }
.client-cabinet-stack { display: grid; gap: 18px; }
.client-cabinet-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 4px; }
.client-home-note { margin-bottom: 16px; }
.manager-header-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.manager-search-input { min-width: 180px; max-width: 260px; padding: 9px 12px; border: 1px solid #e6eee3; border-radius: 12px; background: #fbfdfb; font: inherit; }
.manager-bell { position: relative; overflow: visible; }
.manager-bell-label-short { display: none; }
.manager-bell-count { position: absolute; top: -4px; right: -4px; z-index: 2; min-width: 18px; min-height: 18px; height: auto; padding: 0 5px; border-radius: 999px; background: #c45c26; color: #fff; font-size: 11px; font-weight: 800; line-height: 1; display: grid; place-items: center; box-sizing: border-box; }
.manager-bell-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: min(360px, 82vw);
  max-height: min(420px, 70vh);
  overflow: auto;
  background: #fff;
  border: 1px solid #d7e1d4;
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(40, 64, 40, 0.16);
  padding: 10px;
  z-index: 40;
}
.manager-notification-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.manager-notification-header strong {
  color: #394639;
  font-size: 13px;
}
.manager-notification-header .secondary-button {
  min-height: 32px;
  padding: 5px 10px;
  font-size: 11px;
}
.manager-notification-list {
  display: grid;
  gap: 8px;
}
.manager-notification-item {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 10px;
  border: 1px solid #e4ebe1;
  border-radius: 12px;
  background: #f8fbf6;
}
.manager-notification-main { display: grid; gap: 3px; min-width: 0; }
.manager-notification-badge { width: fit-content; font-size: 10px; }
.manager-notification-client {
  color: #2f3f2f;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.manager-notification-amount {
  color: #2f7d32;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
}
.manager-notification-main .manager-order-summary {
  gap: 2px;
}
.manager-notification-main .manager-order-sum-line {
  font-size: 14px;
}
.manager-notification-main .manager-order-summary-line,
.manager-notification-main .manager-order-number {
  font-size: 12px;
}
.manager-notification-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  color: #6a776a;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
}
.manager-notification-order {
  color: #8a9688;
  font-size: 11px;
  font-weight: 600;
}
.manager-notification-time {
  display: block;
  color: #8a9688;
  font-size: 10px;
}
.manager-notification-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.manager-notification-actions .primary-button,
.manager-notification-actions .secondary-button {
  min-height: 32px;
  padding: 5px 10px;
  font-size: 11px;
}
.manager-notification-empty {
  margin: 0;
  padding: 14px 10px;
  font-size: 13px;
}
.order-onec-box { margin-top: 8px; padding: 12px; border: 1px solid #d7e1d4; border-radius: 14px; background: #f7fbf5; }
.order-onec-title { display: block; margin-bottom: 8px; color: #2f7d32; font-size: 13px; }
.manager-more-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.exchange-summary-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
@media (max-width: 820px) {
  .client-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: 12px;
    padding: 6px;
  }
  .client-nav button { width: 100%; text-align: center; }
  .client-cabinet-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .client-cabinet-nav .category-button { width: 100%; text-align: center; min-height: 42px; padding: 10px 12px; border-radius: 12px; font-size: 14px; }
  .page-content-client { padding-bottom: 24px; }
  .exchange-summary-strip { grid-template-columns: 1fr; }
  .order-thankyou {
    width: 100vw;
    width: 100dvw;
    height: 100vh;
    height: 100dvh;
    min-height: 100vh;
    min-height: 100dvh;
    min-height: -webkit-fill-available;
  }
  .order-thankyou-card {
    padding: 24px 18px 20px;
    border-radius: 18px;
  }
  .order-thankyou-title {
    font-size: clamp(20px, 6.2vw, 26px);
  }
  .order-thankyou-button {
    width: 100%;
    min-height: 48px;
  }
}
.client-home-gate { margin-bottom: 16px; }
.client-settings-stack { display: grid; gap: 18px; }
.client-matrix-toolbar { display: grid; gap: 12px; margin-bottom: 18px; }
.client-catalog-add-panel .product-card-controls {
  margin-top: auto;
}
.client-catalog-add-panel .product-price,
.client-catalog-add-panel .client-catalog-add-price {
  display: block;
  visibility: visible;
  opacity: 1;
  height: auto;
  min-height: 20px;
  margin: 4px 0 8px;
  overflow: visible;
  color: #2f5f2f;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.3;
  flex: 0 0 auto;
}
.product-card-in-matrix {
  border-color: #cfe3cc;
}
.client-matrix-meta { color: #737d73; font-size: 14px; }
.client-matrix-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.client-matrix-card {
  min-height: 0;
  padding: 0 8px 8px;
  border-radius: 14px;
  box-shadow: 0 4px 12px rgba(56, 97, 52, 0.04);
}
.client-matrix-card .product-image-wrap {
  aspect-ratio: 1 / 1;
  height: auto;
  margin: 0 0 2px;
  border-radius: 10px;
  border: 1px solid #e8eee6;
}
.client-matrix-card .product-image-placeholder {
  font-size: 11px;
  padding: 8px;
  text-align: center;
}
.client-matrix-card h2 {
  margin: 8px 0 4px;
  font-size: 13px;
  line-height: 1.3;
  display: block;
  overflow: visible;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.client-matrix-card .product-code {
  margin: 0 0 4px;
  font-size: 11px;
}
.client-matrix-card .product-price {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 800;
  color: #386f37;
}
.client-matrix-card .product-category {
  padding: 3px 7px;
  font-size: 10px;
}
.client-matrix-card .product-card-controls {
  gap: 5px;
}
.client-matrix-card .unit-choice {
  min-height: 30px;
  gap: 5px;
}
.client-matrix-card .unit-choice button {
  min-height: 30px;
  padding: 4px 2px;
  font-size: 10px;
  border-radius: 8px;
}
.client-matrix-card .unit-hint {
  min-height: 14px;
  font-size: 9px;
}
@media (max-width: 1100px) {
  .client-matrix-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 820px) {
  .client-matrix-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .client-matrix-card { padding: 8px; }
  .client-matrix-card .product-image-wrap { height: auto; aspect-ratio: 1 / 1; }
  .client-matrix-card h2 { font-size: 12px; }
}
button.linkish { border: 0; background: transparent; color: #2f6b3a; font-weight: 800; text-decoration: underline; cursor: pointer; padding: 0; }
.manager-grid { display: grid; gap: 16px; }
.manager-textareas { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-top: 12px; }
.manager-textareas textarea { min-height: 90px; border: 1px solid #e6eee3; border-radius: 11px; background: #fbfdfb; }

.client-list { display: grid; gap: 8px; }
.client-card { padding: 12px 14px; border: 1px solid #e1e9de; border-radius: 14px; background: #fff; }
.client-card-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px 12px;
}
.client-card-header > div:first-child { min-width: 0; }
.client-card h3 { margin: 2px 0 0; color: #394639; font-size: 16px; line-height: 1.25; }
.client-card .muted.small { margin: 2px 0 0; }
.client-metrics { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.client-metrics article { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex: 1 1 calc(25% - 6px); min-width: 118px; padding: 6px 10px; border-radius: 10px; background: #f7faf5; }
.client-metrics span { display: block; color: #7a847a; font-size: 11px; line-height: 1.2; }
.client-metrics strong { display: block; margin-top: 0; color: #386f37; font-size: 13px; line-height: 1.2; }
.matrix-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; max-height: 330px; overflow: auto; margin-top: 12px; padding: 10px; border: 1px solid #e1e9de; border-radius: 12px; }
.matrix-item { display: flex; align-items: flex-start; gap: 7px; padding: 8px; border-radius: 9px; background: #f8fbf6; color: #596359; font-size: 11px; line-height: 1.35; }
.matrix-catalog-note {
  margin: 18px 0;
  padding: 16px 18px;
  border: 1px solid #dbe8d7;
  border-radius: 15px;
  background: #f7fbf5;
  color: #596359;
  line-height: 1.55;
}
.matrix-catalog-note.pending {
  border-color: #ead9b5;
  background: #fffaf0;
  color: #7f693b;
}
.catalog-scope-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
}
.catalog-scope-switch button {
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid #d5dfd2;
  border-radius: 10px;
  background: #fff;
  color: #607060;
  font-weight: 700;
}
.catalog-scope-switch button.active {
  border-color: #5b9d57;
  background: #5b9d57;
  color: #fff;
}
.matrix-editor-list {
  display: grid;
  gap: 10px;
  max-height: 620px;
  overflow: auto;
  margin-top: 12px;
  padding-right: 4px;
}
.client-matrix-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid #dce6d8;
  border-radius: 12px;
  background: #f3f8f1;
  box-sizing: border-box;
}
.client-matrix-toolbar-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-width: 0;
}
.client-matrix-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.client-matrix-settings {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid #d5dfd2;
  border-radius: 14px;
  background: #fff;
  box-sizing: border-box;
  display: grid;
  gap: 4px;
  min-width: 0;
}
.client-matrix-settings > h4,
.client-matrix-settings > summary {
  margin: 0;
  color: #3f4f3f;
  font-size: 15px;
}
.client-matrix-settings > summary {
  cursor: pointer;
  font-weight: 800;
  list-style: none;
}
.client-matrix-settings > summary::-webkit-details-marker {
  display: none;
}
.client-matrix-products {
  min-width: 0;
}
.client-matrix-search-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin: 10px 0 4px;
}
.client-matrix-search-input {
  flex: 1 1 220px;
  max-width: 420px;
  min-width: 0;
  height: 38px;
  min-height: 38px;
  max-height: 38px;
  padding: 0 12px;
  border: 1px solid #d7e1d4;
  border-radius: 10px;
  background: #fbfdfb;
  color: #394639;
  font-size: 13px;
  font-weight: 600;
  box-sizing: border-box;
  outline: none;
}
.client-matrix-search-input:focus {
  border-color: rgba(91,157,87,.55);
  box-shadow: 0 0 0 2px rgba(91,157,87,.1);
  background: #fff;
}
.client-matrix-price-chip {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid #d5dfd2;
  border-radius: 999px;
  background: #f3f8f1;
  color: #4f684c;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}
.client-matrix-price-chip.muted {
  color: #8a9688;
  background: #f7f8f6;
}
.client-matrix-save-fab {
  position: sticky;
  bottom: 14px;
  z-index: 20;
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
  pointer-events: none;
}
.client-matrix-save-fab .primary-button {
  pointer-events: auto;
  min-height: 44px;
  padding: 10px 18px;
  box-shadow: 0 10px 28px rgba(38, 67, 31, 0.22);
}
.matrix-window {
  position: fixed;
  inset: 0;
  z-index: 1080;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-x: hidden;
  overflow-y: auto;
  padding: calc(var(--clover-chrome-offset, 56px) + 12px) 12px max(16px, env(safe-area-inset-bottom, 0px));
  background: rgba(28, 40, 28, 0.48);
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  box-sizing: border-box;
}
.matrix-window-card {
  display: flex;
  flex-direction: column;
  width: min(980px, 100%);
  max-height: calc(100dvh - var(--clover-chrome-offset, 56px) - 24px);
  margin: 0 auto;
  overflow: hidden;
  padding: 14px 16px 0;
  border-radius: 18px;
  background: #fff;
  box-sizing: border-box;
}
.matrix-window-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #dce6d8;
}
.matrix-window-head h3 {
  margin: 0;
  font-size: 18px;
}
.matrix-window-head-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
}
.matrix-window-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 10px 0 16px;
  overscroll-behavior: contain;
}
@media (max-width: 820px) {
  .client-matrix-toolbar {
    align-items: stretch;
  }
  .client-matrix-toolbar-actions {
    width: 100%;
  }
  .client-matrix-toolbar-actions .primary-button,
  .client-matrix-toolbar-actions .secondary-button {
    flex: 1 1 auto;
  }
  .client-matrix-search-input {
    flex: 1 1 100%;
    max-width: none;
  }
  .client-matrix-save-fab {
    bottom: 10px;
  }
  .client-matrix-save-fab .primary-button {
    width: 100%;
  }
}
.matrix-editor-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.15fr) minmax(168px, 1.4fr) minmax(160px, 0.85fr);
  gap: 12px;
  align-items: start;
  padding: 12px;
  border: 1px solid #e1e9de;
  border-radius: 13px;
  background: #f8fbf6;
  box-sizing: border-box;
  min-width: 0;
  overflow: visible;
}
.matrix-editor-product {
  display: grid;
  gap: 8px;
  color: #465146;
  font-size: 12px;
  line-height: 1.4;
  min-width: 0;
}
.matrix-editor-product-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
.matrix-editor-units {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 168px;
  align-items: stretch;
  overflow: visible;
}
.matrix-editor-units .matrix-price-field {
  flex: 1 1 112px;
  max-width: 180px;
  min-width: 112px;
}
.matrix-price-field {
  display: grid;
  gap: 5px;
  color: #707a70;
  font-size: 10px;
  font-weight: 700;
  min-width: 0;
}
.matrix-price-field input,
.matrix-price-field select {
  width: 100%;
  min-height: 36px;
  padding: 7px 8px;
  border: 1px solid #d7e0d4;
  border-radius: 9px;
  background: #fff;
  box-sizing: border-box;
}
.matrix-price-calculated {
  align-self: stretch;
  padding: 8px 9px;
  border: 1px solid #d7e4d3;
  border-radius: 10px;
  background: #fff;
}
.matrix-price-calculated small,
.matrix-price-calculated strong {
  display: block;
  line-height: 1.35;
}
.matrix-price-calculated strong { color: #386f37; font-size: 12px; }
.matrix-price-mode { display: grid; gap: 7px; min-width: 0; }
.price-update-time { color: #7a847a; font-size: 9px; line-height: 1.35; }
.matrix-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  align-items: center;
}
.matrix-summary span {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid #d5dfd2;

  border-radius: 10px;
  background: #fff;
  color: #587058;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  box-sizing: border-box;
}
.matrix-pick-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 1px solid #d5dfd2;
  border-radius: 12px;
  background: #fff;
  box-sizing: border-box;
  overflow-x: auto;
}
.matrix-pick-actions span {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 8px 0 4px;
  color: #587058;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.matrix-pick-actions .secondary-button {
  flex: 0 0 auto;
  white-space: nowrap;
}
.catalog-pick-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 1px solid #d5dfd2;
  border-radius: 12px;
  background: #fff;
  box-sizing: border-box;
  overflow-x: auto;
}
.catalog-pick-actions span {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 8px 0 4px;
  color: #587058;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.catalog-pick-actions .secondary-button,
.catalog-pick-actions .danger-button {
  flex: 0 0 auto;
  white-space: nowrap;
}
.matrix-add-compact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 16px 0 12px;
  width: 100%;
  min-width: 0;
  position: relative;
  z-index: 1;
}
.matrix-add-compact .matrix-onec-add,
.matrix-add-compact .matrix-clover-catalog-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
}
.matrix-add-compact .matrix-onec-add:has(.one-c-picker),
.matrix-add-compact .matrix-onec-add:has(.matrix-excel-review),
.matrix-add-compact .matrix-clover-catalog-add:has(.one-c-picker) {
  flex: 1 1 100%;
  width: 100%;
}
.matrix-add-compact .one-c-picker,
.matrix-add-compact .matrix-excel-review,
.matrix-add-compact .bulk-photo-panel,
.matrix-add-compact .matrix-save-message {
  flex: 1 1 100%;
  width: 100%;
  margin-top: 8px;
}
.matrix-add-panel {
  margin-top: 8px;
  padding: 10px;
}
.matrix-add-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
}
.matrix-add-actions .primary-button,
.matrix-add-actions .secondary-button {
  flex: 0 0 auto;
  white-space: nowrap;
}
.matrix-add-compact .one-c-picker-list {
  max-height: 260px;
}

.product-manager-list { display: grid; gap: 12px; align-content: start; }
.product-manager-row {
  display: grid;
  grid-template-columns: 28px 80px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px 14px;
  padding: 12px 14px;
  border: 1px solid #e1e9de;
  border-radius: 14px;
  background: #fff;
  box-sizing: border-box;
  min-width: 0;
}
.product-manager-check {
  display: grid;
  place-items: center;
  align-self: center;
}
.product-manager-check input {
  width: 18px;
  height: 18px;
  margin: 0;
}
.product-manager-thumb {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid #e1e9de;
  background: #fff;
  color: #9aaa98;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}
.product-manager-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  background: #fff;
}
.product-manager-info {
  min-width: 0;
  display: grid;
  gap: 4px;
  align-content: center;
  align-self: center;
}
.product-manager-side {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  min-width: max-content;
}
.product-manager-price {
  display: block;
  flex: 0 0 auto;
  min-width: 0;
  margin: 2px 0 0;
  color: #315f31;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
  white-space: nowrap;
  text-align: left;
}
.product-manager-badges {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  width: auto;
  white-space: normal;
}
.product-row-actions {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
  width: auto;
}
.product-row-action {
  width: auto;
  min-width: 92px;
  min-height: 34px;
  padding: 6px 12px;
  font-size: 12px;
  line-height: 1.2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  white-space: nowrap;
}
.image-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.image-upload-label { display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 7px 10px; border: 1px solid #d5dfd2; border-radius: 9px; background: #fff; color: #587058; font-size: 11px; font-weight: 800; cursor: pointer; }
.image-upload-label input { display: none; }
.product-manager-row h3 { margin: 0; color: #394639; font-size: 15px; line-height: 1.3; }
.product-manager-row p { margin: 0; color: #7a847a; font-size: 11px; line-height: 1.35; }
.product-manager-row.inactive { opacity: .58; }
.product-purchase-summary { display: flex; flex-wrap: wrap; gap: 5px 10px; margin-top: 7px; margin-bottom: 2px; color: #526852; font-size: 10px; line-height: 1.45; }
.product-purchase-summary span { white-space: nowrap; }
.product-purchase-summary strong { color: #315f31; font-size: 10px; }
.product-purchase-updated { display: block; width: 100%; color: #7a847a; line-height: 1.45; padding-bottom: 1px; }
.purchase-price-card { margin-top: 14px; padding: 15px; border: 1px solid #dce7d9; border-radius: 14px; background: #f8fbf6; }
.purchase-price-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.purchase-price-card-head h3 { margin: 0; color: #394639; font-size: 14px; }
.purchase-price-card-head small { color: #7a847a; text-align: right; }
.purchase-price-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
.purchase-price-grid article { padding: 11px; border: 1px solid #dce7d9; border-radius: 11px; background: #fff; }
.purchase-price-grid span, .purchase-price-grid small { display: block; color: #7a847a; font-size: 10px; }
.purchase-price-grid strong { display: block; margin: 5px 0 3px; color: #315f31; font-size: 15px; }
.purchase-price-single {
  padding: 12px 14px;
  border: 1px solid #dce7d9;
  border-radius: 11px;
  background: #fff;
}
.purchase-price-single strong {
  display: block;
  color: #315f31;
  font-size: 18px;
  line-height: 1.2;
}
.purchase-price-single small {
  display: block;
  margin-top: 6px;
  color: #7a847a;
  font-size: 11px;
  line-height: 1.4;
}
.product-editor {
  position: fixed;
  inset: 0;
  z-index: 1300 !important;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-x: hidden;
  overflow-y: auto;
  padding: calc(var(--clover-chrome-offset, 56px) + 16px) 16px max(28px, env(safe-area-inset-bottom, 0px));
  background: rgba(28,40,28,.48);
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  box-sizing: border-box;
}
.product-editor-card {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  width: min(720px,100%);
  max-height: calc(100vh - var(--clover-chrome-offset, 56px) - 32px);
  max-height: calc(100dvh - var(--clover-chrome-offset, 56px) - 32px);
  margin: 0 auto;
  overflow: hidden;
  padding: 16px 18px 0;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 25px 80px rgba(0,0,0,.2);
  box-sizing: border-box;
}
.product-editor-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding-bottom: 18px;
}
.product-editor-card .panel-heading { margin-bottom: 10px; }
.product-editor-card .panel-heading h2 { font-size: 18px; }
.product-editor-card .form-grid { gap: 10px; }
.product-editor-card .unit-settings { margin-top: 10px; gap: 8px; padding-bottom: 4px; }
.product-editor-card .unit-setting { padding: 8px 10px; }
.product-editor-card .one-c-link-editor {
  margin-bottom: 4px;
}
.product-editor-card .form-actions {
  position: static;
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 0 -18px 0;
  padding: 14px 18px calc(14px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid #e1e9de;
  background: #fff;
  box-shadow: 0 -10px 28px rgba(28, 40, 28, 0.1);
}
.product-editor-card .form-actions .primary-button {
  min-width: min(180px, 100%);
  box-shadow: 0 8px 18px rgba(91, 157, 87, 0.28);
}
@media (max-width: 700px) {
  .product-editor-card .form-actions {
    flex-direction: row !important;
    align-items: stretch;
  }
  .product-editor-card .form-actions button {
    width: auto !important;
    flex: 1 1 0;
    min-width: 0;
    justify-content: center;
  }
}
.product-editor-photo {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  margin: 0 0 12px;
  padding: 10px;
  border: 1px solid #e1e9de;
  border-radius: 14px;
  background: #f8fbf6;
}
.product-editor-photo-preview {
  width: 132px;
  height: 132px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid #d7e0d4;
  background: #fff;
  color: #7a847a;
  font-size: 11px;
  font-weight: 700;
}
.product-editor-photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
}
.product-editor-photo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  align-content: center;
}
.product-editor-photo-actions .eyebrow {
  width: 100%;
  margin: 0;
}
.product-editor-files {
  display: grid;
  gap: 8px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid #e1e9de;
  border-radius: 14px;
  background: #f8fbf6;
}
.product-editor-files-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.matrix-manager-note {
  margin-top: 10px;
}
.matrix-manager-note textarea {
  min-height: 44px;
  max-height: 72px;
  resize: vertical;
  padding: 8px 10px;
  border: 1px solid #d7e0d4;
  border-radius: 10px;
  background: #fff;
  font-size: 12px;
  line-height: 1.35;
}
.matrix-manager-note small {
  display: block;
  margin-top: 4px;
  color: #7a847a;
  font-size: 10px;
}
.matrix-edit-product-btn {
  justify-self: start;
  min-height: 30px;
  padding: 5px 10px;
  font-size: 11px;
}
.product-cert-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 5px 10px;
  border: 1px solid #c5d8c1;
  border-radius: 9px;
  background: #eef6ec;
  color: #386f37;
  font-size: 11px;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
}
.product-card .product-cert-link:not(.product-cert-link-top) {
  margin-top: 6px;
  width: fit-content;
}
.unit-settings { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-top: 12px; }
.unit-onec-hint {
  margin: 0;
  padding: 8px 10px;
  border: 1px dashed #d7e3d4;
  border-radius: 10px;
  background: #f7fbf5;
  color: #5f735f;
  font-size: 12px;
  font-weight: 600;
}
.unit-setting { padding: 12px; border: 1px solid #e1e9de; border-radius: 12px; background: #f8fbf6; }
.unit-setting label { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; color: #465146; font-weight: 800; }
.unit-setting .field { margin-top: 8px; }

.manager-contact-settings {
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid #dce7d9;
  border-radius: 16px;
  background: #f8fbf6;
}
.manager-contact-settings h3 { margin: 0 0 6px; color: #394639; }
.manager-contact-settings > p { margin: 0 0 15px; color: #747e74; font-size: 12px; line-height: 1.5; }
.manager-contact-help { margin: 12px 0 0 !important; color: #7a847a !important; font-size: 11px !important; }
.settings-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.setting-card { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 16px; border: 1px solid #e1e9de; border-radius: 14px; background: #f8fbf6; }
.setting-card h3 { margin: 0 0 5px; color: #394639; font-size: 14px; }
.setting-card p { margin: 0; color: #7a847a; font-size: 11px; line-height: 1.4; }
.toggle { width: 52px; height: 28px; min-height: 28px; padding: 3px; border: none; border-radius: 999px; background: #cfd7cd; flex-shrink: 0; box-sizing: border-box; }
.toggle span { display: block; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: .2s; }
.toggle.active { background: #5b9d57; }
.toggle.active span { transform: translateX(24px); }

.backup-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; }
.backup-list, .audit-list { display: grid; gap: 9px; margin-top: 16px; }
.backup-row, .audit-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 14px; align-items: center; padding: 13px; border: 1px solid #e1e9de; border-radius: 12px; background: #f8fbf6; }
.backup-row h3, .audit-row h3 { margin: 0 0 4px; color: #394639; font-size: 13px; }
.backup-row p, .audit-row p { margin: 0; color: #7a847a; font-size: 10px; line-height: 1.45; }
.backup-row .inline-actions { justify-content: flex-end; }
.audit-details { margin-top: 4px; color: #667266; font-size: 10px; word-break: break-word; }
.server-safe-note { margin-top: 14px; padding: 13px; border-radius: 12px; background: #eef6eb; color: #4e714d; font-size: 11px; line-height: 1.5; }
.exchange-notice { margin-bottom: 16px; padding: 15px; border: 1px solid #ead9b5; border-radius: 13px; background: #fff9ec; color: #78632e; line-height: 1.5; }
.success-box { padding: 13px; border: 1px solid #cfe3ca; border-radius: 12px; background: #eef8eb; color: #3f713d; line-height: 1.5; }
.section-toggle { cursor: pointer; color: #4f684f; font-weight: 800; }
.exchange-status-line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.exchange-status-line > .badge,
.exchange-status-line > .manager-order-status-select {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 28px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  width: auto;
}
.exchange-status-line > .manager-order-status-select {
  padding: 0 26px 0 10px;
}
.exchange-pending { background: #edf0ed; color: #687168; }
.exchange-ready { background: #e7f2ff; color: #2f6592; }
.exchange-sent { background: #e5f4e2; color: #3e7b3b; }
.exchange-error { background: #fbe8e8; color: #a34e4e; }
.exchange-message { margin-top: 8px; color: #727d72; font-size: 11px; line-height: 1.45; }
.exchange-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.exchange-actions button { min-height: 34px; padding: 7px 10px; }
.exchange-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 12px; margin-bottom: 16px; }
.exchange-grid article { padding: 16px; border: 1px solid #e1e9de; border-radius: 14px; background: #fff; }
.exchange-grid span { display: block; color: #778177; font-size: 11px; }
.exchange-grid strong { display: block; margin-top: 7px; color: #3f533f; font-size: 25px; }
.exchange-order-list { display: grid; gap: 12px; margin-top: 14px; }
.exchange-order-row { padding: 16px; border: 1px solid #e1e9de; border-radius: 14px; background: #fff; }
.exchange-order-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
.exchange-order-head h3 { margin: 5px 0; color: #3f4c3f; }
.exchange-issues { margin: 10px 0 0; padding: 11px 13px 11px 29px; border-radius: 10px; background: #fff1f1; color: #934e4e; font-size: 11px; line-height: 1.5; }
.exchange-log { display: grid; gap: 8px; margin-top: 14px; }
.exchange-log-row { padding: 12px; border: 1px solid #e5ebe3; border-radius: 11px; background: #f8fbf6; }
.exchange-log-row h4 { margin: 0 0 4px; color: #465346; }
.exchange-log-row p { margin: 0; color: #788278; font-size: 11px; }
.import-label { display: inline-flex; align-items: center; min-height: 42px; padding: 9px 14px; border: 1px solid #d5dfd2; border-radius: 11px; background: #fff; color: #587058; font-weight: 700; cursor: pointer; }
.import-label input { display: none; }

@media print {
  .app-header, .app-nav-bar, .app-top-chrome, .manager-nav, .client-nav, .client-bottom-nav, .client-order-actions, .mobile-checkout-bar, .cart-sheet, .toolbar, button, .order-thankyou { display: none !important; }
  .page-content { width: 100%; padding: 0; }
  .order-card { box-shadow: none; page-break-inside: avoid; }
}

@media (max-width: 1100px) {
  .product-grid { grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; }
  .catalog-layout { grid-template-columns: minmax(0,1fr) 340px; }
  .profile-summary { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .matrix-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .matrix-editor-row { grid-template-columns: 1fr; }
  .matrix-editor-product { grid-column: auto; }
  .matrix-editor-units .matrix-price-field { max-width: none; }
}
@media (max-width: 900px) {
  .stats-grid { grid-template-columns: repeat(2,1fr); }
  .catalog-layout { grid-template-columns: 1fr; gap: 16px; }
  .catalog-layout > .order-summary,
  .catalog-layout > .catalog-main { grid-column: auto; grid-row: auto; }
  .catalog-layout > .order-summary {
    position: static;
    top: auto;
  }
  .order-summary {
    display: none;
  }
  .order-summary h2 { margin: 0 0 10px; font-size: 18px; }
  .summary-list { max-height: 140px; margin-bottom: 10px; }
  .order-summary .save-order-button { display: none; }
  .order-summary .summary-note { display: none; }
  .order-summary .field { min-width: 0; max-width: 100%; }
  .order-summary .field input,
  .order-summary .field select,
  .order-summary .field textarea {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .delivery-date-field { gap: 7px; }
  .delivery-date-desktop-hint { display: none !important; }
  .delivery-date-trigger,
  .delivery-date-trigger-desktop {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 10px 12px;
    border: 1px solid #d6e0d3;
    border-radius: 14px;
    background: #fff;
    color: #394639;
    text-align: left;
    font: inherit;
    box-shadow: 0 4px 12px rgba(56, 97, 52, 0.04);
  }
  .delivery-date-trigger.is-selected,
  .delivery-date-trigger-desktop.is-selected {
    border-color: #b9d7b5;
    background: linear-gradient(180deg, #f4faf2 0%, #eef7eb 100%);
  }
  .delivery-date-day {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: #5b9d57;
    color: #fff;
    font-size: 20px;
    font-weight: 800;
    line-height: 1;
  }
  .delivery-date-day.is-empty {
    background: #e8efe5;
    color: #8a9688;
    font-size: 18px;
  }
  .delivery-date-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .delivery-date-text strong {
    color: #394639;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .delivery-date-text small {
    color: #5f6f5f;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  .delivery-date-action {
    color: #5b9d57;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }
  .delivery-date-preview {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
    padding: 12px;
    border: 1px solid #b9d7b5;
    border-radius: 14px;
    background: linear-gradient(180deg, #f4faf2 0%, #eef7eb 100%);
  }
  .delivery-date-sheet {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 500;
  }
  .delivery-date-sheet-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(30, 42, 30, 0.45);
    cursor: pointer;
    animation: clover-sheet-backdrop-in 0.28s ease-out both;
  }
  .delivery-date-sheet-panel {
    position: absolute;
    left: 0;
    right: 0;
    top: auto;
    bottom: 0;
    transform: none;
    width: 100%;
    max-height: 85svh;
    padding: 18px 16px calc(18px + env(safe-area-inset-bottom, 0px));
    border-radius: 18px 18px 0 0;
    background: #fff;
    box-shadow: 0 -12px 36px rgba(40, 64, 40, 0.18);
    animation: none;
  }
  .delivery-date-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
  }
  .delivery-date-sheet-head strong { color: #394639; font-size: 16px; }
  .delivery-date-sheet-submit {
    width: 100%;
    margin-top: 14px;
    min-height: 50px;
  }
  .catalog-lead { display: none; }
  .embedded-catalog .page-title-row {
    display: none;
  }
  .page-content-client .embedded-catalog.catalog-content {
    width: 100%;
    max-width: 100%;
    margin: 0;
    padding: 0 0 88px;
    min-width: 0;
    overflow-x: hidden;
  }
  .embedded-catalog .matrix-catalog-note {
    margin-bottom: 8px;
    padding: 8px 10px;
    font-size: 12px;
    line-height: 1.35;
  }
  .catalog-layout,
  .catalog-layout > .catalog-main {
    min-width: 0;
    max-width: 100%;
  }
  .catalog-toolbar {
    min-width: 0;
    max-width: 100%;
  }
  .embedded-catalog .catalog-scope-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin: 0 0 8px;
  }
  .embedded-catalog .catalog-scope-switch button {
    min-height: 32px;
    padding: 6px 8px;
    font-size: 11px;
    border-radius: 8px;
  }
  .embedded-catalog .catalog-toolbar { margin-bottom: 8px; }
  .embedded-catalog .catalog-filter-row,
  .catalog-filter-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    margin-bottom: 6px;
  }
  .catalog-filter-actions { gap: 6px; align-items: center; }
  .catalog-view-toggle {
    grid-column: auto;
    width: auto;
    height: 42px;
    min-height: 42px;
    border-radius: 12px;
    align-self: center;
  }
  .catalog-view-toggle button {
    flex: 0 0 auto;
    height: 100%;
    min-height: 42px;
    min-width: 42px;
    font-size: 13px;
    padding: 0;
  }
  .catalog-view-toggle .view-toggle-label {
    display: none;
  }
  .embedded-catalog .catalog-filter-row .category-button {
    min-height: 42px;
    height: 42px;
    min-width: 42px;
    padding: 0 12px;
    font-size: 14px;
    border-radius: 12px;
  }
  .product-card.product-card-list {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0 6px;
    padding: 3px 6px;
  }
  .product-card-list .product-card-controls {
    grid-column: 2;
    grid-row: 1 / span 3;
    min-width: 0 !important;
  }
  .product-card-list h2 {
    font-size: 12px;
    display: block;
    overflow: visible;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    -webkit-line-clamp: unset;
  }
  .product-card-list .product-category {
    display: none;
  }
  .embedded-catalog .catalog-search {
    min-width: 0;
    width: 100%;
    min-height: 36px;
    padding: 7px 10px;
    font-size: 16px;
    border-radius: 10px;
  }
  .fav-label-full { display: none; }
  .fav-label-short { display: inline; }
  .embedded-catalog .category-list {
    flex-wrap: nowrap;
    gap: 8px;
    overflow-x: auto;
    max-width: 100%;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .embedded-catalog .category-list::-webkit-scrollbar { display: none; }
  .embedded-catalog .category-list .category-button {
    flex: 0 0 auto;
    min-height: 42px;
    padding: 10px 14px;
    font-size: 14px;
    border-radius: 12px;
    white-space: nowrap;
  }
  .client-home-note {
    margin-bottom: 6px;
    padding: 6px 8px;
    font-size: 11px;
    line-height: 1.3;
  }
  .product-card-controls { gap: 5px; margin-top: auto; }
  .product-card .unit-choice,
  .product-card .unit-choice.unit-choice-single {
    display: grid !important;
    grid-auto-flow: column !important;
    grid-auto-columns: minmax(0, 1fr) !important;
    grid-template-rows: 30px !important;
    width: 100% !important;
    height: 30px !important;
    min-height: 30px !important;
    max-height: 30px !important;
    gap: 0 !important;
    border: 1px solid #dfe7dc !important;
    border-radius: 10px !important;
    overflow: hidden !important;
  }
  .product-card .unit-choice button,
  .product-card .unit-choice.unit-choice-single button {
    width: auto !important;
    min-width: 0 !important;
    height: 30px !important;
    min-height: 30px !important;
    max-height: 30px !important;
    padding: 0 4px !important;
    border: 0 !important;
    border-right: 1px solid #dfe7dc !important;
    border-radius: 0 !important;
    font-size: 11px !important;
    background: #fff !important;
    color: #5f695f !important;
    box-sizing: border-box !important;
  }
  .product-card .unit-choice button:last-child,
  .product-card .unit-choice.unit-choice-single button:last-child {
    border-right: 0 !important;
  }
  .product-card .unit-choice button.active,
  .product-card .unit-choice.unit-choice-single button.active {
    background: #5b9d57 !important;
    color: #fff !important;
  }
  .unit-hint { display: none; }
  .quantity-control { grid-template-columns: 32px minmax(0, 1fr) 32px; border-radius: 10px; }
  .quantity-control > button { height: 34px; font-size: 16px; }
  .quantity-input { width: 2.75rem; height: 32px; font-size: 14px; }
  .mobile-checkout-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 55;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid #d7e1d4;
    background: rgba(255,255,255,.97);
    box-shadow: 0 -8px 24px rgba(40,64,40,.1);
    backdrop-filter: blur(8px);
  }
  .mobile-checkout-bar-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .mobile-checkout-bar-info strong { color: #394639; font-size: 14px; }
  .mobile-checkout-bar-info span { color: #5f6f5f; font-size: 12px; font-weight: 700; }
  .mobile-checkout-bar-cart,
  .mobile-checkout-bar-button {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
  }
  .mobile-checkout-bar-cart {
    border: 1px solid #c5d7c2;
    background: #f4faf2;
    color: #3f6f3d;
  }
  .mobile-checkout-bar-button {
    border: none;
    background: #5b9d57;
    color: #fff;
  }
  .cart-sheet {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 500;
  }
  .cart-sheet-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(30, 42, 30, 0.45);
    cursor: pointer;
    animation: clover-sheet-backdrop-in 0.28s ease-out both;
  }
  .cart-sheet-panel {
    position: absolute;
    left: 0;
    right: 0;
    top: auto;
    bottom: 0;
    transform: none;
    width: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: 85svh;
    overflow: hidden;
    padding: 16px 16px 0;
    border-radius: 18px 18px 0 0;
    background: #fff;
    box-shadow: 0 -12px 40px rgba(30, 42, 30, 0.18);
    animation: none;
  }
  .cart-sheet-head {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .cart-sheet-head strong { display: block; color: #394639; font-size: 18px; }
  .cart-sheet-head p { margin: 4px 0 0; }
  .cart-sheet-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    display: grid;
    align-content: start;
    gap: 12px;
    padding-bottom: 8px;
  }
  .cart-sheet-list { display: grid; gap: 10px; }
  .cart-sheet-item {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid #e1e9de;
    border-radius: 14px;
    background: #f8fbf6;
  }
  .cart-sheet-item-main { display: grid; gap: 4px; min-width: 0; }
  .cart-sheet-item-main strong {
    color: #394639;
    font-size: 14px;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .cart-sheet-item-main small { color: #6f7b6f; font-size: 12px; line-height: 1.35; }
  .cart-sheet-units { margin-top: 6px; }
  .cart-sheet-qty { background: #fff; }
  .cart-sheet .delivery-date-trigger {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 10px 12px;
    border: 1px solid #d6e0d3;
    border-radius: 14px;
    background: #fff;
    color: #394639;
    text-align: left;
    font: inherit;
  }
  .cart-sheet-address { margin-top: 0; }
  .cart-sheet-footer {
    flex: 0 0 auto;
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid #e4ece1;
    background: #fff;
    box-shadow: 0 -10px 28px rgba(28, 40, 28, 0.08);
  }
  .cart-sheet-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    background: #eef6eb;
  }
  .cart-sheet-total strong { color: #386f37; font-size: 18px; }
  .catalog-content { padding-bottom: 88px; }
  .product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    align-items: stretch;
  }
  .product-grid.product-grid-list {
    grid-template-columns: 1fr !important;
    gap: 2px !important;
    align-items: stretch !important;
  }
  .product-card.product-card-list {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0 6px;
    padding: 3px 6px;
    height: auto !important;
    min-height: 0 !important;
  }
  .product-card-list .product-card-top {
    display: none;
  }
  .product-card-list .product-card-controls {
    min-width: 0 !important;
    width: auto;
    gap: 2px;
  }
  .product-card-list h2 {
    font-size: 12px;
    line-height: 1.15;
    display: block;
    overflow: visible;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    -webkit-line-clamp: unset;
  }
  .product-card-list .product-price {
    font-size: 11px;
  }
  .product-card-list .product-card-controls {
    width: 132px !important;
    min-width: 132px !important;
    max-width: 132px !important;
  }
  .product-card-list .unit-choice,
  .product-card-list .unit-choice.unit-choice-single {
    display: grid !important;
    grid-auto-flow: column !important;
    grid-auto-columns: minmax(0, 1fr) !important;
    grid-template-rows: 24px !important;
    width: 100% !important;
    height: 24px !important;
    min-height: 24px !important;
    max-height: 24px !important;
    border-radius: 7px !important;
  }
  .product-card-list .unit-choice button,
  .product-card-list .unit-choice.unit-choice-single button {
    width: auto !important;
    min-width: 0 !important;
    height: 24px !important;
    min-height: 24px !important;
    max-height: 24px !important;
    font-size: 10px !important;
  }
  .product-card-list .quantity-control {
    width: 100% !important;
    border-radius: 7px !important;
  }
  .product-card-list .quantity-control {
    grid-template-columns: 24px minmax(0, 1fr) 24px;
    gap: 2px;
  }
  .product-card-list .quantity-control > button {
    width: 24px;
    height: 24px;
    min-width: 24px;
  }
  .product-card-list .quantity-input-wrap {
    min-height: 24px;
  }
  .product-card-list .quantity-input {
    width: 2.2rem;
    height: 22px;
    font-size: 12px;
  }
  .product-card-list .quantity-input-wrap small {
    display: none !important;
  }
  .product-card {
    min-height: 0 !important;
    height: auto;
    padding: 8px;
    border-radius: 12px;
    box-shadow: none;
    gap: 4px;
  }
  .product-card-top {
    flex: 0 0 auto;
    margin: 0;
    min-height: 28px;
  }
  .product-cert-link-top {
    min-height: 26px;
    padding: 3px 8px;
    font-size: 10px;
  }
  .favorite-button { font-size: 18px; }
  .product-image-wrap {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 1 / 1;
    height: auto;
    margin: 0;
    border-radius: 12px;
    background: #fff;
    align-self: stretch;
    overflow: hidden;
  }
  .product-image {
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center center;
    background: #fff;
  }
  .product-image-placeholder { font-size: 10px; padding: 0 6px; }
  .product-card h2 {
    flex: 0 0 auto;
    margin: 2px 0;
    font-size: 12px;
    line-height: 1.25;
    display: block;
    -webkit-line-clamp: unset;
    overflow: visible;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .product-code { display: none; }
  .product-price {
    flex: 0 0 auto;
    margin: 0 0 4px !important;
    font-size: 12px;
  }
  .client-catalog-add-panel .product-price,
  .client-catalog-add-panel .client-catalog-add-price {
    display: block !important;
    font-size: 15px !important;
    font-weight: 800 !important;
    min-height: 20px !important;
    height: auto !important;
    overflow: visible !important;
    color: #2f5f2f !important;
  }
  .product-card-controls {
    margin-top: auto;
    gap: 4px;
  }
  .order-meta { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .toolbar.four { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .products-filter-bar {
    display: flex;
    grid-template-columns: none;
  }
  .product-manager-row { grid-template-columns: 28px 68px minmax(0, 1fr); }
  .product-manager-side { grid-column: 1 / -1; align-items: flex-end; justify-content: flex-end; width: 100%; }
  .product-manager-row .image-actions,
  .product-manager-row .row-actions { grid-column: 1 / -1; }
  .client-metrics article { flex: 1 1 calc(50% - 6px); min-width: 0; }
}
@media (max-width: 820px) {
  .mobile-checkout-bar {
    bottom: 0;
    padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  }
  .catalog-content { padding-bottom: 88px; }
  .app-header.app-header-with-nav {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    gap: 6px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
  }
  .app-header-with-nav .app-header-top {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
  .app-header-with-nav .app-header-logo-button {
    flex: 0 1 auto;
    min-width: 0;
    max-width: min(42vw, 110px);
  }
  .app-header-with-nav .app-header-actions {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
    justify-content: flex-end;
  }
  .app-header-with-nav .header-logout {
    order: 30;
    flex: 0 0 auto;
    margin-left: 0;
    white-space: nowrap;
  }
  .app-header-with-nav .app-header-nav {
    flex: 0 0 auto;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
  }
  .app-header-logo {
    width: clamp(64px, 22vw, 96px);
    max-width: 100%;
    max-height: 44px;
    height: auto;
  }
  .app-header-nav .client-nav,
  .client-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: 0;
    padding: 0;
    width: 100%;
    max-width: 100%;
  }
  .app-header-nav .client-nav button,
  .client-nav button {
    width: 100%;
    min-height: 36px;
    height: auto;
    padding: 8px 10px;
    font-size: 13px;
    border-radius: 10px;
    text-align: center;
  }
  .app-header-nav .manager-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
    max-width: 100%;
  }
  .app-header-nav .manager-nav button {
    flex: 1 1 calc(33.333% - 6px);
    min-width: calc(33.333% - 6px);
    min-height: 36px;
    height: auto;
    padding: 8px 10px;
    font-size: 12px;
  }
  .manager-contact-label-full { display: none; }
  .manager-contact-label-short { display: inline; }
  .manager-contact-trigger {
    min-height: 34px;
    padding: 6px 10px;
    font-size: 12px;
  }
  .app-header-titles {
    display: none !important;
    min-width: 0;
    max-width: 100%;
  }
  .app-header-titles strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .app-header-titles .small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .order-history-filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .order-history-filters .category-button {
    width: 100%;
    min-height: 42px;
    padding: 10px 12px;
    font-size: 14px;
    border-radius: 12px;
    text-align: center;
  }
  .client-order-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .client-order-actions button {
    width: 100%;
    justify-content: center;
  }
  .product-card,
  .product-card-controls,
  .unit-choice,
  .quantity-control {
    min-width: 0;
    max-width: 100%;
  }
}
@media (max-width: 700px) {
  .app-header { align-items: center; min-height: 0; padding: 8px 4%; gap: 10px; }
  .app-header-logo { width: 96px; max-width: 96px; max-height: 52px; }
  .app-header-actions { align-items: center; flex-direction: row; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
  .manager-contact-popover { position: fixed; top: 64px; right: 4%; width: min(340px, 92vw); }
  .manager-contact-popover::before { display: none; }
  .page-content, .catalog-content {
    width: 100%;
    max-width: 100%;
    padding-top: 10px;
    padding-left: 12px;
    padding-right: 12px;
    box-sizing: border-box;
    min-width: 0;
    overflow-x: hidden;
  }
  .app-nav-bar {
    width: 100%;
    max-width: 100%;
    padding-left: 12px;
    padding-right: 12px;
    box-sizing: border-box;
  }
  .app-top-chrome .app-header {
    padding-left: 12px;
    padding-right: 12px;
  }
  .app-nav-bar .manager-nav,
  .app-nav-bar .client-nav {
    width: 100%;
  }
  .catalog-content { padding-bottom: 88px; }
  .page-content-client .embedded-catalog.catalog-content {
    width: 100%;
    max-width: 100%;
    margin: 0;
    padding: 0 0 88px;
    min-width: 0;
    overflow-x: hidden;
  }
  .embedded-catalog.catalog-content { padding-top: 0; }
  .page-title-row, .panel-heading, .address-card, .order-card-header { align-items: stretch; flex-direction: column; }
  .client-card-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px 12px;
  }
  .client-card-header-actions {
    justify-self: end;
    align-items: center;
    flex-shrink: 0;
  }
  .client-card-header-actions > strong {
    display: none;
  }
  .page-title-row h1 { font-size: 22px; }
  .embedded-catalog .page-title-row { display: none; }
  .panel-heading .primary-button {
    width: 100%;
    justify-content: center;
  }
  .form-grid, .profile-summary, .toolbar, .toolbar.two, .toolbar.three, .toolbar.four, .manager-order-controls, .manager-textareas, .settings-grid, .order-comments { grid-template-columns: 1fr; }
  .product-grid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
  .order-meta { grid-template-columns: 1fr; }
  .custom-row { grid-template-columns: 1fr; }
  .unit-settings, .purchase-price-grid { grid-template-columns: 1fr; }
  .matrix-grid { grid-template-columns: 1fr; }
  .matrix-editor-row { grid-template-columns: 1fr; }
  .matrix-editor-product { grid-column: auto; }
  .product-manager-row { grid-template-columns: 24px 56px minmax(0, 1fr); }
  .product-manager-side { grid-column: 1 / -1; }
  .form-actions, .backup-actions { align-items: stretch; flex-direction: column; }
  .form-actions button, .backup-actions button, .import-label { width: 100%; justify-content: center; }
}
@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat-card { padding: 15px; }
  .stat-card strong { font-size: 23px; }
  .app-header-logo { width: 90px; max-width: 90px; max-height: 48px; }
  .product-image-wrap {
    aspect-ratio: 1 / 1 !important;
    max-height: none !important;
    width: 100% !important;
    height: auto !important;
    margin: 0 !important;
  }
  .product-card:not(.product-card-list) h2 { font-size: 12px; }
  .product-price { margin: 0 0 4px !important; }
  .client-catalog-add-panel .product-price,
  .client-catalog-add-panel .client-catalog-add-price {
    display: block !important;
    visibility: visible !important;
    margin: 4px 0 8px !important;
    font-size: 15px !important;
    font-weight: 800 !important;
    line-height: 1.3 !important;
    min-height: 20px !important;
    height: auto !important;
    overflow: visible !important;
    color: #2f5f2f !important;
  }
  .favorite-button { font-size: 18px; }
}
`;

export function readDemoSession() {
  try {
    const savedSession = sessionStorage.getItem(DEMO_SESSION_KEY);

    return savedSession
      ? JSON.parse(savedSession)
      : {
          isLoggedIn: false,
          role: "client",
        };
  } catch {
    return {
      isLoggedIn: false,
      role: "client",
    };
  }
}

export function writeDemoSession(isLoggedIn, role) {
  try {
    if (!isLoggedIn) {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
      return;
    }

    sessionStorage.setItem(
      DEMO_SESSION_KEY,
      JSON.stringify({
        isLoggedIn: true,
        role,
      })
    );
  } catch (error) {
    console.error("Не удалось сохранить текущий вход", error);
  }
}

export function safeRead(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Не удалось сохранить ${key}`, error);
  }
}

export function makeId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function makeOrderIdentifiers(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const milliseconds = pad(date.getMilliseconds(), 3);

  return {
    number: `CL-${datePart.slice(2)}-${timePart}-${milliseconds}`,
    externalId: `CLOVER-${datePart}-${timePart}-${milliseconds}`,
  };
}

export function getOrCreateClientId() {
  const saved = localStorage.getItem(STORAGE.clientId);
  if (saved) return saved;
  const id = makeId("client");
  localStorage.setItem(STORAGE.clientId, id);
  return id;
}

const PLACEHOLDER_PRODUCT_CATEGORIES = new Set(["Из 1С", "Новые товары", ""]);

function categoryNameTokens(value) {
  return String(value || "")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .split(/[^a-zа-я0-9]+/u)
    .filter((token) => token.length >= 3);
}

/** Категория по названию: похожий товар в каталоге → правила витрины → «Прочее». */
export function inferProductCategory(name, products = [], fallback = "Прочее") {
  const query = String(name || "").trim();
  if (!query) return fallback;

  const queryTokens = categoryNameTokens(query);
  let best = null;
  for (const product of Array.isArray(products) ? products : []) {
    const category = String(product?.category || "").trim();
    if (!category || PLACEHOLDER_PRODUCT_CATEGORIES.has(category)) continue;
    const productTokens = new Set(categoryNameTokens(product.name));
    if (!queryTokens.length || !productTokens.size) continue;
    const hit = queryTokens.filter((token) => productTokens.has(token)).length;
    const score = hit / queryTokens.length;
    if (score < 0.52) continue;
    if (!best || score > best.score || (score === best.score && category.localeCompare(best.category, "ru") < 0)) {
      best = { category, score };
    }
  }
  if (best) return canonicalizeProductCategory(best.category);

  return assignCloverTaxonomy(query).category || fallback;
}

/** Артикул для UI: только код 1С (внутренние CL-… не показываем). */
export function productArticle(product = {}) {
  const oneC = String(product.oneCCode || product.oneCMatchCode || "").trim();
  if (oneC) return oneC;
  const code = String(product.code || "").trim();
  if (/^cl-\d+$/i.test(code)) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
    return "";
  }
  return code;
}

/** Поля товара для поиска каталога по началам слов. */
export function productCatalogSearchHaystack(product = {}, { includeAdminFields = false } = {}) {
  const parts = [
    product.name,
    productArticle(product),
    product.oneCCode,
    product.oneCMatchCode,
    product.oneCName,
    product.category,
    product.subcategory,
    product.facet,
  ];
  if (includeAdminFields) {
    parts.push(product.oneCSearchQuery, product.oneCMatchName, product.oneCId);
  }
  return parts.filter(Boolean).join(" ");
}

export function normalizeProduct(product) {
  const filteredSaleUnits = Array.isArray(product.saleUnits)
    ? product.saleUnits.filter((unit) => UNIT_ORDER.includes(unit))
    : [];
  const saleUnits = filteredSaleUnits.length ? filteredSaleUnits : ["piece"];
  const numericId = Number(product.id);
  const hasNumericId = Number.isFinite(numericId) && numericId > 0;

  const sizes = {};
  const prices = {};
  const basePrices = {};
  for (const unit of UNIT_ORDER) {
    const sizeField = unitSizeField(unit);
    const priceField = unitPriceField(unit);
    const baseField = unitBasePriceField(unit);
    sizes[sizeField] = Math.max(1, Number(product[sizeField]) || 1);
    prices[priceField] = Math.max(0, Number(product[priceField]) || 0);
    basePrices[baseField] = Math.max(
      0,
      Number(product[baseField] ?? product[priceField]) || 0
    );
  }

  const purchasePrices =
    product.purchasePrices && typeof product.purchasePrices === "object"
      ? { ...emptyPurchasePrices(), ...product.purchasePrices }
      : emptyPurchasePrices();

  const oneCCode = String(product.oneCCode || "").trim();
  const oneCMatchCode = String(product.oneCMatchCode || "").trim();
  const rawCode = String(product.code || "").trim();
  const articleFromOneC = oneCCode || oneCMatchCode;
  const code = articleFromOneC
    ? articleFromOneC
    : /^cl-\d+$/i.test(rawCode)
      ? ""
      : rawCode;

  return {
    ...product,
    id: hasNumericId ? numericId : product.id,
    code,
    oneCId: product.oneCId || "",
    oneCCode: oneCCode || articleFromOneC,
    oneCName: product.oneCName || "",
    oneCLinkMode: product.oneCLinkMode || "",
    oneCLinkedAt: product.oneCLinkedAt || "",
    oneCMatchCode: oneCMatchCode || articleFromOneC,
    oneCMatchName: product.oneCMatchName || "",
    oneCSearchQuery: product.oneCSearchQuery || "",
    oneCSearchRequestedAt: product.oneCSearchRequestedAt || "",
    imageUrl: product.imageUrl || "",
    imageUpdatedAt: product.imageUpdatedAt || "",
    certificateUrl: product.certificateUrl || "",
    certificateName: product.certificateName || "",
    certificateUpdatedAt: product.certificateUpdatedAt || "",
    active: product.active !== false,
    showOnStorefront: product.showOnStorefront === true,
    subcategory: String(product.subcategory || "").trim(),
    facet: String(product.facet || "").trim(),
    storefrontDetails: (() => {
      const details =
        product.storefrontDetails && typeof product.storefrontDetails === "object"
          ? product.storefrontDetails
          : {};
      return {
        description: String(details.description || "").trim(),
        composition: String(details.composition || "").trim(),
        characteristics: String(details.characteristics || "").trim(),
      };
    })(),
    storefrontPricing: (() => {
      const raw =
        product.storefrontPricing && typeof product.storefrontPricing === "object"
          ? product.storefrontPricing
          : {};
      const source =
        String(raw.source || "").trim() === "manual" ? "manual" : "inherit";
      const pricing = { source };
      for (const unit of UNIT_ORDER) {
        const value = raw[unit];
        if (value === "" || value === null || value === undefined) {
          pricing[unit] = null;
          continue;
        }
        const numeric = Number(String(value).replace(",", "."));
        pricing[unit] =
          Number.isFinite(numeric) && numeric >= 0
            ? Math.round(numeric * 100) / 100
            : null;
      }
      return pricing;
    })(),
    ...sizes,
    ...prices,
    ...basePrices,
    pieceOrderMultiple: (() => {
      const raw = Number(product.pieceOrderMultiple);
      if (!Number.isFinite(raw) || raw < 1) return 1;
      return Math.max(1, Math.floor(raw));
    })(),
    priceSources:
      product.priceSources &&
      typeof product.priceSources === "object"
        ? product.priceSources
        : {},
    purchasePrices,
    purchasePriceUpdatedAt: product.purchasePriceUpdatedAt || "",
    purchasePriceUnit: product.purchasePriceUnit || "piece",
    purchasePriceAvailable: Boolean(product.purchasePriceAvailable),
    salePriceReceivedAt: product.salePriceReceivedAt || "",
    clientPriceMode: product.clientPriceMode || "base",
    clientPriceOverrideMode: product.clientPriceOverrideMode || "inherit",
    markupPercent: Math.max(0, Number(product.markupPercent) || 0),
    defaultPricingMode: product.defaultPricingMode || "base",
    defaultMarkupPercent: Math.max(0, Number(product.defaultMarkupPercent) || 0),
    oneCPriceTypeId: product.oneCPriceTypeId || "",
    isMatrixProduct: product.isMatrixProduct !== false,
    saleUnits,
    salePricesByType:
      product.salePricesByType && typeof product.salePricesByType === "object"
        ? product.salePricesByType
        : {},
  };
}

/** Поля цен 1С живут в ответе API, в PUT каталога их не отправляем — иначе nginx 413. */
export function stripProductForSave(product = {}) {
  const {
    purchasePrices,
    purchasePriceUpdatedAt,
    purchasePriceReceivedAt,
    purchasePriceSourceUpdatedAt,
    purchasePriceSourceDatabase,
    purchasePriceUnit,
    purchasePriceAvailable,
    salePricesByType,
    salePriceReceivedAt,
    clientPriceMode,
    clientPriceOverrideMode,
    markupPercent,
    defaultPricingMode,
    defaultMarkupPercent,
    oneCPriceTypeId,
    priceSources,
    basePricePiece,
    basePricePack,
    basePriceBundle,
    basePriceBox,
    basePricePair,
    basePriceRoll,
    isMatrixProduct,
    ...stored
  } = product;
  return stored;
}

export function formatDate(value) {
  if (!value) return "Дата не указана";
  try {
    const raw = String(value).trim();
    // YYYY-MM-DD (доставка и т.п.) — полдень локально, без сдвига суток
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Intl.DateTimeFormat("ru-RU").format(new Date(`${raw}T12:00:00`));
    }
    // ISO datetime — календарный день в локальной зоне (не UTC из slice)
    return new Intl.DateTimeFormat("ru-RU").format(new Date(raw));
  } catch {
    return value;
  }
}

export function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

/**
 * Сколько базовых штук в одной выбранной единице продажи → в 1С всегда «шт».
 * - piece / pair / roll → 1:1
 * - pack / box / bundle → «Внутри, шт.» (кратно содержимому)
 */
export function unitConvertsOneToOneToPieces(unit) {
  // Метр/пара/рулон в 1С уходят как шт 1:1 (без масштаба «внутри»).
  return unit === "piece" || unit === "pair" || unit === "meter" || unit === "roll";
}

/** Единицы товара в порядке «меньше → больше». */
export function orderedSaleUnits(product) {
  const saleUnits = Array.isArray(product?.saleUnits) ? product.saleUnits : [];
  const ordered = UNIT_ORDER.filter((unit) => saleUnits.includes(unit));
  return ordered.length ? ordered : ["piece"];
}

export function getUnitMultiplier(product, unit) {
  if (unitConvertsOneToOneToPieces(unit) || !UNIT_CONFIG[unit]) return 1;
  return Math.max(1, Number(product?.[unitSizeField(unit)]) || 1);
}

/**
 * Кратность заказа в шт.: цена за 1 шт., количество только 5, 10, 15…
 * (не путать с packSize — там цена за упаковку).
 */
export function getPieceOrderMultiple(product) {
  const raw = Number(product?.pieceOrderMultiple);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.max(1, Math.floor(raw));
}

/** Шаг изменения количества в единицах продажи (для шт. — кратность). */
export function getUnitOrderStep(product, unit) {
  if (unit === "piece") return getPieceOrderMultiple(product);
  return 1;
}

/** Округлить количество до кратности (0 остаётся 0). */
export function snapQuantityToStep(quantity, step) {
  const s = Math.max(1, Number(step) || 1);
  const q = Math.max(0, Number(quantity) || 0);
  if (q <= 0) return 0;
  return Math.max(s, Math.round(q / s) * s);
}

/**
 * Поле количества: для упаковки/пачки с размером >1 показываем штуки (100, 200…),
 * в заказе храним число единиц продажи (1, 2 уп.).
 */
export function toQuantityInputValue(unitQuantity, multiplier) {
  const qty = Math.max(0, Number(unitQuantity) || 0);
  const mult = Math.max(1, Number(multiplier) || 1);
  return mult > 1 ? qty * mult : qty;
}

/** Ввод из поля (штуки при mult>1) → количество единиц продажи. */
export function fromQuantityInputValue(inputValue, multiplier, orderStep = 1) {
  const raw = Math.max(0, Number.parseInt(String(inputValue), 10) || 0);
  const mult = Math.max(1, Number(multiplier) || 1);
  if (mult > 1) {
    if (raw <= 0) return 0;
    return Math.max(1, Math.round(raw / mult));
  }
  return snapQuantityToStep(raw, orderStep);
}

export function quantityInputStep(multiplier, orderStep = 1) {
  const mult = Math.max(1, Number(multiplier) || 1);
  if (mult > 1) return mult;
  return Math.max(1, Number(orderStep) || 1);
}

export function quantityInputUnitLabel(unit, multiplier) {
  if (Math.max(1, Number(multiplier) || 1) > 1) return "шт.";
  return UNIT_CONFIG[unit]?.shortLabel || "шт.";
}

export function getUnitPrice(product, unit) {
  return Number(product?.[unitPriceField(unit)]) || 0;
}

export function getPriceSource(product, unit) {
  return product.priceSources?.[unit] || "unspecified";
}

export function hasPersonalPrices(link) {
  return Object.values(link.personalPrices || {}).some((price) =>
    price?.source === "purchase_markup" ||
    UNIT_ORDER.some(
      (unit) =>
        price?.[unit] !== null &&
        price?.[unit] !== undefined &&
        price?.[unit] !== ""
    )
  );
}

export function roundPriceUp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  // Фактическая сумма с копейками (без округления вверх до рубля).
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function hasPurchasePrice(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

export function hasManualUnitValue(price = {}) {
  return UNIT_ORDER.some(
    (unit) =>
      price?.[unit] !== null &&
      price?.[unit] !== undefined &&
      price?.[unit] !== ""
  );
}

/** При выборе «Фиксированная» подставляет базу каталога в пустые единицы продажи. */

export function prefillManualPriceFromProduct(product, currentPrice = {}) {
  const next = {
    source: "manual",
    markupPercent: Math.max(0, Number(currentPrice.markupPercent) || 0),
  };

  for (const unit of UNIT_ORDER) {
    next[unit] =
      currentPrice[unit] !== null && currentPrice[unit] !== undefined
        ? Number(currentPrice[unit])
        : null;
  }

  const saleUnits = Array.isArray(product?.saleUnits) ? product.saleUnits : [];
  for (const unit of UNIT_ORDER) {
    if (!saleUnits.includes(unit)) continue;
    if (next[unit] !== null) continue;
    const base = Math.max(0, Number(product?.[unitPriceField(unit)]) || 0);
    if (base > 0) next[unit] = base;
  }

  return next;
}

export function calculateMarkupPreview(purchasePrice, markupPercent) {
  const purchase = Number(purchasePrice);
  if (!Number.isFinite(purchase) || purchase < 0) return 0;
  const markup = Math.max(0, Number(markupPercent) || 0);
  return roundPriceUp(purchase * (1 + markup / 100));
}

/**
 * База для превью наценки в UI менеджера (как pickPurchaseMarkupCost на сервере).
 * Свежий вид цен побеждает более старую закупку; priceSource из matrix-prices — приоритетнее.
 */
export function pickPurchaseMarkupCostForUi({
  purchasePrice,
  typedPrice,
  purchaseUpdatedAt = "",
  typedReceivedAt = "",
  priceSource = "",
} = {}) {
  const purchase = hasPurchasePrice(purchasePrice) ? Number(purchasePrice) : null;
  const typed =
    typedPrice !== null &&
    typedPrice !== undefined &&
    typedPrice !== "" &&
    Number.isFinite(Number(typedPrice))
      ? Number(typedPrice)
      : null;

  if (priceSource === "purchase_markup_from_price_type") {
    return {
      cost: typed !== null ? typed : purchase,
      kind: "one_c_price_type",
    };
  }
  if (priceSource === "purchase_markup") {
    return {
      cost: purchase !== null ? purchase : typed,
      kind: "purchase",
    };
  }

  if (purchase === null && typed === null) {
    return { cost: null, kind: "purchase" };
  }
  if (purchase === null) {
    return { cost: typed, kind: "one_c_price_type" };
  }
  if (typed === null) {
    return { cost: purchase, kind: "purchase" };
  }

  const purchaseAt = String(purchaseUpdatedAt || "").trim();
  const typedAt = String(typedReceivedAt || "").trim();
  if (typedAt && (!purchaseAt || typedAt > purchaseAt)) {
    return { cost: typed, kind: "one_c_price_type" };
  }
  return { cost: purchase, kind: "purchase" };
}

/** Вид цен 1С с именем вроде «Закупочная цена» (не путать с каналом purchase-prices). */
export function findZakupPriceType(oneCPriceTypes = [], salePricesByType = {}) {
  const listed = (Array.isArray(oneCPriceTypes) ? oneCPriceTypes : []).find((item) =>
    /закупочн/i.test(String(item?.name || ""))
  );
  if (listed?.id) {
    return {
      id: String(listed.id).trim(),
      name: String(listed.name || "Закупочная цена").trim(),
    };
  }
  const byType =
    salePricesByType && typeof salePricesByType === "object" ? salePricesByType : {};
  for (const [id, entry] of Object.entries(byType)) {
    const name = String(entry?.priceTypeName || entry?.name || "").trim();
    if (!/закупочн/i.test(name)) continue;
    return { id: String(id).trim(), name: name || "Закупочная цена" };
  }
  return null;
}

/**
 * Число и подпись для карточки товара в редакторе.
 * Свежий вид «Закупочная» побеждает более старый канал purchase-prices.
 */
export function pickProductCardOneCCost({
  purchasePrices = {},
  purchaseUpdatedAt = "",
  salePricesByType = {},
  salePriceReceivedAt = "",
  oneCPriceTypes = [],
  preferredUnit = "piece",
} = {}) {
  const unit =
    UNIT_ORDER.includes(preferredUnit) && hasPurchasePrice(purchasePrices?.[preferredUnit])
      ? preferredUnit
      : UNIT_ORDER.find((item) => hasPurchasePrice(purchasePrices?.[item])) ||
        UNIT_ORDER.find((item) => {
          const zakup = findZakupPriceType(oneCPriceTypes, salePricesByType);
          if (!zakup) return false;
          const entry = salePricesByType?.[zakup.id];
          return entry && Number.isFinite(Number(entry[item]));
        }) ||
        "piece";

  const purchase = hasPurchasePrice(purchasePrices?.[unit])
    ? Number(purchasePrices[unit])
    : null;

  const zakup = findZakupPriceType(oneCPriceTypes, salePricesByType);
  const entry =
    zakup && salePricesByType && typeof salePricesByType === "object"
      ? salePricesByType[zakup.id]
      : null;
  let typed = null;
  if (entry && typeof entry === "object") {
    const direct = Number(entry[unit]);
    if (Number.isFinite(direct) && direct >= 0) typed = direct;
    else if (unit === "piece" || unit === "pair" || unit === "roll" || unit === "meter") {
      typed = null;
    } else {
      const piece = Number(entry.piece);
      typed = Number.isFinite(piece) && piece >= 0 ? piece : null;
    }
  }
  const typedAt = String(
    entry?.receivedAt || entry?.updatedAt || salePriceReceivedAt || ""
  ).trim();
  const purchaseAt = String(purchaseUpdatedAt || "").trim();
  const picked = pickPurchaseMarkupCostForUi({
    purchasePrice: purchase,
    typedPrice: typed,
    purchaseUpdatedAt: purchaseAt,
    typedReceivedAt: typedAt,
  });
  const fromType = picked.kind === "one_c_price_type";
  return {
    cost: picked.cost,
    kind: picked.kind,
    unit,
    updatedAt: fromType ? typedAt : purchaseAt,
    title: fromType ? `Вид цен «${zakup?.name || "Закупочная"}»` : "Закупочная цена товара",
    sourceLabel: fromType
      ? "Из «Обновить цены» (вид цен)"
      : "Из выгрузки закупочных цен",
  };
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function typedEntryValues(entry) {
  if (!entry || typeof entry !== "object") return [];
  return [entry.piece, ...UNIT_ORDER.map((unit) => entry[unit])];
}

function firstTypedPriceByName(salePricesByType, pattern) {
  const byType =
    salePricesByType && typeof salePricesByType === "object" ? salePricesByType : {};
  for (const entry of Object.values(byType)) {
    const name = String(entry?.priceTypeName || entry?.name || "");
    if (!pattern.test(name)) continue;
    const found = firstPositiveNumber(...typedEntryValues(entry));
    if (found != null) return found;
  }
  return null;
}

function firstTypedPriceByTypeList(salePricesByType, oneCPriceTypes, pattern) {
  const byType =
    salePricesByType && typeof salePricesByType === "object" ? salePricesByType : {};
  const listed = Array.isArray(oneCPriceTypes) ? oneCPriceTypes : [];
  for (const type of listed) {
    if (!pattern.test(String(type?.name || ""))) continue;
    const id = String(type?.id || "").trim();
    if (!id) continue;
    const found = firstPositiveNumber(...typedEntryValues(byType[id]));
    if (found != null) return found;
  }
  return null;
}

/**
 * Цена в списке товаров менеджера: закупка, «Закупочная» / «Продажная», любой вид цен 1С, каталог.
 * Одно положительное число без префикса «от».
 */
export function firstPositiveCatalogPrice(product, oneCPriceTypes = []) {
  if (!product || typeof product !== "object") return null;
  const card = pickProductCardOneCCost({
    purchasePrices: product.purchasePrices,
    purchaseUpdatedAt:
      product.purchasePriceReceivedAt || product.purchasePriceUpdatedAt || "",
    salePricesByType: product.salePricesByType,
    salePriceReceivedAt: product.salePriceReceivedAt || "",
    oneCPriceTypes,
  });
  const byType =
    product.salePricesByType && typeof product.salePricesByType === "object"
      ? product.salePricesByType
      : {};
  const typedValues = [];
  for (const entry of Object.values(byType)) {
    typedValues.push(...typedEntryValues(entry));
  }
  const storefront =
    product.storefrontPricing && typeof product.storefrontPricing === "object"
      ? product.storefrontPricing
      : {};
  return firstPositiveNumber(
    card.cost,
    ...UNIT_ORDER.map((unit) => product.purchasePrices?.[unit]),
    firstTypedPriceByName(byType, /закупочн/i),
    firstTypedPriceByTypeList(byType, oneCPriceTypes, /закупочн/i),
    firstTypedPriceByName(byType, /продажн/i),
    firstTypedPriceByTypeList(byType, oneCPriceTypes, /продажн/i),
    firstTypedPriceByName(byType, /рознич/i),
    firstTypedPriceByTypeList(byType, oneCPriceTypes, /рознич/i),
    ...typedValues,
    product.pricePiece,
    product.price,
    ...UNIT_ORDER.map((unit) => product[unitPriceField(unit)]),
    ...UNIT_ORDER.map((unit) => storefront[unit]),
    ...UNIT_ORDER.map((unit) => product[unitBasePriceField(unit)])
  );
}

export function getOrderTotal(order) {
  const itemsTotal = (order.items || []).reduce(
    (sum, item) => sum + (Number(item.lineTotal) || 0),
    0
  );
  const customTotal = (order.customItems || []).reduce(
    (sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
    0
  );
  return roundPriceUp(itemsTotal + customTotal);
}

export function getPositionCount(order) {
  return (order.items?.length || 0) + (order.customItems?.length || 0);
}

export function statusClass(status) {
  if (status === "Новый") return "status-new";
  if (["Принят", "Собирается", "Обработан вручную"].includes(status)) return "status-work";
  if (status === "Готов к доставке") return "status-ready";
  if (status === "Выполнен") return "status-done";
  return "status-cancel";
}

export function makeOrderHistoryEvent(type, label, actor = "Система") {
  return {
    id: makeId("history"),
    type,
    label,
    actor,
    createdAt: new Date().toISOString(),
  };
}

export function appendOrderHistory(order, event) {
  const history = Array.isArray(order?.history) ? order.history : [];
  return [...history, event].slice(-100);
}

export function reconciliationPeriodLabel(item) {
  const labels = { q1: "1 квартал", q2: "2 квартал", q3: "3 квартал", q4: "4 квартал", all: "За весь период", custom: "Определённый период" };
  if (item.periodType === "all") return labels.all;
  if (["q1", "q2", "q3", "q4"].includes(item.periodType)) return `${labels[item.periodType]} ${item.year || ""}`.trim();
  return `${item.dateFrom || "—"} — ${item.dateTo || "—"}`;
}

export const RECONCILIATION_STATUS_LABELS = {
  new: "Новый запрос",
  processing: "Готовится",
  ready: "Готов",
  rejected: "Отклонён",
};
