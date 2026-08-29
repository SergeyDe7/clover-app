/**
 * Категории и подкатегории витрины Clover.
 * children: [] — у группы нет подгрупп, товары показываем сразу.
 * Порядок: сначала с подкатегориями, затем без; «Прочее» всегда последняя.
 */
import { sortProductsWithLidsGrouped } from "../../shared/productCatalogOrder.js";

export const CLOVER_PRODUCT_GROUPS = [
  "Одноразовая посуда",
  "Хозяйственные товары",
  "Химия, чистящие средства",
  "Бумажная продукция",
  "Пакеты, упаковочные материалы",
  "Барные аксессуары",
  "Канцелярские товары",
  "Прочее",
];

const DISPOSABLE = "Одноразовая посуда";
const HOUSEHOLD = "Хозяйственные товары";
const CHEM = "Химия, чистящие средства";
const BAR = "Барные аксессуары";
const PAPER = "Бумажная продукция";
const BAGS = "Пакеты, упаковочные материалы";
const OFFICE = "Канцелярские товары";
const OTHER = "Прочее";

/** Старые имена каталога → канон витрины. */
export const LEGACY_CATEGORY_TO_CANONICAL = {
  Контейнеры: DISPOSABLE,
  "Гигиеническая продукция": PAPER,
  "Химия профессиональная": CHEM,
  "Химия бытовая": CHEM,
  "Бытовая химия": CHEM,
  "Бумага офисная": OFFICE,
  "Лотки и подложки": DISPOSABLE,
  "Уборочный инвентарь и оборудование": HOUSEHOLD,
  "Барные аксессуары и товары для сервировки": BAR,
  "Кухонные принадлежности": HOUSEHOLD,
  Пленка: HOUSEHOLD,
  "Пакеты и сумки": BAGS,
  "Упаковочные материалы": DISPOSABLE,
  "Товары для гостиниц, отелей и бань": HOUSEHOLD,
  "Спецодежда, обувь и средства защиты": HOUSEHOLD,
  Перчатки: HOUSEHOLD,
  "Принадлежности для касс и торговли": OFFICE,
  "Оборудование для туалетных комнат": CHEM,
  "Офисная техника и расходные материалы": OFFICE,
  "Продукты питания": OTHER,
  "Бытовая техника и электротовары": OTHER,
  Мебель: OTHER,
  "Посуда и столовые приборы": DISPOSABLE,
  "Одноразовая продукция": DISPOSABLE,
  Канцтовары: OFFICE,
  Текстиль: PAPER,
  "Пакеты и пленка": BAGS,
  Уборка: HOUSEHOLD,
  Упаковка: BAGS,
  "Новые товары": OTHER,
  "Из 1С": OTHER,
};

export function canonicalizeProductCategory(name) {
  const raw = String(name || "").trim() || OTHER;
  if (CLOVER_PRODUCT_GROUPS.includes(raw)) return raw;
  return LEGACY_CATEGORY_TO_CANONICAL[raw] || raw;
}

const LEGACY_SUBCATEGORY_TO_CANONICAL = {
  "Тряпки, МОПы, полотенца": "Тряпки, мопы, полотенца",
};

export function canonicalizeProductSubcategory(name) {
  const raw = String(name || "").trim();
  return LEGACY_SUBCATEGORY_TO_CANONICAL[raw] || raw;
}

function normTaxonomyText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е");
}

