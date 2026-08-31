import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ORDER_STATUSES,
  allowedNextOrderStatuses,
  applyOneCAcceptedStatus,
  applyOrderStatusPolicy,
  buildStatusUpdatedOrder,
  canTransitionOrderStatus,
  enforceOrderStatusChange,
} from "../src/orderStatus.js";
import {
  ROLES,
  hasRole,
  isClientRole,
  isStaffRole,
  normalizeRole,
} from "../src/roles.js";

assert.deepEqual(ORDER_STATUSES, [
  "Новый",
  "Принят",
  "Обработан вручную",
  "Собирается",
  "Готов к доставке",
  "Доставляется",
  "Выполнен",
  "Отменён",
]);

assert.equal(canTransitionOrderStatus("Новый", "Принят"), true);
assert.equal(canTransitionOrderStatus("Новый", "Выполнен"), true);
assert.equal(canTransitionOrderStatus("Новый", "Обработан вручную"), true);
assert.equal(canTransitionOrderStatus("Новый", "Доставляется"), true);
assert.equal(canTransitionOrderStatus("Принят", "Выполнен"), true);
assert.equal(canTransitionOrderStatus("Принят", "Новый"), false);
assert.equal(canTransitionOrderStatus("Принят", "Принят"), true);
assert.equal(canTransitionOrderStatus("Выполнен", "Отменён"), false);
assert.equal(canTransitionOrderStatus("Готов к доставке", "Доставляется"), true);
assert.equal(canTransitionOrderStatus("Доставляется", "Выполнен"), true);
assert.deepEqual(allowedNextOrderStatuses("Новый"), [
  "Новый",
  "Принят",
  "Обработан вручную",
  "Собирается",
  "Готов к доставке",
  "Доставляется",
  "Выполнен",
  "Отменён",
]);
assert.deepEqual(allowedNextOrderStatuses("Принят"), [
  "Принят",
  "Обработан вручную",
  "Собирается",
  "Готов к доставке",
  "Доставляется",
  "Выполнен",
  "Отменён",
]);
assert.deepEqual(allowedNextOrderStatuses("Готов к доставке"), [
  "Готов к доставке",
  "Доставляется",
  "Выполнен",
  "Отменён",
  "Обработан вручную",
]);
assert.deepEqual(allowedNextOrderStatuses("Доставляется"), [
  "Доставляется",
  "Выполнен",
  "Отменён",
  "Обработан вручную",
]);

const clientKeep = enforceOrderStatusChange({
  previous: { status: "Принят" },
  incoming: { status: "Новый" },
  role: "client",
});
assert.equal(clientKeep.ok, true);
assert.equal(clientKeep.status, "Принят");

assert.equal(
  enforceOrderStatusChange({
    previous: null,
    incoming: { status: "Принят" },
    role: "client",
  }).code,
  "ORDER_STATUS_CREATE_FORBIDDEN"
);

assert.equal(
  enforceOrderStatusChange({
    previous: null,
    incoming: { status: "Новый" },
    role: "client",
  }).ok,
  true
);

assert.equal(
  enforceOrderStatusChange({
    previous: { status: "Новый" },
    incoming: { status: "Выполнен" },
    role: "manager",
  }).ok,
  true
);

assert.equal(
  enforceOrderStatusChange({
    previous: { status: "Принят" },
    incoming: { status: "Новый" },
    role: "manager",
  }).code,
  "ORDER_STATUS_TRANSITION_FORBIDDEN"
);

assert.equal(
  enforceOrderStatusChange({
    previous: { status: "Готов к доставке" },
    incoming: { status: "Выполнен" },
    role: "admin",
  }).ok,
  true
);

const policy = applyOrderStatusPolicy({
  previousById: new Map([
    ["a", { id: "a", status: "Новый" }],
    ["b", { id: "b", status: "Принят" }],
  ]),
  orders: [
    { id: "a", status: "Принят" },
    { id: "b", status: "Собирается" },
  ],
  role: "manager",
});
assert.equal(policy.ok, true);
assert.equal(policy.orders[0].status, "Принят");
assert.equal(policy.orders[1].status, "Собирается");

const forwardPolicy = applyOrderStatusPolicy({
  previousById: new Map([["a", { id: "a", status: "Новый" }]]),
  orders: [{ id: "a", status: "Выполнен" }],
  role: "manager",
});
assert.equal(forwardPolicy.ok, true);
assert.equal(forwardPolicy.orders[0].status, "Выполнен");

const badPolicy = applyOrderStatusPolicy({
  previousById: new Map([["a", { id: "a", status: "Принят" }]]),
  orders: [{ id: "a", status: "Новый" }],
  role: "manager",
});
assert.equal(badPolicy.ok, false);
assert.equal(badPolicy.code, "ORDER_STATUS_TRANSITION_FORBIDDEN");

const patched = buildStatusUpdatedOrder(
  { id: "o1", status: "Новый", history: [] },
  "Принят",
  { role: "manager", historyId: "h1" }
);
assert.equal(patched.ok, true);
assert.equal(patched.unchanged, false);
assert.equal(patched.order.status, "Принят");
assert.equal(patched.order.history.at(-1).type, "status.changed");

const unchanged = buildStatusUpdatedOrder(
  { id: "o1", status: "Новый", history: [] },
  "Новый",
  { role: "manager" }
);
assert.equal(unchanged.ok, true);
assert.equal(unchanged.unchanged, true);

const completedPatch = buildStatusUpdatedOrder(
  { id: "o1", status: "Новый", history: [] },
  "Выполнен",
  { role: "manager", historyId: "h-done" }
);
assert.equal(completedPatch.ok, true);
assert.equal(completedPatch.order.status, "Выполнен");

const reversePatch = buildStatusUpdatedOrder(
  { id: "o1", status: "Выполнен", history: [] },
  "Принят",
  { role: "manager" }
);
assert.equal(reversePatch.ok, false);
assert.equal(reversePatch.code, "ORDER_STATUS_TRANSITION_FORBIDDEN");

const fromOneC = applyOneCAcceptedStatus(
  { id: "o2", status: "Новый", history: [] },
  { historyId: "onec-1", oneCState: "В работе" }
);
assert.equal(fromOneC.ok, true);
assert.equal(fromOneC.order.status, "Принят");

assert.equal(normalizeRole("Admin"), ROLES.ADMIN);
assert.equal(isStaffRole("manager"), true);
assert.equal(isStaffRole("admin"), true);
assert.equal(isStaffRole("client"), false);
assert.equal(isClientRole("client"), true);
assert.equal(hasRole("admin", "manager"), true);
assert.equal(hasRole("manager", "admin"), false);
assert.equal(hasRole("client", ["manager", "admin"]), false);
assert.equal(hasRole("admin", ["manager", "admin"]), true);

const serverSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/server.js"),
  "utf8"
);
assert.match(serverSource, /app\.patch\(\s*"\/api\/orders\/:orderId\/status"/);
assert.match(serverSource, /app\.post\(\s*"\/api\/orders\/status\/bulk"/);

console.log("verify-order-status-roles: ok");
