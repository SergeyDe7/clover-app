import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PUBLIC_CATALOG_PAGE_DEFAULT,
  PUBLIC_CATALOG_PAGE_MAX,
  paginatePublicCatalogProducts,
  resolvePublicCatalogClientSubject,
  resolvePublicCatalogPage,
  resolvePublicCatalogTrustedProxyIps,
} from "../src/publicCatalogGuard.js";
import {
  PUBLIC_RATE_LIMIT_POLICIES,
  consumePublicRateLimit,
  createBoundedRateLimitStore,
} from "../src/publicRateLimit.js";
import {
  advanceCatalogRequestGeneration,
  isCatalogRequestGenerationCurrent,
  makeCatalogRouteSnapshot,
  mergeCatalogRoutePage,
} from "../../src/screens/storefront/catalogRouteSnapshot.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..", "..");
const serverDirectory = path.join(projectRoot, "server");
const read = (relative) => readFileSync(path.join(projectRoot, relative), "utf8");

assert.equal(PUBLIC_CATALOG_PAGE_DEFAULT, 60);
assert.equal(PUBLIC_CATALOG_PAGE_MAX, 60);
assert.deepEqual(resolvePublicCatalogPage(), { limit: 60, offset: 0 });
assert.deepEqual(resolvePublicCatalogPage({ limit: "20", offset: "40" }), {
  limit: 20,
  offset: 40,
});
assert.deepEqual(resolvePublicCatalogPage({ limit: 1000, offset: -5 }), {
  limit: 60,
  offset: 0,
});

const corpus = Array.from({ length: 137 }, (_, index) => ({ id: index + 1 }));
const first = paginatePublicCatalogProducts(corpus);
assert.equal(first.products.length, 60);
assert.deepEqual(first.pagination, {
  limit: 60,
  offset: 0,
  total: 137,
  hasMore: true,
  nextOffset: 60,
});
const last = paginatePublicCatalogProducts(corpus, { limit: 60, offset: 120 });
assert.deepEqual(last.products.map((item) => item.id), corpus.slice(120).map((item) => item.id));
assert.equal(last.pagination.hasMore, false);
assert.equal(last.pagination.nextOffset, null);

assert.equal(
  resolvePublicCatalogClientSubject({
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "x-real-ip": "203.0.113.7" },
  }),
  "ip:203.0.113.7"
);
assert.equal(
  resolvePublicCatalogClientSubject({
    socket: { remoteAddress: "198.51.100.8" },
    headers: { "x-real-ip": "203.0.113.7" },
  }),
  "ip:198.51.100.8",
  "direct clients must not spoof X-Real-IP"
);
const trustedRemoteProxy = resolvePublicCatalogTrustedProxyIps("192.0.2.10,invalid");
assert.equal(
  resolvePublicCatalogClientSubject(
    {
      socket: { remoteAddress: "192.0.2.10" },
      headers: { "x-real-ip": "203.0.113.9" },
    },
    trustedRemoteProxy
  ),
  "ip:203.0.113.9"
);
assert.equal(
  resolvePublicCatalogClientSubject(
    {
      socket: { remoteAddress: "192.0.2.11" },
      headers: { "x-real-ip": "203.0.113.9" },
    },
    trustedRemoteProxy
  ),
  "ip:192.0.2.11",
  "only exact allowlisted proxy IPs may supply X-Real-IP"
);
assert.equal(
  resolvePublicCatalogClientSubject({
    socket: { remoteAddress: "::ffff:127.0.0.1" },
    headers: { "x-real-ip": "2001:db8::5" },
  }),
  "ip:2001:db8::5"
);

assert.deepEqual(PUBLIC_RATE_LIMIT_POLICIES.catalogRead, {
  max: 30,
  windowMs: 60_000,
});
const store = createBoundedRateLimitStore({ maxEntries: 32, now: () => 1000 });
const secret = "stage7-test-secret-stage7-test-secret";
for (let attempt = 1; attempt <= 30; attempt += 1) {
  assert.equal(
    consumePublicRateLimit({
      scope: "catalogRead",
      subject: "ip:203.0.113.7",
      secret,
      store,
    }).allowed,
    true
  );
}
const blocked = consumePublicRateLimit({
  scope: "catalogRead",
  subject: "ip:203.0.113.7",
  secret,
  store,
});
assert.equal(blocked.allowed, false);
assert.equal(blocked.retryAfterSeconds, 60);

