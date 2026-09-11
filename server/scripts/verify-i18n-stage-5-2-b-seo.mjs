/**
 * Stage 5.2-B — SEO metadata corpus localization lifecycle gate.
 * TEMP SQLite only. No production writes. No commit required.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workRoot = path.resolve(__dirname, "../..");
const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const WORKTREE_DATA = path.resolve(workRoot, "server/data");

function rejectUnsafePath(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
  if (resolved === WORKTREE_DATA || resolved.startsWith(`${WORKTREE_DATA}${path.sep}`)) {
    throw new Error(`Refusing worktree DB path: ${resolved}`);
  }
}

if (process.env.DB_PATH) rejectUnsafePath(process.env.DB_PATH);

const tempDir = mkdtempSync(path.join(tmpdir(), "clover-stage5-2-b-"));
mkdirSync(tempDir, { recursive: true });
const dbPath = path.join(tempDir, "clover.sqlite");
rejectUnsafePath(dbPath);
process.env.DB_PATH = dbPath;
process.env.TEST_DB_ISOLATED = "YES";
process.env.CLOVER_SITEMAP_RUNTIME_WRITE = "0";

function cleanup() {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

globalThis.window = {
  location: {
    hostname: "clover-spb.ru",
    origin: "https://clover-spb.ru",
    pathname: "/",
  },
};

const loaderPath = path.join(tempDir, "vite-env-loader.mjs");
writeFileSync(
  loaderPath,
  `
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.format === "module") {
    let source = result.source;
    if (Buffer.isBuffer(source)) source = source.toString("utf8");
    if (typeof source === "string" && source.includes("import.meta.env")) {
      source = source.replaceAll(
        "import.meta.env",
        "({VITE_PUBLIC_BASE_URL:\\"\\",VITE_APP_PUBLIC_URL:\\"\\",VITE_CABINET_PATH:\\"/lk\\",VITE_CABINET_URL:\\"\\",VITE_STORE_HOSTS:\\"clover-spb.ru\\"})"
      );
      return { format: "module", shortCircuit: true, source };
    }
  }
  return result;
}
`
);
register(pathToFileURL(loaderPath).href);

const { getDatabasePath, findTranslationEntryByEntityIdentity, getTranslationValueRow, insertTranslationEntryRow } =
  await import("../src/db.js");
assert.equal(path.resolve(getDatabasePath()), path.resolve(dbPath));
assert.ok(!path.resolve(getDatabasePath()).startsWith(PRODUCTION_DATA));
console.log("TEST_DB_ISOLATED=YES");
console.log("FAQ_CORPUS: NOT PRESENT — N/A");
console.log("CATEGORY_LANDING_DESCRIPTION_CORPUS: NOT PRESENT — N/A");

const { sourceHash } = await import("../../src/shared/i18n/sourceHash.js");
const { TARGET_INTERNAL_LOCALES } = await import("../../src/shared/i18n/languageRegistry.js");
const {
  BROWSER_LANGUAGE_AUTO_REDIRECT,
  PUBLIC_LANGUAGE_PREFIXES_ENABLED,
} = await import("../../src/shared/i18n/languageResolver.js");

const seoCatalog = await import("../../src/shared/i18n/seoCatalog.js");
const {
  SEO_NAMESPACE,
  SEO_ENTITY_TYPE,
  listSeoCatalogEntries,
  getSeoCatalogEntry,
  isCurrentSeoCatalogEntry,
  formatSeoTemplate,
  getSeoCanonicalField,
} = seoCatalog;

assert.equal(SEO_NAMESPACE, "seo");
assert.equal(SEO_ENTITY_TYPE, "route");

const EXPECTED_IDENTITIES = [
  ["catalog", "descriptionTemplate"],
  ["product", "titleTemplate"],
  ["cart", "title"],
  ["cart", "description"],
  ["checkout", "title"],
  ["checkout", "description"],
  ["contacts", "title"],
  ["contacts", "description"],
  ["aktsii", "title"],
  ["aktsii", "description"],
];

const EXPECTED_RU_SOURCES = Object.freeze({
  "catalog\0descriptionTemplate":
    "Каталог «{label}»: хозтовары, упаковка и расходники для HoReCa. Заказ без регистрации на сайте КЛЕВЕР.",
  "product\0titleTemplate": "Товар {code} | КЛЕВЕР",
  "cart\0title": "Корзина | КЛЕВЕР",
  "cart\0description": "Корзина заказа на сайте компании КЛЕВЕР.",
  "checkout\0title": "Оформление заказа | КЛЕВЕР",
  "checkout\0description": "Оформление заказа хозтоваров и упаковки для HoReCa.",
  "contacts\0title": "Контакты | КЛЕВЕР",
  "contacts\0description": "Контакты компании КЛЕВЕР: адрес, телефон и карта проезда.",
  "aktsii\0title": "Акции | КЛЕВЕР",
  "aktsii\0description":
    "Акции и специальные предложения компании КЛЕВЕР для HoReCa. Актуальные информационные материалы на сайте clover-spb.ru.",
});

const catalogEntries = listSeoCatalogEntries();
assert.equal(catalogEntries.length, 10, "exactly 10 SEO identities");
assert.ok(catalogEntries.every((e) => e.critical === true), "all 10 critical");
assert.ok(
  catalogEntries.every(
    (e) => e.namespace === "seo" && e.entityType === "route" && e.entityId && e.fieldKey && e.sourceRu
  )
);
for (const [entityId, fieldKey] of EXPECTED_IDENTITIES) {
  const entry = getSeoCatalogEntry(entityId, fieldKey);
  assert.ok(entry, `missing ${entityId}/${fieldKey}`);
  assert.equal(isCurrentSeoCatalogEntry(entry), true);
  assert.equal(
    entry.sourceRu,
    EXPECTED_RU_SOURCES[`${entityId}\0${fieldKey}`],
    `RU source ${entityId}/${fieldKey}`
  );
}
assert.equal(getSeoCatalogEntry("home", "title"), null, "no home SEO row");
assert.equal(getSeoCatalogEntry("about", "title"), null, "no InfoPage SEO duplicate");
assert.equal(getSeoCatalogEntry("disposable", "name"), null, "no category SEO duplicate");

const catalogSrc = readFileSync(path.join(workRoot, "src/shared/i18n/seoCatalog.js"), "utf8");
assert.equal(/node:crypto|node:fs|localizationStore|seoTranslationSeed/.test(catalogSrc), false);
assert.equal(/from ["'].*sourceHash/.test(catalogSrc), false);

const seedMod = await import("../src/i18n/seoTranslationSeed.js");
const { getSeoSeedTranslation, hasSeoSeed, listSeoSeedKeys } = seedMod;
assert.equal(listSeoSeedKeys().length, 10);
let seedCells = 0;
for (const entry of catalogEntries) {
  assert.equal(hasSeoSeed(entry.entityId, entry.fieldKey), true);
  for (const locale of TARGET_INTERNAL_LOCALES) {
    const seed = getSeoSeedTranslation(entry.entityId, entry.fieldKey, locale);
    assert.ok(String(seed).trim(), `seed ${entry.entityId}/${entry.fieldKey}/${locale}`);
    if (entry.sourceRu.includes("{label}")) assert.ok(seed.includes("{label}"));
    if (entry.sourceRu.includes("{code}")) assert.ok(seed.includes("{code}"));
    seedCells += 1;
  }
}
assert.equal(seedCells, 60);
assert.deepEqual([...TARGET_INTERNAL_LOCALES], ["en", "uz", "ky", "tg", "zh-CN", "ar"]);

const {
  storefrontRouteDocumentMeta,
  STOREFRONT_DEFAULT_TITLE,
  STOREFRONT_DEFAULT_DESCRIPTION,
} = await import("../../src/screens/storefront/seo.js");

// Independent base fixtures from exact main 6b7974f (NOT imported from implementation under test).
const BASE_DEFAULT_DESCRIPTION =
  "Компания КЛЕВЕР поставляет расходные материалы для кафе, ресторанов и отелей: одноразовую посуду, упаковку, бытовую химию и хозяйственные товары. Заказывайте с ";
const BASE_ABOUT_DESCRIPTION =
  "ООО «КЛЕВЕР» — производство и поставка хозяйственных товаров и бытовой химии в Санкт-Петербурге с 2015 года.";

assert.equal(
  STOREFRONT_DEFAULT_DESCRIPTION,
  BASE_DEFAULT_DESCRIPTION,
  "default description must remain exact base hero slice(0,160)"
);

const PRE_STAGE_RU = Object.freeze({
  home: {
    title: "Хозтовары, упаковка и химия для HoReCa | КЛЕВЕР",
    description: BASE_DEFAULT_DESCRIPTION,
    path: "/",
  },
  catalog: {
    title: "Каталог | КЛЕВЕР",
    description:
      "Каталог «Каталог»: хозтовары, упаковка и расходники для HoReCa. Заказ без регистрации на сайте КЛЕВЕР.",
    path: "/catalog",
  },
  catalogDynamic: {
    title: "Одноразовая посуда — Стаканы | КЛЕВЕР",
    description:
      "Каталог «Одноразовая посуда — Стаканы»: хозтовары, упаковка и расходники для HoReCa. Заказ без регистрации на сайте КЛЕВЕР.",
  },
  product: {
    title: "Товар ABC-123 | КЛЕВЕР",
    description: BASE_DEFAULT_DESCRIPTION,
    type: "product",
  },
  cart: {
    title: "Корзина | КЛЕВЕР",
    description: "Корзина заказа на сайте компании КЛЕВЕР.",
  },
  checkout: {
    title: "Оформление заказа | КЛЕВЕР",
    description: "Оформление заказа хозтоваров и упаковки для HoReCa.",
  },
  contacts: {
    title: "Контакты | КЛЕВЕР",
    description: "Контакты компании КЛЕВЕР: адрес, телефон и карта проезда.",
  },
  aktsii: {
    title: "Акции | КЛЕВЕР",
    description:
      "Акции и специальные предложения компании КЛЕВЕР для HoReCa. Актуальные информационные материалы на сайте clover-spb.ru.",
    path: "https://clover-spb.ru/aktsii",
  },
});

assert.equal(STOREFRONT_DEFAULT_TITLE, PRE_STAGE_RU.home.title);

function assertMeta(label, actual, expected) {
  assert.equal(actual.title, expected.title, `${label} title`);
  assert.equal(actual.description, expected.description, `${label} description`);
  if (expected.path !== undefined) assert.equal(actual.path, expected.path, `${label} path`);
  if (expected.type !== undefined) assert.equal(actual.type, expected.type, `${label} type`);
}

assertMeta("home", storefrontRouteDocumentMeta({ name: "home" }), PRE_STAGE_RU.home);
assertMeta("catalog", storefrontRouteDocumentMeta({ name: "catalog" }), PRE_STAGE_RU.catalog);
assertMeta(
  "catalogDynamic",
  storefrontRouteDocumentMeta({
    name: "catalog",
    category: "Одноразовая посуда",
    subcategory: "Стаканы",
  }),
  PRE_STAGE_RU.catalogDynamic
);
assertMeta(
  "product",
  storefrontRouteDocumentMeta({ name: "product", code: "ABC-123" }),
  PRE_STAGE_RU.product
);
assertMeta("cart", storefrontRouteDocumentMeta({ name: "cart" }), PRE_STAGE_RU.cart);
assertMeta("checkout", storefrontRouteDocumentMeta({ name: "checkout" }), PRE_STAGE_RU.checkout);
assertMeta("contacts", storefrontRouteDocumentMeta({ name: "contacts" }), PRE_STAGE_RU.contacts);
assertMeta("aktsii", storefrontRouteDocumentMeta({ name: "aktsii" }), PRE_STAGE_RU.aktsii);

const aboutMeta = storefrontRouteDocumentMeta({ name: "info", slug: "about" });
assert.equal(aboutMeta.title, "О нас | КЛЕВЕР");
assert.equal(aboutMeta.description, BASE_ABOUT_DESCRIPTION);
assert.equal(aboutMeta.path, "/about");

assert.equal(
  formatSeoTemplate(getSeoCanonicalField("catalog", "descriptionTemplate"), { label: "X" }),
  "Каталог «X»: хозтовары, упаковка и расходники для HoReCa. Заказ без регистрации на сайте КЛЕВЕР."
);
assert.equal(
  formatSeoTemplate(getSeoCanonicalField("product", "titleTemplate"), { code: "Z" }),
  "Товар Z | КЛЕВЕР"
);

const seoJs = readFileSync(path.join(workRoot, "src/screens/storefront/seo.js"), "utf8");
assert.ok(seoJs.includes("seoCatalog.js"), "seo.js must consume seoCatalog");
assert.equal(
  seoJs.includes("Каталог «${label}»: хозтовары, упаковка и расходники для HoReCa"),
  false,
  "catalog description literal must not remain duplicated in seo.js"
);
assert.equal(
  seoJs.includes("`Товар ${route.code} | ${STOREFRONT_SITE_NAME}`"),
  false,
  "product title template must not remain duplicated in seo.js"
);
assert.equal(seoJs.includes('Корзина заказа на сайте компании КЛЕВЕР.'), false);
assert.equal(seoJs.includes("og:locale\", \"ru_RU\""), true);

const storeMod = await import("../src/localizationStore.js");
const {
  initializeLocalizationCatalog,
  readLocalizationSettings,
  readTranslationStore,
  completenessByLanguage,
  listWorkspaceRows,
  saveManualTranslation,
  resetTranslationToAuto,
  readSeoTranslationStore,
} = storeMod;

const before = readLocalizationSettings().catalogVersion;
const first = initializeLocalizationCatalog();
assert.equal(first.dirty, true);
const afterFirst = readLocalizationSettings().catalogVersion;
assert.equal(afterFirst, before + 1);

const store1 = readTranslationStore();
const seoEntries = store1.entries.filter(
  (e) => e.namespace === "seo" && e.entityType === "route" && e.entityId
);
assert.equal(seoEntries.length, 10);
const seoIds = new Set(seoEntries.map((e) => e.id));
const seoValues = store1.values.filter((v) => seoIds.has(v.entryId));
assert.equal(seoValues.length, 60);
assert.ok(seoValues.every((v) => v.state === "AUTO"));

for (const [entityId, fieldKey] of EXPECTED_IDENTITIES) {
  const row = findTranslationEntryByEntityIdentity("seo", "route", entityId, fieldKey);
  assert.ok(row, `persisted ${entityId}/${fieldKey}`);
  assert.equal(row.sourceHash, sourceHash(getSeoCanonicalField(entityId, fieldKey)));
  assert.ok(row.critical === true || row.critical === 1, `critical ${entityId}/${fieldKey}`);
}

const pageEntries = store1.entries.filter(
  (e) => e.namespace === "page" && e.entityType === "info"
);
assert.equal(pageEntries.length, 21);

const reports = completenessByLanguage(store1);
for (const code of ["en", "uz", "ky", "tg", "zh", "ar"]) {
  const report = reports[code];
  assert.equal(report.domains.seo.total, 10, `${code} seo.total`);
  assert.equal(report.domains.seo.ready, 10, `${code} seo.ready`);
  assert.equal(report.domains.seo.complete, true, `${code} seo.complete`);
  assert.equal(report.domains.faq.total, 0, `${code} faq.total`);
  assert.equal(report.domains.faq.ready, 0, `${code} faq.ready`);
  assert.equal(report.domains.faq.complete, false, `${code} faq.complete`);
  assert.equal(report.complete, false, `${code} overall must stay false`);
}

const second = initializeLocalizationCatalog();
assert.equal(second.dirty, false);
assert.equal(readLocalizationSettings().catalogVersion, afterFirst, "idempotent no bump");

const cartTitle = findTranslationEntryByEntityIdentity("seo", "route", "cart", "title");
assert.ok(cartTitle);
const manual = saveManualTranslation(cartTitle.id, "en", "Basket | КЛЕВЕР", "admin@test");
assert.equal(manual.changed, true);
const afterManualSync = initializeLocalizationCatalog();
assert.equal(afterManualSync.dirty, false);
const manualValue = getTranslationValueRow(cartTitle.id, "en");
assert.equal(manualValue.state, "MANUAL");
assert.equal(manualValue.value, "Basket | КЛЕВЕР");

const reset = resetTranslationToAuto(cartTitle.id, "en", "admin@test");
assert.equal(reset.changed, true);
const autoAgain = getTranslationValueRow(cartTitle.id, "en");
assert.equal(autoAgain.state, "AUTO");
assert.equal(autoAgain.value, getSeoSeedTranslation("cart", "title", "en"));

// AUTO refresh when persisted source drifts from code-owned catalog.
const checkoutDesc = findTranslationEntryByEntityIdentity(
  "seo",
  "route",
  "checkout",
  "description"
);
assert.ok(checkoutDesc);
const { updateTranslationEntryRow, upsertTranslationValueRow } = await import("../src/db.js");
const driftedRu = `${checkoutDesc.sourceRu} :: drifted`;
const driftedHash = sourceHash(driftedRu);
updateTranslationEntryRow({
  id: checkoutDesc.id,
  sourceRu: driftedRu,
  sourceHash: driftedHash,
  critical: true,
  updatedAt: new Date().toISOString(),
});
upsertTranslationValueRow({
  entryId: checkoutDesc.id,
  languageCode: "en",
  value: "DRIFTED AUTO VALUE",
  state: "AUTO",
  sourceHash: driftedHash,
  updatedAt: new Date().toISOString(),
  updatedBy: "test-drift",
});
const refresh = initializeLocalizationCatalog();
assert.equal(refresh.dirty, true);
const restoredEntry = findTranslationEntryByEntityIdentity(
  "seo",
  "route",
  "checkout",
  "description"
);
assert.equal(restoredEntry.sourceRu, getSeoCanonicalField("checkout", "description"));
assert.equal(restoredEntry.sourceHash, sourceHash(getSeoCanonicalField("checkout", "description")));
const restoredAuto = getTranslationValueRow(checkoutDesc.id, "en");
assert.equal(restoredAuto.state, "AUTO");
assert.equal(restoredAuto.value, getSeoSeedTranslation("checkout", "description", "en"));
assert.equal(restoredAuto.sourceHash, restoredEntry.sourceHash);

// MANUAL preserved + stale when entry sourceHash drifts (before resync restores code source).
const contactsDesc = findTranslationEntryByEntityIdentity(
  "seo",
  "route",
  "contacts",
  "description"
);
assert.ok(contactsDesc);
saveManualTranslation(
  contactsDesc.id,
  "en",
  "КЛЕВЕР contacts: address, phone and map.",
  "admin@test"
);
updateTranslationEntryRow({
  id: contactsDesc.id,
  sourceRu: contactsDesc.sourceRu,
  sourceHash: sourceHash(`${contactsDesc.sourceRu}::bump`),
  critical: true,
  updatedAt: new Date().toISOString(),
});
const manualKept = getTranslationValueRow(contactsDesc.id, "en");
assert.equal(manualKept.state, "MANUAL");
assert.equal(manualKept.value, "КЛЕВЕР contacts: address, phone and map.");
const contactsRows = listWorkspaceRows({ view: "seo", language: "en" }).filter(
  (row) => row.entityId === "contacts" && row.fieldKey === "description"
);
assert.equal(contactsRows.length, 1);
assert.equal(contactsRows[0].languages.en.stale, true);
assert.equal(contactsRows[0].languages.en.state, "MANUAL");

// Resync restores code-owned sourceHash; MANUAL value text preserved.
const versionBeforeResync = readLocalizationSettings().catalogVersion;
const afterManualSourceSync = initializeLocalizationCatalog();
assert.equal(afterManualSourceSync.dirty, true);
assert.equal(readLocalizationSettings().catalogVersion, versionBeforeResync + 1);
const manualAfterResync = getTranslationValueRow(contactsDesc.id, "en");
assert.equal(manualAfterResync.state, "MANUAL");
assert.equal(manualAfterResync.value, "КЛЕВЕР contacts: address, phone and map.");
const restoredContacts = findTranslationEntryByEntityIdentity(
  "seo",
  "route",
  "contacts",
  "description"
);
assert.equal(
  restoredContacts.sourceHash,
  sourceHash(getSeoCanonicalField("contacts", "description"))
);

const catalogDesc = findTranslationEntryByEntityIdentity(
  "seo",
  "route",
  "catalog",
  "descriptionTemplate"
);
assert.ok(catalogDesc);
let placeholderRejected = false;
try {
  saveManualTranslation(catalogDesc.id, "en", "Catalog without placeholder", "admin@test");
} catch (error) {
  placeholderRejected = true;
  assert.equal(error.code, "PLACEHOLDER_MISMATCH");
  assert.equal(error.status, 400);
}
assert.equal(placeholderRejected, true, "catalog {label} placeholder required");

const productTitle = findTranslationEntryByEntityIdentity(
  "seo",
  "route",
  "product",
  "titleTemplate"
);
placeholderRejected = false;
try {
  saveManualTranslation(productTitle.id, "en", "Product without code | КЛЕВЕР", "admin@test");
} catch (error) {
  placeholderRejected = true;
  assert.equal(error.code, "PLACEHOLDER_MISMATCH");
  assert.equal(error.status, 400);
}
assert.equal(placeholderRejected, true, "product {code} placeholder required");

saveManualTranslation(
  catalogDesc.id,
  "en",
  "Catalog “{label}”: household goods for HoReCa on КЛЕВЕР.",
  "admin@test"
);

const seoView = listWorkspaceRows({ view: "seo", language: "en" });
const seoViewSeo = seoView.filter((row) => row.namespace === "seo");
const seoViewPages = seoView.filter((row) => row.namespace === "page");
const seoViewProducts = seoView.filter((row) => row.namespace === "product");
const seoViewCategories = seoView.filter((row) => row.namespace === "category");
assert.equal(seoViewSeo.length, 10, "view=seo contains 10 SEO rows");
assert.equal(seoViewPages.length, 21, "view=seo contains 21 page rows");
assert.equal(seoViewProducts.length, 0, "no products in seo view");
assert.equal(seoViewCategories.length, 0, "no categories in seo view");

const { stats: seoReadStats } = readSeoTranslationStore({ languageInternal: "en" });
assert.equal(seoReadStats.seoCurrentEntries, 10);
assert.ok(seoReadStats.seoNamespaceEntriesRead >= 10);

// Force stale SEO AUTO: bump entry sourceHash without refreshing AUTO value.
const staleEntry = findTranslationEntryByEntityIdentity("seo", "route", "contacts", "title");
assert.ok(staleEntry);
updateTranslationEntryRow({
  id: staleEntry.id,
  sourceRu: staleEntry.sourceRu,
  sourceHash: sourceHash(`${staleEntry.sourceRu}::stale`),
  critical: true,
  updatedAt: new Date().toISOString(),
});
const untranslated = listWorkspaceRows({ view: "untranslated", language: "en" });
const untranslatedSeo = untranslated.filter(
  (row) => row.namespace === "seo" && row.entityId === "contacts" && row.fieldKey === "title"
);
assert.ok(untranslatedSeo.length >= 1, "untranslated includes stale SEO");

assert.equal(BROWSER_LANGUAGE_AUTO_REDIRECT, false);
assert.equal(PUBLIC_LANGUAGE_PREFIXES_ENABLED, false);
assert.equal(readLocalizationSettings().enabledLanguages.join(","), "ru");

assert.equal(
  seoJs.includes("getSeoSeedTranslation") || seoJs.includes("localizationStore"),
  false,
  "public seo.js must not use translation DB"
);

// Orphan SEO entity must not be editable / must not appear via current allowlist.
insertTranslationEntryRow({
  id: randomUUID(),
  namespace: "seo",
  entityType: "route",
  entityId: "orphan-route",
  fieldKey: "title",
  sourceRu: "Orphan",
  sourceHash: sourceHash("Orphan"),
  critical: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const seoViewAfterOrphan = listWorkspaceRows({ view: "seo", language: "en" }).filter(
  (row) => row.namespace === "seo"
);
assert.equal(seoViewAfterOrphan.length, 10, "orphan SEO not scanned into view=seo");
assert.equal(
  seoViewAfterOrphan.some((row) => row.entityId === "orphan-route"),
  false
);

console.log("STAGE_5_2_B_VERIFY_PASS");
