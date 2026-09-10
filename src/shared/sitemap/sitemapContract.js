/**
 * SEO-001 sitemap contract — pure, browser-safe, no Node/DB imports.
 */
import {
  canonicalizeProductCategory,
  canonicalizeProductSubcategory,
} from "../../screens/storefront/productGroups.js";

export const SITEMAP_ORIGIN = "https://clover-spb.ru";

/** Static public paths that must appear in the sitemap (leading slash). */
export const SITEMAP_STATIC_PATHS = Object.freeze([
  "/",
  "/catalog",
  "/contacts",
  "/aktsii",
  "/about",
  "/delivery",
  "/payment",
  "/returns",
  "/wholesale",
  "/privacy-policy",
  "/personal-data-consent",
]);

/** Paths that must never appear (prefix or exact). */
export const SITEMAP_FORBIDDEN_PATH_PREFIXES = Object.freeze([
  "/lk",
  "/vitrina/lk",
  "/api",
  "/auth",
  "/cart",
  "/checkout",
  "/admin",
  "/manager",
  "/install-app",
  "/en",
  "/uz",
  "/ky",
  "/tg",
  "/zh",
  "/ar",
]);

export const SITEMAP_FORBIDDEN_HOSTS = Object.freeze([
  "localhost",
  "127.0.0.1",
  "cloverspb.ru",
  "www.cloverspb.ru",
]);

/**
 * Build a storefront absolute URL for sitemap (production host, no /vitrina prefix).
 * Mirrors storefrontHref path encoding without window/host branching.
 */
export function sitemapStorefrontPath(route) {
  if (!route || route === "home" || route.name === "home") return "/";
  if (typeof route === "string") {
    return route.startsWith("/") ? route : `/${route}`;
  }
  if (route.name === "catalog") {
    if (!route.category) return "/catalog";
    let path = `/catalog/${encodeURIComponent(route.category)}`;
    if (route.subcategory) {
      path += `/${encodeURIComponent(route.subcategory)}`;
    }
    return path;
  }
  if (route.name === "product") {
    return `/product/${encodeURIComponent(route.code)}`;
  }
  if (route.name === "contacts") return "/contacts";
  if (route.name === "aktsii") return "/aktsii";
  if (route.name === "info" && route.slug) return `/${route.slug}`;
  return "/";
}

