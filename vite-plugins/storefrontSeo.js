/**
 * Vite preview/dev middleware:
 * - 301 кириллических /catalog/... → латинские slug
 * - динамический sitemap.xml
 * - пререндер HTML витрины (title/description/canonical/H1/контент) для ботов и первого ответа
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const API_BASE = process.env.CLOVER_API_BASE || "http://127.0.0.1:4100";
const ORIGIN = "https://clover-spb.ru";

let catalogCache = { at: 0, products: null };
let siteCache = { at: 0, site: null };
const CATALOG_TTL_MS = 60_000;
const SITE_TTL_MS = 60_000;

async function loadSeoModules(root) {
  const slugsUrl = pathToFileURL(
    path.join(root, "src/screens/storefront/storefrontSlugs.js")
  ).href;
  const prerenderUrl = pathToFileURL(
    path.join(root, "src/screens/storefront/seoPrerender.js")
  ).href;
  const [slugs, prerender] = await Promise.all([
    import(slugsUrl),
    import(prerenderUrl),
  ]);
  return { slugs, prerender };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function getAllStorefrontProducts() {
  const now = Date.now();
  if (catalogCache.products && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.products;
  }
  const data = await fetchJson(`${API_BASE}/api/public/catalog`);
  const products = Array.isArray(data?.products) ? data.products : [];
  catalogCache = { at: now, products };
  return products;
}

async function getPublicSite() {
  const now = Date.now();
  if (siteCache.site && now - siteCache.at < SITE_TTL_MS) {
    return siteCache.site;
  }
  try {
    const data = await fetchJson(`${API_BASE}/api/public/site`);
    const site = data?.site && typeof data.site === "object" ? data.site : data || {};
    siteCache = { at: now, site };
    return site;
  } catch {
    return siteCache.site || {};
  }
}

function readIndexHtml(root, isPreview) {
  const candidates = isPreview
    ? [path.join(root, "dist/index.html"), path.join(root, "index.html")]
    : [path.join(root, "index.html"), path.join(root, "dist/index.html")];
  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  return null;
}

function isStorefrontRequest(req, urlPath) {
  if (
    !urlPath ||
    urlPath.startsWith("/api/") ||
    urlPath.startsWith("/assets/") ||
    urlPath.startsWith("/fonts/") ||
    urlPath.startsWith("/uploads/") ||
    urlPath.startsWith("/storefront/") ||
    urlPath === "/sw.js" ||
    urlPath === "/manifest.webmanifest" ||
    urlPath === "/robots.txt" ||
    urlPath === "/lk" ||
    urlPath.startsWith("/lk/")
  ) {
    return false;
  }
  // Реальная статика с расширением — не пререндерим. .php/.asp и т.п. → 404 ниже.
  if (
    /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|woff2?|ttf|txt|xml|webmanifest)$/i.test(
      urlPath
    ) &&
    urlPath !== "/sitemap.xml"
  ) {
    return false;
  }

  const host = String(req.headers.host || "")
    .split(":")[0]
    .replace(/^www\./i, "")
    .toLowerCase();
  if (host === "clover-spb.ru") return true;
  if (urlPath === "/vitrina" || urlPath.startsWith("/vitrina/")) return true;
  if (
    urlPath === "/catalog" ||
    urlPath.startsWith("/catalog/") ||
    urlPath === "/product" ||
    urlPath.startsWith("/product/") ||
    urlPath === "/cart" ||
    urlPath === "/checkout" ||
    urlPath === "/contacts" ||
    urlPath === "/install-app"
  ) {
    return true;
  }
  // Unknown HTML paths still go through SEO middleware (for 404 / legacy redirects)
  if (!urlPath.startsWith("/api") && !urlPath.startsWith("/uploads")) {
    return host === "clover-spb.ru";
  }
  return false;
}


function stripPreview(urlPath) {
  if (urlPath === "/vitrina" || urlPath === "/vitrina/") return "/";
  if (urlPath.startsWith("/vitrina/")) return urlPath.slice("/vitrina".length) || "/";
  return urlPath;
}

export function cloverStorefrontSeo() {
  return {
    name: "clover-storefront-seo",
    configureServer(server) {
      attach(server, false);
    },
    configurePreviewServer(server) {
      attach(server, true);
    },
  };

  function attach(server, isPreview) {
    server.middlewares.use(async (req, res, next) => {
      try {
        const rawUrl = String(req.url || "/");
        const urlPath = rawUrl.split("?")[0];
        if (req.method !== "GET" && req.method !== "HEAD") {
          next();
          return;
        }

        // www → apex (один 301), на случай если nginx ещё не разделён
        const reqHost = String(req.headers.host || "")
          .split(":")[0]
          .toLowerCase();
        if (reqHost === "www.clover-spb.ru") {
          const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";
          res.statusCode = 301;
          res.setHeader("Location", `${ORIGIN}${urlPath}${query}`);
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.end();
          return;
        }

        if (urlPath === "/robots.txt") {
          next();
          return;
        }

        const root = server.config.root;
        const { slugs, prerender } = await loadSeoModules(root);

        if (urlPath === "/sitemap.xml") {
          const products = await getAllStorefrontProducts();
          const { xml } = prerender.buildSitemapXml({ products });
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/xml; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=300");
          res.end(xml);
          return;
        }

        if (!isStorefrontRequest(req, urlPath)) {
          next();
          return;
        }

        if (urlPath === "/lk" || urlPath.startsWith("/lk/")) {
          next();
          return;
        }

        if (/\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|woff2?|ttf|txt|xml|webmanifest)$/i.test(urlPath)) {
          next();
          return;
        }

        const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";

        // Legacy exact + /vitrina/* → канон; кириллический catalog → slug (один hop)
        const legacyExact = slugs.legacyPathRedirect(urlPath);
        let redirectCandidate = legacyExact || urlPath;
        const cyrillicTarget = slugs.legacyCatalogPathRedirect(redirectCandidate);
        if (cyrillicTarget) redirectCandidate = cyrillicTarget;
        if (!legacyExact) {
          const cyrillicOnly = slugs.legacyCatalogPathRedirect(urlPath);
          if (cyrillicOnly) redirectCandidate = cyrillicOnly;
        }
        if (redirectCandidate && redirectCandidate !== urlPath) {
          res.statusCode = 301;
          res.setHeader("Location", `${redirectCandidate}${query}`);
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.end();
          return;
        }

        const logicalPath = stripPreview(urlPath);
        const route = slugs.parseStorefrontPathname(logicalPath);
        const indexHtml = readIndexHtml(root, isPreview);
        if (!indexHtml) {
          next();
          return;
        }

        let products = [];
        let product = null;
        let categories = [];
        let status = 200;

        if (route.name === "not-found") {
          status = 404;
        } else if (route.name === "catalog" || route.name === "home") {
          try {
            const qs = new URLSearchParams();
            if (route.category) qs.set("category", route.category);
            if (route.subcategory) qs.set("subcategory", route.subcategory);
            if (route.facet) qs.set("facet", route.facet);
            const data = await fetchJson(
              `${API_BASE}/api/public/catalog${qs.toString() ? `?${qs}` : ""}`
            );
            products = Array.isArray(data?.products) ? data.products : [];
            categories = Array.isArray(data?.categories) ? data.categories : [];
          } catch {
            products = [];
          }
        } else if (route.name === "product") {
          try {
            const data = await fetchJson(
              `${API_BASE}/api/public/catalog/${encodeURIComponent(route.code)}`
            );
            product = data?.product || null;
            if (!product) status = 404;
          } catch (err) {
            status = err.status === 404 ? 404 : 200;
            product = null;
          }
        }

        const built = prerender.buildPrerenderBody(route, {
          product,
          products,
          categories,
        });
        if (built.status) status = built.status;

        if (built.meta && status !== 404) {
          const pathForCanon =
            route.name === "home" ? "/" : buildCanonicalPath(route, slugs);
          built.meta.path = pathForCanon;
          built.meta.canonical = `${ORIGIN}${pathForCanon === "/" ? "/" : pathForCanon}`;
        }
        if (built.meta && status === 404) {
          built.meta.canonical = null;
          built.meta.robots = built.meta.robots || "noindex, follow";
        }

        const site = await getPublicSite();
        const jsonLd = prerender.buildPageJsonLdGraphs(route, {
          product,
          site,
          status,
        });

        const injected = prerender.injectPrerenderIntoHtml(indexHtml, {
          meta: built.meta,
          html: built.html,
          status,
          jsonLd,
        });

        res.statusCode = injected.status || status;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.end(injected.html);
      } catch (error) {
        console.error("[clover-storefront-seo]", error);
        next();
      }
    });
  }
}

function buildCanonicalPath(route, slugs) {
  return slugs.buildStorefrontPath(route);
}