/** Правила раскладки: первое совпадение. Подкатегория "" — у группы нет подгрупп. */
const TAXONOMY_ASSIGN_RULES = [
  { category: CHEM, subcategory: "Жироудалители", patterns: [/жироудал/u, /шуманит/u, /азелит/u, /grill max/u, /для мытья грил/u] },
  { category: CHEM, subcategory: "Для посудомоечных машин", patterns: [/посудомо/u, /\bпмм\b/u, /ополаскиватель для пмм/u] },
  { category: CHEM, subcategory: "Для мытья посуды", patterns: [/для мытья посуды/u, /мойки посуды/u, /для ручной мойки посуды/u, /\bfairy\b/u] },
  { category: CHEM, subcategory: "Для окон", patterns: [/для окон/u, /для стекол/u, /для стёкол/u, /стекол и зеркал/u, /мистер мускул/u] },
  { category: HOUSEHOLD, subcategory: "Тряпки, мопы, полотенца", patterns: [/моп/u, /тряпк/u, /полотно/u, /хпп/u, /микрофибр/u, /вафельн/u, /ручной пад/u] },
  { category: HOUSEHOLD, subcategory: "Швабры, щетки", patterns: [/швабр/u, /щетк/u, /веник/u, /ерш для/u, /вантуз/u, /совок/u] },
  { category: CHEM, subcategory: "Для полов", patterns: [/для мытья пола/u, /средство.*для пола/u, /для полов/u, /уборки полов/u] },
  { category: CHEM, subcategory: "Для сантехники", patterns: [/сантехник/u, /адрилан/u, /доместос/u, /санокс/u] },
  { category: CHEM, subcategory: "Для дезинфекции", patterns: [/дезинф/u, /антисептик/u, /септо/u, /здравдез/u] },
  { category: CHEM, subcategory: "Порошки", patterns: [/стиральн.*порош/u, /порошок viksan/u, /порошок ять/u, /отбеливатель.*порош/u, /пемолюкс/u] },
  { category: CHEM, subcategory: "Мыло", patterns: [/жидкое мыло/u, /мыло-пена/u, /хозяйственное мыло/u, /туалетное мыло/u, /\bмыло\b/u] },
  { category: CHEM, subcategory: "Универсальные", patterns: [/универсальн.*очист/u, /универсальный очиститель/u] },
  { category: CHEM, subcategory: "Освежители воздуха", patterns: [/освежитель воздуха/u, /airwick/u, /\bдореми\b/u, /\balpen\b/u] },
  { category: CHEM, subcategory: "Отбеливатели", patterns: [/\bбелизна\b/u, /отбеливател/u, /отбеливани/u, /имнова вайтен/u] },
  { category: PAPER, subcategory: "Салфетки", patterns: [/салфетк/u] },
  { category: CHEM, subcategory: "Прочее", patterns: [/хелп - /u, /чистящ/u, /моющ/u, /химитек/u, /ника-2/u, /средство для/u, /экопрофхим/u, /prosept/u, /очиститель/u, /полироль/u, /dry dez/u] },

  { category: HOUSEHOLD, subcategory: "Мешки для мусора", patterns: [/пакет[ыа]? для мусора/u, /мешк.*для мусора/u, /мешк.*мусор/u] },
  { category: HOUSEHOLD, subcategory: "Перчатки", patterns: [/перчатк/u, /нитрил/u, /латекс/u, /винилов/u] },
  { category: HOUSEHOLD, subcategory: "Одноразовая одежда", patterns: [/шапочк/u, /халат однораз/u, /бахил/u, /маска медицин/u, /нарукавник/u, /набородник/u, /балаклав/u, /передник/u, /пилотка/u, /спецодежд/u] },
  { category: HOUSEHOLD, subcategory: "Пленка под запайку", patterns: [/пленк.*под запай/u, /запаечн.*пленк/u, /пленк.*для запай/u] },
  { category: HOUSEHOLD, subcategory: "Фольга, пленка, пергамент", patterns: [/фольг/u, /пергамент/u, /подпергамент/u, /стрейч/u, /пленк.*пищев/u, /пленка пищевая/u] },
  { category: HOUSEHOLD, subcategory: "Прочее", patterns: [/распылител/u, /пульверизатор/u, /опрыскивател/u, /ролик для чистки/u, /ловушка от мух/u, /ведр.*хозяйств/u] },
  { category: HOUSEHOLD, subcategory: "Губки для посуды", patterns: [/губк/u] },

  { category: PAPER, subcategory: "Туалетная бумага", patterns: [/туалетн.*бумаг/u] },
  { category: PAPER, subcategory: "Бумажные полотенца", patterns: [/полотенц.*бумаж/u, /бумажн.*полотенц/u, /рулонные полотенца/u, /полотенца в рулоне/u, /z-укл/u, /v-укл/u, /v-сложен/u] },
  { category: PAPER, subcategory: "Прочее", patterns: [/покрытия для унитаза/u] },

  { category: BAGS, subcategory: "Пакеты-майки", patterns: [/пакет-майк/u, /пакеты-майк/u, /майка/u] },
  { category: BAGS, subcategory: "Пакеты вакуумные", patterns: [/вакуумн.*пакет/u] },
  { category: BAGS, subcategory: "Пакеты фасовочные", patterns: [/фасовочн/u] },
  { category: BAGS, subcategory: "Бумажные пакеты с ручкой", patterns: [/бумажн.*пакет.*с ручк/u, /пакет.*крафт.*с ручк/u] },
  { category: BAGS, subcategory: "Бумажные пакеты без ручки", patterns: [/бумажн.*пакет/u, /уголок бумажн/u] },
  { category: BAGS, subcategory: "Пакеты zip-lock", patterns: [/зиплок/u, /zip-?lock/u, /с замком зип/u, /пакет с замком/u] },
  { category: BAGS, subcategory: "Прочее", patterns: [/фильтр-пакет/u, /пакет(?!ы? для мусора)/u] },

  { category: DISPOSABLE, subcategory: "Ланч-боксы", patterns: [/ланч-?бокс/u, /\blb[-\s]/u] },
  { category: DISPOSABLE, subcategory: "Коробки для пиццы", patterns: [/пицц/u] },
  { category: DISPOSABLE, subcategory: "Соусники", patterns: [/соусник/u] },
  { category: DISPOSABLE, subcategory: "Стаканы", patterns: [/стакан/u, /шейкер пэт/u] },
  { category: DISPOSABLE, subcategory: "Тарелки, миски", patterns: [/тарелк/u, /миск/u, /креманк/u] },
  { category: DISPOSABLE, subcategory: "Для суши и лапши", patterns: [/суши/u, /ролл/u, /вок/u, /noodles/u, /палочки для еды/u] },
  { category: DISPOSABLE, subcategory: "Столовые приборы", patterns: [/вилк/u, /ложк/u, /набор.*прибор/u, /размешивател/u, /зубочист/u, /шпател/u, /конверт для (столовых )?прибор/u, /нож белый/u, /нож черный/u, /нож для чистки/u] },
  { category: DISPOSABLE, subcategory: "Бутылки", patterns: [/бутылк/u] },
  { category: OFFICE, subcategory: "", patterns: [/лоток.*бумаг/u] },
  { category: DISPOSABLE, subcategory: "Лотки", patterns: [/лоток/u, /подложк/u] },
  { category: DISPOSABLE, subcategory: "Для кондитерских изделий", patterns: [/кондитер/u, /тарталетк/u] },
  { category: DISPOSABLE, subcategory: "Контейнеры под запайку", patterns: [/под запай/u, /запайк/u, /спк/u] },
  { category: DISPOSABLE, subcategory: "Формы алюминиевые", patterns: [/алюмин/u] },
  { category: DISPOSABLE, subcategory: "Ведра", patterns: [/ведр/u] },
  { category: DISPOSABLE, subcategory: "Бумажная упаковка", patterns: [/eco tabox/u, /eco sandwich/u, /fast food box/u, /бумажн.*контейнер/u, /контейнер.*бумажн/u, /крафт с окном/u, /упаковка eco/u, /уголок бумажн/u, /коробка для (картофеля|гамбургера|фри)/u, /капкейк/u, /бумага для шаверм/u, /бумага для выпечк/u] },
  { category: DISPOSABLE, subcategory: "Контейнеры", patterns: [/контейнер/u, /opsalad/u, /ракушк/u, /ип-\d/u, /банка супов/u, /крышк/u, /банк[аиу]/u] },

  { category: BAR, subcategory: "", patterns: [/трубочк/u, /пика /u, /барн/u, /коктейл/u, /мартини/u, /вилочка коктейл/u, /палочки для шашлык/u] },
  { category: OFFICE, subcategory: "", patterns: [/кассов/u, /этикет/u, /скотч/u, /скрепк/u, /папк/u, /маркер/u, /карандаш/u, /блокнот/u, /линейк/u, /ластик/u, /клей/u, /степлер/u, /канцеляр/u, /файл/u, /штемпел/u, /термоэтикет/u, /калькулятор/u, /стикер для записей/u, /планшет а4/u, /лоток.*бумаг/u, /конверт.*бумажн/u, /ручка шариков/u, /шило/u, /корректирующ/u, /накладная/u, /ресторанный счет/u, /бумага а4/u, /блок бумажн/u] },
];

