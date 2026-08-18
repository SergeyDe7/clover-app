import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSafeManagerOrderReplace,
  normalizeExchangeState,
  sanitizeOrderExchangeForSave,
} from "../src/exchange.js";
import {
  clientMayOrderCatalogProduct,
  findClientOrderMatrixViolations,
  isMatrixProductForLink,
  ordersRequiringMatrixCheck,
} from "../src/matrixGuard.js";

import { readFrontendUiSource } from "./readFrontendUiSource.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverSource = readFileSync(path.join(root, "server/src/server.js"), "utf8");
const appSource = readFrontendUiSource(root);

assert.ok(
  serverSource.includes("sanitizeOrderExchangeForSave"),
  "PUT /api/state/orders должен санитизировать exchange."
);
assert.ok(
  serverSource.includes("assertSafeManagerOrderReplace"),
  "PUT /api/state/orders должен защищать manager replace от wipe."
);
assert.ok(
  serverSource.includes("findClientOrderMatrixViolations"),
  "PUT /api/state/orders должен проверять товары клиента по матрице."
);
assert.ok(
  serverSource.includes("MATRIX_PRODUCT_FORBIDDEN"),
  "Обход матрицы должен возвращать явный код ошибки."
);
assert.ok(
  serverSource.includes("isMatrixProductForLink"),
  "Пересчёт цен не должен помечать все товары как матричные."
);
assert.ok(
  serverSource.includes("isAdminFullResetAllowed"),
  "Полный сброс должен быть ограничен kill-switch."
);
assert.ok(
  serverSource.includes("ONEC_RESET_NOT_ALLOWED") ||
    serverSource.includes('previous.status === "sending"'),
  "Reset обмена должен явно обрабатывать очередь ready/sending."
);
assert.ok(
  appSource.includes('disabled={busy || exchange.status === "sending"}'),
  "UI reset/send должны быть disabled при sending."
);
assert.ok(
  appSource.includes('const [openClientId, setOpenClientId] = useState("")'),
  "Матрица клиента не должна восстанавливать open после F5."
);
assert.ok(
  !appSource.includes("useState(readOpenManagerClientId)"),
  "Матрица клиента не должна восстанавливать open после F5."
);
assert.ok(
  !appSource.includes("scheduleSync(() => api.saveClientLinks(clientLinks))"),
  "Автосейв матрицы должен быть отключён."
);
assert.ok(
  appSource.includes('authUser?.role === "manager"'),
  "Кабинет менеджера должен опираться на роль из bootstrap, а не на локальный дефолт."
);

const migrateManagerIdx = serverSource.indexOf('"/api/migrate/manager"');
assert.ok(migrateManagerIdx > 0, "migrate/manager должен существовать.");
const migrateManagerSlice = serverSource.slice(
  migrateManagerIdx,
  migrateManagerIdx + 1200
);
assert.ok(
  migrateManagerSlice.includes("mergeProductsPreservingOneCLinks"),
  "migrate/manager обязан merge'ить products с сохранением 1С-связей."
);
assert.ok(
  migrateManagerSlice.includes("mergeClientLinksPreservingOneCLinks"),
  "migrate/manager обязан merge'ить clientLinks с сохранением 1С-связей."
);
assert.ok(
  !/setGlobalState\(\s*"products",\s*req\.body\.products\s*\)/.test(
    migrateManagerSlice
  ),
  "migrate/manager не должен писать products сырым телом."
);

const migrateClientIdx = serverSource.indexOf('"/api/migrate/client"');
const migrateClientSlice = serverSource.slice(
  migrateClientIdx,
  migrateClientIdx + 1800
);
assert.ok(
  migrateClientSlice.includes("previousClientOrders.length === 0"),
  "migrate/client не должен затирать уже существующие серверные заказы."
);

const products = [
  { id: "1", name: "В матрице", active: true },
  { id: "2", name: "Вне матрицы", active: true },
];

assert.equal(
  clientMayOrderCatalogProduct(
    { matrixMode: "selected", matrixProductIds: ["1"] },
    "2",
    products
  ),
  false,
  "selected без id запрещает товар вне матрицы."
);
assert.equal(
  clientMayOrderCatalogProduct(
    { matrixMode: "selected", matrixProductIds: ["1"] },
    "1",
    products
  ),
  true
);
assert.equal(
  clientMayOrderCatalogProduct({ matrixMode: "pending" }, "1", products),
  false,
  "pending запрещает каталожные позиции."
);
assert.equal(
  clientMayOrderCatalogProduct(
    { matrixMode: "pending", allowFullCatalog: true },
    "2",
    products
  ),
  true,
  "allowFullCatalog разрешает активный каталог."
);
assert.equal(
  clientMayOrderCatalogProduct({ matrixMode: "all" }, "2", products),
  true
);

