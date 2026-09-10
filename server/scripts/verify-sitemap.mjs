/**
 * SEO-001 sitemap verifier — rule-based, no hardcoded URL counts.
 *
 * Usage:
 *   node server/scripts/verify-sitemap.mjs
 *   node server/scripts/verify-sitemap.mjs --xml /path/to/sitemap.xml
 *   node server/scripts/verify-sitemap.mjs --legacy-public
 *
 * Default: prefer dist/sitemap.xml, else build from local DB read-only.
 *
 * Expected set is computed from DB + shared eligibility helpers (same as API).
 * Actual locs come from the XML file under test — not regenerated into itself.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

const {
  SITEMAP_STATIC_PATHS,
  SITEMAP_ORIGIN,
  listPublicSitemapProducts,
  collectSitemapIndexSets,
  buildSitemapEntries,
  renderSitemapXml,
  isForbiddenSitemapUrl,
  toAbsoluteSitemapUrl,
  sitemapStorefrontPath,
  escapeXml,
  passesPublicStorefrontEligibility,
  resolvePublicProductCode,
} = await import(
  pathToFileURL(
    path.join(projectRoot, "src/shared/sitemap/sitemapContract.js")
  ).href
);

function parseArgs(argv) {
  const out = { xml: "", legacyPublic: false, requireProducts: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--xml") out.xml = String(argv[++i] || "");
    else if (a === "--legacy-public") out.legacyPublic = true;
    else if (a === "--allow-empty-products") out.requireProducts = false;
  }
  return out;
}

function extractLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(xml))) {
    locs.push(match[1].trim());
  }
  return locs;
}

function readAppStateJson(db, key, fallback) {
  const row = db
    .prepare("SELECT value_json FROM app_state WHERE key = ?")
    .get(key);
  if (!row?.value_json) return fallback;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return fallback;
  }
}

function oneCByIdMap(oneCProducts) {
  const map = new Map();
  for (const item of Array.isArray(oneCProducts) ? oneCProducts : []) {
    const id = String(item?.id || "").trim();
    if (id) map.set(id, item);
  }
  return map;
}

function loadPublicProductsFromDb(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const products = readAppStateJson(db, "products", []);
    const settings = readAppStateJson(db, "settings", {});
    const oneCProducts = readAppStateJson(db, "oneCProducts", []);
    const linked = settings.storefrontShowOnlyLinked !== false;
    return {
      products,
      settings,
      linked,
      oneCById: oneCByIdMap(oneCProducts),
      publicProducts: listPublicSitemapProducts(products, {
        storefrontShowOnlyLinked: linked,
        oneCById: oneCByIdMap(oneCProducts),
      }),
    };
  } finally {
    db.close();
  }
}

/**
 * Independent eligibility cross-check: re-apply the three gates without
 * calling listPublicSitemapProducts, then compare code sets.
 */
function assertEligibilityParity(rawProducts, linked, oneCById, publicProducts) {
  const independentCodes = new Set();
  for (const product of Array.isArray(rawProducts) ? rawProducts : []) {
    if (!passesPublicStorefrontEligibility(product, { storefrontShowOnlyLinked: linked })) {
      continue;
    }
    const oneCItem = oneCById.get(String(product.oneCId || "")) || null;
    const name =
      String(product.name || "").trim() ||
      String(oneCItem?.name || product.oneCName || "").trim();
    if (!name) continue;
    const code = resolvePublicProductCode(product, oneCItem);
    if (!code) continue;
    independentCodes.add(code);
  }
  const listed = new Set(publicProducts.map((p) => p.code));
  assert.equal(
    independentCodes.size,
    listed.size,
    "eligibility parity: independent code set size mismatch"
  );
  for (const code of independentCodes) {
    assert.ok(listed.has(code), `eligibility parity: missing ${code}`);
  }
  for (const code of listed) {
    assert.ok(independentCodes.has(code), `eligibility parity: unexpected ${code}`);
  }
}