/**
 * Категория и подкатегория по названию товара.
 * Если у группы есть подгруппы и правило не указало свою — «Прочее».
 */
export function assignCloverTaxonomy(name) {
  const text = normTaxonomyText(name);
  if (!text) return { category: OTHER, subcategory: "", facet: "" };

  for (const rule of TAXONOMY_ASSIGN_RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(text))) continue;
    const children = getGroupChildren(rule.category);
    let subcategory = String(rule.subcategory || "").trim();
    if (children.length && !subcategory) subcategory = "Прочее";
    if (children.length && subcategory) {
      const exists = children.some(
        (child) => child.name.toLocaleLowerCase("ru-RU") === subcategory.toLocaleLowerCase("ru-RU")
      );
      if (!exists) subcategory = "Прочее";
    }
    if (!children.length) subcategory = "";
    return { category: rule.category, subcategory, facet: "" };
  }

  return { category: OTHER, subcategory: "", facet: "" };
}

/** Иконки и подгруппы для страницы категории. */
export const CLOVER_GROUP_META = {
  "Одноразовая посуда": {
    icon: "disposable",
    children: [
      { name: "Стаканы" },
      { name: "Контейнеры" },
      { name: "Бумажная упаковка" },
      { name: "Ведра" },
      { name: "Ланч-боксы" },
      { name: "Коробки для пиццы" },
      { name: "Соусники" },
      { name: "Тарелки, миски" },
      { name: "Столовые приборы" },
      { name: "Для суши и лапши" },
      { name: "Бутылки" },
      { name: "Лотки" },
      { name: "Для кондитерских изделий" },
      { name: "Контейнеры под запайку" },
      { name: "Формы алюминиевые" },
      { name: "Прочее" },
    ],
  },
  "Хозяйственные товары": {
    icon: "clean",
    children: [
      { name: "Фольга, пленка, пергамент" },
      { name: "Одноразовая одежда" },
      { name: "Тряпки, мопы, полотенца" },
      { name: "Перчатки" },
      { name: "Мешки для мусора" },
      { name: "Губки для посуды" },
      { name: "Швабры, щетки" },
      { name: "Пленка под запайку" },
      { name: "Прочее" },
    ],
  },
  "Химия, чистящие средства": {
    icon: "chemistry",
    children: [
      { name: "Жироудалители" },
      { name: "Для мытья посуды" },
      { name: "Для окон" },
      { name: "Для полов" },
      { name: "Для сантехники" },
      { name: "Универсальные" },
      { name: "Для дезинфекции" },
      { name: "Мыло" },
      { name: "Порошки" },
      { name: "Для посудомоечных машин" },
      { name: "Освежители воздуха" },
      { name: "Отбеливатели" },
      { name: "Прочее" },
    ],
  },
  "Барные аксессуары": {
    icon: "disposable",
    children: [],
  },
  "Бумажная продукция": {
    icon: "textile",
    children: [
      { name: "Бумажные полотенца" },
      { name: "Туалетная бумага" },
      { name: "Салфетки" },
      { name: "Прочее" },
    ],
  },
  "Пакеты, упаковочные материалы": {
    icon: "bags",
    children: [
      { name: "Пакеты-майки" },
      { name: "Пакеты фасовочные" },
      { name: "Пакеты вакуумные" },
      { name: "Бумажные пакеты с ручкой" },
      { name: "Бумажные пакеты без ручки" },
      { name: "Пакеты zip-lock" },
      { name: "Прочее" },
    ],
  },
  "Канцелярские товары": {
    icon: "office",
    children: [],
  },
  Прочее: {
    icon: "other",
    children: [],
  },
};