const violations = findClientOrderMatrixViolations(
  [
    {
      id: "o1",
      items: [{ productId: "2", name: "Вне" }],
      customItems: [{ name: "Свой товар" }],
    },
  ],
  { matrixMode: "selected", matrixProductIds: ["1"] },
  products
);
assert.equal(violations.length, 1);
assert.equal(violations[0].productId, "2");

const customOnly = findClientOrderMatrixViolations(
  [{ id: "o2", items: [], customItems: [{ name: "Свой" }] }],
  { matrixMode: "pending" },
  products
);
assert.equal(customOnly.length, 0, "Только customItems не нарушают матрицу.");

const previousById = new Map([
  [
    "old-1",
    {
      id: "old-1",
      items: [{ productId: "2", name: "Вне", quantity: 1, unit: "piece" }],
    },
  ],
]);
const unchangedOutside = ordersRequiringMatrixCheck(
  [
    {
      id: "old-1",
      items: [{ productId: "2", name: "Вне", quantity: 1, unit: "piece" }],
    },
    {
      id: "new-1",
      items: [{ productId: "1", name: "Ок", quantity: 1, unit: "piece" }],
    },
  ],
  previousById
);
assert.deepEqual(
  unchangedOutside.map((order) => order.id),
  ["new-1"],
  "Неизменённый старый заказ вне матрицы не должен попадать в matrix check."
);
const changedOutside = ordersRequiringMatrixCheck(
  [
    {
      id: "old-1",
      items: [{ productId: "2", name: "Вне", quantity: 2, unit: "piece" }],
    },
  ],
  previousById
);
assert.equal(changedOutside.length, 1, "Изменение состава включает заказ в matrix check.");

assert.equal(isMatrixProductForLink({ matrixMode: "all" }, "9"), true);
assert.equal(
  isMatrixProductForLink(
    { matrixMode: "selected", matrixProductIds: ["1"] },
    "2"
  ),
  false
);

const previousNotSent = {
  id: "o1",
  exchange: { status: "not_sent", message: "" },
};
const clientHackReady = sanitizeOrderExchangeForSave(
  {
    id: "o1",
    exchange: { status: "ready", message: "хак" },
    items: [{ productId: "1", quantity: 1 }],
  },
  previousNotSent,
  "client"
);
assert.equal(
  normalizeExchangeState(clientHackReady.exchange).status,
  "not_sent",
  "Клиент не должен ставить заказ в очередь 1С через bulk save."
);

const previousReady = {
  id: "o1",
  exchange: { status: "ready", message: "В очереди" },
};
const clientCannotClearQueue = sanitizeOrderExchangeForSave(
  {
    id: "o1",
    exchange: { status: "not_sent" },
  },
  previousReady,
  "client"
);
assert.equal(
  normalizeExchangeState(clientCannotClearQueue.exchange).status,
  "ready",
  "Клиент не должен сбрасывать уже поставленный в очередь exchange."
);

const clientNew = sanitizeOrderExchangeForSave(
  {
    id: "o-new",
    exchange: { status: "ready" },
  },
  null,
  "client"
);
assert.equal(
  normalizeExchangeState(clientNew.exchange).status,
  "not_sent",
  "Новый заказ клиента не может сразу попасть в очередь 1С."
);

const managerPreserve = sanitizeOrderExchangeForSave(
  {
    id: "o1",
    status: "Принят",
    exchange: { status: "not_sent" },
  },
  previousReady,
  "manager"
);
assert.equal(
  normalizeExchangeState(managerPreserve.exchange).status,
  "ready",
  "Bulk-save менеджера не должен затирать очередь 1С."
);

const wipe = assertSafeManagerOrderReplace(
  [
    { id: "a", exchange: { status: "not_sent" } },
    { id: "b", exchange: { status: "not_sent" } },
  ],
  [{ id: "brand-new", exchange: { status: "not_sent" } }]
);
assert.equal(wipe.ok, false);
assert.equal(wipe.status, 409);

const normalDelete = assertSafeManagerOrderReplace(
  [{ id: "a" }, { id: "b" }],
  [{ id: "a" }]
);
assert.equal(normalDelete.ok, true);

const lastDelete = assertSafeManagerOrderReplace([{ id: "a" }], []);
assert.equal(lastDelete.ok, true);

const emptyWipe = assertSafeManagerOrderReplace([{ id: "a" }, { id: "b" }], []);
assert.equal(emptyWipe.ok, false);

console.log(
  "verify-orders-hardening: exchange sanitize + matrix guard + migrate merge + wipe guard ok"
);
