/**
 * SEO Structured Data — JSON-LD builders (Organization, Product+Offer, BreadcrumbList, WebSite).
 * Только фактические публичные поля. Без FAQPage / LocalBusiness / SearchAction / brand / availability.
 */
import { buildStorefrontPath, categorySlug, subcategorySlug } from "./storefrontSlugs.js";
import { buildStorefrontProductDescription } from "./storefrontProductSeo.js";

export const STOREFRONT_ORIGIN = "https://clover-spb.ru";
export const ORGANIZATION_ID = `${STOREFRONT_ORIGIN}/#organization`;
export const WEBSITE_ID = `${STOREFRONT_ORIGIN}/#website`;

const ORG_NAME = "КЛЕВЕР";
const ORG_DESCRIPTION =
  "Поставки хозтоваров, упаковки и химии для HoReCa в Санкт-Петербурге и регионах.";
const ORG_LOGO = `${STOREFRONT_ORIGIN}/apple-touch-icon.png`;

const DAY_NAME_TO_SCHEMA = {
  понедельник: "Monday",
  вторник: "Tuesday",
  среда: "Wednesday",
  четверг: "Thursday",
  пятница: "Friday",
  суббота: "Saturday",
  воскресенье: "Sunday",
};

const WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function absUrl(pathOrUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${STOREFRONT_ORIGIN}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

/** Публичная витринная цена как в SSR (piece). */
function productUnitPrice(product) {
  const n = Number(product?.prices?.piece) || 0;
  return Number.isFinite(n) ? n : 0;
}

function normalizeTimeToken(raw) {
  const m = String(raw || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function daysBetweenInclusive(fromSchema, toSchema) {
  const a = WEEKDAY_ORDER.indexOf(fromSchema);
  const b = WEEKDAY_ORDER.indexOf(toSchema);
  if (a < 0 || b < 0 || a > b) return null;
  return WEEKDAY_ORDER.slice(a, b + 1);
}

/**
 * Строгий разбор contactHours → OpeningHoursSpecification[].
 * Поддерживает фактический формат site API:
 *   "Понедельник - Суббота с 8:00--18:00ч\\nВоскресенье - выходной"
 * @returns {{ ok: true, specs: object[] } | { ok: false, reason: string }}
 */
export function parseContactHoursToOpeningHoursSpec(contactHours) {
  const raw = String(contactHours || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return { ok: false, reason: "empty contactHours" };

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length !== 2) {
    return {
      ok: false,
      reason: `expected exactly 2 lines, got ${lines.length}: ${JSON.stringify(raw)}`,
    };
  }

  // Line 1: "Понедельник - Суббота с 8:00--18:00ч" (en-dash/em-dash/hyphen, optional spaces)
  const openRe =
    /^([А-Яа-яЁё]+)\s*[-–—]\s*([А-Яа-яЁё]+)\s+с\s+(\d{1,2}:\d{2})\s*[-–—]+\s*(\d{1,2}:\d{2})\s*ч?\.?$/i;
  const openMatch = lines[0].match(openRe);
  if (!openMatch) {
    return { ok: false, reason: `unrecognized open line: ${JSON.stringify(lines[0])}` };
  }

  const fromDay = DAY_NAME_TO_SCHEMA[openMatch[1].toLowerCase()];
  const toDay = DAY_NAME_TO_SCHEMA[openMatch[2].toLowerCase()];
  if (!fromDay || !toDay) {
    return {
      ok: false,
      reason: `unknown weekday names: ${openMatch[1]} / ${openMatch[2]}`,
    };
  }
  const openDays = daysBetweenInclusive(fromDay, toDay);
  if (!openDays || openDays.length === 0) {
    return { ok: false, reason: `invalid day range ${fromDay}–${toDay}` };
  }

  const opens = normalizeTimeToken(openMatch[3]);
  const closes = normalizeTimeToken(openMatch[4]);
  if (!opens || !closes) {
    return { ok: false, reason: `invalid time tokens in ${JSON.stringify(lines[0])}` };
  }
  if (opens >= closes) {
    return { ok: false, reason: `opens>=closes: ${opens} / ${closes}` };
  }

  // Line 2: closed day(s) — "Воскресенье - выходной"
  const closedRe = /^([А-Яа-яЁё]+)\s*[-–—]\s*выходной\.?$/i;
  const closedMatch = lines[1].match(closedRe);
  if (!closedMatch) {
    return { ok: false, reason: `unrecognized closed line: ${JSON.stringify(lines[1])}` };
  }
  const closedDay = DAY_NAME_TO_SCHEMA[closedMatch[1].toLowerCase()];
  if (!closedDay) {
    return { ok: false, reason: `unknown closed weekday: ${closedMatch[1]}` };
  }
  if (openDays.includes(closedDay)) {
    return {
      ok: false,
      reason: `closed day ${closedDay} overlaps open range`,
    };
  }

  // Выходной не объявляем рабочим: только открытые дни.
  return {
    ok: true,
    specs: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: openDays.map((d) => `https://schema.org/${d}`),
        opens,
        closes,
      },
    ],
  };
}

/** Organization из публичных полей /api/public/site (+ стабильные name/url/logo/description). */
export function buildOrganizationJsonLd(site = {}) {
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: ORG_NAME,
    url: `${STOREFRONT_ORIGIN}/`,
    logo: ORG_LOGO,
    description: ORG_DESCRIPTION,
  };
  const phone = String(site?.contactPhone || "").trim();
  const email = String(site?.contactEmail || "").trim();
  const address = String(site?.contactAddress || "").trim();
  if (phone) org.telephone = phone;
  if (email) org.email = email;
  if (address) {
    org.address = {
      "@type": "PostalAddress",
      streetAddress: address,
    };
  }

  const hoursRaw = String(site?.contactHours || "").trim();
  if (hoursRaw) {
    const parsed = parseContactHoursToOpeningHoursSpec(hoursRaw);
    if (!parsed.ok) {
      const err = new Error(
        `[storefrontJsonLd] cannot parse contactHours: ${parsed.reason}`
      );
      err.code = "CONTACT_HOURS_PARSE";
      err.contactHours = hoursRaw;
      throw err;
    }
    org.openingHoursSpecification = parsed.specs;
  }
  return org;
}