export function getGroupMeta(name) {
  const key = canonicalizeProductCategory(name);
  return (
    CLOVER_GROUP_META[key] || {
      icon: "other",
      children: [],
    }
  );
}

function normalizeChild(node) {
  if (!node) return null;
  if (typeof node === "string") return { name: node, children: [] };
  return {
    name: String(node.name || "").trim(),
    children: Array.isArray(node.children)
      ? node.children.map(normalizeChild).filter((item) => item?.name)
      : [],
  };
}

export function getGroupChildren(category) {
  const meta = getGroupMeta(category);
  return (Array.isArray(meta.children) ? meta.children : [])
    .map(normalizeChild)
    .filter((item) => item?.name);
}

export function findSubgroup(category, subcategory) {
  const needle = canonicalizeProductSubcategory(subcategory).toLocaleLowerCase("ru-RU");
  if (!needle) return null;
  return (
    getGroupChildren(category).find(
      (child) =>
        child.name.toLocaleLowerCase("ru-RU") === needle
    ) || null
  );
}

export function getSubgroupFacets(category, subcategory) {
  const sub = findSubgroup(category, subcategory);
  return sub?.children || [];
}

/** Есть ли у группы подгруппы (для редактора товара: обязательность subcategory). */
export function groupRequiresSubgroup(category) {
  return getGroupChildren(category).length > 0;
}

