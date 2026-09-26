import assert from "node:assert/strict";
import {
  CATALOG_CARD_RENDER_BATCH,
  catalogScrollRemaining,
  countSectionProducts,
  isCatalogScrollNearEnd,
  makeFlatCatalogSection,
  nextRenderLimitAfterDemand,
  orderedProductIds,
  scheduleCatalogRenderBump,
  sliceSectionsToRenderLimit,
  stabilizeSectionProductOrder,
} from "../../src/screens/storefront/catalogProgressiveRender.js";

const sections = [
  {
    name: "A",
    products: Array.from({ length: 50 }, (_, i) => ({ id: `a${i}` })),
  },
  {
    name: "B",
    products: Array.from({ length: 40 }, (_, i) => ({ id: `b${i}` })),
  },
];

assert.equal(countSectionProducts(sections), 90);

const first = sliceSectionsToRenderLimit(sections, CATALOG_CARD_RENDER_BATCH);
assert.equal(countSectionProducts(first), CATALOG_CARD_RENDER_BATCH);
assert.equal(first.length, 1);
assert.equal(first[0].products.length, CATALOG_CARD_RENDER_BATCH);
assert.deepEqual(
  orderedProductIds(first),
  Array.from({ length: CATALOG_CARD_RENDER_BATCH }, (_, i) => `a${i}`)
);

const mid = sliceSectionsToRenderLimit(sections, 60);
assert.equal(countSectionProducts(mid), 60);
assert.equal(mid.length, 2);
assert.equal(mid[0].products.length, 50);
assert.equal(mid[1].products.length, 10);
assert.equal(new Set(orderedProductIds(mid)).size, 60);

const all = sliceSectionsToRenderLimit(sections, 10_000);
assert.equal(countSectionProducts(all), 90);
assert.deepEqual(orderedProductIds(all), orderedProductIds(sections));

// Demand bump under fast scroll
assert.equal(nextRenderLimitAfterDemand(36, 90), 108 > 90 ? 90 : 108);
assert.equal(nextRenderLimitAfterDemand(36, 90), 90);
assert.equal(nextRenderLimitAfterDemand(20, 100), 92);
assert.equal(nextRenderLimitAfterDemand(100, 100), 100);

// Catalog owns an internal scroller. A viewport-sized document must not make
// the catalog look permanently near its end and auto-fetch every API page.
const internalScroller = { scrollHeight: 4_000, scrollTop: 0, clientHeight: 600 };
assert.equal(catalogScrollRemaining(internalScroller), 3_400);
assert.equal(isCatalogScrollNearEnd(internalScroller), false);
assert.equal(
  isCatalogScrollNearEnd({ ...internalScroller, scrollTop: 3_200 }),
  true
);
assert.equal(isCatalogScrollNearEnd({ scrollHeight: 600, clientHeight: 0 }), false);

// The root catalog must stay one continuous grid across API pages. Splitting
// category chunks into separate four-column grids created the visible holes.
{
  const firstProducts = Array.from({ length: 60 }, (_, i) => ({
    id: `p${i}`,
    category: i % 2 ? "A" : "B",
  }));
  const allProducts = [
    ...firstProducts,
    ...Array.from({ length: 60 }, (_, i) => ({
      id: `p${i + 60}`,
      category: i % 3 ? "C" : "A",
    })),
  ];
  const initial = stabilizeSectionProductOrder(makeFlatCatalogSection(firstProducts));
  const next = stabilizeSectionProductOrder(
    makeFlatCatalogSection(allProducts),
    initial
  );

  assert.equal(initial.length, 1);
  assert.equal(next.length, 1);
  assert.equal(next[0].products.length, 120);
  assert.equal(next[0].continuation, undefined);
  assert.equal(next[0].hideHeading, true);
  assert.deepEqual(
    orderedProductIds(next).slice(0, 60),
    orderedProductIds(initial)
  );
}

// A newly fetched product may sort ahead of an existing one, but cards already
// on screen must not jump. Only genuinely new ids are appended per section.
{
  const initial = stabilizeSectionProductOrder([
    { name: "A", products: [{ id: "a2" }, { id: "a3" }] },
    { name: "B", products: [{ id: "b2" }] },
  ]);
  const next = stabilizeSectionProductOrder([
    { name: "A", products: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] },
    { name: "B", products: [{ id: "b1" }, { id: "b2" }] },
  ], initial);
  assert.deepEqual(orderedProductIds(next), ["a2", "a3", "b2", "a1", "b1"]);
  assert.deepEqual(orderedProductIds(next).slice(0, 3), orderedProductIds(initial));
  assert.equal(next[2].continuation, true);
}

// No requestIdleCallback: timer fallback runs
{
  let calls = 0;
  const timers = [];
  const cancel = scheduleCatalogRenderBump(() => {
    calls += 1;
  }, {
    ric: null,
    fallbackDelayMs: 5,
    setTimer: (fn, ms) => {
      const id = { fn, ms };
      timers.push(id);
      return id;
    },
    clearTimer: (id) => {
      id.cleared = true;
    },
  });
  assert.equal(timers.length, 1);
  timers[0].fn();
  assert.equal(calls, 1);
  cancel();
}

// Idle + guaranteed timer: cancel prevents double bump
{
  let calls = 0;
  let idleCb = null;
  let timerCb = null;
  const cancel = scheduleCatalogRenderBump(() => {
    calls += 1;
  }, {
    idleTimeoutMs: 10,
    fallbackDelayMs: 10,
    ric: (fn) => {
      idleCb = fn;
      return 1;
    },
    cic: () => {},
    setTimer: (fn) => {
      timerCb = fn;
      return 2;
    },
    clearTimer: () => {},
  });
  idleCb();
  timerCb();
  assert.equal(calls, 1, "bump must run once");
  cancel();
}

// Cancel before fire: zero bumps
{
  let calls = 0;
  let timerCb = null;
  const cancel = scheduleCatalogRenderBump(() => {
    calls += 1;
  }, {
    ric: null,
    setTimer: (fn) => {
      timerCb = fn;
      return 1;
    },
    clearTimer: () => {},
  });
  cancel();
  timerCb();
  assert.equal(calls, 0);
}

console.log("verify-catalog-progressive-render: ok");