function assertSitemapRules(xml, { expectedProducts, label }) {
  assert.ok(xml.includes('<?xml version="1.0"'), `${label}: missing xml decl`);
  assert.ok(
    xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'),
    `${label}: missing sitemap namespace`
  );
  assert.ok(xml.includes("<urlset"), `${label}: missing urlset`);
  assert.doesNotMatch(xml, /<lastmod>/i, `${label}: unexpected lastmod`);
  assert.doesNotMatch(xml, /<priority>/i, `${label}: unexpected priority`);
  assert.doesNotMatch(xml, /<changefreq>/i, `${label}: unexpected changefreq`);

  const locs = extractLocs(xml);
  assert.ok(locs.length > 0, `${label}: no locs`);

  const unique = new Set(locs);
  assert.equal(unique.size, locs.length, `${label}: duplicate loc`);

  for (const loc of locs) {
    assert.equal(isForbiddenSitemapUrl(loc), false, `${label}: forbidden ${loc}`);
    const url = new URL(loc);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "clover-spb.ru");
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.ok(Buffer.byteLength(loc, "utf8") < 2048, `${label}: loc too long`);
  }

  for (const staticPath of SITEMAP_STATIC_PATHS) {
    const abs = toAbsoluteSitemapUrl(staticPath);
    assert.ok(locs.includes(abs), `${label}: missing static ${abs}`);
  }

  assert.equal(
    locs.some((loc) => loc.includes("/install-app")),
    false,
    `${label}: install-app must be absent`
  );
  assert.equal(
    locs.some((loc) => /\/(en|uz|ky|tg|zh|ar)(\/|$)/.test(new URL(loc).pathname)),
    false,
    `${label}: locale prefix must be absent`
  );

  const productLocs = locs.filter((loc) => new URL(loc).pathname.startsWith("/product/"));
  const catalogPaths = locs
    .map((loc) => new URL(loc).pathname)
    .filter((p) => p.startsWith("/catalog/"));
  const topCategoryLocs = catalogPaths.filter(
    (p) => p.split("/").filter(Boolean).length === 2
  );
  const subcategoryLocs = catalogPaths.filter(
    (p) => p.split("/").filter(Boolean).length === 3
  );

  if (expectedProducts) {
    const sets = collectSitemapIndexSets(expectedProducts);
    const expected = buildSitemapEntries({
      categories: sets.categories,
      subcategories: sets.subcategories,
      productCodes: sets.productCodes,
    });
    const expectedSet = new Set(expected);
    const actualSet = new Set(locs);

    const missing = expected.filter((loc) => !actualSet.has(loc));
    const unexpected = locs.filter((loc) => !expectedSet.has(loc));
    assert.equal(
      missing.length,
      0,
      `${label}: missing URLs (${missing.length}): ${missing.slice(0, 5).join(", ")}`
    );
    assert.equal(
      unexpected.length,
      0,
      `${label}: unexpected URLs (${unexpected.length}): ${unexpected.slice(0, 5).join(", ")}`
    );
    assert.equal(locs.length, expected.length, `${label}: loc count mismatch`);

    const expectedProductLocs = new Set(
      sets.productCodes.map((code) =>
        toAbsoluteSitemapUrl(`/product/${encodeURIComponent(code)}`)
      )
    );
    const actualProductLocs = new Set(productLocs);
    for (const loc of expectedProductLocs) {
      assert.ok(actualProductLocs.has(loc), `${label}: missing product ${loc}`);
    }
    for (const loc of actualProductLocs) {
      assert.ok(expectedProductLocs.has(loc), `${label}: unexpected product ${loc}`);
    }

    const expectedTaxonomy = new Set(
      [
        ...sets.categories.map((c) =>
          toAbsoluteSitemapUrl(sitemapStorefrontPath({ name: "catalog", category: c }))
        ),
        ...sets.subcategories.map((s) =>
          toAbsoluteSitemapUrl(
            sitemapStorefrontPath({
              name: "catalog",
              category: s.category,
              subcategory: s.subcategory,
            })
          )
        ),
      ]
    );
    const actualTaxonomy = new Set(
      locs.filter((loc) => new URL(loc).pathname.startsWith("/catalog/"))
    );
    for (const loc of expectedTaxonomy) {
      assert.ok(actualTaxonomy.has(loc), `${label}: missing taxonomy ${loc}`);
    }
    for (const loc of actualTaxonomy) {
      assert.ok(expectedTaxonomy.has(loc), `${label}: unexpected taxonomy ${loc}`);
    }

    assert.equal(
      locs.includes(`${SITEMAP_ORIGIN}/product/___not-a-real-code___`),
      false
    );
  }

  if (expectedProducts && expectedProducts.length > 0) {
    const sets = collectSitemapIndexSets(expectedProducts);
    const contractSize = buildSitemapEntries({
      categories: sets.categories,
      subcategories: sets.subcategories,
      productCodes: sets.productCodes,
    }).length;
    if (contractSize > 18) {
      assert.ok(
        locs.length > 18,
        `${label}: expected catalog coverage > legacy 18, got ${locs.length}`
      );
    }
    assert.ok(productLocs.length > 0, `${label}: expected product URLs`);
    assert.ok(topCategoryLocs.length > 0, `${label}: expected category URLs`);
  }

  return {
    total: locs.length,
    static: SITEMAP_STATIC_PATHS.length,
    categories: topCategoryLocs.length,
    subcategories: subcategoryLocs.length,
    products: productLocs.length,
  };
}