export function sortCloverProductGroups(names) {
  const order = new Map(CLOVER_PRODUCT_GROUPS.map((name, index) => [name, index]));
  const unique = [
    ...new Set(
      (Array.isArray(names) ? names : [])
        .map((name) => canonicalizeProductCategory(name))
        .filter(Boolean)
    ),
  ];

  return unique.sort((a, b) => {
    if (a === "Прочее") return 1;
    if (b === "Прочее") return -1;
    const aHasSubs = getGroupChildren(a).length > 0 ? 0 : 1;
    const bHasSubs = getGroupChildren(b).length > 0 ? 0 : 1;
    if (aHasSubs !== bHasSubs) return aHasSubs - bHasSubs;
    const ai = order.has(a) ? order.get(a) : 1000;
    const bi = order.has(b) ? order.get(b) : 1000;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b, "ru");
  });
}

/**
 * Дерево групп для навигации витрины.
 * Если categories пуст — показываем полный канонический список.
 */
export function buildGroupNav(categories) {
  const fromApi = (Array.isArray(categories) ? categories : [])
    .map((item) => (typeof item === "string" ? item : item?.name))
    .filter(Boolean);
  const names = sortCloverProductGroups(
    fromApi.length ? [...CLOVER_PRODUCT_GROUPS, ...fromApi] : CLOVER_PRODUCT_GROUPS
  );
  return names.map((name) => {
    const meta = getGroupMeta(name);
    return {
      name,
      icon: meta.icon,
      children: getGroupChildren(name),
    };
  });
}

export function groupProductsByCloverGroup(products) {
  const map = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const name = canonicalizeProductCategory(product?.category || "Прочее");
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(product);
  }
  return sortCloverProductGroups([...map.keys()]).map((name) => ({
    name,
    products: sortProductsWithLidsGrouped(map.get(name) || []),
    count: (map.get(name) || []).length,
    ...getGroupMeta(name),
  }));
}

/** Совпадение фильтра каталога с учётом старых имён. */
export function categoryMatchesFilter(productCategory, filterCategory) {
  // Пустой фильтр = «Все» (не канонизировать в «Прочее»).
  if (!String(filterCategory || "").trim()) return true;
  const filter = canonicalizeProductCategory(filterCategory);
  const product = canonicalizeProductCategory(productCategory);
  return (
    product.toLocaleLowerCase("ru-RU") === filter.toLocaleLowerCase("ru-RU")
  );
}

export function subcategoryMatchesFilter(productSubcategory, filterSubcategory) {
  const filter = canonicalizeProductSubcategory(filterSubcategory);
  if (!filter) return true;
  const product = canonicalizeProductSubcategory(productSubcategory);
  return (
    product.toLocaleLowerCase("ru-RU") === filter.toLocaleLowerCase("ru-RU")
  );
}

