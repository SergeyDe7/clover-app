/**
 * SEO Structured Data Wave 1 — JSON-LD builders (Organization, Product+Offer, BreadcrumbList).
 * Только фактические публичные поля. Без FAQPage / LocalBusiness / ItemList / brand / availability.
 */
import { buildStorefrontPath, categorySlug, subcategorySlug } from "./storefrontSlugs.js";
import { buildStorefrontProductDescription } from "./storefrontProductSeo.js";

export const STOREFRONT_ORIGIN = "https://clover-spb.ru";
export const ORGANIZATION_ID = `${STOREFRONT_ORIGIN}/#organization`;

const ORG_NAME = "КЛЕВЕР";
const ORG_DESCRIPTION =
  "Поставки хозтоваров, упаковки и химии для HoReCa в Санкт-Петербурге и регионах.";
const ORG_LOGO = `${STOREFRONT_ORIGIN}/apple-touch-icon.png`;

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
  return org;
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
 * Organization всегда одна; Product/Breadcrumb — только на валидных страницах.
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
