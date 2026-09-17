import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  autoLinkCloverClients,
  mergeClientLinksPreservingOneCLinks,
} from "../src/oneCClients.js";
import { buildSalePriceRequirements } from "../src/oneCSalePrices.js";
import { resolveClientProductPricing } from "../src/pricing.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDirectory, "..");
const firstSyncAt = "2026-09-17T10:00:00.000Z";
const secondSyncAt = "2026-09-17T10:05:00.000Z";

const cloverClient = {
  id: "client-1",
  companyName: "Fixture client",
  inn: "0000000001",
};
const typeA = {
  id: "one-c-client-1",
  name: "Fixture counterparty",
  inn: "0000000001",
  priceTypeId: "price-type-a",
  priceTypeName: "Category A",
};
const typeB = {
  ...typeA,
  priceTypeId: "price-type-b",
  priceTypeName: "Category B",
};
const typeC = {
  ...typeA,
  priceTypeId: "price-type-c",
  priceTypeName: "Category C",
};

// A. A manager-owned category and related defaults are authoritative.
const manualBefore = {
  oneCId: typeA.id,
  oneCPriceTypeId: typeA.priceTypeId,
  oneCPriceTypeName: typeA.priceTypeName,
  oneCPriceTypeSource: "manual",
  defaultPricingMode: "base",
  defaultMarkupPercent: 12,
  personalPrices: { product: { source: "manual", piece: 150 } },
};
const manualAfterPreview = autoLinkCloverClients(
  [cloverClient],
  { [cloverClient.id]: manualBefore },
  [typeB],
  firstSyncAt
).clientLinks[cloverClient.id];
assert.equal(manualAfterPreview.oneCPriceTypeId, typeA.priceTypeId);
assert.equal(manualAfterPreview.oneCPriceTypeName, typeA.priceTypeName);
assert.equal(manualAfterPreview.oneCPriceTypeSource, "manual");
assert.equal(manualAfterPreview.defaultPricingMode, "base");
assert.equal(manualAfterPreview.defaultMarkupPercent, 12);
assert.deepEqual(manualAfterPreview.personalPrices, manualBefore.personalPrices);

// B. An existing link without a category may receive the contract category.
const filled = autoLinkCloverClients(
  [cloverClient],
  { [cloverClient.id]: { oneCId: typeB.id, oneCPriceTypeId: "" } },
  [typeB],
  firstSyncAt
).clientLinks[cloverClient.id];
assert.equal(filled.oneCPriceTypeId, typeB.priceTypeId);
assert.equal(filled.oneCPriceTypeName, typeB.priceTypeName);
assert.equal(filled.oneCPriceTypeSource, "one_c_auto");

// C. A newly auto-linked client receives the contract category.
const newAutoLink = autoLinkCloverClients(
  [cloverClient],
  {},
  [typeB],
  firstSyncAt
).clientLinks[cloverClient.id];
assert.equal(newAutoLink.oneCPriceTypeId, typeB.priceTypeId);
assert.equal(newAutoLink.oneCPriceTypeSource, "one_c_auto");

// D. A category previously assigned by 1C follows later contract changes.
const refreshedAuto = autoLinkCloverClients(
  [cloverClient],
  {
    [cloverClient.id]: {
      ...newAutoLink,
      oneCPriceTypeId: typeB.priceTypeId,
      oneCPriceTypeName: typeB.priceTypeName,
      oneCPriceTypeSource: "one_c_auto",
    },
  },
  [typeC],
  secondSyncAt
).clientLinks[cloverClient.id];
assert.equal(refreshedAuto.oneCPriceTypeId, typeC.priceTypeId);
assert.equal(refreshedAuto.oneCPriceTypeName, typeC.priceTypeName);
assert.equal(refreshedAuto.oneCPriceTypeSource, "one_c_auto");

// E. Repeating the same preview is idempotent.
const repeated = autoLinkCloverClients(
  [cloverClient],
  { [cloverClient.id]: refreshedAuto },
  [typeC],
  "2026-09-17T10:10:00.000Z"
);
assert.equal(repeated.changed, false);
assert.deepEqual(repeated.clientLinks[cloverClient.id], refreshedAuto);

// F. A manager change A -> C is marked manual by the server-side merge.
const manuallyChanged = mergeClientLinksPreservingOneCLinks(
  {
    [cloverClient.id]: {
      oneCPriceTypeId: typeC.priceTypeId,
      oneCPriceTypeName: typeC.priceTypeName,
    },
  },
  {
    [cloverClient.id]: {
      ...newAutoLink,
      oneCPriceTypeId: typeA.priceTypeId,
      oneCPriceTypeName: typeA.priceTypeName,
      oneCPriceTypeSource: "one_c_auto",
    },
  },
  { manualPriceConfigClientIds: [cloverClient.id] }
)[cloverClient.id];
assert.equal(manuallyChanged.oneCPriceTypeId, typeC.priceTypeId);
assert.equal(manuallyChanged.oneCPriceTypeSource, "manual");

