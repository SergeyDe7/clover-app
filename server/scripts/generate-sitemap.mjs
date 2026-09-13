#!/usr/bin/env node
/**
 * SEO-001 — generate dist/sitemap.xml from local authoritative storefront catalog.
 *
 * Reads SQLite app_state read-only (same products/settings as public catalog).
 * Does NOT call production HTTP. Does NOT mutate DB.
 *
 * Env:
 *   DB_PATH — sqlite file (default: <repo>/server/data/clover.sqlite)
 *   SITEMAP_OUT — output path (default: <repo>/dist/sitemap.xml)
 *
 * Missing DB → hard fail (exit 1). No silent static-only / incomplete sitemap.
 *
 * CLI-only entry: importing this module does nothing; main() runs only when executed.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

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

async function main() {
  const {
    listPublicSitemapProducts,
    collectSitemapIndexSets,
    buildSitemapEntries,
    renderSitemapXml,
    SITEMAP_STATIC_PATHS,
  } = await import(
    pathToFileURL(
      path.join(projectRoot, "src/shared/sitemap/sitemapContract.js")
    ).href
  );
  const {
    buildIndexableRouteDescriptors,
    buildLocalizedRouteManifest,
    renderLocalizedSitemapXml,
  } = await import(
    pathToFileURL(
      path.join(projectRoot, "src/shared/sitemap/localizedSitemap.js")
    ).href
  );

  function readRows(db, sql) {
    try {
      return db.prepare(sql).all();
    } catch {
      return [];
    }
  }

  function loadSitemapState(dbPath) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const products = readAppStateJson(db, "products", []);
      const settings = readAppStateJson(db, "settings", {});
      const oneCProducts = readAppStateJson(db, "oneCProducts", []);
      const localizationSettings = readAppStateJson(
        db,
        "localizationSettings",
        { enabledLanguages: ["ru"] }
      );
      const linked = settings.storefrontShowOnlyLinked !== false;
      const publicProducts = listPublicSitemapProducts(products, {
        storefrontShowOnlyLinked: linked,
        oneCById: oneCByIdMap(oneCProducts),
      });
      const entries = readRows(
        db,
        `SELECT id, namespace, entity_type AS entityType, entity_id AS entityId,
                field_key AS fieldKey, source_ru AS sourceRu,
                source_hash AS sourceHash, critical
         FROM translation_entries`
      );
      const values = readRows(
        db,
        `SELECT entry_id AS entryId, language_code AS languageCode, value, state,
                source_hash AS sourceHash
         FROM translation_values`
      );
      const productTranslations = readRows(
        db,
        `SELECT product_id AS productId, language_code AS languageCode,
                field_key AS fieldKey, auto_value AS autoValue,
                auto_source_hash AS autoSourceHash,
                manual_value AS manualValue,
                manual_source_hash AS manualSourceHash
         FROM product_translations`
      );
      return {
        products,
        settings,
        localizationSettings,
        publicProducts,
        translationStore: { entries, values },
        productTranslations,
      };
    } finally {
      db.close();
    }
  }

  const dbPath =
    process.env.DB_PATH ||
    path.join(projectRoot, "server/data/clover.sqlite");
  const outPath =
    process.env.SITEMAP_OUT || path.join(projectRoot, "dist/sitemap.xml");

  if (!existsSync(dbPath)) {
    console.error(
      `[sitemap] DB not found: ${dbPath}. Production builds require server/data/clover.sqlite (or set DB_PATH).`
    );
    process.exit(1);
  }

  const state = loadSitemapState(dbPath);
  const publicProducts = state.publicProducts;
  const sets = collectSitemapIndexSets(publicProducts);
  const infrastructureEnabled =
    String(process.env.CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED || "").trim() === "1";
  let manifest = {
    version: 1,
    infrastructureEnabled: false,
    enabledLanguages: ["ru"],
    routes: {},
  };
  let locs = [];
  let xml;
  if (infrastructureEnabled) {
    const descriptors = buildIndexableRouteDescriptors({
      categories: sets.categories,
      subcategories: sets.subcategories,
      publicProducts,
    });
    manifest = buildLocalizedRouteManifest({
      descriptors,
      enabledLanguages: state.localizationSettings.enabledLanguages,
      translationStore: state.translationStore,
      productTranslations: state.productTranslations,
      products: state.products,
      infoPages: state.settings.storefrontInfoPages,
    });
    locs = Object.values(manifest.routes)
      .filter((record) => !record.canonicalAlias)
      .map((record) => record.canonical);
    xml = renderLocalizedSitemapXml(manifest);
  } else {
    locs = buildSitemapEntries({
      categories: sets.categories,
      subcategories: sets.subcategories,
      productCodes: sets.productCodes,
    });
    xml = renderSitemapXml(locs);
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, xml);
  renameSync(tmpPath, outPath);
  const manifestPath = path.join(path.dirname(outPath), "public-route-manifest.json");
  const manifestTmpPath = `${manifestPath}.${process.pid}.tmp`;
  writeFileSync(manifestTmpPath, `${JSON.stringify(manifest)}\n`);
  renameSync(manifestTmpPath, manifestPath);

  console.log(
    JSON.stringify({
      SITEMAP_GENERATE: "OK",
      db: dbPath,
      out: outPath,
      total: locs.length,
      localizedRoutes: infrastructureEnabled,
      enabledLanguages: manifest.enabledLanguages,
      static: SITEMAP_STATIC_PATHS.length,
      categories: sets.categories.length,
      subcategories: sets.subcategories.length,
      products: sets.productCodes.length,
    })
  );
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isCli) {
  await main();
}
