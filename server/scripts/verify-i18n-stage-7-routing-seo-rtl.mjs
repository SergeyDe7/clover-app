import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  PUBLIC_LOCALE_CODES,
  TARGET_INTERNAL_LOCALES,
  canonicalizeLocale,
} from "../../src/shared/i18n/languageRegistry.js";
import {
  equivalentPublicLocaleHref,
  isIndexablePublicSearch,
  publicAlternateLinks,
  publicDocumentPath,
  publicPathForLocale,
  resolvePublicUrlLocale,
  stripPublicLocalePrefix,
  unprefixedPublicPath,
} from "../../src/shared/i18n/publicLocaleRouting.js";
import { resolveLocale } from "../../src/shared/i18n/languageResolver.js";
import { listSeoCatalogEntries } from "../../src/shared/i18n/seoCatalog.js";
import { listInfoPageCatalogEntries } from "../../src/shared/i18n/infoPageCatalog.js";
import { listCategoryCatalogEntries } from "../../src/shared/i18n/categoryCatalog.js";
import { sourceHash } from "../../src/shared/i18n/sourceHash.js";
import {
  renderPublicRouteHtml,
  resolvePublicRouteRequest,
} from "../../src/shared/sitemap/publicRouteHtml.js";
import { isForbiddenSitemapUrl } from "../../src/shared/sitemap/sitemapContract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const productionData = path.resolve("/opt/clover/clover-app/server/data");
const temp = mkdtempSync(path.join(tmpdir(), "clover-stage7-"));
const dbPath = path.join(temp, "fixture.sqlite");
const outDir = path.join(temp, "dist");

assert.equal(path.resolve(dbPath).startsWith(productionData), false);

function cleanup() {
  rmSync(temp, { recursive: true, force: true });
}
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) =>
        error ? reject(error) : resolve(address.port)
      );
    });
  });
}

function insertAppState(db, key, value) {
  db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)").run(
    key,
    JSON.stringify(value)
  );
}

