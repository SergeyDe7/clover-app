/**
 * Группы витрины — названия как у Opticom (популярные категории),
 * в стиле и структуре Clover. children: [] — крючок под подгруппы.
 */
export const CLOVER_PRODUCT_GROUPS = [
  "Контейнеры",
  "Гигиеническая продукция",
  "Одноразовая посуда",
  "Химия профессиональная",
  "Канцелярские товары",
  "Бумага офисная",
  "Лотки и подложки",
  "Химия бытовая",
  "Уборочный инвентарь и оборудование",
  "Барные аксессуары и товары для сервировки",
  "Кухонные принадлежности",
  "Пленка",
  "Пакеты и сумки",
  "Упаковочные материалы",
  "Товары для гостиниц, отелей и бань",
  "Спецодежда, обувь и средства защиты",
  "Принадлежности для касс и торговли",
  "Оборудование для туалетных комнат",
  "Офисная техника и расходные материалы",
  "Продукты питания",
  "Бытовая техника и электротовары",
  "Мебель",
  "Посуда и столовые приборы",
];

/** Старые имена Clover → канон витрины (Opticom-стиль). */
export const LEGACY_CATEGORY_TO_CANONICAL = {
  Перчатки: "Спецодежда, обувь и средства защиты",
  "Пакеты и пленка": "Пакеты и сумки",
  Уборка: "Уборочный инвентарь и оборудование",
  Упаковка: "Упаковочные материалы",
  "Одноразовая продукция": "Одноразовая посуда",
  Канцтовары: "Канцелярские товары",
  "Бытовая химия": "Химия бытовая",
  Текстиль: "Гигиеническая продукция",
};

export function canonicalizeProductCategory(name) {
  const raw = String(name || "").trim() || "Прочее";
  return LEGACY_CATEGORY_TO_CANONICAL[raw] || raw;
}

/** Короткие описания для страницы группы (витрина). */
export const CLOVER_GROUP_META = {
  Контейнеры: {
    icon: "box",
    lead: "Контейнеры для хранения, фасовки и доставки.",
    children: [
      {
        name: "Бумажные контейнеры",
        children: [
          { name: "Круглые" },
          { name: "Прямоугольные" },
          { name: "С крышкой" },
        ],
      },
      {
        name: "Пластиковые контейнеры",
        children: [
          { name: "Круглые" },
          { name: "Прямоугольные" },
          { name: "Ракушки" },
        ],
      },
      { name: "Контейнеры-ракушки" },
      { name: "Ланч-боксы" },
      { name: "Контейнеры под запайку" },
    ],
  },
  "Гигиеническая продукция": {
    icon: "textile",
    lead: "Салфетки, полотенца и средства гигиены.",
    children: [],
  },
  "Одноразовая посуда": {
    icon: "disposable",
    lead: "Тарелки, стаканы, приборы и расходники для сервиса.",
    children: [
      {
        name: "Стаканы",
        children: [
          { name: "Пластиковые" },
          { name: "1-слойные" },
          { name: "2-слойные" },
          { name: "3-слойные" },
          { name: "Крышки" },
        ],
      },
      { name: "Эко-посуда" },
      { name: "Тарелки, миски" },
      { name: "Столовые приборы" },
      { name: "Соусники" },
      { name: "Бокалы, фужеры, рюмки" },
      { name: "Формы алюминиевые" },
      { name: "Упаковка для фастфуда" },
      { name: "Коробки для пиццы" },
    ],
  },
  "Химия профессиональная": {
    icon: "chemistry",
    lead: "Профессиональные моющие и дезинфицирующие средства.",
    children: [],
  },
  "Канцелярские товары": {
    icon: "office",
    lead: "Канцелярия для офиса, кассы и склада.",
    children: [],
  },
  "Бумага офисная": {
    icon: "office",
    lead: "Бумага А4 и офисные расходники.",
    children: [],
  },
  "Лотки и подложки": {
    icon: "box",
    lead: "Лотки, подложки и формы для выкладки и упаковки.",
    children: [],
  },
  "Химия бытовая": {
    icon: "chemistry",
    lead: "Бытовая химия для кухни, санузлов и уборки.",
    children: [],
  },
  "Уборочный инвентарь и оборудование": {
    icon: "clean",
    lead: "Инвентарь и расходники для уборки.",
    children: [],
  },
  "Барные аксессуары и товары для сервировки": {
    icon: "disposable",
    lead: "Аксессуары для бара и сервировки стола.",
    children: [],
  },
  "Кухонные принадлежности": {
    icon: "other",
    lead: "Принадлежности для кухни и пищеблока.",
    children: [],
  },
  Пленка: {
    icon: "bags",
    lead: "Пищевая плёнка, стрейч и упаковочные плёнки.",
    children: [],
  },
  "Пакеты и сумки": {
    icon: "bags",
    lead: "Пакеты, мешки и сумки для фасовки и доставки.",
    children: [],
  },
  "Упаковочные материалы": {
    icon: "box",
    lead: "Коробки, банки и материалы для упаковки.",
    children: [],
  },
  "Товары для гостиниц, отелей и бань": {
    icon: "textile",
    lead: "Расходники и текстиль для гостиничного сервиса.",
    children: [],
  },
  "Спецодежда, обувь и средства защиты": {
    icon: "gloves",
    lead: "СИЗ, перчатки, спецодежда и защита.",
    children: [],
  },
  "Принадлежности для касс и торговли": {
    icon: "office",
    lead: "Кассовая лента и расходники для торговли.",
    children: [],
  },
  "Оборудование для туалетных комнат": {
    icon: "clean",
    lead: "Диспенсеры и расходники для санузлов.",
    children: [],
  },
  "Офисная техника и расходные материалы": {
    icon: "office",
    lead: "Расходники для офисной техники.",
    children: [],
  },
  "Продукты питания": {
    icon: "other",
    lead: "Продукты и сопутствующие позиции ассортимента.",
    children: [],
  },
  "Бытовая техника и электротовары": {
    icon: "other",
    lead: "Техника и электротовары для бизнеса.",
    children: [],
  },
  Мебель: {
    icon: "other",
    lead: "Мебель для офиса, склада и точек обслуживания.",
    children: [],
  },
  "Посуда и столовые приборы": {
    icon: "disposable",
    lead: "Посуда и приборы для сервировки.",
    children: [],
  },
  Прочее: {
    icon: "other",
    lead: "Товары вне основных групп — уточняйте у менеджера.",
    children: [],
  },
};