// A manual clear is an explicit base-price decision, not an unassigned value.
const manuallyCleared = mergeClientLinksPreservingOneCLinks(
  {
    [cloverClient.id]: {
      oneCPriceTypeId: "",
      oneCPriceTypeName: "",
      defaultPricingMode: "base",
    },
  },
  { [cloverClient.id]: refreshedAuto },
  { manualPriceConfigClientIds: [cloverClient.id] }
)[cloverClient.id];
assert.equal(manuallyCleared.oneCPriceTypeSource, "manual");
const clearedAfterPreview = autoLinkCloverClients(
  [cloverClient],
  { [cloverClient.id]: manuallyCleared },
  [typeB],
  secondSyncAt
).clientLinks[cloverClient.id];
assert.equal(clearedAfterPreview.oneCPriceTypeId, "");
assert.equal(clearedAfterPreview.oneCPriceTypeName, "");
assert.equal(clearedAfterPreview.defaultPricingMode, "base");
assert.equal(clearedAfterPreview.oneCPriceTypeSource, "manual");

// G. Unrelated edits preserve authority; request bodies cannot forge provenance.
const unrelatedEdit = mergeClientLinksPreservingOneCLinks(
  {
    [cloverClient.id]: {
      managerNote: "Fixture note",
      oneCPriceTypeSource: "one_c_auto",
    },
  },
  { [cloverClient.id]: manualBefore },
  { manualPriceConfigClientIds: [] }
)[cloverClient.id];
assert.equal(unrelatedEdit.managerNote, "Fixture note");
assert.equal(unrelatedEdit.oneCPriceTypeId, typeA.priceTypeId);
assert.equal(unrelatedEdit.oneCPriceTypeSource, "manual");

// H. Missing or malformed 1C price types never clear a manual category.
for (const invalidPriceType of ["", "   ", { unexpected: true }]) {
  const invalidResult = autoLinkCloverClients(
    [cloverClient],
    { [cloverClient.id]: manualBefore },
    [{ ...typeB, priceTypeId: invalidPriceType, priceTypeName: "" }],
    firstSyncAt
  ).clientLinks[cloverClient.id];
  assert.equal(invalidResult.oneCPriceTypeId, typeA.priceTypeId);
  assert.equal(invalidResult.oneCPriceTypeName, typeA.priceTypeName);
}

// Legacy non-empty values remain protected but are not relabelled as manual.
const legacyUnknown = {
  oneCId: typeA.id,
  oneCPriceTypeId: typeA.priceTypeId,
  oneCPriceTypeName: typeA.priceTypeName,
  defaultPricingMode: "one_c_price_type",
};
const legacyAfter = autoLinkCloverClients(
  [cloverClient],
  { [cloverClient.id]: legacyUnknown },
  [typeB],
  firstSyncAt
).clientLinks[cloverClient.id];
assert.equal(legacyAfter.oneCPriceTypeId, typeA.priceTypeId);
assert.equal(legacyAfter.oneCPriceTypeSource, undefined);

const legacyMinimal = {
  oneCId: typeA.id,
  oneCPriceTypeId: typeA.priceTypeId,
  oneCPriceTypeName: typeA.priceTypeName,
};
const legacyRoundTrip = mergeClientLinksPreservingOneCLinks(
  {
    [cloverClient.id]: {
      ...legacyMinimal,
      defaultPricingMode: "base",
      managerNote: "Unrelated legacy edit",
      oneCPriceTypeSource: "manual",
    },
  },
  { [cloverClient.id]: legacyMinimal },
  { manualPriceConfigClientIds: [] }
)[cloverClient.id];
assert.equal(legacyRoundTrip.managerNote, "Unrelated legacy edit");
assert.equal(legacyRoundTrip.oneCPriceTypeId, typeA.priceTypeId);
assert.equal(legacyRoundTrip.oneCPriceTypeSource, undefined);
assert.equal(legacyRoundTrip.defaultPricingMode, undefined);

// A stale UI snapshot cannot revert an auto value without explicit price intent.
const staleSnapshot = mergeClientLinksPreservingOneCLinks(
  {
    [cloverClient.id]: {
      ...newAutoLink,
      managerNote: "Fresh unrelated edit",
      oneCPriceTypeSource: "manual",
    },
  },
  { [cloverClient.id]: refreshedAuto },
  { manualPriceConfigClientIds: [] }
)[cloverClient.id];
assert.equal(staleSnapshot.managerNote, "Fresh unrelated edit");
assert.equal(staleSnapshot.oneCPriceTypeId, typeC.priceTypeId);
assert.equal(staleSnapshot.oneCPriceTypeName, typeC.priceTypeName);
assert.equal(staleSnapshot.oneCPriceTypeSource, "one_c_auto");

