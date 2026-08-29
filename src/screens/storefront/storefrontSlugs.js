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

/** Известна ли каноническая категория (из карты slug). */
export function isKnownCategoryName(name) {
  const canon = canonicalizeProductCategory(name);
  return Boolean(canon && CATEGORY_SLUG_BY_NAME[canon]);
}

/** Сегмент URL → каноническое имя категории (slug или кириллица). */
export function resolveCategoryFromSegment(segment) {
  const raw = String(segment || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (CATEGORY_BY_SLUG[raw]) return CATEGORY_BY_SLUG[raw];
  if (CATEGORY_BY_SLUG[lower]) return CATEGORY_BY_SLUG[lower];
  const canon = canonicalizeProductCategory(raw);
  if (CATEGORY_SLUG_BY_NAME[canon]) return canon;
  return "";
}

/** Сегмент URL → имя подкатегории (только известные slug / канон). */
export function resolveSubcategoryFromSegment(segment, categoryName = "") {
  const raw = String(segment || "").trim();
  if (!raw) return "";
  let name = "";
  if (SUBCATEGORY_BY_SLUG[raw]) name = SUBCATEGORY_BY_SLUG[raw];
  else if (SUBCATEGORY_BY_SLUG[raw.toLowerCase()]) name = SUBCATEGORY_BY_SLUG[raw.toLowerCase()];
  else {
    const canon = canonicalizeProductSubcategory(raw);
    if (SUBCATEGORY_SLUG_BY_NAME[canon]) name = canon;
  }
  if (!name) return "";
  if (!categoryName) return name;
  const children = getGroupChildren(categoryName);
  if (!children.length) return "";
  const hit = children.find((child) => child.name === name);
  return hit ? name : "";
}

export function resolveFacetFromSegment(segment) {
  const raw = String(segment || "").trim();
  if (!raw) return "";
  if (!hasCyrillic(raw)) return raw;
  return canonicalizeProductSubcategory(raw) || raw;
}

/**
 * Если в пути каталога есть кириллица (старые URL) — вернуть канонический path со slug.
 * Только для известных категорий/подкатегорий. Иначе null (далее 404).
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
  if (catSeg && !category) return null;
  const subcategory = resolveSubcategoryFromSegment(subSeg, category);
  if (subSeg && !subcategory) return null;
  const facet = facetSeg ? resolveFacetFromSegment(facetSeg) : "";
  if (facetSeg && !facet) return null;

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

/**
 * Точные legacy path нового домена clover-spb.ru → канонический URL (один 301).
 * Без массового redirect неизвестных URL на главную.
 */
const LEGACY_EXACT_REDIRECTS = new Map([
  ["/каталог", "/catalog"],
  ["/vitrina", "/"],
  ["/vitrina/", "/"],
  ["/vitrina/catalog", "/catalog"],
  ["/vitrina/cart", "/cart"],
  ["/vitrina/checkout", "/checkout"],
  ["/vitrina/contacts", "/contacts"],
  ["/vitrina/install-app", "/install-app"],
  ["/vitrina/lk", "/lk"],
]);

/**
 * @returns {string | null} target path for 301, or null if no exact legacy match
 */
export function legacyPathRedirect(pathname) {
  const raw = String(pathname || "/");
  const pathOnly = raw.split("?")[0] || "/";
  let decoded = pathOnly;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    decoded = pathOnly;
  }

  for (const candidate of [pathOnly, decoded]) {
    const hit = LEGACY_EXACT_REDIRECTS.get(candidate);
    if (hit) return hit;
  }

  // /vitrina/<rest> → /<rest> (если rest не пустой); пустой уже в EXACT
  const vitrinaMatch = decoded.match(/^\/vitrina(\/.*)?$/i);
  if (vitrinaMatch) {
    const rest = vitrinaMatch[1] || "/";
    if (rest === "/" || rest === "") return "/";
    return rest;
  }

  return null;
}

/** Маршрут каталога существует в утверждённой taxonomy. */
export function isValidCatalogRoute(route) {
  if (!route || route.name !== "catalog") return false;
  if (!route.category) return true;
  if (!isKnownCategoryName(route.category)) return false;
  if (!route.subcategory) return !route.facet;
  const children = getGroupChildren(route.category);
  if (!children.length) return false;
  if (!children.some((child) => child.name === route.subcategory)) return false;
  if (!route.facet) return true;
  // facet: допускаем только если есть в дереве подкатегории
  const facets = children.find((c) => c.name === route.subcategory)?.children || [];
  if (!Array.isArray(facets) || !facets.length) return false;
  const facetName = String(route.facet || "").trim();
  return facets.some(
    (f) =>
      String(f?.name || f || "").trim() === facetName ||
      facetSlug(f?.name || f) === facetSlug(facetName)
  );
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
  if (route.name === "not-found") return "/";
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
    if (!route.code) return "/product";
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
    if (parts.length > 4) return { name: "not-found" };
    const catSeg = parts[1] ? decodeURIComponent(parts[1]) : "";
    const subSeg = parts[2] ? decodeURIComponent(parts[2]) : "";
    const facetSeg = parts[3] ? decodeURIComponent(parts[3]) : "";
    if (parts[1] && !catSeg) return { name: "not-found" };
    const category = catSeg ? resolveCategoryFromSegment(catSeg) : "";
    if (catSeg && !category) return { name: "not-found" };
    const subcategory = subSeg
      ? resolveSubcategoryFromSegment(subSeg, category)
      : "";
    if (subSeg && !subcategory) return { name: "not-found" };
    const facet = facetSeg ? resolveFacetFromSegment(facetSeg) : "";
    if (facetSeg && !facet) return { name: "not-found" };
    const route = { name: "catalog", category, subcategory, facet };
    if (!isValidCatalogRoute(route)) return { name: "not-found" };
    // сегменты должны совпасть с каноническими slug (кроме кириллицы — её ловит 301)
    if (catSeg && !hasCyrillic(catSeg) && catSeg.toLowerCase() !== categorySlug(category)) {
      return { name: "not-found" };
    }
    if (
      subSeg &&
      !hasCyrillic(subSeg) &&
      subSeg.toLowerCase() !== subcategorySlug(subcategory)
    ) {
      return { name: "not-found" };
    }
    return route;
  }
  if (parts[0] === "product") {
    if (!parts[1]) return { name: "not-found", reason: "empty-product" };
    return { name: "product", code: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "cart") return { name: "cart" };
  if (parts[0] === "checkout") return { name: "checkout" };
  if (parts[0] === "contacts") return { name: "contacts" };
  if (parts[0] === "install-app") return { name: "install-app" };
  return { name: "not-found" };
}
