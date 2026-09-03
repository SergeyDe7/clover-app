import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pushedPaths = [];
const dispatchedEvents = [];
const windowScrollCalls = [];
let catalogScrollTop = 0;
const catalogScrollCalls = [];

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

try {
  const { navigateStorefront } = await vite.ssrLoadModule(
    "/src/screens/storefront/components/StoreHeader.jsx",
  );

  for (const [route, expectedPath] of [
    [
      { name: "catalog", category: "Хозяйственные товары" },
      "/catalog/%D0%A5%D0%BE%D0%B7%D1%8F%D0%B9%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%BD%D1%8B%D0%B5%20%D1%82%D0%BE%D0%B2%D0%B0%D1%80%D1%8B",
    ],
    [
      {
        name: "catalog",
        category: "Хозяйственные товары",
        subcategory: "Перчатки",
      },
      "/catalog/%D0%A5%D0%BE%D0%B7%D1%8F%D0%B9%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%BD%D1%8B%D0%B5%20%D1%82%D0%BE%D0%B2%D0%B0%D1%80%D1%8B/%D0%9F%D0%B5%D1%80%D1%87%D0%B0%D1%82%D0%BA%D0%B8",
    ],
  ]) {
    catalogScrollTop = 700;
    navigateStorefront(route);

    assert.equal(pushedPaths.at(-1), expectedPath, "Маршрут каталога должен обновиться");
    assert.equal(
      catalogScrollTop,
      0,
      "Новая категория или подкатегория должна открываться с начала списка товаров",
    );
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
    assert.equal(dispatchedEvents.at(-1), "popstate");
  }

  console.log("verify-storefront-catalog-scroll-top: ok");
} finally {
  await vite.close();
}