/** WebSite только для главной; без SearchAction. */
export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${STOREFRONT_ORIGIN}/`,
    name: ORG_NAME,
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/**
 * Product (+ Offer только если публичная цена > 0).
 * @returns {object | null}
 */
export function buildProductJsonLd(product) {
  if (!product?.code || !product?.name) return null;
  const path = `/product/${encodeURIComponent(product.code)}`;
  const url = `${STOREFRONT_ORIGIN}${path}`;
  const description = buildStorefrontProductDescription(product);
  const imagePath = String(product.imageUrl || "").trim();
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: String(product.name).trim(),
    sku: String(product.code).trim(),
    description: description || String(product.name).trim(),
    url,
  };
  if (imagePath) ld.image = absUrl(imagePath);

  const price = productUnitPrice(product);
  if (price > 0) {
    ld.offers = {
      "@type": "Offer",
      "@id": `${url}#offer`,
      url,
      price: price.toFixed(2),
      priceCurrency: "RUB",
      seller: { "@id": ORGANIZATION_ID },
    };
  }
  return ld;
}

function crumb(name, path) {
  return {
    name: String(name || "").trim(),
    path: path === "/" ? "/" : String(path || ""),
  };
}

/**
 * Цепочка крошек по маршруту (без выдуманных уровней).
 * @returns {{ name: string, path: string }[]}
 */
export function buildBreadcrumbTrail(route, { product } = {}) {
  if (!route) return [];
  if (route.name === "catalog") {
    const trail = [crumb("Главная", "/"), crumb("Каталог", "/catalog")];
    if (route.category) {
      trail.push(
        crumb(route.category, `/catalog/${categorySlug(route.category)}`)
      );
      if (route.subcategory) {
        trail.push(
          crumb(
            route.subcategory,
            `/catalog/${categorySlug(route.category)}/${subcategorySlug(route.subcategory)}`
          )
        );
      }
    }
    return trail;
  }
  if (route.name === "product" && product?.code) {
    const trail = [crumb("Главная", "/"), crumb("Каталог", "/catalog")];
    const category = String(product.category || "").trim();
    const subcategory = String(product.subcategory || "").trim();
    if (category) {
      trail.push(crumb(category, `/catalog/${categorySlug(category)}`));
      if (subcategory) {
        trail.push(
          crumb(
            subcategory,
            `/catalog/${categorySlug(category)}/${subcategorySlug(subcategory)}`
          )
        );
      }
    }
    trail.push(
      crumb(product.name || product.code, `/product/${encodeURIComponent(product.code)}`)
    );
    return trail;
  }
  return [];
}

/** @returns {object | null} */
export function buildBreadcrumbListJsonLd(route, { product } = {}) {
  const trail = buildBreadcrumbTrail(route, { product });
  if (trail.length < 2) return null;

  let pagePath = "/";
  if (route?.name === "product" && product?.code) {
    pagePath = `/product/${encodeURIComponent(product.code)}`;
  } else if (route?.name === "catalog") {
    pagePath = buildStorefrontPath(route);
  } else {
    return null;
  }
  const pageUrl = `${STOREFRONT_ORIGIN}${pagePath === "/" ? "/" : pagePath}`;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absUrl(item.path === "/" ? "/" : item.path),
    })),
  };
}

/**
 * Набор JSON-LD графов для SSR страницы.
 * Organization всегда одна; WebSite — только home; Product/Breadcrumb — только на валидных страницах.
 */
export function buildPageJsonLdGraphs(route, { product, site, status } = {}) {
  const graphs = [];
  const httpStatus = status || 200;

  // Organization на всех успешных витринных ответах (и на 404 без Product).
  graphs.push(buildOrganizationJsonLd(site));

  if (httpStatus === 404 || route?.name === "not-found") {
    return graphs;
  }
  if (route?.name === "cart" || route?.name === "checkout") {
    return graphs;
  }

  if (route?.name === "home") {
    graphs.push(buildWebSiteJsonLd());
    return graphs;
  }

  // BreadcrumbList: категории, подкатегории (не корень /catalog), карточки товаров
  if (route?.name === "catalog" && route.category) {
    const crumbs = buildBreadcrumbListJsonLd(route);
    if (crumbs) graphs.push(crumbs);
    return graphs;
  }

  if (route?.name === "product" && product) {
    const productLd = buildProductJsonLd(product);
    if (productLd) graphs.push(productLd);
    const crumbs = buildBreadcrumbListJsonLd(route, { product });
    if (crumbs) graphs.push(crumbs);
  }

  return graphs;
}
