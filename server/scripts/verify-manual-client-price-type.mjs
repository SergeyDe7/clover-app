import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  autoLinkCloverClients,
  clientPriceTypeSource,
  mergeClientLinksPreservingOneCLinks,
} from "../src/oneCClients.js";
import { buildSalePriceRequirements } from "../src/oneCSalePrices.js";
import { resolveClientProductPricing } from "../src/pricing.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(serverRoot, "..");
const firstSyncAt = "2026-09-17T10:00:00.000Z";
const secondSyncAt = "2026-09-17T10:05:00.000Z";
const EXPECTED_REVIEW_RANGE = Object.freeze({
  base: "fcf0fc38262453cc28d53478af1ae96d6c860b87",
  head: "1bc7b81ceb5893f7e8f9a19f251a5b40cb4857c1",
});

function parseReviewRange(args) {
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || "").trim() : "";
  };
  const base = valueAfter("--base");
  const head = valueAfter("--head");
  const shaPattern = /^[0-9a-f]{40}$/u;
  if (!shaPattern.test(base) || !shaPattern.test(head)) {
    throw new Error(
      "verify-manual-client-price-type requires exact --base and --head 40-character SHA values."
    );
  }
  return { base, head };
}

function assertExpectedReviewRange(range) {
  assert.deepEqual(
    range,
    EXPECTED_REVIEW_RANGE,
    "Manual client-price review must use the exact immutable PR #132 range."
  );
}

const verifierArgs = process.argv.slice(2);
const functionalOnly = verifierArgs.length === 1 && verifierArgs[0] === "--functional-only";
const reviewRange = functionalOnly ? null : parseReviewRange(verifierArgs);

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

const unchangedExplicitIntent = mergeClientLinksPreservingOneCLinks(
  {
    [cloverClient.id]: {
      oneCPriceTypeId: refreshedAuto.oneCPriceTypeId,
      oneCPriceTypeName: refreshedAuto.oneCPriceTypeName,
      defaultPricingMode: refreshedAuto.defaultPricingMode,
      oneCPriceTypeSource: "manual",
    },
  },
  { [cloverClient.id]: refreshedAuto },
  { manualPriceConfigClientIds: [cloverClient.id] }
)[cloverClient.id];
assert.equal(unchangedExplicitIntent.oneCPriceTypeId, typeC.priceTypeId);
assert.equal(unchangedExplicitIntent.oneCPriceTypeSource, "one_c_auto");

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
const assertLegacyUnknownClassification = (classifier) => {
  assert.equal(
    classifier(legacyUnknown),
    "legacy_unknown",
    "Непустая legacy-запись без provenance обязана классифицироваться как legacy_unknown."
  );
};
assertLegacyUnknownClassification(clientPriceTypeSource);
const legacyAfter = autoLinkCloverClients(
  [cloverClient],
  { [cloverClient.id]: legacyUnknown },
  [typeB],
  firstSyncAt
).clientLinks[cloverClient.id];
assert.equal(legacyAfter.oneCPriceTypeId, typeA.priceTypeId);
assert.equal(legacyAfter.oneCPriceTypeSource, undefined);
assert.equal(clientPriceTypeSource(legacyAfter), "legacy_unknown");

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
assert.equal(clientPriceTypeSource(legacyRoundTrip), "legacy_unknown");

const legacyManualChange = mergeClientLinksPreservingOneCLinks(
  {
    [cloverClient.id]: {
      oneCPriceTypeId: typeC.priceTypeId,
      oneCPriceTypeName: typeC.priceTypeName,
      defaultPricingMode: "one_c_price_type",
    },
  },
  { [cloverClient.id]: legacyUnknown },
  { manualPriceConfigClientIds: [cloverClient.id] }
)[cloverClient.id];
assert.equal(legacyManualChange.oneCPriceTypeId, typeC.priceTypeId);
assert.equal(legacyManualChange.oneCPriceTypeSource, "manual");
assert.equal(clientPriceTypeSource(legacyManualChange), "manual");