function unitTests() {
  const fixtureProducts = [
    {
      id: 1,
      name: "A",
      code: "CL-1",
      oneCCode: "НФ-1",
      oneCId: "x",
      active: true,
      showOnStorefront: true,
      category: "Химия, чистящие средства",
      subcategory: "Мыло",
    },
    {
      id: 2,
      name: "B",
      code: "CL-2",
      oneCCode: "НФ-2",
      oneCId: "y",
      active: true,
      showOnStorefront: true,
      category: "Химия, чистящие средства",
      subcategory: "Пакеты zip-lock",
    },
    {
      id: 3,
      name: "Hidden",
      code: "CL-3",
      oneCCode: "НФ-3",
      oneCId: "z",
      active: true,
      showOnStorefront: false,
      category: "Прочее",
      subcategory: "",
    },
  ];
  const publicList = listPublicSitemapProducts(fixtureProducts, {
    storefrontShowOnlyLinked: true,
  });
  assert.equal(publicList.length, 2);
  const sets = collectSitemapIndexSets(publicList);
  assert.ok(sets.categories.includes("Химия, чистящие средства"));
  assert.equal(sets.categories.includes("Прочее"), false);
  assert.equal(sets.subcategories.length, 2);
  assert.ok(
    sets.subcategories.some((s) => s.subcategory === "Пакеты zip-lock")
  );
  const locs = buildSitemapEntries({
    categories: sets.categories,
    subcategories: sets.subcategories,
    productCodes: sets.productCodes,
  });
  const xml = renderSitemapXml(locs);
  assertSitemapRules(xml, { expectedProducts: publicList, label: "unit-fixture" });

  // Route encoding: spaces, commas, %, Cyrillic — single encodeURIComponent, no double-encoding
  const special = sitemapStorefrontPath({
    name: "catalog",
    category: "Химия, чистящие средства",
    subcategory: "A B%C",
  });
  assert.equal(
    special,
    `/catalog/${encodeURIComponent("Химия, чистящие средства")}/${encodeURIComponent("A B%C")}`
  );
  assert.equal(special.includes("%25"), true); // % → %25 once
  assert.equal(decodeURIComponent(special.split("/")[2]), "Химия, чистящие средства");
  const productPath = sitemapStorefrontPath({
    name: "product",
    code: "код/с?якорь#x",
  });
  assert.equal(productPath, `/product/${encodeURIComponent("код/с?якорь#x")}`);
  assert.equal(
    escapeXml(`https://clover-spb.ru/a&b<"'>`),
    "https://clover-spb.ru/a&amp;b&lt;&quot;&apos;&gt;"
  );
}

