import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSafeManagerOrderReplace,
  normalizeExchangeState,
  sanitizeOrderExchangeForSave,
} from "../src/exchange.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverSource = readFileSync(path.join(root, "server/src/server.js"), "utf8");
const appSource = readFileSync(path.join(root, "src/App.jsx"), "utf8");

assert.ok(
  serverSource.includes("sanitizeOrderExchangeForSave"),
  "PUT /api/state/orders должен санитизировать exchange."
);
assert.ok(
  serverSource.includes("assertSafeManagerOrderReplace"),
  "PUT /api/state/orders должен защищать manager replace от wipe."
);
assert.ok(
  appSource.includes("open={matrixOpen}"),
  "Матрица клиента должна восстанавливать open после F5."
);
assert.ok(
  !appSource.includes("scheduleSync(() => api.saveClientLinks(clientLinks))"),
  "Автосейв матрицы должен быть отключён."
);
assert.ok(
  appSource.includes("authUser?.role === \"manager\""),
  "Кабинет менеджера должен опираться на роль из bootstrap, а не на локальный дефолт."
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
  [
    { id: "a" },
    { id: "b" },
  ],
  [{ id: "a" }]
);
assert.equal(normalDelete.ok, true);

const lastDelete = assertSafeManagerOrderReplace([{ id: "a" }], []);
assert.equal(lastDelete.ok, true);

const emptyWipe = assertSafeManagerOrderReplace([{ id: "a" }, { id: "b" }], []);
assert.equal(emptyWipe.ok, false);

console.log(
  "verify-orders-hardening: exchange sanitize + manager wipe guard + UI gates ok"
);
