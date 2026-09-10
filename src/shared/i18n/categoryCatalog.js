/**
 * Code-owned Stage 5.1 category/subcategory localization corpus.
 * Russian CLOVER taxonomy remains business/data authority; IDs are display-only keys.
 *
 * Browser-safe: no Node builtins / sourceHash. Server persistence hashes via
 * localizationStore + shared sourceHash(sourceRu).
 */
import {
  CLOVER_GROUP_META,
  CLOVER_PRODUCT_GROUPS,
} from "../../screens/storefront/productGroups.js";

export const CATEGORY_NAMESPACE = "category";
export const CATEGORY_FIELD_KEY = "name";

/** Stable top-level localization IDs keyed by canonical RU name. */
export const CATEGORY_STABLE_IDS = Object.freeze({
  "Одноразовая посуда": "disposable",
  "Хозяйственные товары": "household",
  "Химия, чистящие средства": "chemistry",
  "Барные аксессуары": "bar",
  "Бумажная продукция": "paper",
  "Пакеты, упаковочные материалы": "bags",
  "Канцелярские товары": "office",
  Прочее: "other",
});

/** Stable subcategory IDs within parent category id. */
export const SUBCATEGORY_STABLE_IDS = Object.freeze({
  disposable: Object.freeze({
    Стаканы: "cups",
    Контейнеры: "containers",
    "Бумажная упаковка": "paper-packaging",
    Ведра: "buckets",
    "Ланч-боксы": "lunch-boxes",
    "Коробки для пиццы": "pizza-boxes",
    Соусники: "sauce-cups",
    "Тарелки, миски": "plates-bowls",
    "Столовые приборы": "cutlery",
    "Для суши и лапши": "sushi-noodles",
    Бутылки: "bottles",
    Лотки: "trays",
    "Для кондитерских изделий": "confectionery",
    "Контейнеры под запайку": "sealing-containers",
    "Формы алюминиевые": "aluminum-forms",
    Прочее: "other",
  }),
  household: Object.freeze({
    "Фольга, пленка, пергамент": "foil-film-parchment",
    "Одноразовая одежда": "disposable-clothing",
    "Тряпки, мопы, полотенца": "cloths-mops-towels",
    Перчатки: "gloves",
    "Мешки для мусора": "trash-bags",
    "Губки для посуды": "dish-sponges",
    "Швабры, щетки": "mops-brushes",
    "Пленка под запайку": "sealing-film",
    Прочее: "other",
  }),
  chemistry: Object.freeze({
    Жироудалители: "degreasers",
    "Для мытья посуды": "dishwashing",
    "Для окон": "windows",
    "Для полов": "floors",
    "Для сантехники": "plumbing",
    Универсальные: "universal",
    "Для дезинфекции": "disinfection",
    Мыло: "soap",
    Порошки: "powders",
    "Для посудомоечных машин": "dishwasher",
    Прочее: "other",
  }),
  paper: Object.freeze({
    "Бумажные полотенца": "paper-towels",
    "Туалетная бумага": "toilet-paper",
    Салфетки: "napkins",
    Прочее: "other",
  }),
  bags: Object.freeze({
    "Пакеты-майки": "t-shirt-bags",
    "Пакеты фасовочные": "packing-bags",
    "Пакеты вакуумные": "vacuum-bags",
    "Бумажные пакеты с ручкой": "kraft-bags-handles",
    "Бумажные пакеты без ручки": "kraft-bags-no-handles",
    Прочее: "other",
  }),
});

function freezeEntry(entry) {
  return Object.freeze({ ...entry, critical: true });
}

function buildCatalog() {
  const entries = [];
  const byEntity = new Map();
  const bySource = new Map();

  for (const sourceRu of CLOVER_PRODUCT_GROUPS) {
    const entityId = CATEGORY_STABLE_IDS[sourceRu];
    if (!entityId) {
      throw new Error(`Missing stable category id for ${sourceRu}`);
    }
    const entry = freezeEntry({
      namespace: CATEGORY_NAMESPACE,
      entityType: "category",
      entityId,
      fieldKey: CATEGORY_FIELD_KEY,
      sourceRu,
      parentEntityId: "",
      critical: true,
    });
    entries.push(entry);
    byEntity.set(categoryEntityKey("category", entityId), entry);
    bySource.set(sourceKey("category", sourceRu, ""), entry);

    const children = CLOVER_GROUP_META[sourceRu]?.children || [];
    const childIds = SUBCATEGORY_STABLE_IDS[entityId] || null;
    for (const child of children) {
      const childRu = String(child?.name || "").trim();
      if (!childRu) continue;
      const childId = childIds?.[childRu];
      if (!childId) {
        throw new Error(`Missing stable subcategory id for ${sourceRu} / ${childRu}`);
      }
      const fullId = `${entityId}/${childId}`;
      const sub = freezeEntry({
        namespace: CATEGORY_NAMESPACE,
        entityType: "subcategory",
        entityId: fullId,
        fieldKey: CATEGORY_FIELD_KEY,
        sourceRu: childRu,
        parentEntityId: entityId,
        parentSourceRu: sourceRu,
        critical: true,
      });
      entries.push(sub);
      byEntity.set(categoryEntityKey("subcategory", fullId), sub);
      bySource.set(sourceKey("subcategory", childRu, sourceRu), sub);
    }
  }

  return {
    entries: Object.freeze(entries.slice()),
    byEntity,
    bySource,
  };
}

export function categoryEntityKey(entityType, entityId) {
  return `${String(entityType || "")}\0${String(entityId || "")}`;
}

function sourceKey(entityType, sourceRu, parentSourceRu = "") {
  return `${String(entityType || "")}\0${String(parentSourceRu || "")}\0${String(sourceRu || "")}`;
}

const CATALOG = buildCatalog();

export function listCategoryCatalogEntries() {
  return CATALOG.entries;
}

export function getCategoryCatalogEntry(entityType, entityId) {
  return CATALOG.byEntity.get(categoryEntityKey(entityType, entityId)) || null;
}

export function findCategoryCatalogBySource({ entityType, sourceRu, parentSourceRu = "" } = {}) {
  return CATALOG.bySource.get(sourceKey(entityType, sourceRu, parentSourceRu)) || null;
}

export function isCurrentCategoryCatalogEntry(entry) {
  if (!entry) return false;
  if (String(entry.namespace || "") !== CATEGORY_NAMESPACE) return false;
  if (String(entry.fieldKey || "") !== CATEGORY_FIELD_KEY) return false;
  const entityType = String(entry.entityType || "");
  const entityId = String(entry.entityId || "");
  if (!entityType || !entityId) return false;
  return Boolean(getCategoryCatalogEntry(entityType, entityId));
}

/** O(1) membership set for store filtering. */
export const CURRENT_CATEGORY_ENTITY_KEYS = Object.freeze(
  new Set(CATALOG.entries.map((entry) => categoryEntityKey(entry.entityType, entry.entityId)))
);