const snapshot = makeCatalogRouteSnapshot("catalog\u0000", {
  products: [{ id: 1 }, { id: 2 }],
  pagination: { offset: 0, nextOffset: 2, hasMore: true },
});
const merged = mergeCatalogRoutePage(snapshot, "catalog\u0000", {
  products: [{ id: 2 }, { id: 3 }],
  pagination: { offset: 2, nextOffset: null, hasMore: false },
});
assert.deepEqual(merged.payload.products.map((item) => item.id), [1, 2, 3]);
assert.equal(merged.payload.pagination.hasMore, false);
assert.equal(
  mergeCatalogRoutePage(snapshot, "other", {
    products: [{ id: 9 }],
    pagination: { offset: 2 },
  }),
  snapshot,
  "a nonzero page must never replace a different route snapshot"
);
assert.equal(
  mergeCatalogRoutePage(null, "catalog\u0000", {
    products: [{ id: 61 }],
    pagination: { offset: 60 },
  }),
  null,
  "a nonzero page must never create a snapshot"
);

let generation = advanceCatalogRequestGeneration(null, "A");
const staleGeneration = generation.generation;
let resolveStalePage;
const stalePage = new Promise((resolve) => { resolveStalePage = resolve; });
generation = advanceCatalogRequestGeneration(generation, "B");
generation = advanceCatalogRequestGeneration(generation, "A");
let abaSnapshot = makeCatalogRouteSnapshot("A", {
  products: [{ id: "A-new-1" }],
  pagination: { offset: 0, nextOffset: 60, hasMore: true },
});
resolveStalePage({
  products: [{ id: "A-old-61" }],
  pagination: { offset: 60, nextOffset: 120, hasMore: true },
});
const stalePayload = await stalePage;
if (isCatalogRequestGenerationCurrent(generation, staleGeneration)) {
  abaSnapshot = mergeCatalogRoutePage(abaSnapshot, "A", stalePayload);
}
assert.deepEqual(
  abaSnapshot.payload.products.map((product) => product.id),
  ["A-new-1"],
  "a delayed A page must not merge after A -> B -> A"
);