const emptyLegacyLink = {
  oneCId: typeB.id,
  oneCPriceTypeId: "",
  oneCPriceTypeName: "",
};
assert.equal(clientPriceTypeSource(emptyLegacyLink), "");
const emptyLegacyAfterAuto = autoLinkCloverClients(
  [cloverClient],
  { [cloverClient.id]: emptyLegacyLink },
  [typeB],
  firstSyncAt
).clientLinks[cloverClient.id];
assert.equal(emptyLegacyAfterAuto.oneCPriceTypeId, typeB.priceTypeId);
assert.equal(emptyLegacyAfterAuto.oneCPriceTypeSource, "one_c_auto");
assert.equal(clientPriceTypeSource(emptyLegacyAfterAuto), "one_c_auto");

const classifierMutationDirectory = mkdtempSync(
  path.join(tmpdir(), "clover-legacy-classifier-mutant-")
);
const oneCClientsSource = readFileSync(
  path.join(serverRoot, "src", "oneCClients.js"),
  "utf8"
);
const legacyFallbackSource =
  'return cleanPriceTypeId(link.oneCPriceTypeId) ? "legacy_unknown" : "";';
assert.ok(oneCClientsSource.includes(legacyFallbackSource));
const mutatedClassifierSource = oneCClientsSource.replace(
  legacyFallbackSource,
  'return cleanPriceTypeId(link.oneCPriceTypeId) ? "manual" : "";'
);
const mutatedClassifierPath = path.join(
  classifierMutationDirectory,
  "oneCClients-mutated.mjs"
);
writeFileSync(mutatedClassifierPath, mutatedClassifierSource);
const mutatedClassifierModule = await import(
  `${pathToFileURL(mutatedClassifierPath).href}?mutation=${Date.now()}`
);
assert.equal(
  mutatedClassifierModule.clientPriceTypeSource(legacyUnknown),
  "manual"
);
assert.throws(
  () =>
    assertLegacyUnknownClassification(
      mutatedClassifierModule.clientPriceTypeSource
    ),
  /legacy_unknown/
);

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

// Omitted/null/malformed intent is always equivalent to an empty intent list.
for (const manualPriceConfigClientIds of [
  undefined,
  null,
  "client-1",
  { clientId: cloverClient.id },
  1,
  [],
]) {
  const options =
    manualPriceConfigClientIds === undefined
      ? undefined
      : { manualPriceConfigClientIds };
  const result = mergeClientLinksPreservingOneCLinks(
    {
      [cloverClient.id]: {
        ...newAutoLink,
        oneCPriceTypeId: typeA.priceTypeId,
        oneCPriceTypeName: typeA.priceTypeName,
        oneCPriceTypeSource: "manual",
      },
    },
    { [cloverClient.id]: refreshedAuto },
    options
  )[cloverClient.id];
  assert.equal(result.oneCPriceTypeId, typeC.priceTypeId);
  assert.equal(result.oneCPriceTypeName, typeC.priceTypeName);
  assert.equal(result.oneCPriceTypeSource, "one_c_auto");
}

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
const serverSource = readFileSync(path.join(serverRoot, "src", "server.js"), "utf8").replace(/\r\n/gu, "\n");
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

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitHealth(baseUrl, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Server process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Focused verifier HTTP server health timeout.");
}

async function httpApi(
  baseUrl,
  route,
  { method = "GET", token = "", body, headers = {} } = {}
) {
  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: response.status, json };
}

