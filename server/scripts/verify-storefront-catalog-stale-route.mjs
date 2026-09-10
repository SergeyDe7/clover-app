/**
 * Stage storefront catalog — stale route-payload regression.
 * Behavioral helper tests + CatalogPage request-time binding structure gate.
 * No production DB. No package changes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPagePath = path.join(root, "src/screens/storefront/pages/CatalogPage.jsx");
const catalogPageSource = readFileSync(catalogPagePath, "utf8");

const {
  makeCatalogRouteSnapshot,
  resolveStorefrontCatalogView,
} = await import(
  pathToFileURL(path.join(root, "src/screens/storefront/catalogRouteSnapshot.js")).href
);

function routeKey(category = "", subcategory = "", facet = "") {
  return `${String(category || "")}\0${String(subcategory || "")}\0${String(facet || "")}`;
}

function resolveVisibleProducts(currentRouteKey, retained) {
  const { currentPayload } = resolveStorefrontCatalogView(currentRouteKey, retained);
  return currentPayload ? currentPayload.products || [] : null;
}

function resolveEmptyState(currentRouteKey, retained) {
  const products = resolveVisibleProducts(currentRouteKey, retained);
  if (products === null) return false;
  return products.length === 0;
}

/** Collapse insignificant whitespace/quotes for structure matching. */
function normalizeJsxSource(source) {
  return String(source || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ")
    .replace(/'/g, '"');
}

/**
 * Extract the useEffect callback body that performs storefrontApi.catalog fetch.
 * Formatting-independent enough for whitespace/quote variance.
 */
function extractCatalogFetchEffectBody(source) {
  const normalized = normalizeJsxSource(source);
  const marker = "storefrontApi .catalog";
  const markerAlt = "storefrontApi.catalog";
  let markerAt = normalized.indexOf(marker);
  if (markerAt < 0) markerAt = normalized.indexOf(markerAlt);
  assert.ok(markerAt >= 0, "CatalogPage must call storefrontApi.catalog");

  const effectStart = normalized.lastIndexOf("useEffect(() => {", markerAt);
  assert.ok(effectStart >= 0, "storefrontApi.catalog must live inside a useEffect");

  const braceOpen = normalized.indexOf("{", effectStart);
  assert.ok(braceOpen >= 0);
  let depth = 0;
  let end = -1;
  for (let i = braceOpen; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.ok(end > braceOpen, "catalog fetch useEffect body must be balanced");
  const body = normalized.slice(braceOpen + 1, end);
  assert.ok(
    body.includes("storefrontApi .catalog") || body.includes("storefrontApi.catalog"),
    "extracted effect must include catalog fetch"
  );
  return body;
}

/**
 * Prove request-time route identity is captured in the fetch effect and used
 * when tagging the successful payload snapshot (not a live/current retag source).
 */
function assertCatalogFetchRequestTimeBinding(source, label = "CatalogPage") {
  const body = extractCatalogFetchEffectBody(source);

  assert.match(
    body,
    /\bcancelled\b/,
    `${label}: catalog fetch effect must retain cancellation flag`
  );
  assert.match(
    body,
    /cancelled\s*=\s*true/,
    `${label}: catalog fetch effect cleanup must set cancelled=true`
  );

  const capture = body.match(
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*catalogScrollRouteKey\s*\(\s*category\s*,\s*subcategory\s*,\s*facet\s*\)/
  );
  assert.ok(
    capture,
    `${label}: fetch effect must capture request-time routeKey via catalogScrollRouteKey(category, subcategory, facet)`
  );
  const requestIdName = capture[1];

  assert.match(
    body,
    /storefrontApi\s*\.\s*catalog\s*\(/,
    `${label}: fetch effect must call storefrontApi.catalog`
  );

  assert.doesNotMatch(
    body,
    /makeCatalogRouteSnapshot\s*\(\s*[^)]*\.current/,
    `${label}: must not tag snapshot from a ref.current live route`
  );
  assert.doesNotMatch(
    body,
    /makeCatalogRouteSnapshot\s*\(\s*[^)]*window\.location/,
    `${label}: must not tag snapshot from window.location`
  );
  assert.doesNotMatch(
    body,
    /makeCatalogRouteSnapshot\s*\(\s*catalogScrollRouteKey\s*\(/,
    `${label}: snapshot must use the pre-captured request key binding, not a recomputed call at resolve time`
  );

  const snapshotCall = body.match(
    /makeCatalogRouteSnapshot\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)/
  );
  assert.ok(
    snapshotCall,
    `${label}: successful payload must call makeCatalogRouteSnapshot(capturedKey, payload)`
  );
  assert.equal(
    snapshotCall[1],
    requestIdName,
    `${label}: makeCatalogRouteSnapshot must use the same captured request-time key (${requestIdName}), not a different/live identity`
  );

  return { requestIdName, payloadArg: snapshotCall[2] };
}

const KEY_ALL = routeKey("", "", "");
const KEY_DISPOSABLE = routeKey("Одноразовая посуда", "", "");
const KEY_HOUSEHOLD = routeKey("Хозяйственные товары", "", "");
const KEY_CHEMISTRY = routeKey("Химия, чистящие средства", "", "");
const KEY_PAPER = routeKey("Бумажная продукция", "", "");
const KEY_CHEM_SUB = routeKey("Химия, чистящие средства", "Жироудалители", "");
const KEY_CHEM_SUB_B = routeKey("Химия, чистящие средства", "Мыло", "");
const KEY_CHEM_FACET = routeKey("Химия, чистящие средства", "Жироудалители", "спрей");

const payloadFor = (key, label) =>
  makeCatalogRouteSnapshot(key, {
    categories: [{ name: "Одноразовая посуда" }, { name: "Химия, чистящие средства" }],
    products: [{ id: `prod-${label}`, name: label, category: label }],
  });

const chemistryRetained = payloadFor(KEY_CHEMISTRY, "Химия, чистящие средства");
const disposableRetained = payloadFor(KEY_DISPOSABLE, "Одноразовая посуда");
const householdRetained = payloadFor(KEY_HOUSEHOLD, "Хозяйственные товары");
const chemSubRetained = payloadFor(KEY_CHEM_SUB, "Жироудалители");
const emptyMatching = makeCatalogRouteSnapshot(KEY_PAPER, {
  categories: chemistryRetained.payload.categories,
  products: [],
});

// --- Behavioral snapshot invariants ---
assert.deepEqual(
  resolveVisibleProducts(KEY_CHEMISTRY, chemistryRetained)?.map((p) => p.id),
  ["prod-Химия, чистящие средства"],
  "matching route: A + A → payload A"
);

assert.equal(
  resolveVisibleProducts(KEY_DISPOSABLE, chemistryRetained),
  null,
  "category mismatch: A + B → null"
);
assert.equal(
  resolveVisibleProducts(KEY_CHEMISTRY, disposableRetained),
  null,
  "B→A category mismatch → null"
);
assert.equal(
  resolveVisibleProducts(KEY_HOUSEHOLD, chemistryRetained),
  null,
  "chemistry must not flash under household"
);
assert.equal(
  resolveVisibleProducts(KEY_CHEMISTRY, householdRetained),
  null,
  "household must not flash under chemistry"
);
assert.equal(
  resolveVisibleProducts(KEY_CHEM_SUB, chemistryRetained),
  null,
  "subcategory mismatch: parent payload under subcategory → null"
);
assert.equal(
  resolveVisibleProducts(KEY_CHEM_SUB_B, chemSubRetained),
  null,
  "subcategory A → B mismatch → null"
);
assert.equal(
  resolveVisibleProducts(KEY_CHEM_FACET, chemSubRetained),
  null,
  "facet mismatch → null"
);
assert.equal(
  resolveVisibleProducts(KEY_CHEMISTRY, chemSubRetained),
  null,
  "subcategory → parent mismatch → null"
);
assert.equal(
  resolveVisibleProducts(KEY_ALL, chemistryRetained),
  null,
  "category → all mismatch → null"
);

assert.deepEqual(
  resolveVisibleProducts(KEY_PAPER, payloadFor(KEY_PAPER, "Бумажная продукция"))?.map((p) => p.id),
  ["prod-Бумажная продукция"],
  "current B response: B + B → payload B"
);

assert.equal(resolveEmptyState(KEY_DISPOSABLE, chemistryRetained), false);
assert.equal(resolveEmptyState(KEY_PAPER, null), false);
assert.equal(resolveEmptyState(KEY_PAPER, emptyMatching), true);

const { categories: navCats, currentPayload: mismatched } = resolveStorefrontCatalogView(
  KEY_DISPOSABLE,
  chemistryRetained
);
assert.ok(navCats.length > 0, "nav may retain latest categories corpus");
assert.equal(mismatched, null, "nav retention must not revive mismatched products");

const lateA = makeCatalogRouteSnapshot(KEY_CHEMISTRY, {
  categories: [],
  products: [{ id: "late-chem", name: "late" }],
});
assert.equal(
  resolveVisibleProducts(KEY_PAPER, lateA),
  null,
  "late stale snapshot A while current B → null"
);

// Always-return-payload helper mutation (in-memory): must violate mismatch invariant.
function alwaysReturnPayloadView(_routeKey, snapshot) {
  const categories = Array.isArray(snapshot?.payload?.categories)
    ? snapshot.payload.categories
    : [];
  return { categories, currentPayload: snapshot?.payload ?? null };
}
assert.notEqual(
  alwaysReturnPayloadView(KEY_DISPOSABLE, chemistryRetained).currentPayload,
  null,
  "sanity: broken helper would expose stale payload"
);
assert.equal(
  resolveStorefrontCatalogView(KEY_DISPOSABLE, chemistryRetained).currentPayload,
  null,
  "correct helper keeps stale payload hidden"
);
assert.throws(
  () => {
    assert.equal(
      alwaysReturnPayloadView(KEY_DISPOSABLE, chemistryRetained).currentPayload,
      null,
      "always-return-payload mutation must fail mismatch assert"
    );
  },
  /always-return-payload mutation must fail mismatch assert|null/,
  "always-return-payload helper mutation must FAIL behavioral assert"
);

// --- CatalogPage request-time binding (structure-aware) ---
assert.match(
  catalogPageSource,
  /resolveStorefrontCatalogView/,
  "CatalogPage must resolve view via resolveStorefrontCatalogView"
);
assert.match(
  catalogPageSource,
  /currentPayload/,
  "CatalogPage products/empty-state must use currentPayload"
);
assert.doesNotMatch(
  catalogPageSource,
  /const list = data\?\.products \|\| \[\]/,
  "CatalogPage must not derive products from unbound retained data"
);
assert.doesNotMatch(
  catalogPageSource,
  /!error && data && !products\.length/,
  "empty-state must require matching currentPayload"
);

const binding = assertCatalogFetchRequestTimeBinding(catalogPageSource, "CatalogPage");

// Wrong-key mutation: retag snapshot with a different identity than the captured request key.
const wrongKeySource = catalogPageSource.replace(
  new RegExp(
    `makeCatalogRouteSnapshot\\(\\s*${binding.requestIdName}\\s*,`,
    "g"
  ),
  "makeCatalogRouteSnapshot(routeKey,"
);
assert.notEqual(
  wrongKeySource,
  catalogPageSource,
  "mutation sanity requires altering makeCatalogRouteSnapshot first argument"
);
assert.throws(
  () => assertCatalogFetchRequestTimeBinding(wrongKeySource, "mutated-wrong-key CatalogPage"),
  (err) =>
    /captured request-time key|same captured request-time key|not a different\/live identity/i.test(
      String(err?.message || err)
    ),
  "wrong-key CatalogPage mutation must FAIL request-binding assertion"
);

// Live-ref retag mutation
const liveRefSource = catalogPageSource.replace(
  new RegExp(
    `makeCatalogRouteSnapshot\\(\\s*${binding.requestIdName}\\s*,`,
    "g"
  ),
  "makeCatalogRouteSnapshot(routeKeyRef.current,"
);
assert.throws(
  () => assertCatalogFetchRequestTimeBinding(liveRefSource, "mutated-live-ref CatalogPage"),
  (err) =>
    /ref\.current live route|must not tag snapshot from a ref\.current/i.test(
      String(err?.message || err)
    ),
  "live-ref CatalogPage mutation must FAIL request-binding assertion"
);

console.log(
  JSON.stringify({
    STOREFRONT_CATALOG_STALE_ROUTE: "PASS",
    requestTimeBinding: {
      capturedName: binding.requestIdName,
      snapshotUsesCapturedKey: true,
    },
    behavioral: {
      matching: true,
      categoryMismatch: true,
      subcategoryMismatch: true,
      facetMismatch: true,
      lateStale: true,
      currentResponse: true,
      alwaysReturnMutationFails: true,
      wrongKeyMutationFails: true,
    },
    raceClaim: {
      requestCancellationPreserved: true,
      staleSnapshotRenderProtection: "TESTED",
      fullReactOverlappingAsyncLifecycle: "NOT_DIRECTLY_TESTED",
    },
    transitions: [
      "A→B",
      "B→A",
      "category→sub",
      "sub→sub",
      "sub→facet",
      "sub→parent",
      "category→all",
    ],
  })
);