function seedFixtureDatabase() {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE app_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
    CREATE TABLE translation_entries (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_key TEXT NOT NULL,
      source_ru TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      critical INTEGER NOT NULL
    );
    CREATE TABLE translation_values (
      entry_id TEXT NOT NULL,
      language_code TEXT NOT NULL,
      value TEXT NOT NULL,
      state TEXT NOT NULL,
      source_hash TEXT NOT NULL
    );
    CREATE TABLE product_translations (
      product_id TEXT NOT NULL,
      language_code TEXT NOT NULL,
      field_key TEXT NOT NULL,
      auto_value TEXT NOT NULL,
      auto_source_hash TEXT NOT NULL,
      manual_value TEXT NOT NULL,
      manual_source_hash TEXT NOT NULL
    );
  `);

  const product = {
    id: "product-7",
    code: "SKU-7",
    oneCId: "onec-7",
    oneCCode: "SKU-7",
    name: "Стакан тестовый",
    active: true,
    showOnStorefront: true,
    category: "Одноразовая посуда",
    subcategory: "Стаканы",
    storefrontDetails: {
      description: "Описание тестового стакана",
      composition: "",
      characteristics: "",
    },
  };
  insertAppState(db, "products", [product]);
  insertAppState(db, "oneCProducts", [
    { id: "onec-7", code: "SKU-7", name: product.name },
  ]);
  insertAppState(db, "settings", {
    storefrontShowOnlyLinked: true,
    storefrontInfoPages: {},
  });
  insertAppState(db, "localizationSettings", {
    enabledLanguages: PUBLIC_LOCALE_CODES,
    catalogVersion: 700,
  });

  const catalogs = [
    ...listSeoCatalogEntries(),
    ...listInfoPageCatalogEntries(),
    ...listCategoryCatalogEntries(),
  ];
  const insertEntry = db.prepare(
    `INSERT INTO translation_entries(
       id, namespace, entity_type, entity_id, field_key, source_ru, source_hash, critical
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const insertValue = db.prepare(
    `INSERT INTO translation_values(
       entry_id, language_code, value, state, source_hash
     ) VALUES (?, ?, ?, 'MANUAL', ?)`
  );
  catalogs.forEach((entry, index) => {
    const id = `entry-${index}`;
    const hash = sourceHash(entry.sourceRu);
    insertEntry.run(
      id,
      entry.namespace,
      entry.entityType || "",
      entry.entityId || "",
      entry.fieldKey,
      entry.sourceRu,
      hash
    );
    for (const internal of TARGET_INTERNAL_LOCALES) {
      const publicCode = internal === "zh-CN" ? "zh" : internal;
      const translated =
        entry.entityId === "catalog" && entry.fieldKey === "title"
          ? `${publicCode.toUpperCase()} Catalog`
          : `${publicCode.toUpperCase()} ${entry.sourceRu}`;
      insertValue.run(id, internal, translated, hash);
    }
  });

  const insertProduct = db.prepare(
    `INSERT INTO product_translations(
       product_id, language_code, field_key, auto_value, auto_source_hash,
       manual_value, manual_source_hash
     ) VALUES (?, ?, 'name', ?, ?, '', '')`
  );
  const nameHash = sourceHash(product.name);
  for (const internal of TARGET_INTERNAL_LOCALES) {
    const publicCode = internal === "zh-CN" ? "zh" : internal;
    insertProduct.run(
      product.id,
      internal,
      `${publicCode.toUpperCase()} Test Cup`,
      nameHash
    );
  }
  db.close();
}

function minimalEnvironment(extra = {}) {
  return {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: temp,
    NODE_ENV: "test",
    NO_PROXY: "*",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
    DB_PATH: dbPath,
    SITEMAP_OUT: path.join(outDir, "sitemap.xml"),
    ...extra,
  };
}

function run(command, args, env = minimalEnvironment()) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`
  );
  return result;
}

function attribute(tag, name) {
  const match = String(tag).match(
    new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i")
  );
  return match ? match[1] ?? match[2] : "";
}

function parseHead(html) {
  const head = String(html).match(/<head>([\s\S]*?)<\/head>/i)?.[1] || "";
  const htmlTag = String(html).match(/<html\b[^>]*>/i)?.[0] || "";
  const title = head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  return {
    lang: attribute(htmlTag, "lang"),
    dir: attribute(htmlTag, "dir"),
    title,
    canonical: links
      .filter((tag) => attribute(tag, "rel") === "canonical")
      .map((tag) => attribute(tag, "href")),
    alternates: links
      .filter((tag) => attribute(tag, "rel") === "alternate")
      .map((tag) => ({
        hreflang: attribute(tag, "hreflang"),
        href: attribute(tag, "href"),
      })),
    robots: metas
      .filter((tag) => attribute(tag, "name") === "robots")
      .map((tag) => attribute(tag, "content")),
    ogLocale: metas
      .filter((tag) => attribute(tag, "property") === "og:locale")
      .map((tag) => attribute(tag, "content")),
  };
}

function parseSitemap(xml) {
  return [...String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => {
    const block = match[1];
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] || "";
    const alternates = [...block.matchAll(/<xhtml:link\b[^>]*\/>/g)].map(
      (item) => ({
        hreflang: attribute(item[0], "hreflang"),
        href: attribute(item[0], "href"),
      })
    );
    return { loc, alternates };
  });
}

// Pure URL contract: every public canonical path is locale-prefixed, including RU.
// Unprefixed aliases remain successful Russian renderers, not canonicals.
for (const code of PUBLIC_LOCALE_CODES) {
  const path = publicPathForLocale("/catalog/Категория", code);
  assert.ok(path.startsWith(`/${code}/`));
  const parsed = resolvePublicUrlLocale({
    pathname: path,
    enabledLanguages: PUBLIC_LOCALE_CODES,
    infrastructureEnabled: true,
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.effectiveLocale, code);
}
assert.equal(publicPathForLocale("/", "ru"), "/ru/");
assert.equal(publicPathForLocale("/", "en"), "/en/");
assert.equal(publicPathForLocale("/catalog", "ru"), "/ru/catalog");
assert.notEqual(publicPathForLocale("/catalog", "ru"), "/catalog");
assert.equal(
  equivalentPublicLocaleHref({
    pathname: "/en/catalog",
    locale: "ru",
    enabledLanguages: PUBLIC_LOCALE_CODES,
    infrastructureEnabled: true,
  }),
  "/ru/catalog"
);
assert.equal(
  equivalentPublicLocaleHref({
    pathname: "/catalog",
    locale: "en",
    enabledLanguages: PUBLIC_LOCALE_CODES,
    infrastructureEnabled: true,
  }),
  "/en/catalog"
);
assert.equal(canonicalizeLocale("zh"), "zh-CN");
assert.equal(
  resolveLocale({
    surface: "storefront",
    urlPrefix: "en",
    preferredLanguage: "ar",
    enabledLanguages: PUBLIC_LOCALE_CODES,
    publicLocaleInfrastructureEnabled: true,
  }),
  "en"
);
assert.equal(
  resolveLocale({
    surface: "storefront",
    preferredLanguage: "ar",
    enabledLanguages: PUBLIC_LOCALE_CODES,
    publicLocaleInfrastructureEnabled: true,
  }),
  "ru"
);
assert.equal(
  resolveLocale({
    surface: "cabinet",
    preferredLanguage: "ar",
    enabledLanguages: PUBLIC_LOCALE_CODES,
    publicLocaleInfrastructureEnabled: true,
  }),
  "ar"
);
assert.equal(
  equivalentPublicLocaleHref({
    pathname: "/en/product/SKU-7",
    search: "?utm_source=test",
    hash: "#details",
    locale: "ar",
    enabledLanguages: PUBLIC_LOCALE_CODES,
    infrastructureEnabled: true,
  }),
  "/ar/product/SKU-7?utm_source=test#details"
);
assert.equal(
  equivalentPublicLocaleHref({
    pathname: "/lk/orders",
    locale: "en",
    enabledLanguages: PUBLIC_LOCALE_CODES,
    infrastructureEnabled: true,
  }),
  ""
);
assert.equal(
  stripPublicLocalePrefix("/en/en/catalog", {
    infrastructureEnabled: true,
  }).ok,
  false
);
assert.equal(isIndexablePublicSearch("?utm_source=test&gclid=1"), true);
assert.equal(isIndexablePublicSearch("?q=cup"), false);
for (const name of ["cart", "checkout", "install-app"]) {
  assert.equal(
    publicDocumentPath({
      pathname: `/${name}`,
      locale: "ru",
      infrastructureEnabled: true,
      localeEligible: false,
    }),
    `/${name}`
  );
}
assert.equal(
  publicDocumentPath({
    pathname: "/catalog",
    locale: "ru",
    infrastructureEnabled: true,
    localeEligible: true,
  }),
  "/ru/catalog"
);
const seoSrc = readFileSync(
  path.join(root, "src/screens/storefront/seo.js"),
  "utf8"
);
assert.match(seoSrc, /publicDocumentPath\(/);
assert.match(seoSrc, /route\.name === "install-app"/);
assert.match(seoSrc, /localeEligible: eligible/);
assert.match(
  seoSrc,
  /organizationDescription:\s*site\?\.seo\?\.home\?\.description/
);
const productPageSrc = readFileSync(
  path.join(root, "src/screens/storefront/pages/ProductPage.jsx"),
  "utf8"
);
assert.match(productPageSrc, /organizationDescription:/);
assert.match(
  productPageSrc,
  /site\?\.seo\?\.home\?\.description \|\| STOREFRONT_DEFAULT_DESCRIPTION/
);

seedFixtureDatabase();
const viteBin = path.join(root, "node_modules/vite/bin/vite.js");
run(process.execPath, [viteBin, "build", "--outDir", outDir, "--emptyOutDir"]);
run(process.execPath, [path.join(root, "server/scripts/generate-sitemap.mjs")]);
const disabledSitemapOut = path.join(temp, "disabled-sitemap.xml");
const disabledManifestOut = path.join(temp, "disabled-manifest.json");
run(
  process.execPath,
  [path.join(root, "server/scripts/generate-sitemap.mjs")],
  minimalEnvironment({
    CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "0",
    SITEMAP_OUT: disabledSitemapOut,
    PUBLIC_ROUTE_MANIFEST_OUT: disabledManifestOut,
  })
);
const disabledSitemap = parseSitemap(readFileSync(disabledSitemapOut, "utf8"));
assert.equal(
  disabledSitemap.some((entry) => entry.loc === "https://clover-spb.ru/"),
  true
);
assert.equal(
  disabledSitemap.some((entry) => /https:\/\/clover-spb\.ru\/(?:ru|en|uz|ky|tg|zh|ar)(?:\/|$)/.test(entry.loc)),
  false
);
assert.equal(
  readFileSync(path.join(outDir, "index.html"), "utf8").includes(
    'name="clover-public-locale-routes"'
  ) &&
    readFileSync(path.join(outDir, "index.html"), "utf8").includes(
      'content="enabled"'
    ),
  true
);

const manifest = JSON.parse(
  readFileSync(path.join(outDir, "public-route-manifest.json"), "utf8")
);
assert.equal(manifest.infrastructureEnabled, true);
assert.deepEqual(manifest.enabledLanguages, PUBLIC_LOCALE_CODES);
assert.equal(Object.hasOwn(manifest.routes, "/"), false);
assert.equal(Object.hasOwn(manifest.routes, "/catalog"), false);
assert.equal(Object.hasOwn(manifest.routes, "/ru/"), true);
assert.equal(Object.hasOwn(manifest.routes, "/ru/catalog"), true);
assert.equal(Object.hasOwn(manifest.routes, "/en/product/SKU-7"), true);
assert.equal(Object.hasOwn(manifest.routes, "/zh/about"), true);
assert.equal(Object.hasOwn(manifest.routes, "/ar/catalog"), true);
assert.equal(Object.hasOwn(manifest.routes, "/lk"), false);
assert.equal(manifest.routes["/ru/"].canonical, "https://clover-spb.ru/ru/");
assert.equal(manifest.routes["/ru/catalog"].canonical, "https://clover-spb.ru/ru/catalog");
assert.equal(
  manifest.routes["/zh/about"].alternates.find(
    (item) => item.hreflang === "zh-CN"
  )?.href,
  "https://clover-spb.ru/zh/about"
);
assert.equal(
  manifest.routes["/en/about"].alternates.find(
    (item) => item.hreflang === "x-default"
  )?.href,
  "https://clover-spb.ru/ru/about"
);
assert.equal(
  resolvePublicRouteRequest(manifest, "/ru/catalog").action,
  "render"
);
assert.equal(
  resolvePublicRouteRequest(manifest, "/catalog").action,
  "render"
);
assert.notEqual(
  resolvePublicRouteRequest(manifest, "/ru/catalog").action,
  "redirect"
);
assert.notEqual(
  resolvePublicRouteRequest(manifest, "/catalog").action,
  "redirect"
);
assert.equal(
  resolvePublicRouteRequest(manifest, "/catalog").record.canonical,
  "https://clover-spb.ru/ru/catalog"
);
assert.equal(
  resolvePublicRouteRequest(manifest, "/ru/catalog").record.canonical,
  "https://clover-spb.ru/ru/catalog"
);

const disabledManifest = {
  ...manifest,
  enabledLanguages: ["ru", "en"],
  routes: Object.fromEntries(
    Object.entries(manifest.routes).filter(([, record]) =>
      ["ru", "en"].includes(record.locale)
    )
  ),
};
assert.deepEqual(
  resolvePublicRouteRequest(disabledManifest, "/ar/catalog"),
  { action: "error", status: 404, reason: "unknown-or-unpublished" }
);
assert.deepEqual(resolvePublicRouteRequest({ infrastructureEnabled: false }, "/en"), {
  action: "pass",
});

const baseHtml = readFileSync(path.join(outDir, "index.html"), "utf8");
const escaped = renderPublicRouteHtml(baseHtml, {
  ...manifest.routes["/en/"],
  title: `Unsafe <script>alert("x")</script>`,
});
assert.doesNotMatch(parseHead(escaped).title, /<script>/i);
assert.match(parseHead(escaped).title, /&lt;script&gt;/);

const sitemap = readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
const sitemapUrls = parseSitemap(sitemap);
assert.ok(sitemapUrls.length > 0);
assert.equal(new Set(sitemapUrls.map((entry) => entry.loc)).size, sitemapUrls.length);
assert.equal(sitemapUrls.some((entry) => entry.loc === "https://clover-spb.ru/"), false);
assert.equal(sitemapUrls.some((entry) => entry.loc === "https://clover-spb.ru/catalog"), false);
assert.equal(sitemapUrls.some((entry) => entry.loc === "https://clover-spb.ru/ru/"), true);
assert.equal(sitemapUrls.some((entry) => entry.loc === "https://clover-spb.ru/ru/catalog"), true);
assert.equal(sitemapUrls.some((entry) => /\/(?:lk|api)(?:\/|$)/.test(entry.loc)), false);
for (const entry of sitemapUrls) {
  assert.equal(isForbiddenSitemapUrl(entry.loc, { allowLocalePrefixes: true }), false);
  assert.deepEqual(
    entry.alternates,
    publicAlternateLinks(
      unprefixedPublicPath(new URL(entry.loc).pathname, {
        infrastructureEnabled: true,
      }),
      PUBLIC_LOCALE_CODES
    )
  );
  assert.equal(
    entry.alternates.find((item) => item.hreflang === "x-default")?.href.startsWith(
      "https://clover-spb.ru/ru"
    ),
    true
  );
}

const port = await freePort();
const preview = spawn(
  process.execPath,
  [
    viteBin,
    "preview",
    "--outDir",
    outDir,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: root,
    env: minimalEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  }
);
let previewOutput = "";
preview.stdout.on("data", (chunk) => {
  previewOutput += chunk;
});
preview.stderr.on("data", (chunk) => {
  previewOutput += chunk;
});

async function request(pathname, options) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    redirect: "manual",
    ...options,
  });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await request("/");
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // retry until preview accepts connections
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, `preview startup failed\n${previewOutput}`);

  const cases = [
    ["/", "ru", "ltr", "https://clover-spb.ru/ru/"],
    ["/ru/", "ru", "ltr", "https://clover-spb.ru/ru/"],
    ["/ru/catalog", "ru", "ltr", "https://clover-spb.ru/ru/catalog"],
    ["/en/catalog/%D0%9E%D0%B4%D0%BD%D0%BE%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D1%8F%20%D0%BF%D0%BE%D1%81%D1%83%D0%B4%D0%B0", "en", "ltr", "https://clover-spb.ru/en/catalog/%D0%9E%D0%B4%D0%BD%D0%BE%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D1%8F%20%D0%BF%D0%BE%D1%81%D1%83%D0%B4%D0%B0"],
    ["/ar/product/SKU-7", "ar", "rtl", "https://clover-spb.ru/ar/product/SKU-7"],
    ["/zh/about", "zh-CN", "ltr", "https://clover-spb.ru/zh/about"],
    ["/catalog", "ru", "ltr", "https://clover-spb.ru/ru/catalog"],
  ];
  const bodies = new Map();
  for (const [pathname, lang, direction, canonical] of cases) {
    const response = await request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get("content-language"), lang);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    const html = await response.text();
    bodies.set(pathname, html);
    const head = parseHead(html);
    assert.equal(head.lang, lang);
    assert.equal(head.dir, direction);
    assert.deepEqual(head.canonical, [canonical]);
    assert.equal(head.ogLocale.length, 1);
    assert.equal(head.alternates.length, PUBLIC_LOCALE_CODES.length + 1);
    assert.equal(
      head.alternates.find((item) => item.hreflang === "x-default")?.href.startsWith(
        "https://clover-spb.ru/ru"
      ),
      true,
      pathname
    );
    const jsonLd = JSON.parse(
      html.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i
      )?.[1] || "{}"
    );
    assert.equal(jsonLd["@type"], "Organization");
    assert.equal(jsonLd.name, "КЛЕВЕР");
    assert.equal(jsonLd.logo, "https://clover-spb.ru/apple-touch-icon.png");
    assert.equal(jsonLd.url, "https://clover-spb.ru/ru/");
    assert.doesNotMatch(jsonLd.description || "", /AR Test Cup|SKU-7/);
    if (lang !== "ru") {
      assert.doesNotMatch(jsonLd.description || "", /Поставки хозтоваров/);
      assert.match(jsonLd.description || "", new RegExp(`^${lang === "zh-CN" ? "ZH" : lang.toUpperCase()} `));
    }
  }
  assert.notEqual(bodies.get("/"), bodies.get("/ar/product/SKU-7"));
  assert.match(parseHead(bodies.get("/ar/product/SKU-7")).title, /AR Test Cup/);
  const arOrg = JSON.parse(
    bodies.get("/ar/product/SKU-7").match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i
    )?.[1] || "{}"
  );
  assert.notEqual(arOrg.description, parseHead(bodies.get("/ar/product/SKU-7")).title);
  const russianPrefixed = await request("/ru/catalog?utm_source=test");
  assert.equal(russianPrefixed.status, 200);
  assert.deepEqual(parseHead(await russianPrefixed.text()).canonical, [
    "https://clover-spb.ru/ru/catalog",
  ]);
  const russianLegacy = await request("/catalog?utm_source=test");
  assert.equal(russianLegacy.status, 200);
  assert.deepEqual(parseHead(await russianLegacy.text()).canonical, [
    "https://clover-spb.ru/ru/catalog",
  ]);
  assert.equal((await request("/public-route-manifest.json")).status, 404);

  const refresh = await request("/ar/product/SKU-7");
  assert.equal(await refresh.text(), bodies.get("/ar/product/SKU-7"));
  const query = await request("/en/catalog?q=cup");
  assert.deepEqual(parseHead(await query.text()).robots, ["noindex,follow"]);
  const tracking = await request("/en/catalog?utm_source=test");
  assert.deepEqual(parseHead(await tracking.text()).robots, ["index,follow"]);
  for (const noindexPath of ["/cart", "/checkout", "/install-app"]) {
    const response = await request(noindexPath);
    assert.equal(response.status, 200, noindexPath);
    const head = parseHead(await response.text());
    assert.deepEqual(head.robots, ["noindex,follow"], noindexPath);
    assert.equal(head.alternates.length, 0, noindexPath);
    assert.deepEqual(head.canonical, [`https://clover-spb.ru${noindexPath}`]);
  }
  const facet = await request(
    "/en/catalog/%D0%9E%D0%B4%D0%BD%D0%BE%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D1%8F%20%D0%BF%D0%BE%D1%81%D1%83%D0%B4%D0%B0/%D0%A1%D1%82%D0%B0%D0%BA%D0%B0%D0%BD%D1%8B/facet"
  );
  assert.equal(facet.status, 200);
  const facetHead = parseHead(await facet.text());
  assert.deepEqual(facetHead.robots, ["noindex,follow"]);
  assert.equal(facetHead.alternates.length, 0);
  assert.equal((await request("/en/cart")).status, 404);

  for (const invalid of [
    "/fr/catalog",
    "/ar/lk",
    "/en/en/catalog",
    "/en/product/not-real",
    "/en/%2Fapi",
  ]) {
    const response = await request(invalid);
    assert.ok([400, 404].includes(response.status), invalid);
  }
  const redirect = await request("/EN/catalog/?utm_source=test");
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "/en/catalog?utm_source=test");

  const assetName = readFileSync(path.join(outDir, "index.html"), "utf8").match(
    /src="(\/assets\/index-[^"]+\.js)"/
  )?.[1];
  assert.ok(assetName);
  assert.equal((await request(assetName)).status, 200);
} finally {
  preview.kill("SIGTERM");
  await new Promise((resolve) => preview.once("exit", resolve));
}

