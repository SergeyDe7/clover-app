import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const windowScrollCalls = [];
let windowScrollY = 0;

globalThis.window = {
  scrollY: 0,
  pageYOffset: 0,
  scrollTo(optionsOrX, y) {
    if (typeof optionsOrX === "object" && optionsOrX) {
      windowScrollCalls.push(optionsOrX);
      windowScrollY = Number(optionsOrX.top) || 0;
      window.scrollY = windowScrollY;
      window.pageYOffset = windowScrollY;
      return;
    }
    const top = Number(y) || 0;
    windowScrollCalls.push({ top, left: Number(optionsOrX) || 0, behavior: "auto" });
    windowScrollY = top;
    window.scrollY = top;
    window.pageYOffset = top;
  },
};
globalThis.document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
};

const vite = await createServer({
  root,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const panelSource = readFileSync(
  path.join(root, "src/screens/client/ClientCatalogAddPanel.jsx"),
  "utf8",
);

try {
  const {
    clientCatalogNavKey,
    resetClientCatalogScrollOnNavIdentity,
  } = await vite.ssrLoadModule(
    "/src/screens/client/ClientCatalogAddPanel.jsx",
  );

  assert.equal(typeof clientCatalogNavKey, "function");
  assert.equal(typeof resetClientCatalogScrollOnNavIdentity, "function");

  const keyAll = clientCatalogNavKey("", "");
  const keyHousehold = clientCatalogNavKey("Хозяйственные товары", "");
  const keyGloves = clientCatalogNavKey("Хозяйственные товары", "Перчатки");
  const keyBags = clientCatalogNavKey("Хозяйственные товары", "Пакеты");
  const keyDisposable = clientCatalogNavKey("Одноразовая посуда", "");

  assert.notEqual(keyHousehold, keyDisposable);
  assert.notEqual(keyHousehold, keyGloves);
  assert.notEqual(keyGloves, keyBags);
  assert.equal(clientCatalogNavKey("Хозяйственные товары"), keyHousehold);

  // RED / current failure without identity reset: scrolled list stays mid-page
  // after category change unless resetClientCatalogScrollOnNavIdentity runs.
  windowScrollY = 820;
  window.scrollY = 820;
  const before = windowScrollCalls.length;
  const stayed = resetClientCatalogScrollOnNavIdentity(keyHousehold, keyHousehold);
  assert.equal(stayed, false, "same category identity must not reset scroll");
  assert.equal(windowScrollY, 820);
  assert.equal(windowScrollCalls.length, before);

  // Search / cart / qty / data refresh are not nav identity → no reset
  assert.equal(resetClientCatalogScrollOnNavIdentity(keyGloves, keyGloves), false);
  assert.equal(windowScrollY, 820);

  // Category A scrolled → category B must go to top
  windowScrollY = 820;
  window.scrollY = 820;
  assert.equal(
    resetClientCatalogScrollOnNavIdentity(keyHousehold, keyDisposable),
    true,
  );
  assert.equal(windowScrollY, 0);
  assert.deepEqual(windowScrollCalls.at(-1), {
    top: 0,
    left: 0,
    behavior: "auto",
  });

  // Category → subcategory
  windowScrollY = 640;
  window.scrollY = 640;
  assert.equal(resetClientCatalogScrollOnNavIdentity(keyHousehold, keyGloves), true);
  assert.equal(windowScrollY, 0);

  // Subcategory → subcategory
  windowScrollY = 510;
  window.scrollY = 510;
  assert.equal(resetClientCatalogScrollOnNavIdentity(keyGloves, keyBags), true);
  assert.equal(windowScrollY, 0);

  // All categories
  windowScrollY = 300;
  window.scrollY = 300;
  assert.equal(resetClientCatalogScrollOnNavIdentity(keyBags, keyAll), true);
  assert.equal(windowScrollY, 0);

  assert.match(
    panelSource,
    /useLayoutEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?resetClientCatalogScrollOnNavIdentity\([\s\S]*?\},\s*\[navKey\]/,
    "ClientCatalogAddPanel must reset window scroll only on navKey identity",
  );
  const effect = panelSource.match(
    /useLayoutEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?resetClientCatalogScrollOnNavIdentity\([\s\S]*?\},\s*\[([^\]]+)\]/,
  );
  assert.ok(effect);
  assert.equal(effect[1].trim(), "navKey");
  assert.doesNotMatch(effect[1], /\b(search|products|busyId|matrixProductIds|deferredSearch)\b/);

  // Must not import/touch storefront scroll helpers
  assert.doesNotMatch(panelSource, /scrollStorefrontCatalogToTop|resetCatalogScrollOnRouteIdentity/);
  assert.doesNotMatch(panelSource, /screens\/storefront\/components\/StoreHeader/);

  console.log("verify-client-catalog-scroll-top: ok");
} finally {
  await vite.close();
}