/**
 * Подгруппа/фасет по названию товара: сначала правила раскладки,
 * затем совпадение с именами children группы.
 */
export function inferSubcategoryFacetFromName(
  productName,
  category,
  products = []
) {
  const cat = canonicalizeProductCategory(category);
  const query = String(productName || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е");
  if (!cat || !query) return { subcategory: "", facet: "" };

  const assigned = assignCloverTaxonomy(productName);
  if (assigned.category === cat && assigned.subcategory) {
    return { subcategory: assigned.subcategory, facet: assigned.facet || "" };
  }

  const children = getGroupChildren(cat);
  if (!children.length) return { subcategory: "", facet: "" };

  const scoreLabel = (label) => {
    const needle = String(label || "")
      .trim()
      .toLocaleLowerCase("ru-RU")
      .replaceAll("ё", "е");
    if (!needle) return 0;
    if (query.includes(needle)) return 100 + needle.length;
    const stem = (word) =>
      String(word || "")
        .replace(
          /(ами|ями|ыми|ого|ему|ых|ии|ий|ый|ой|ая|ое|ые|ов|ев|ей|ом|ем|ах|ях|ам|ям|ую|юю|у|ю|а|я|ы|и|е|о)$/u,
          ""
        )
        .slice(0, 12);
    const tokens = needle.split(/\s+/).filter((w) => w.length >= 4);
    if (!tokens.length) return 0;
    const queryWords = query.split(/\s+/).filter(Boolean);
    const hits = tokens.filter((token) => {
      if (query.includes(token)) return true;
      const tokenStem = stem(token);
      if (tokenStem.length < 4) return false;
      return queryWords.some((word) => {
        const wordStem = stem(word);
        return (
          wordStem.startsWith(tokenStem) ||
          tokenStem.startsWith(wordStem) ||
          word.includes(tokenStem) ||
          token.includes(wordStem)
        );
      });
    }).length;
    if (!hits) return 0;
    return hits * 20 + Math.min(needle.length, 40);
  };

  let bestSub = null;
  for (const child of children) {
    const score = scoreLabel(child.name);
    if (score <= 0) continue;
    if (!bestSub || score > bestSub.score) {
      bestSub = { name: child.name, score };
    }
  }

  if (!bestSub) {
    for (const product of Array.isArray(products) ? products : []) {
      if (canonicalizeProductCategory(product?.category) !== cat) continue;
      const sub = String(product?.subcategory || "").trim();
      if (!sub) continue;
      const other = String(product?.name || "")
        .trim()
        .toLocaleLowerCase("ru-RU")
        .replaceAll("ё", "е");
      if (!other) continue;
      const shared = other
        .split(/\s+/)
        .filter((w) => w.length >= 4 && query.includes(w)).length;
      if (shared < 2) continue;
      if (!bestSub || shared > bestSub.score) {
        bestSub = {
          name: sub,
          score: shared,
          facet: String(product?.facet || "").trim(),
        };
      }
    }
  }

  if (!bestSub) {
    if (children.some((child) => child.name === "Прочее")) {
      return { subcategory: "Прочее", facet: "" };
    }
    return { subcategory: "", facet: "" };
  }

  let facet = String(bestSub.facet || "").trim();
  if (!facet) {
    let bestFacet = null;
    for (const item of getSubgroupFacets(cat, bestSub.name)) {
      const score = scoreLabel(item.name);
      if (score <= 0) continue;
      if (!bestFacet || score > bestFacet.score) {
        bestFacet = { name: item.name, score };
      }
    }
    facet = bestFacet?.name || "";
  }

  return { subcategory: bestSub.name, facet };
}

export function facetMatchesFilter(productFacet, filterFacet) {
  const filter = String(filterFacet || "").trim();
  if (!filter) return true;
  const product = String(productFacet || "").trim();
  return (
    product.toLocaleLowerCase("ru-RU") === filter.toLocaleLowerCase("ru-RU")
  );
}