function seedHttpFixture(databasePath, outputPath, password) {
  const seedPath = path.join(path.dirname(databasePath), "seed-http.mjs");
  writeFileSync(
    seedPath,
    `
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(${JSON.stringify(
      path.join(serverRoot, "package.json")
    )});
const bcrypt = require("bcryptjs");
process.env.DB_PATH = ${JSON.stringify(databasePath)};
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
const { createUser, setGlobalState } = await import(${JSON.stringify(
      pathToFileURL(path.join(serverRoot, "src", "db.js")).href
    )});
const passwordHash = bcrypt.hashSync(${JSON.stringify(password)}, 4);
const admin = createUser({
  email: "manual-price-admin@test.local",
  passwordHash,
  role: "admin",
  emailVerified: true,
  approvalStatus: "approved",
});
const clientA = createUser({
  email: "manual-price-a@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "HTTP Client A", contactName: "A", inn: "1000000001" },
});
const clientB = createUser({
  email: "manual-price-b@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "HTTP Client B", contactName: "B", inn: "1000000002" },
});
setGlobalState("clientLinks", {
  [clientA.id]: {
    oneCId: "http-onec-a",
    oneCPriceTypeId: "fresh-c",
    oneCPriceTypeName: "Fresh C",
    oneCPriceTypeSource: "one_c_auto",
    defaultPricingMode: "one_c_price_type",
    defaultMarkupPercent: 0,
    managerNote: "A stored",
  },
  [clientB.id]: {
    oneCId: "http-onec-b",
    oneCPriceTypeId: "b-auto",
    oneCPriceTypeName: "B Auto",
    oneCPriceTypeSource: "one_c_auto",
    defaultPricingMode: "one_c_price_type",
    defaultMarkupPercent: 0,
    managerNote: "B stored",
  },
});
writeFileSync(
  ${JSON.stringify(outputPath)},
  JSON.stringify({ admin, clientA, clientB })
);
`
  );
  const seeded = spawnSync(process.execPath, [seedPath], {
    cwd: serverRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DB_PATH: databasePath,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
    },
  });
  assert.equal(
    seeded.status,
    0,
    `HTTP fixture seed failed: ${seeded.stderr || seeded.stdout}`
  );
}