export function getGroupMeta(name) {
  const key = canonicalizeProductCategory(name);
  return (
    CLOVER_GROUP_META[key] || {
      icon: "other",
      lead: "Товары этой группы из номенклатуры Clover.",
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
  const needle = String(subcategory || "").trim();
  if (!needle) return null;
  return (
    getGroupChildren(category).find(
      (child) =>
        child.name.toLocaleLowerCase("ru-RU") === needle.toLocaleLowerCase("ru-RU")
    ) || null
  );
}

export function getSubgroupFacets(category, subcategory) {
  const sub = findSubgroup(category, subcategory);
  return sub?.children || [];
}

/** Есть ли у группы подгруппы — на странице группы товары не показываем, пока не выбрана подгруппа. */
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
    const ai = order.has(a) ? order.get(a) : 1000;
    const bi = order.has(b) ? order.get(b) : 1000;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b, "ru");
  });
}

/**
 * Дерево групп для навигации витрины.
 * Если categories пуст — показываем полный канонический список (как на Opticom).
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
      lead: meta.lead,
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
    products: map.get(name) || [],
    count: (map.get(name) || []).length,
    ...getGroupMeta(name),
  }));
}

/** Совпадение фильтра каталога с учётом старых имён. */
export function categoryMatchesFilter(productCategory, filterCategory) {
  const filter = canonicalizeProductCategory(filterCategory);
  const product = canonicalizeProductCategory(productCategory);
  if (!filter) return true;
  return (
    product.toLocaleLowerCase("ru-RU") === filter.toLocaleLowerCase("ru-RU")
  );
}

export function subcategoryMatchesFilter(productSubcategory, filterSubcategory) {
  const filter = String(filterSubcategory || "").trim();
  if (!filter) return true;
  const product = String(productSubcategory || "").trim();
  return (
    product.toLocaleLowerCase("ru-RU") === filter.toLocaleLowerCase("ru-RU")
  );
}

/**
 * Подгруппа/фасет по названию товара: совпадение с именами children группы
 * или с уже размеченными товарами той же категории.
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

  if (!bestSub) return { subcategory: "", facet: "" };

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