const args = parseArgs(process.argv.slice(2));
unitTests();

if (args.legacyPublic) {
  const legacyPath = path.join(
    projectRoot,
    "server/scripts/fixtures/legacy-sitemap-18.xml"
  );
  assert.ok(existsSync(legacyPath), "legacy fixture missing");
  const xml = readFileSync(legacyPath, "utf8");
  const legacyLocs = extractLocs(xml);
  assert.equal(legacyLocs.length, 18, "legacy fixture must be the historic 18-URL file");
  const dbPath =
    process.env.DB_PATH ||
    path.join(projectRoot, "server/data/clover.sqlite");
  assert.ok(existsSync(dbPath), `DB missing for legacy RED check: ${dbPath}`);
  const { publicProducts } = loadPublicProductsFromDb(dbPath);
  assert.ok(
    publicProducts.length > 0,
    "public products empty — cannot RED-check coverage"
  );
  let failed = false;
  try {
    assertSitemapRules(xml, {
      expectedProducts: publicProducts,
      label: "legacy-public",
    });
  } catch (error) {
    failed = true;
    console.log(
      JSON.stringify({
        SITEMAP_LEGACY_RED: "FAIL_AS_EXPECTED",
        message: String(error.message || error),
        legacyLocs: legacyLocs.length,
        publicProducts: publicProducts.length,
      })
    );
  }
  assert.equal(
    failed,
    true,
    "legacy sitemap unexpectedly satisfied full contract"
  );
  console.log(JSON.stringify({ SITEMAP_VERIFIER: "RED_LEGACY_OK" }));
  process.exit(0);
}

const dbPath =
  process.env.DB_PATH ||
  path.join(projectRoot, "server/data/clover.sqlite");

let xmlPath = args.xml;
if (!xmlPath) {
  const distPath = path.join(projectRoot, "dist/sitemap.xml");
  if (existsSync(distPath)) xmlPath = distPath;
}

let publicProducts = [];
let loaded = null;
if (existsSync(dbPath)) {
  loaded = loadPublicProductsFromDb(dbPath);
  publicProducts = loaded.publicProducts;
  assertEligibilityParity(
    loaded.products,
    loaded.linked,
    loaded.oneCById,
    publicProducts
  );
} else if (args.requireProducts) {
  throw new Error(`DB not found at ${dbPath}; set DB_PATH or --allow-empty-products`);
}

if (!xmlPath) {
  const sets = collectSitemapIndexSets(publicProducts);
  const locs = buildSitemapEntries({
    categories: sets.categories,
    subcategories: sets.subcategories,
    productCodes: sets.productCodes,
  });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "clover-sitemap-"));
  xmlPath = path.join(tmp, "sitemap.xml");
  writeFileSync(xmlPath, renderSitemapXml(locs));
  const summary = assertSitemapRules(readFileSync(xmlPath, "utf8"), {
    expectedProducts: publicProducts,
    label: "generated-from-db",
  });
  rmSync(tmp, { recursive: true, force: true });
  console.log(
    JSON.stringify({ SITEMAP_VERIFIER: "PASS", mode: "db-contract", ...summary })
  );
  process.exit(0);
}

const xml = readFileSync(xmlPath, "utf8");
const summary = assertSitemapRules(xml, {
  expectedProducts: args.requireProducts ? publicProducts : null,
  label: xmlPath,
});
console.log(
  JSON.stringify({
    SITEMAP_VERIFIER: "PASS",
    mode: "xml-file",
    xml: xmlPath,
    ...summary,
  })
);
