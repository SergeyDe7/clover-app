/**
 * Латинские ЧПУ-slug для категорий и подкатегорий витрины.
 * Канонические русские имена — из productGroups.js.
 */
import {
  CLOVER_PRODUCT_GROUPS,
  canonicalizeProductCategory,
  canonicalizeProductSubcategory,
  getGroupChildren,
} from "./productGroups.js";

/** Категория (RU) → slug */
export const CATEGORY_SLUG_BY_NAME = {
  "Одноразовая посуда": "odnorazovaya-posuda",
  "Хозяйственные товары": "hozyajstvennye-tovary",
  "Химия, чистящие средства": "himiya-chistyashchie-sredstva",
  "Бумажная продукция": "bumazhnaya-produkciya",
  "Пакеты, упаковочные материалы": "pakety-upakovochnye-materialy",
  "Барные аксессуары": "barnye-aksessuary",
  "Канцелярские товары": "kancelyarskie-tovary",
  Прочее: "prochee",
};

/** Подкатегория (RU) → slug (глобально уникальные среди известных; «Прочее» → prochee) */
export const SUBCATEGORY_SLUG_BY_NAME = {
  Стаканы: "stakany",
  Контейнеры: "kontejnery",
  "Бумажная упаковка": "bumazhnaya-upakovka",
  Ведра: "vedra",
  "Ланч-боксы": "lanch-boksy",
  "Коробки для пиццы": "korobki-dlya-piccy",
  Соусники: "sousniki",
  "Тарелки, миски": "tarelki-miski",
  "Столовые приборы": "stolovye-pribory",
  "Для суши и лапши": "dlya-sushi-i-lapshi",
  Бутылки: "butylki",
  Лотки: "lotki",
  "Для кондитерских изделий": "dlya-konditerskih-izdelij",
  "Контейнеры под запайку": "kontejnery-pod-zapajku",
  "Формы алюминиевые": "formy-alyuminievye",
  "Фольга, пленка, пергамент": "folga-plenka-pergament",
  "Одноразовая одежда": "odnorazovaya-odezhda",
  "Тряпки, мопы, полотенца": "tryapki-mopy-polotenca",
  Перчатки: "perchatki",
  "Мешки для мусора": "meshki-dlya-musora",
  "Губки для посуды": "gubki-dlya-posudy",
  "Швабры, щетки": "shvabry-schetki",
  "Пленка под запайку": "plenka-pod-zapajku",
  Жироудалители: "zhiroudaliteli",
  "Для мытья посуды": "dlya-mytya-posudy",
  "Для окон": "dlya-okon",
  "Для полов": "dlya-polov",
  "Для сантехники": "dlya-santehniki",
  Универсальные: "universalnye",
  "Для дезинфекции": "dlya-dezinfekcii",
  Мыло: "mylo",
  Порошки: "poroshki",
  "Для посудомоечных машин": "dlya-posudomoechnyh-mashin",
  "Освежители воздуха": "osvezhiteli-vozduha",
  Отбеливатели: "otbelivateli",
  "Бумажные полотенца": "bumazhnye-polotenca",
  "Туалетная бумага": "tualetnaya-bumaga",
  Салфетки: "salfetki",
  "Пакеты-майки": "pakety-majki",
  "Пакеты фасовочные": "pakety-fasovochnye",
  "Пакеты вакуумные": "pakety-vakuumnye",
  "Бумажные пакеты с ручкой": "bumazhnye-pakety-s-ruchkoj",
  "Бумажные пакеты без ручки": "bumazhnye-pakety-bez-ruchki",
  "Пакеты zip-lock": "pakety-zip-lock",
  Прочее: "prochee",
};

const CATEGORY_BY_SLUG = Object.fromEntries(
  Object.entries(CATEGORY_SLUG_BY_NAME).map(([name, slug]) => [slug, name])
);

const SUBCATEGORY_BY_SLUG = Object.fromEntries(
  Object.entries(SUBCATEGORY_SLUG_BY_NAME).map(([name, slug]) => [slug, name])
);

const CYRILLIC_RE = /[а-яёА-ЯЁ]/u;

export function hasCyrillic(value) {
  return CYRILLIC_RE.test(String(value || ""));
}

