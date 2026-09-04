import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pushedPaths = [];
const dispatchedEvents = [];
const windowScrollCalls = [];
let catalogScrollTop = 0;
const catalogScrollCalls = [];
let restoreCatalogScrollOnPopstate = 0;

const catalogScroller = {
  scrollTo(options) {
    catalogScrollCalls.push(options);
    catalogScrollTop = Number(options?.top) || 0;
  },
};

globalThis.window = {
  location: {
    hostname: "clover-spb.ru",
    pathname: "/catalog",
  },
  history: {
    pushState(_state, _title, nextPath) {
      pushedPaths.push(nextPath);
      window.location.pathname = nextPath;
    },
  },
  dispatchEvent(event) {
    dispatchedEvents.push(event.type);
    if (event?.type === "popstate") {
      catalogScrollTop = restoreCatalogScrollOnPopstate;
    }
    return true;
  },
  scrollTo(options) {
    windowScrollCalls.push(options);
  },
};
globalThis.document = {
  querySelector(selector) {
    return selector === ".sf-catalog-main" ? catalogScroller : null;
  },
};
globalThis.PopStateEvent = class PopStateEvent {
  constructor(type) {
    this.type = type;
  }
};

const vite = await createServer({
  root,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const catalogPageSource = readFileSync(
  path.join(root, "src/screens/storefront/pages/CatalogPage.jsx"),
  "utf8",
);

try {
  const {
    catalogScrollRouteKey,
    navigateStorefront,
    resetCatalogScrollOnRouteIdentity,
  } = await vite.ssrLoadModule(
    "/src/screens/storefront/components/StoreHeader.jsx",
  );

  assert.equal(typeof catalogScrollRouteKey, "function");
  assert.equal(typeof resetCatalogScrollOnRouteIdentity, "function");

  const keyHousehold = catalogScrollRouteKey("Хозяйственные товары");
  const keyDisposable = catalogScrollRouteKey("Одноразовая посуда");
  const keyGloves = catalogScrollRouteKey("Хозяйственные товары", "Перчатки");
  const keyBags = catalogScrollRouteKey("Хозяйственные товары", "Пакеты");

  assert.equal(
    catalogScrollRouteKey("Хозяйственные товары", "", ""),
    keyHousehold,
  );
  assert.notEqual(keyHousehold, keyDisposable);
  assert.notEqual(keyHousehold, keyGloves);
  assert.notEqual(keyGloves, keyBags);

  // A. Same route identity, product/catalog data object replaced → scroll stays.
  catalogScrollTop = 700;
  const callsAfterScrollDown = catalogScrollCalls.length;
  const dataBefore = { products: [{ id: 1 }] };
  const dataAfter = { products: [{ id: 1 }, { id: 2 }] };
  assert.notEqual(dataBefore, dataAfter);
  const resetOnData = resetCatalogScrollOnRouteIdentity(
    keyHousehold,
    catalogScrollRouteKey("Хозяйственные товары"),
  );
  assert.equal(resetOnData, false);
  assert.equal(catalogScrollTop, 700);
  assert.equal(catalogScrollCalls.length, callsAfterScrollDown);

  // B. Cart / quantity updates are not a route-identity change → scroll stays.
  const resetOnCart = resetCatalogScrollOnRouteIdentity(keyHousehold, keyHousehold);
  const resetOnQty = resetCatalogScrollOnRouteIdentity(keyGloves, keyGloves);
  assert.equal(resetOnCart, false);
  assert.equal(resetOnQty, false);
  assert.equal(catalogScrollTop, 700);

  // Ordinary rerender with the same key → scroll stays.
  resetCatalogScrollOnRouteIdentity(keyHousehold, keyHousehold);
  assert.equal(catalogScrollTop, 700);

  // C. Category / subcategory identity change → top.
  for (const [fromKey, toKey, route, expectedPath] of [
    [
      keyHousehold,
      keyDisposable,
      { name: "catalog", category: "Одноразовая посуда" },
      "/catalog/%D0%9E%D0%B4%D0%BD%D0%BE%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D1%8F%20%D0%BF%D0%BE%D1%81%D1%83%D0%B4%D0%B0",
    ],
    [
      keyHousehold,
      keyGloves,
      {
        name: "catalog",
        category: "Хозяйственные товары",
        subcategory: "Перчатки",
      },
      "/catalog/%D0%A5%D0%BE%D0%B7%D1%8F%D0%B9%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%BD%D1%8B%D0%B5%20%D1%82%D0%BE%D0%B2%D0%B0%D1%80%D1%8B/%D0%9F%D0%B5%D1%80%D1%87%D0%B0%D1%82%D0%BA%D0%B8",
    ],
    [
      keyGloves,
      keyBags,
      {
        name: "catalog",
        category: "Хозяйственные товары",
        subcategory: "Пакеты",
      },
      "/catalog/%D0%A5%D0%BE%D0%B7%D1%8F%D0%B9%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%BD%D1%8B%D0%B5%20%D1%82%D0%BE%D0%B2%D0%B0%D1%80%D1%8B/%D0%9F%D0%B0%D0%BA%D0%B5%D1%82%D1%8B",
    ],
  ]) {
    catalogScrollTop = 700;
    restoreCatalogScrollOnPopstate = 700;
    navigateStorefront(route);
    assert.equal(pushedPaths.at(-1), expectedPath);
    assert.equal(dispatchedEvents.at(-1), "popstate");
    // popstate may restore the old offset; post-commit identity reset is the one reset.
    const didReset = resetCatalogScrollOnRouteIdentity(fromKey, toKey);
    assert.equal(didReset, true);
    assert.equal(catalogScrollTop, 0);
    assert.deepEqual(catalogScrollCalls.at(-1), {
      top: 0,
      left: 0,
      behavior: "auto",
    });
    assert.deepEqual(windowScrollCalls.at(-1), {
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }

  assert.match(
    catalogPageSource,
    /resetCatalogScrollOnRouteIdentity/,
    "CatalogPage должен вызывать identity-trigger, а не сбрасывать скролл от data",
  );
  assert.match(
    catalogPageSource,
    /catalogScrollRouteKey\(category,\s*subcategory,\s*facet\)/,
  );
  const scrollEffect = catalogPageSource.match(
    /useLayoutEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?resetCatalogScrollOnRouteIdentity\([\s\S]*?\},\s*\[([^\]]+)\]/,
  );
  assert.ok(scrollEffect, "useLayoutEffect сброса скролла должен зависеть только от route identity");
  assert.equal(scrollEffect[1].trim(), "routeKey");
  assert.doesNotMatch(scrollEffect[1], /\b(data|products|query|error|treeOpen)\b/);

  const { navigateStorefront: navAfter } = await vite.ssrLoadModule(
    "/src/screens/storefront/components/StoreHeader.jsx",
  );
  const scrollsBeforeNavOnly = catalogScrollCalls.length;
  catalogScrollTop = 420;
  restoreCatalogScrollOnPopstate = 420;
  navAfter({ name: "catalog", category: "Прочее" });
  assert.equal(
    catalogScrollCalls.length,
    scrollsBeforeNavOnly,
    "navigateStorefront сам не сбрасывает скролл — только identity trigger после commit",
  );

  console.log("verify-storefront-catalog-scroll-top: ok");
} finally {
  await vite.close();
}
