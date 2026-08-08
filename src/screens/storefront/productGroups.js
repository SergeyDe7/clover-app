/**
 * Группы товаров Clover — те же названия, что в ЛК / правилах категорий.
 * Порядок как в CATEGORY_KEYWORD_RULES (appHelpers / oneCProducts).
 */
export const CLOVER_PRODUCT_GROUPS = [
  "Перчатки",
  "Пакеты и пленка",
  "Уборка",
  "Упаковка",
  "Одноразовая продукция",
  "Канцтовары",
  "Бытовая химия",
  "Текстиль",
];

export function sortCloverProductGroups(names) {
  const order = new Map(CLOVER_PRODUCT_GROUPS.map((name, index) => [name, index]));
  const unique = [
    ...new Set(
      (Array.isArray(names) ? names : [])
        .map((name) => String(name || "").trim())
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

export function groupProductsByCloverGroup(products) {
  const map = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const name = String(product?.category || "Прочее").trim() || "Прочее";
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(product);
  }
  return sortCloverProductGroups([...map.keys()]).map((name) => ({
    name,
    products: map.get(name) || [],
    count: (map.get(name) || []).length,
  }));
}