async function runHttpRegressions() {
  const httpDirectory = mkdtempSync(
    path.join(tmpdir(), "clover-manual-price-http-")
  );
  const databasePath = path.join(httpDirectory, "fixture.sqlite");
  const seedOutputPath = path.join(httpDirectory, "seed.json");
  const password = "ManualPriceHttpPass!1";
  const jwtSecret = "manual-price-http-jwt-secret-at-least-32-characters";
  const oneCKey = "manual-price-http-onec-key-at-least-32-characters";
  seedHttpFixture(databasePath, seedOutputPath, password);
  const seeded = JSON.parse(readFileSync(seedOutputPath, "utf8"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: serverRoot,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      JWT_SECRET: jwtSecret,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      ONEC_TEST_EXCHANGE_API_KEY: oneCKey,
      ONEC_PROD_EXCHANGE_ENABLED: "false",
      ONEC_ALLOWED_DATABASES: "TEST",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitHealth(baseUrl);
    const login = await httpApi(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: seeded.admin.email,
        password,
      },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json.token;
    const readLinks = async () => {
      const bootstrap = await httpApi(baseUrl, "/api/bootstrap", { token });
      assert.equal(bootstrap.status, 200, JSON.stringify(bootstrap.json));
      return bootstrap.json.clientLinks;
    };

    const intentVariants = [
      { label: "omitted" },
      { label: "null", value: null },
      { label: "string", value: seeded.clientA.id },
      { label: "object", value: { clientId: seeded.clientA.id } },
      { label: "number", value: 1 },
      { label: "empty", value: [] },
    ];
    for (const variant of intentVariants) {
      const body = {
        clientLinks: {
          [seeded.clientA.id]: {
            oneCId: "http-onec-a",
            oneCPriceTypeId: "stale-b",
            oneCPriceTypeName: "Stale B",
            oneCPriceTypeSource: "manual",
            defaultPricingMode: "base",
            defaultMarkupPercent: 99,
            managerNote: `A ${variant.label}`,
          },
        },
      };
      if (variant.label !== "omitted") {
        body.manualPriceConfigClientIds = variant.value;
      }
      const put = await httpApi(baseUrl, "/api/state/client-links", {
        method: "PUT",
        token,
        body,
      });
      assert.equal(put.status, 200, `${variant.label}: ${JSON.stringify(put.json)}`);
      const saved = put.json.clientLinks[seeded.clientA.id];
      assert.equal(saved.oneCPriceTypeId, "fresh-c", variant.label);
      assert.equal(saved.oneCPriceTypeName, "Fresh C", variant.label);
      assert.equal(saved.oneCPriceTypeSource, "one_c_auto", variant.label);
      assert.equal(saved.defaultPricingMode, "one_c_price_type", variant.label);
      assert.equal(saved.defaultMarkupPercent, 0, variant.label);
    }

    const noOpIntent = await httpApi(baseUrl, "/api/state/client-links", {
      method: "PUT",
      token,
      body: {
        clientLinks: {
          [seeded.clientA.id]: {
            oneCPriceTypeId: "fresh-c",
            oneCPriceTypeName: "Fresh C",
            oneCPriceTypeSource: "manual",
            defaultPricingMode: "one_c_price_type",
            defaultMarkupPercent: 0,
          },
        },
        manualPriceConfigClientIds: [seeded.clientA.id],
      },
    });
    assert.equal(noOpIntent.status, 200, JSON.stringify(noOpIntent.json));
    assert.equal(
      noOpIntent.json.clientLinks[seeded.clientA.id].oneCPriceTypeSource,
      "one_c_auto"
    );

    const scopedIntent = await httpApi(baseUrl, "/api/state/client-links", {
      method: "PUT",
      token,
      body: {
        clientLinks: {
          [seeded.clientA.id]: {
            oneCPriceTypeId: "a-forged-by-b-intent",
            oneCPriceTypeName: "A forged",
            oneCPriceTypeSource: "manual",
          },
          [seeded.clientB.id]: {
            oneCPriceTypeId: "b-selected",
            oneCPriceTypeName: "B selected",
            oneCPriceTypeSource: "legacy_unknown",
          },
        },
        manualPriceConfigClientIds: [seeded.clientB.id],
      },
    });
    assert.equal(scopedIntent.status, 200, JSON.stringify(scopedIntent.json));
    assert.equal(
      scopedIntent.json.clientLinks[seeded.clientA.id].oneCPriceTypeId,
      "fresh-c"
    );
    assert.equal(
      scopedIntent.json.clientLinks[seeded.clientA.id].oneCPriceTypeSource,
      "one_c_auto"
    );
    assert.equal(
      scopedIntent.json.clientLinks[seeded.clientB.id].oneCPriceTypeId,
      "b-selected"
    );
    assert.equal(
      scopedIntent.json.clientLinks[seeded.clientB.id].oneCPriceTypeSource,
      "manual"
    );

    const preview = await httpApi(baseUrl, "/api/one-c/clients-preview", {
      method: "POST",
      headers: { "X-Clover-Key": oneCKey },
      body: {
        database: "TEST",
        items: [
          {
            id: "http-onec-a",
            name: "HTTP Client A",
            inn: "1000000001",
            priceTypeId: "fresh-d",
            priceTypeName: "Fresh D",
          },
          {
            id: "http-onec-b",
            name: "HTTP Client B",
            inn: "1000000002",
            priceTypeId: "b-from-onec",
            priceTypeName: "B from 1C",
          },
        ],
      },
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.json));
    let links = await readLinks();
    assert.equal(links[seeded.clientA.id].oneCPriceTypeId, "fresh-d");
    assert.equal(links[seeded.clientA.id].oneCPriceTypeSource, "one_c_auto");
    assert.equal(links[seeded.clientB.id].oneCPriceTypeId, "b-selected");
    assert.equal(links[seeded.clientB.id].oneCPriceTypeSource, "manual");

    const manualClear = await httpApi(baseUrl, "/api/state/client-links", {
      method: "PUT",
      token,
      body: {
        clientLinks: {
          [seeded.clientA.id]: {
            oneCPriceTypeId: "",
            oneCPriceTypeName: "",
            oneCPriceTypeSource: "one_c_auto",
            defaultPricingMode: "base",
            defaultMarkupPercent: 0,
          },
        },
        manualPriceConfigClientIds: [seeded.clientA.id],
      },
    });
    assert.equal(manualClear.status, 200, JSON.stringify(manualClear.json));
    assert.equal(
      manualClear.json.clientLinks[seeded.clientA.id].oneCPriceTypeId,
      ""
    );
    assert.equal(
      manualClear.json.clientLinks[seeded.clientA.id].oneCPriceTypeSource,
      "manual"
    );

    const migrate = await httpApi(baseUrl, "/api/migrate/manager", {
      method: "POST",
      token,
      body: {
        clientLinks: {
          [seeded.clientB.id]: {
            oneCPriceTypeId: "b-forged-migrate",
            oneCPriceTypeName: "B forged migrate",
            oneCPriceTypeSource: "manual",
            defaultPricingMode: "base",
            defaultMarkupPercent: 777,
            managerNote: "B legitimate migrated note",
          },
        },
      },
    });
    assert.equal(migrate.status, 200, JSON.stringify(migrate.json));
    links = await readLinks();
    assert.equal(links[seeded.clientB.id].oneCPriceTypeId, "b-selected");
    assert.equal(links[seeded.clientB.id].oneCPriceTypeName, "B selected");
    assert.equal(links[seeded.clientB.id].oneCPriceTypeSource, "manual");
    assert.equal(links[seeded.clientB.id].defaultPricingMode, "one_c_price_type");
    assert.equal(links[seeded.clientB.id].defaultMarkupPercent, 0);
    assert.equal(
      links[seeded.clientB.id].managerNote,
      "B legitimate migrated note"
    );

    const malformedMigrate = await httpApi(
      baseUrl,
      "/api/migrate/manager",
      {
        method: "POST",
        token,
        body: {
          clientLinks: {
            [seeded.clientB.id]: {
              managerNote: "MUST NOT PARTIALLY WRITE",
              personalPrices: {
                product: { source: "manual", piece: 999 },
              },
            },
          },
        },
      }
    );
    assert.ok(malformedMigrate.status >= 400, JSON.stringify(malformedMigrate.json));
    links = await readLinks();
    assert.equal(
      links[seeded.clientB.id].managerNote,
      "B legitimate migrated note"
    );
  } catch (error) {
    console.error(stderr.slice(-2500));
    throw error;
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      child.kill("SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}

await runHttpRegressions();

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

// L. Exact fail-closed proof that order/queue/claim/ACK files are untouched.
function gitText(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const ALLOWED_SERVER_HUNK_RANGES = Object.freeze([
  [222, 222],
  [675, 675],
  [1482, 1482],
  [5415, 5448],
  [5450, 5454],
  [5456, 5461],
  [5607, 5607],
  [6790, 6790],
  [6794, 6855],
  [6857, 6861],
  [6863, 6867],
  [6869, 6869],
  [6871, 6873],
  [6875, 6887],
  [6889, 6889],
  [7026, 7027],
  [7029, 7034],
]);

const ALLOWED_PR_PATHS = new Set([
  "server/scripts/run-package-scripts.mjs",
  "server/scripts/verify-client-pricing-ui.mjs",
  "server/scripts/verify-manual-client-price-type.mjs",
  "server/src/oneCClients.js",
  "server/src/server.js",
  "server/src/staffPolicy.js",
  "src/screens/manager/ManagerClients.jsx",
  "src/screens/manager/matrixMembership.js",
  "src/serverApi.js",
]);

function assertOnlyAllowedPaths(changedPaths, allowedPaths) {
  const unexpected = changedPaths.filter((file) => !allowedPaths.has(file));
  assert.deepEqual(
    unexpected,
    [],
    `Files outside the exact PR allowlist changed: ${unexpected.join(", ")}`
  );
}

function assertServerHunksAllowed(serverDiff, { serverChanged = false } = {}) {
  const matches = [
    ...serverDiff.matchAll(
      /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gmu
    ),
  ];
  if (serverChanged) {
    assert.ok(
      matches.length > 0,
      "Changed server.js must produce at least one inspectable text hunk."
    );
  }
  for (const match of matches) {
    const oldStart = Number(match[1]);
    const oldCount = match[2] === undefined ? 1 : Number(match[2]);
    const oldEnd =
      oldCount === 0 ? oldStart : oldStart + oldCount - 1;
    assert.ok(
      ALLOWED_SERVER_HUNK_RANGES.some(
        ([start, end]) => oldStart >= start && oldEnd <= end
      ),
      `Unexpected server.js hunk outside client-price scope at base lines ${oldStart}-${oldEnd}.`
    );
  }
}

function protectedChangedPaths(changedPaths) {
  return changedPaths.filter((file) => {
    const tokens = file
      .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1-$2")
      .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
      .toLocaleLowerCase("en-US")
      .split(/[^a-z0-9]+/u)
      .filter(Boolean);
    return tokens.some(
      (token) =>
        /^orders?/u.test(token) ||
        /^queues?/u.test(token) ||
        /^claims?/u.test(token) ||
        /^ack/u.test(token) ||
        /^accepted/u.test(token) ||
        /^exchange/u.test(token)
    );
  });
}

function assertReviewCommitAvailable(cwd, sha) {
  try {
    gitText(cwd, ["cat-file", "-e", `${sha}^{commit}`]);
  } catch {
    throw new Error(
      `Required review commit ${sha} is unavailable. Fetch the full Git history (fetch-depth: 0) before running this gate.`
    );
  }
}

function verifyProtectedDiff({ cwd, base, head, allowedPaths = null }) {
  assert.notEqual(base, head, "Review base and head must not be identical.");
  assertReviewCommitAvailable(cwd, base);
  assertReviewCommitAvailable(cwd, head);
  assert.equal(
    gitText(cwd, ["merge-base", base, head]),
    base,
    `Review base ${base} must be an ancestor of head ${head}.`
  );

  const changedPaths = gitText(cwd, [
    "diff",
    "--no-renames",
    "--name-only",
    `${base}..${head}`,
    "--",
  ])
    .split(/\r?\n/u)
    .filter(Boolean);
  const protectedPaths = protectedChangedPaths(changedPaths);
  assert.deepEqual(
    protectedPaths,
    [],
    `Order/queue/claim/ACK files changed: ${protectedPaths.join(", ")}`
  );
  if (allowedPaths) {
    assertOnlyAllowedPaths(changedPaths, allowedPaths);
  }

  const serverDiff = gitText(cwd, [
    "diff",
    "--text",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    "--unified=0",
    `${base}..${head}`,
    "--",
    "server/src/server.js",
  ]);
  assertServerHunksAllowed(serverDiff, {
    serverChanged: changedPaths.includes("server/src/server.js"),
  });
  return changedPaths;
}

function verifyRepositoryWorkspaceScope({ cwd, base, allowedPaths }) {
  const untrackedPaths = gitText(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ])
    .split(/\r?\n/u)
    .filter(Boolean);
  assert.deepEqual(
    untrackedPaths,
    [],
    `Untracked files make the review range ambiguous: ${untrackedPaths.join(", ")}`
  );

  const changedPaths = gitText(cwd, [
    "diff",
    "--no-renames",
    "--name-only",
    base,
    "--",
  ])
    .split(/\r?\n/u)
    .filter(Boolean);
  assertOnlyAllowedPaths(changedPaths, allowedPaths);
  const protectedPaths = protectedChangedPaths(changedPaths);
  assert.deepEqual(
    protectedPaths,
    [],
    `Order/queue/claim/ACK workspace files changed: ${protectedPaths.join(", ")}`
  );

  const serverDiff = gitText(cwd, [
    "diff",
    "--text",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    "--unified=0",
    base,
    "--",
    "server/src/server.js",
  ]);
  assertServerHunksAllowed(serverDiff, {
    serverChanged: changedPaths.includes("server/src/server.js"),
  });
}

function runGitVerifierSelfTest() {
  assert.throws(
    () => parseReviewRange([]),
    /requires exact --base and --head/
  );
  assert.deepEqual(
    parseReviewRange([
      "--base",
      EXPECTED_REVIEW_RANGE.base,
      "--head",
      EXPECTED_REVIEW_RANGE.head,
    ]),
    EXPECTED_REVIEW_RANGE
  );
  assert.throws(
    () =>
      assertExpectedReviewRange({
        base: "a".repeat(40),
        head: EXPECTED_REVIEW_RANGE.head,
      }),
    /exact immutable PR #132 range/u
  );
  const gitFixture = mkdtempSync(
    path.join(tmpdir(), "clover-manual-price-git-")
  );
  gitText(gitFixture, ["init"]);
  gitText(gitFixture, ["config", "user.name", "Clover Verifier"]);
  gitText(gitFixture, ["config", "user.email", "verifier@clover.test"]);
  writeFileSync(path.join(gitFixture, "safe.txt"), "base\n");
  gitText(gitFixture, ["add", "safe.txt"]);
  gitText(gitFixture, ["commit", "-m", "base"]);
  const base = gitText(gitFixture, ["rev-parse", "HEAD"]);
  writeFileSync(path.join(gitFixture, "safe.txt"), "head\n");
  gitText(gitFixture, ["add", "safe.txt"]);
  gitText(gitFixture, ["commit", "-m", "safe head"]);
  const safeHead = gitText(gitFixture, ["rev-parse", "HEAD"]);
  assert.deepEqual(
    verifyProtectedDiff({ cwd: gitFixture, base, head: safeHead }),
    ["safe.txt"]
  );
  assertOnlyAllowedPaths(["safe.txt"], new Set(["safe.txt"]));
  assert.throws(
    () =>
      assertOnlyAllowedPaths(
        ["server/src/db.js"],
        new Set(["server/src/server.js"])
      ),
    /outside the exact PR allowlist/u
  );
  assert.throws(
    () => verifyProtectedDiff({ cwd: gitFixture, base, head: base }),
    /must not be identical/u
  );
  assert.throws(
    () =>
      verifyProtectedDiff({
        cwd: gitFixture,
        base: "0".repeat(40),
        head: safeHead,
      }),
    /fetch-depth: 0/u
  );

  mkdirSync(path.join(gitFixture, "server", "src"), { recursive: true });
  writeFileSync(
    path.join(gitFixture, "server", "src", "orderQueue.js"),
    "export const changed = true;\n"
  );
  gitText(gitFixture, ["add", "server/src/orderQueue.js"]);
  gitText(gitFixture, ["commit", "-m", "forbidden order change"]);
  const forbiddenHead = gitText(gitFixture, ["rev-parse", "HEAD"]);
  assert.throws(
    () =>
      verifyProtectedDiff({
        cwd: gitFixture,
        base,
        head: forbiddenHead,
      }),
    /Order\/queue\/claim\/ACK files changed/u
  );

  assertServerHunksAllowed("@@ -5415,1 +5415,1 @@\n-old\n+new\n");
  for (const protectedLine of [694, 1745, 2123, 3139, 4536, 5489, 7080]) {
    assert.throws(
      () =>
        assertServerHunksAllowed(
          `@@ -${protectedLine},1 +${protectedLine},1 @@\n-old\n+new\n`
        ),
      /outside client-price scope/u
    );
  }
  assert.throws(
    () =>
      assertServerHunksAllowed(
        "@@ -200,4500 +200,4500 @@\n-old\n+new\n"
      ),
    /outside client-price scope/u
  );
  assert.deepEqual(
    protectedChangedPaths([
      "server/src/claims.js",
      "server/src/orderqueue.js",
      "server/src/orders/index.js",
      "server/src/acknowledgement.js",
      "server/src/oneCClaim.js",
      "server/src/oneCAccepted.js",
      "server/src/exchanges.js",
      "server/src/exchangestatus.js",
      "server/src/acceptedstatus.js",
      "server/src/exchanges/worker.js",
      "server/scripts/run-package-scripts.mjs",
    ]),
    [
      "server/src/claims.js",
      "server/src/orderqueue.js",
      "server/src/orders/index.js",
      "server/src/acknowledgement.js",
      "server/src/oneCClaim.js",
      "server/src/oneCAccepted.js",
      "server/src/exchanges.js",
      "server/src/exchangestatus.js",
      "server/src/acceptedstatus.js",
      "server/src/exchanges/worker.js",
    ]
  );
  assert.throws(
    () => assertServerHunksAllowed("", { serverChanged: true }),
    /must produce at least one inspectable text hunk/u
  );
}

runGitVerifierSelfTest();
if (!functionalOnly) {
  assertExpectedReviewRange(reviewRange);
  verifyProtectedDiff({
    cwd: repositoryRoot,
    ...reviewRange,
    allowedPaths: ALLOWED_PR_PATHS,
  });
  const repositoryHead = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  assert.equal(
    gitText(repositoryRoot, ["merge-base", reviewRange.head, repositoryHead]),
    reviewRange.head,
    "Historical manual client-price review head must be an ancestor of the checkout."
  );
  if (repositoryHead === reviewRange.head) {
    verifyRepositoryWorkspaceScope({
      cwd: repositoryRoot,
      base: reviewRange.base,
      allowedPaths: ALLOWED_PR_PATHS,
    });
  }
}

console.log("verify-manual-client-price-type: ok");