// I. Updating one client does not mutate another client.
const secondClient = {
  id: "client-2",
  companyName: "Second fixture client",
  inn: "0000000002",
};
const secondManual = {
  oneCId: "one-c-client-2",
  oneCPriceTypeId: "second-manual-type",
  oneCPriceTypeName: "Second manual category",
  oneCPriceTypeSource: "manual",
  defaultPricingMode: "one_c_price_type",
};
const multiClientResult = autoLinkCloverClients(
  [cloverClient, secondClient],
  {
    [cloverClient.id]: {
      ...newAutoLink,
      oneCPriceTypeSource: "one_c_auto",
    },
    [secondClient.id]: secondManual,
  },
  [
    typeC,
    {
      id: secondManual.oneCId,
      name: "Second fixture counterparty",
      inn: secondClient.inn,
      priceTypeId: "unsafe-overwrite",
      priceTypeName: "Unsafe overwrite",
    },
  ],
  secondSyncAt
).clientLinks;
assert.equal(multiClientResult[cloverClient.id].oneCPriceTypeId, typeC.priceTypeId);
assert.deepEqual(multiClientResult[secondClient.id], {
  ...secondManual,
  matched1C: true,
  oneCCode: "",
  oneCName: "Second fixture counterparty",
  oneCInn: secondClient.inn,
  oneCLinkMode: "manual",
  oneCLinkedAt: secondSyncAt,
});

// J. The preview state writes are wired through the transaction primitive.
const serverSource = readFileSync(path.join(serverRoot, "src", "server.js"), "utf8");
const previewStart = serverSource.indexOf(
  'app.post("/api/one-c/clients-preview"'
);
const previewEnd = serverSource.indexOf(
  'app.get(\n  "/api/admin/one-c/clients"',
  previewStart
);
assert.ok(previewStart >= 0 && previewEnd > previewStart);
const previewRoute = serverSource.slice(previewStart, previewEnd);
assert.match(previewRoute, /runInTransaction\(\(\) => \{/);

const fixtureDirectory = mkdtempSync(
  path.join(tmpdir(), "clover-manual-price-type-")
);
process.env.DB_PATH = path.join(fixtureDirectory, "fixture.sqlite");
const {
  getGlobalState,
  runInTransaction,
  setGlobalState,
} = await import(`../src/db.js?manual-price-type=${Date.now()}`);
setGlobalState("transactionFixtureA", { value: "before-a" });
setGlobalState("transactionFixtureB", { value: "before-b" });
assert.throws(
  () =>
    runInTransaction(() => {
      setGlobalState("transactionFixtureA", { value: "after-a" });
      setGlobalState("transactionFixtureB", { value: "after-b" });
      throw new Error("injected preview persistence failure");
    }),
  /injected preview persistence failure/
);
assert.deepEqual(getGlobalState("transactionFixtureA", {}), {
  value: "before-a",
});
assert.deepEqual(getGlobalState("transactionFixtureB", {}), {
  value: "before-b",
});

// K. Price requests and calculation keep using the protected saved ID.
const pricedProduct = {
  id: "product-1",
  oneCId: "one-c-product-1",
  active: true,
  matrixMode: "selected",
  pricePiece: 0,
  pieceSize: 1,
  saleUnits: ["piece"],
};
const requirements = buildSalePriceRequirements(
  [pricedProduct],
  {
    [cloverClient.id]: {
      ...manualAfterPreview,
      defaultPricingMode: "one_c_price_type",
      matrixMode: "selected",
      matrixProductIds: [pricedProduct.id],
    },
  },
  {}
);
assert.ok(
  requirements.some(
    (item) =>
      item.id === pricedProduct.oneCId &&
      item.priceTypeId === typeA.priceTypeId
  )
);
assert.ok(
  !requirements.some((item) => item.priceTypeId === typeB.priceTypeId)
);
const calculated = resolveClientProductPricing(
  pricedProduct,
  {},
  {
    id: pricedProduct.oneCId,
    salePricesByType: {
      [typeA.priceTypeId]: { piece: 125 },
      [typeB.priceTypeId]: { piece: 999 },
    },
  },
  {
    ...manualAfterPreview,
    defaultPricingMode: "one_c_price_type",
  }
);
assert.equal(calculated.oneCPriceTypeId, typeA.priceTypeId);
assert.equal(calculated.prices.piece, 125);

// L. The change set does not modify order, queue, claim or ACK implementation.
let changedPaths = "";
let serverDiff = "";
try {
  changedPaths = execFileSync(
    "git",
    ["diff", "--name-only", "origin/main", "--"],
    { cwd: path.resolve(serverRoot, ".."), encoding: "utf8" }
  );
  serverDiff = execFileSync(
    "git",
    ["diff", "--unified=0", "origin/main", "--", "server/src/server.js"],
    { cwd: path.resolve(serverRoot, ".."), encoding: "utf8" }
  );
} catch {
  // A source archive may not have origin/main; functional order verifiers still
  // run separately in the delivery matrix.
}
assert.equal(
  changedPaths
    .split(/\r?\n/u)
    .filter(Boolean)
    .some((file) =>
      /(^|\/)(exchange|order|onecClaim|oneCAccepted)/iu.test(file)
    ),
  false
);
for (const match of serverDiff.matchAll(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/gmu)) {
  const oldLine = Number(match[1]);
  assert.ok(
    oldLine < 3900 || oldLine > 4525,
    `Order/queue/claim/ACK hunk changed near server.js:${oldLine}`
  );
}

console.log("verify-manual-client-price-type: ok");