export function toAbsoluteSitemapUrl(path) {
  const normalized = path === "/" ? "/" : String(path || "/");
  if (normalized === "/") return `${SITEMAP_ORIGIN}/`;
  return `${SITEMAP_ORIGIN}${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
}

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Shared public-storefront eligibility (active / showOnStorefront / linked).
 * Used by sitemap + listStorefrontProducts — keep one implementation.
 */
export function passesPublicStorefrontEligibility(
  product,
  { storefrontShowOnlyLinked = true } = {}
) {
  if (!product || product.active === false) return false;
  if (product.showOnStorefront !== true) return false;
  if (storefrontShowOnlyLinked && !String(product.oneCId || "").trim()) {
    return false;
  }
  return true;
}

/**
 * Resolve public storefront product code — same rules as storefrontPublic.toPublicProduct.
 * @param {object|null} [oneCItem] optional linked 1C catalog row (code fallback)
 */
export function resolvePublicProductCode(product, oneCItem = null) {
  const cloverCode = String(product?.code || "").trim();
  const oneCCode = String(product?.oneCCode || oneCItem?.code || "").trim();
  return (
    oneCCode ||
    (/^cl-\d+$/i.test(cloverCode) ? "" : cloverCode) ||
    (product?.id != null && String(product.id).trim() !== ""
      ? `id-${product.id}`
      : "")
  );
}

/**
 * Pure public-index filter matching listStorefrontProducts eligibility
 * (without prices / localization).
 * @param {Map<string, object>|Record<string, object>|null} [oneCById]
 */
export function listPublicSitemapProducts(
  products,
  { storefrontShowOnlyLinked = true, oneCById = null } = {}
) {
  const list = Array.isArray(products) ? products : [];
  const out = [];
  const seenCodes = new Set();
  const lookup =
    oneCById instanceof Map
      ? oneCById
      : oneCById && typeof oneCById === "object"
        ? new Map(Object.entries(oneCById))
        : null;

  for (const product of list) {
    if (!passesPublicStorefrontEligibility(product, { storefrontShowOnlyLinked })) {
      continue;
    }
    const oneCItem = lookup
      ? lookup.get(String(product.oneCId || "")) || null
      : null;
    const cloverName = String(product.name || "").trim();
    const oneCName = String(
      oneCItem?.name || product.oneCName || ""
    ).trim();
    const name = cloverName || oneCName;
    if (!name) continue;

    const code = resolvePublicProductCode(product, oneCItem);
    if (!code) continue;
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const category = canonicalizeProductCategory(
      String(product.category || "Прочее").trim() || "Прочее"
    );
    const subcategory = canonicalizeProductSubcategory(
      String(product.subcategory || "").trim()
    );
    out.push({
      code,
      category,
      subcategory,
      name,
      id: product.id,
    });
  }
  return out;
}

/**
 * Derive indexable taxonomy + product locs from public sitemap products.
 * - categories: distinct categories with ≥1 public product
 * - subcategories: distinct category+subcategory pairs with ≥1 public product
 *   (includes data-only names that actually have products)
 * - empty registry children are NOT added here
 */
export function collectSitemapIndexSets(publicProducts) {
  const categories = new Set();
  const subcategoryKeys = new Map(); // key -> { category, subcategory }
  const productCodes = [];

  for (const product of publicProducts) {
    const category = String(product.category || "").trim();
    if (!category) continue;
    categories.add(category);

    const subcategory = String(product.subcategory || "").trim();
    if (subcategory) {
      const key = `${category}\0${subcategory}`;
      if (!subcategoryKeys.has(key)) {
        subcategoryKeys.set(key, { category, subcategory });
      }
    }
    productCodes.push(product.code);
  }

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b, "ru")),
    subcategories: [...subcategoryKeys.values()].sort((a, b) => {
      const c = a.category.localeCompare(b.category, "ru");
      if (c !== 0) return c;
      return a.subcategory.localeCompare(b.subcategory, "ru");
    }),
    // Deterministic product order (independent of storefront display sort).
    productCodes: [...productCodes].sort((a, b) => a.localeCompare(b, "ru")),
  };
}

export function buildSitemapEntries({
  staticPaths = SITEMAP_STATIC_PATHS,
  categories = [],
  subcategories = [],
  productCodes = [],
} = {}) {
  const paths = [];

  for (const staticPath of staticPaths) {
    paths.push(staticPath);
  }
  for (const category of categories) {
    paths.push(
      sitemapStorefrontPath({ name: "catalog", category: String(category) })
    );
  }
  for (const entry of subcategories) {
    paths.push(
      sitemapStorefrontPath({
        name: "catalog",
        category: String(entry.category),
        subcategory: String(entry.subcategory),
      })
    );
  }
  for (const code of productCodes) {
    paths.push(sitemapStorefrontPath({ name: "product", code: String(code) }));
  }

  const locs = [];
  const seen = new Set();
  for (const path of paths) {
    const loc = toAbsoluteSitemapUrl(path);
    if (seen.has(loc)) continue;
    seen.add(loc);
    locs.push(loc);
  }
  return locs;
}

/** Render sitemap XML. Omits lastmod/priority/changefreq (no trusted timestamps). */
export function renderSitemapXml(locs) {
  const urls = (Array.isArray(locs) ? locs : [])
    .map(
      (loc) => `  <url>
    <loc>${escapeXml(loc)}</loc>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function isForbiddenSitemapUrl(loc) {
  let url;
  try {
    url = new URL(String(loc));
  } catch {
    return true;
  }
  if (url.protocol !== "https:") return true;
  if (url.hostname !== "clover-spb.ru") return true;
  if (url.search || url.hash) return true;
  const path = url.pathname || "/";
  if (path !== "/" && path.endsWith("/")) {
    // allow only exact root trailing style we generate; reject other trailing-slash variants as odd
  }
  for (const prefix of SITEMAP_FORBIDDEN_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}