const serverSource = read("server/src/server.js");
assert.match(serverSource, /rejectPublicCatalogReadLimit\(req, res\)/);
assert.match(serverSource, /store:\s*publicCatalogReadRateLimitStore/);
assert.match(serverSource, /limit:\s*req\.query\.limit/);
assert.match(serverSource, /offset:\s*req\.query\.offset/);
assert.match(serverSource, /Cross-Origin-Resource-Policy["'],\s*["']same-origin/);

const storefrontSource = read("src/screens/storefront/pages/CatalogPage.jsx");
assert.match(storefrontSource, /pagination\?\.hasMore/);
assert.match(storefrontSource, /nextOffset/);
assert.match(storefrontSource, /mergeCatalogRoutePage/);
assert.match(storefrontSource, /loadingMoreRef\.current/);
assert.match(storefrontSource, /catalogRequestGenerationRef\.current/);
assert.match(storefrontSource, /isCatalogRequestGenerationCurrent/);
const publicApiSource = read("src/screens/storefront/publicApi.js");
assert.match(publicApiSource, /query\.set\(["']limit["']/);
assert.match(publicApiSource, /query\.set\(["']offset["']/);

const temp = mkdtempSync(path.join(tmpdir(), "clover-s7-scraping-"));
const databasePath = path.join(temp, "clover.sqlite");
const envPath = path.join(temp, "empty.env");
const seedPath = path.join(temp, "seed.mjs");
const uploadProbeName = `stage7-corp-${process.pid}-${Date.now()}.txt`;
const uploadProbePath = path.join(serverDirectory, "uploads", uploadProbeName);
const jwtSecret = "clover-stage7-anti-scraping-test-secret";
writeFileSync(envPath, "");
mkdirSync(path.dirname(uploadProbePath), { recursive: true });
writeFileSync(uploadProbePath, "stage7");

function moduleUrl(absolutePath) {
  return pathToFileURL(absolutePath).href;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitHealth(base) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // startup retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("isolated server health timeout");
}

function seedDatabase() {
  writeFileSync(
    seedPath,
    `
import { setGlobalState } from ${JSON.stringify(moduleUrl(path.join(serverDirectory, "src/db.js")))};
import { DEFAULT_SETTINGS } from ${JSON.stringify(moduleUrl(path.join(serverDirectory, "src/defaults.js")))};
setGlobalState("settings", {
  ...DEFAULT_SETTINGS,
  storefrontPricingMode: "manual",
  storefrontShowOnlyLinked: false,
});
setGlobalState("products", Array.from({ length: 137 }, (_, index) => ({
  id: \`s7-product-\${index + 1}\`,
  name: \`Stage 7 Product \${index + 1}\`,
  code: \`S7-\${String(index + 1).padStart(4, "0")}\`,
  category: index < 70 ? "Одноразовая посуда" : "Упаковка",
  subcategory: index % 2 === 0 ? "Контейнеры" : "Стаканы",
  active: true,
  showOnStorefront: true,
  saleUnits: ["piece"],
  pieceSize: 1,
  storefrontPricing: { source: "manual", piece: index + 1 },
})));
`
  );
  const seeded = spawnSync(process.execPath, [seedPath], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      JWT_SECRET: jwtSecret,
      DOTENV_CONFIG_PATH: envPath,
    },
    encoding: "utf8",
  });
  assert.equal(seeded.status, 0, seeded.stderr || seeded.stdout);
}

let child;
try {
  seedDatabase();
  const port = await freePort();
  child = spawn(process.execPath, ["src/server.js"], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      DB_PATH: databasePath,
      JWT_SECRET: jwtSecret,
      DOTENV_CONFIG_PATH: envPath,
      APP_PUBLIC_URL: `http://127.0.0.1:${port}`,
      ALLOW_LAN_ORIGINS: "false",
      ONEC_PROD_EXCHANGE_ENABLED: "false",
      ONEC_ALLOWED_DATABASES: "TEST",
      ONEC_TEST_EXCHANGE_API_KEY: "stage7-test-onec-key-123456789",
      CLOVER_SERVER_BACKUP_DIR: path.join(temp, "backups"),
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      MAIL_FROM: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitHealth(`http://127.0.0.1:${port}`);
  } catch (error) {
    throw new Error(`${error.message}\n${stderr.slice(-2000)}`);
  }

  const firstResponse = await fetch(`http://127.0.0.1:${port}/api/public/catalog`);
  const firstPayload = await firstResponse.json();
  assert.equal(firstResponse.status, 200);
  assert.equal(firstPayload.products.length, 60);
  assert.equal(firstPayload.pagination.total, 137);
  assert.equal(firstPayload.pagination.nextOffset, 60);
  assert.equal(firstPayload.subcategories.length, 4);

  const secondResponse = await fetch(
    `http://127.0.0.1:${port}/api/public/catalog?limit=60&offset=60`
  );
  const secondPayload = await secondResponse.json();
  assert.equal(secondPayload.products.length, 60);
  assert.equal(secondPayload.pagination.nextOffset, 120);
  assert.notEqual(secondPayload.products[0].id, firstPayload.products[0].id);

  const uploadResponse = await fetch(
    `http://127.0.0.1:${port}/uploads/${encodeURIComponent(uploadProbeName)}`
  );
  assert.equal(uploadResponse.status, 200);
  assert.equal(await uploadResponse.text(), "stage7");
  assert.equal(uploadResponse.headers.get("cross-origin-resource-policy"), "same-origin");

  let rateLimitedResponse;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    rateLimitedResponse = await fetch(
      `http://127.0.0.1:${port}/api/public/catalog?limit=1&offset=${attempt}`,
      { headers: { "X-Real-IP": "203.0.113.77" } }
    );
  }
  assert.equal(rateLimitedResponse.status, 429);
  assert.equal((await rateLimitedResponse.json()).code, "CATALOG_RATE_LIMITED");
  assert.ok(Number(rateLimitedResponse.headers.get("retry-after")) > 0);
} finally {
  if (child && !child.killed) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  rmSync(uploadProbePath, { force: true });
  rmSync(temp, { recursive: true, force: true });
}

console.log("verify-security-stage7-anti-scraping: ok");