const sw = readFileSync(path.join(root, "public/sw.js"), "utf8");
assert.match(sw, /Never cache API \/ uploads/);
assert.match(sw, /fetch\(request, \{ cache: "no-store" \}\)/);
const navigationCacheBlock =
  sw.match(
    /if \(isNavigationRequest\(request, path\)\) \{([\s\S]*?)\/\/ Hashed build assets/
  )?.[1] || "";
assert.ok(navigationCacheBlock);
assert.doesNotMatch(navigationCacheBlock, /cache\.put\(/);

const storefrontCss = readFileSync(
  path.join(root, "src/screens/storefront/storefront.css"),
  "utf8"
);
assert.match(storefrontCss, /html\[dir="rtl"\] \.sf-app/);
assert.match(storefrontCss, /unicode-bidi: isolate/);
assert.match(storefrontCss, /inset-inline-(?:start|end)/);
assert.match(storefrontCss, /\.sf-directional-back/);
assert.match(storefrontCss, /\.sf-product-price(?:-value)?/);

console.log("STAGE_7_ROUTE_CONTRACT=PASS");
console.log("STAGE_7_HTTP_HTML=PASS");
console.log("STAGE_7_SITEMAP_XML=PASS");
console.log("STAGE_7_RTL_STATIC=PASS");
console.log("STAGE_7_CACHE_ISOLATION=PASS");
console.log("STAGE_7_VERIFY_PASS");