export function slugifyStorefrontLabel(value) {
  const raw = String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е");
  if (!raw) return "";
  const map = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
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
  return raw
    .split("")
    .map((ch) => {
      if (Object.prototype.hasOwnProperty.call(map, ch)) return map[ch];
      if (/[a-z0-9]/.test(ch)) return ch;
      if (/[\s_,.;:/\\()]+/.test(ch) || ch === "-" || ch === "—") return "-";
      return "";
    })
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function categorySlug(name) {
  const canon = canonicalizeProductCategory(name);
  return CATEGORY_SLUG_BY_NAME[canon] || slugifyStorefrontLabel(canon);
}

export function subcategorySlug(name) {
  const canon = canonicalizeProductSubcategory(name);
  if (!canon) return "";
  return SUBCATEGORY_SLUG_BY_NAME[canon] || slugifyStorefrontLabel(canon);
}

export function facetSlug(name) {
  return slugifyStorefrontLabel(name);
}

/** Сегмент URL → каноническое имя категории (slug или кириллица). */
export function resolveCategoryFromSegment(segment) {
  const raw = String(segment || "").trim();
  if (!raw) return "";
  if (CATEGORY_BY_SLUG[raw]) return CATEGORY_BY_SLUG[raw];
  const canon = canonicalizeProductCategory(raw);
  if (CATEGORY_SLUG_BY_NAME[canon]) return canon;
  // неизвестный латинский slug — как есть (не ломаем URL)
  if (!hasCyrillic(raw) && CATEGORY_BY_SLUG[raw.toLowerCase()]) {
    return CATEGORY_BY_SLUG[raw.toLowerCase()];
  }
  return canon;
}

/** Сегмент URL → имя подкатегории. */
export function resolveSubcategoryFromSegment(segment, categoryName = "") {
  const raw = String(segment || "").trim();
  if (!raw) return "";
  if (SUBCATEGORY_BY_SLUG[raw]) {
    const name = SUBCATEGORY_BY_SLUG[raw];
    if (!categoryName) return name;
    const children = getGroupChildren(categoryName);
    if (!children.length) return name;
    const hit = children.find((child) => child.name === name);
    return hit ? name : name;
  }
  const canon = canonicalizeProductSubcategory(raw);
  if (SUBCATEGORY_SLUG_BY_NAME[canon]) return canon;
  if (!hasCyrillic(raw)) {
    const bySlug = SUBCATEGORY_BY_SLUG[raw.toLowerCase()];
    if (bySlug) return bySlug;
  }
  return canon;
}

export function resolveFacetFromSegment(segment) {
  const raw = String(segment || "").trim();
  if (!raw) return "";
  if (!hasCyrillic(raw)) return raw;
  return canonicalizeProductSubcategory(raw) || raw;
}

/**
 * Если в пути каталога есть кириллица (старые URL) — вернуть канонический path со slug.
 * Иначе null.
 */
export function legacyCatalogPathRedirect(pathname) {
  const path = String(pathname || "/");
  const parts = path.split("/").filter(Boolean);
  let prefix = "";
  let catalogIdx = 0;
  if (parts[0] === "vitrina") {
    prefix = "/vitrina";
    catalogIdx = 1;
  }
  if (parts[catalogIdx] !== "catalog") return null;
  const catSeg = parts[catalogIdx + 1] ? decodeURIComponent(parts[catalogIdx + 1]) : "";
  const subSeg = parts[catalogIdx + 2] ? decodeURIComponent(parts[catalogIdx + 2]) : "";
  const facetSeg = parts[catalogIdx + 3] ? decodeURIComponent(parts[catalogIdx + 3]) : "";
  if (!catSeg && !subSeg) return null;
  const needsRedirect =
    hasCyrillic(catSeg) || hasCyrillic(subSeg) || hasCyrillic(facetSeg);
  if (!needsRedirect) return null;

  const category = resolveCategoryFromSegment(catSeg);
  const subcategory = resolveSubcategoryFromSegment(subSeg, category);
  const facet = resolveFacetFromSegment(facetSeg);
  let next = `${prefix}/catalog`;
  if (category) {
    next += `/${categorySlug(category)}`;
    if (subcategory) {
      next += `/${subcategorySlug(subcategory)}`;
      if (facet) next += `/${facetSlug(facet)}`;
    }
  }
  return next;
}

/** Полный список известных slug категорий (для отчёта/тестов). */
export function listCategorySlugEntries() {
  return CLOVER_PRODUCT_GROUPS.map((name) => ({
    name,
    slug: categorySlug(name),
    children: getGroupChildren(name).map((child) => ({
      name: child.name,
      slug: subcategorySlug(child.name),
    })),
  }));
}

/** Абсолютный path витрины без /vitrina (для canonical/sitemap/SSR). */
export function buildStorefrontPath(route) {
  if (!route || route === "home" || route.name === "home") return "/";
  if (typeof route === "string") {
    return route.startsWith("/") ? route : `/${route}`;
  }
  if (route.name === "catalog") {
    if (!route.category) return "/catalog";
    let path = `/catalog/${categorySlug(route.category)}`;
    if (route.subcategory) {
      path += `/${subcategorySlug(route.subcategory)}`;
      if (route.facet) path += `/${facetSlug(route.facet)}`;
    }
    return path;
  }
  if (route.name === "product") {
    return `/product/${encodeURIComponent(route.code)}`;
  }
  if (route.name === "cart") return "/cart";
  if (route.name === "checkout") return "/checkout";
  if (route.name === "contacts") return "/contacts";
  if (route.name === "install-app") return "/install-app";
  return "/";
}

export function parseStorefrontPathname(pathname = "/") {
  const raw = String(pathname || "/");
  const withoutPreview =
    raw === "/vitrina" || raw === "/vitrina/"
      ? "/"
      : raw.startsWith("/vitrina/")
        ? raw.slice("/vitrina".length) || "/"
        : raw;
  const parts = withoutPreview.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "catalog") {
    const category = parts[1]
      ? resolveCategoryFromSegment(decodeURIComponent(parts[1]))
      : "";
    const subcategory = parts[2]
      ? resolveSubcategoryFromSegment(decodeURIComponent(parts[2]), category)
      : "";
    const facet = parts[3]
      ? resolveFacetFromSegment(decodeURIComponent(parts[3]))
      : "";
    return { name: "catalog", category, subcategory, facet };
  }
  if (parts[0] === "product" && parts[1]) {
    return { name: "product", code: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "cart") return { name: "cart" };
  if (parts[0] === "checkout") return { name: "checkout" };
  if (parts[0] === "contacts") return { name: "contacts" };
  if (parts[0] === "install-app") return { name: "install-app" };
  return { name: "home" };
}
