/**
 * Real integration proofs for paid delivery PR-B:
 * - createStorefrontOrder() with raw delivery 1C meta (not public settings)
 * - PUT /api/state/orders HTTP endpoint (fake fee, dozakaz, custom items)
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  FREE_DELIVERY_MIN_TOTAL,
  PAID_DELIVERY_FEE,
  isCloverDeliveryLine,
} from "../src/deliveryFee.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const temp = mkdtempSync(path.join(tmpdir(), "clover-paid-delivery-int-"));
const databasePath = path.join(temp, "clover.sqlite");
const seedMetaPath = path.join(temp, "seed.json");
const seedScriptPath = path.join(temp, "seed.mjs");
const jwtSecret = "clover-paid-delivery-integration-secret-32chars!";
const password = "PaidDeliveryIntVerify!1";

const DELIVERY_UUID = "abd0ca3a-8033-11f1-abc0-b42e99f8290d";
const DELIVERY_CODE = "НФ-00002361";
const DELIVERY_NAME = "Доставка СПб тест";

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

async function waitHealth(base, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server health timeout");
}

async function api(base, route, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

function deliveryLines(order) {
  return (Array.isArray(order?.items) ? order.items : []).filter(isCloverDeliveryLine);
}

function seedDatabase() {
  writeFileSync(
    seedScriptPath,
    `
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(${JSON.stringify(moduleUrl(path.join(serverDir, "package.json")))});
const bcrypt = require("bcryptjs");
import {
  createUser,
  replaceOrders,
  getGlobalState,
  setGlobalState,
} from ${JSON.stringify(moduleUrl(path.join(serverDir, "src/db.js")))};

const password = ${JSON.stringify(password)};
const passwordHash = bcrypt.hashSync(password, 4);
const metaPath = ${JSON.stringify(seedMetaPath)};
const DELIVERY_UUID = ${JSON.stringify(DELIVERY_UUID)};
const DELIVERY_CODE = ${JSON.stringify(DELIVERY_CODE)};
const DELIVERY_NAME = ${JSON.stringify(DELIVERY_NAME)};

const client = createUser({
  email: "paid-delivery-client@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "Paid Delivery Co", contactName: "PD" },
});

const productA = {
  id: "pd-product-a",
  name: "Товар A",
  code: "PD-A",
  active: true,
  showOnStorefront: true,
  oneCId: "prod-uuid-a",
  oneCCode: "НФ-A",
  saleUnits: ["piece"],
  pieceSize: 1,
  storefrontPricing: { source: "manual", piece: 4999 },
};
const productB = {
  id: "pd-product-b",
  name: "Товар B",
  code: "PD-B",
  active: true,
  showOnStorefront: true,
  oneCId: "prod-uuid-b",
  oneCCode: "НФ-B",
  saleUnits: ["piece"],
  pieceSize: 1,
  storefrontPricing: { source: "manual", piece: 5000 },
};
const productC = {
  id: "pd-product-c",
  name: "Товар C копейки",
  code: "PD-C",
  active: true,
  showOnStorefront: true,
  oneCId: "prod-uuid-c",
  oneCCode: "НФ-C",
  saleUnits: ["piece"],
  pieceSize: 1,
  storefrontPricing: { source: "manual", piece: 1234.567 },
};
const productD = {
  id: "pd-product-d",
  name: "Товар D кабинет",
  code: "PD-D",
  active: true,
  showOnStorefront: false,
  oneCId: "prod-uuid-d",
  oneCCode: "НФ-D",
  saleUnits: ["piece"],
  pieceSize: 1,
  pricePiece: 1000,
};

setGlobalState("products", [productA, productB, productC, productD]);
setGlobalState("oneCProducts", [
  { id: "prod-uuid-a", code: "НФ-A", name: "Товар A" },
  { id: "prod-uuid-b", code: "НФ-B", name: "Товар B" },
  { id: "prod-uuid-c", code: "НФ-C", name: "Товар C" },
  { id: "prod-uuid-d", code: "НФ-D", name: "Товар D" },
  { id: DELIVERY_UUID, code: DELIVERY_CODE, name: DELIVERY_NAME },
]);

const settings = {
  ...getGlobalState("settings", {}),
  allowClientEdit: true,
  showPrices: true,
  storefrontPricingMode: "price_type",
  storefrontShowOnlyLinked: true,
  deliveryOneCId: DELIVERY_UUID,
  deliveryOneCCode: DELIVERY_CODE,
  deliveryOneCName: DELIVERY_NAME,
};
setGlobalState("settings", settings);

const links = { ...(getGlobalState("clientLinks", {}) || {}) };
links[client.id] = {
  ...(links[client.id] || {}),
  matched1C: true,
  oneCId: "client-uuid-pd",
  oneCName: "Paid Delivery Co",
  matrixMode: "all",
  matrixProductIds: ["pd-product-d"],
  defaultPricingMode: "base",
  personalPrices: {
    "pd-product-d": { source: "manual", piece: 1000 },
  },
};
setGlobalState("clientLinks", links);

const nowIso = "2026-08-31T12:00:00.000Z";
const openOrder = {
  id: "order-pd-open",
  number: "CL-PD-1",
  clientId: client.id,
  customerName: "Paid Delivery Co",
  customerEmail: client.email,
  status: "Новый",
  exchange: { status: "not_sent" },
  items: [
    {
      id: "line-d1",
      productId: "pd-product-d",
      name: "Товар D кабинет",
      unit: "piece",
      quantity: 1,
      unitPrice: 1000,
      lineTotal: 1000,
      oneCId: "prod-uuid-d",
    },
  ],
  customItems: [],
  deliveryFee: 0,
  deliveryNote: "",
  total: 1000,
  amount: 1000,
  firstDeliveryDate: "2026-09-05",
  createdAt: nowIso,
  updatedAt: nowIso,
};
replaceOrders({ userId: client.id, orders: [openOrder], managerMode: false });

writeFileSync(
  metaPath,
  JSON.stringify(
    {
      client: { id: client.id, email: client.email },
      openOrder,
      products: { a: productA, b: productB, c: productC, d: productD },
    },
    null,
    2
  )
);
`
  );

  const result = spawnSync(process.execPath, [seedScriptPath], {
    cwd: serverDir,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      JWT_SECRET: jwtSecret,
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`seed failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(readFileSync(seedMetaPath, "utf8"));
}

function runCreateStorefrontOrderTests() {
  const scriptPath = path.join(temp, "storefront-create.mjs");
  writeFileSync(
    scriptPath,
    `
import assert from "node:assert/strict";
import {
  createStorefrontOrder,
  getStorefrontSettings,
  getPublicSite,
} from ${JSON.stringify(moduleUrl(path.join(serverDir, "src/storefrontPublic.js")))};
import { getOrderById, getGlobalState } from ${JSON.stringify(moduleUrl(path.join(serverDir, "src/db.js")))};
import { roundPriceUp } from ${JSON.stringify(moduleUrl(path.join(serverDir, "src/pricing.js")))};
import {
  CLOVER_DELIVERY_LINE_ID,
  FREE_DELIVERY_MIN_TOTAL,
  PAID_DELIVERY_FEE,
  isCloverDeliveryLine,
} from ${JSON.stringify(moduleUrl(path.join(serverDir, "src/deliveryFee.js")))};

const DELIVERY_UUID = ${JSON.stringify(DELIVERY_UUID)};
const DELIVERY_CODE = ${JSON.stringify(DELIVERY_CODE)};
const DELIVERY_NAME = ${JSON.stringify(DELIVERY_NAME)};

function deliveryLines(order) {
  return (Array.isArray(order?.items) ? order.items : []).filter(isCloverDeliveryLine);
}

assert.equal(FREE_DELIVERY_MIN_TOTAL, 5000);
assert.equal(PAID_DELIVERY_FEE, 500);

const rawSettings = getGlobalState("settings", {});
assert.equal(rawSettings.deliveryOneCId, DELIVERY_UUID);
assert.equal(rawSettings.deliveryOneCCode, DELIVERY_CODE);
assert.equal(rawSettings.deliveryOneCName, DELIVERY_NAME);

const publicSettings = getStorefrontSettings(rawSettings);
for (const key of ["deliveryOneCId", "deliveryOneCCode", "deliveryOneCName"]) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(publicSettings, key),
    false,
    "public settings must not expose " + key
  );
}

const publicSite = getPublicSite();
const siteJson = JSON.stringify(publicSite);
assert.equal(siteJson.includes(DELIVERY_UUID), false);
assert.equal(siteJson.includes(DELIVERY_CODE), false);
assert.equal(siteJson.includes("deliveryOneC"), false);

const baseInput = {
  contactName: "Гость Витрины",
  companyName: "Storefront Co",
  phone: "+79990001122",
  email: "guest-pd@test.local",
  address: "СПб, Невский 1",
  comment: "",
  firstDeliveryDate: "2026-09-05",
};

const paidResponse = createStorefrontOrder({
  ...baseInput,
  items: [{ productId: "pd-product-a", code: "PD-A", unit: "piece", qty: 1 }],
});
const paidSaved = getOrderById(paidResponse.id)?.payload;
assert.ok(paidSaved, "paid storefront order must be persisted");
assert.equal(paidResponse.deliveryFee, PAID_DELIVERY_FEE);
assert.equal(paidSaved.deliveryFee, PAID_DELIVERY_FEE);
assert.equal(paidResponse.deliveryFee, paidSaved.deliveryFee);
const paidDelivery = deliveryLines(paidSaved);
assert.equal(paidDelivery.length, 1, "exactly one delivery line under threshold");
assert.equal(paidDelivery[0].productId, CLOVER_DELIVERY_LINE_ID);
assert.equal(paidDelivery[0].oneCId, DELIVERY_UUID);
assert.equal(paidDelivery[0].oneCCode, DELIVERY_CODE);
assert.equal(paidDelivery[0].code, DELIVERY_CODE);
assert.equal(paidDelivery[0].name, DELIVERY_NAME);
assert.equal(paidDelivery[0].lineTotal, PAID_DELIVERY_FEE);
const paidItemsSum = (paidSaved.items || []).reduce(
  (sum, line) => sum + (Number(line.lineTotal) || 0),
  0
);
assert.equal(paidItemsSum - PAID_DELIVERY_FEE, 4999);
assert.equal(paidSaved.total, roundPriceUp(paidItemsSum));
assert.equal(paidSaved.amount, paidSaved.total);
assert.equal(paidResponse.total, paidSaved.total);

const freeResponse = createStorefrontOrder({
  ...baseInput,
  contactName: "Гость Free",
  items: [{ productId: "pd-product-b", code: "PD-B", unit: "piece", qty: 1 }],
});
const freeSaved = getOrderById(freeResponse.id)?.payload;
assert.ok(freeSaved, "free storefront order must be persisted");
assert.equal(freeResponse.deliveryFee, 0);
assert.equal(freeSaved.deliveryFee, 0);
assert.equal(deliveryLines(freeSaved).length, 0);
const freeItemsSum = (freeSaved.items || []).reduce(
  (sum, line) => sum + (Number(line.lineTotal) || 0),
  0
);
assert.equal(freeItemsSum, 5000);
assert.equal(freeSaved.total, roundPriceUp(freeItemsSum));
assert.equal(freeSaved.amount, freeSaved.total);
assert.equal(freeResponse.total, freeSaved.total);

const decimalResponse = createStorefrontOrder({
  ...baseInput,
  contactName: "Гость Decimal",
  items: [{ productId: "pd-product-c", code: "PD-C", unit: "piece", qty: 1 }],
});
const decimalSaved = getOrderById(decimalResponse.id)?.payload;
assert.ok(decimalSaved, "decimal storefront order must be persisted");
assert.equal(decimalSaved.deliveryFee, PAID_DELIVERY_FEE);
assert.equal(deliveryLines(decimalSaved).length, 1);
const goodsLine = (decimalSaved.items || []).find((item) => !isCloverDeliveryLine(item));
assert.ok(goodsLine);
assert.equal(Number(goodsLine.unitPrice), 1234.57, "manual price keeps kopecks (2dp)");
assert.equal(Number(goodsLine.lineTotal), 1234.57);
const decimalItemsSum = (decimalSaved.items || []).reduce(
  (sum, line) => sum + (Number(line.lineTotal) || 0),
  0
);
assert.equal(decimalItemsSum, 1234.57 + 500);
assert.equal(roundPriceUp(1234.567 + 500), 1734.57);
assert.equal(roundPriceUp(decimalItemsSum), 1734.57);
assert.equal(decimalSaved.total, 1734.57);
assert.equal(decimalSaved.amount, 1734.57);
assert.equal(decimalResponse.total, 1734.57);
assert.equal(decimalResponse.deliveryFee, decimalSaved.deliveryFee);

console.log("createStorefrontOrder real execution: ok");
`
  );

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: serverDir,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      JWT_SECRET: jwtSecret,
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `createStorefrontOrder tests failed: ${result.stderr || result.stdout}`
    );
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

async function runPutEndpointTests(seeded, base) {
  const login = await api(base, "/api/auth/login", {
    method: "POST",
    body: { email: seeded.client.email, password },
  });
  assert.equal(login.status, 200, `login failed: ${JSON.stringify(login.json)}`);
  const token = login.json.token;

  const publicSite = await api(base, "/api/public/site");
  assert.equal(publicSite.status, 200);
  const publicBlob = JSON.stringify(publicSite.json);
  assert.equal(publicBlob.includes(DELIVERY_UUID), false);
  assert.equal(publicBlob.includes(DELIVERY_CODE), false);
  assert.equal(publicBlob.includes("deliveryOneC"), false);

  // Fake fee must not control totals (goods 1000 → delivery 500 → total 1500)
  const fakePut = await api(base, "/api/state/orders", {
    method: "PUT",
    token,
    body: {
      orders: [
        {
          ...seeded.openOrder,
          deliveryFee: 0,
          deliveryNote: "free hack",
          total: 1,
          amount: 1,
          items: [
            {
              id: "line-d1",
              productId: "pd-product-d",
              name: "Товар D кабинет",
              unit: "piece",
              quantity: 1,
              unitPrice: 1000,
              lineTotal: 1000,
              oneCId: "prod-uuid-d",
            },
          ],
          customItems: [],
          updatedAt: "2026-08-31T13:00:00.000Z",
        },
      ],
    },
  });
  assert.equal(fakePut.status, 200, `fake put: ${JSON.stringify(fakePut.json)}`);
  const fakeSaved = (fakePut.json.orders || []).find((o) => o.id === "order-pd-open");
  assert.ok(fakeSaved, "order returned after fake-fee put");
  assert.equal(fakeSaved.deliveryFee, PAID_DELIVERY_FEE, "server-authoritative fee");
  assert.equal(deliveryLines(fakeSaved).length, 1);
  assert.equal(deliveryLines(fakeSaved)[0].lineTotal, PAID_DELIVERY_FEE);
  assert.equal(fakeSaved.total, 1500);
  assert.equal(fakeSaved.amount, 1500);

  // Custom items count toward threshold and totals
  const customPut = await api(base, "/api/state/orders", {
    method: "PUT",
    token,
    body: {
      orders: [
        {
          ...fakeSaved,
          deliveryFee: 9999,
          items: (fakeSaved.items || []).filter((item) => !isCloverDeliveryLine(item)),
          customItems: [
            {
              id: "c-custom-1",
              name: "Вне матрицы",
              quantity: 1,
              unit: "шт.",
              unitPrice: 500,
            },
          ],
          updatedAt: "2026-08-31T14:00:00.000Z",
        },
      ],
    },
  });
  assert.equal(customPut.status, 200, `custom put: ${JSON.stringify(customPut.json)}`);
  const customSaved = (customPut.json.orders || []).find((o) => o.id === "order-pd-open");
  assert.ok(customSaved);
  assert.equal(customSaved.deliveryFee, PAID_DELIVERY_FEE);
  assert.equal(deliveryLines(customSaved).length, 1);
  assert.equal(customSaved.customItems?.length, 1);
  // goods 1000 + custom 500 + delivery 500 = 2000
  assert.equal(customSaved.total, 2000);
  assert.equal(customSaved.amount, 2000);

  // Dozakaz: add catalog lines to cross free threshold, keep same orderId
  const dozakazPut = await api(base, "/api/state/orders", {
    method: "PUT",
    token,
    body: {
      orders: [
        {
          ...customSaved,
          deliveryFee: 0,
          items: [
            ...(customSaved.items || []).filter((item) => !isCloverDeliveryLine(item)),
            {
              id: "line-add",
              productId: "pd-product-d",
              name: "Товар D кабинет",
              unit: "piece",
              quantity: 4,
              unitPrice: 1000,
              lineTotal: 4000,
              oneCId: "prod-uuid-d",
            },
          ],
          customItems: customSaved.customItems,
          updatedAt: "2026-08-31T15:00:00.000Z",
        },
      ],
    },
  });
  assert.equal(dozakazPut.status, 200, `dozakaz put: ${JSON.stringify(dozakazPut.json)}`);
  const dozakazSaved = (dozakazPut.json.orders || []).find((o) => o.id === "order-pd-open");
  assert.ok(dozakazSaved);
  assert.equal(dozakazSaved.id, "order-pd-open");
  // goods 1000+4000 + custom 500 = 5500 ≥ 5000 → free
  assert.equal(dozakazSaved.deliveryFee, 0);
  assert.equal(deliveryLines(dozakazSaved).length, 0);
  assert.equal(dozakazSaved.total, 5500);
  assert.equal(dozakazSaved.amount, 5500);
  assert.ok(
    (dozakazSaved.customItems || []).some((item) => item.id === "c-custom-1"),
    "custom item preserved after dozakaz"
  );
}

async function main() {
  assert.equal(FREE_DELIVERY_MIN_TOTAL, 5000);
  assert.equal(PAID_DELIVERY_FEE, 500);

  const seeded = seedDatabase();
  runCreateStorefrontOrderTests();

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      PORT: String(port),
      HOST: "127.0.0.1",
      JWT_SECRET: jwtSecret,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      SMTP_HOST: "",
      TELEGRAM_BOT_TOKEN: "",
      ONEC_BASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.stdout.on("data", () => {});

  try {
    await waitHealth(base);
    await runPutEndpointTests(seeded, base);
    console.log("verify-paid-delivery-integration: ok");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 3000);
      child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    rmSync(temp, { recursive: true, force: true });
    if (stderr && /EADDRINUSE/.test(stderr)) {
      console.error(stderr.slice(0, 800));
    }
  }
}

main().catch((error) => {
  console.error("verify-paid-delivery-integration: FAIL", error);
  try {
    rmSync(temp, { recursive: true, force: true });
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
