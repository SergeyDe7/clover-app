import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ORDER_STATUSES, allowedNextOrderStatuses, buildStatusUpdatedOrder, enforceOrderStatusChange, applyOneCAcceptedStatus } from "../src/orderStatus.js";
import { ORDER_STATUSES as FRONT_STATUSES, allowedNextOrderStatuses as frontNext, MANAGER_BULK_ORDER_STATUSES } from "../../src/config/orderConfig.js";
import { canOrderAcceptAddendum } from "../../src/shared/orderAddendum.js";
import { assertClientMayEditExistingOrder, assertClientOrderOwnership } from "../src/orderClientEdit.js";
import { orderStatusLabel } from "../../src/shared/i18n/displayLabels.js";
import { RU_DICTIONARY } from "../../src/shared/i18n/dictionaries/ru.js";

// Reproducible isolated scenario: staff sets waiting-payment on an existing order;
// expect one history event, unchanged exchange/items, client push, repeated update no-op.
const WAIT = "Ожидание оплаты";
assert.deepEqual(FRONT_STATUSES, ORDER_STATUSES);
assert.ok(MANAGER_BULK_ORDER_STATUSES.includes(WAIT));
for (const status of ORDER_STATUSES) assert.deepEqual(frontNext(status), allowedNextOrderStatuses(status));
for (const from of ["Новый", "Принят", "Обработан вручную"]) {
  for (const role of ["manager", "admin"]) assert.equal(enforceOrderStatusChange({ previous: { status: from }, incoming: { status: WAIT }, role }).ok, true);
}
for (const from of ["Собирается", "Готов к доставке", "Доставляется", "Выполнен", "Отменён"]) {
  assert.equal(enforceOrderStatusChange({ previous: { status: from }, incoming: { status: WAIT }, role: "manager" }).code, "ORDER_STATUS_TRANSITION_FORBIDDEN");
}
assert.deepEqual(allowedNextOrderStatuses(WAIT), [WAIT, "Принят", "Собирается", "Готов к доставке", "Доставляется", "Выполнен", "Отменён"]);
for (const role of ["client", "manager", "admin"]) assert.equal(enforceOrderStatusChange({ incoming: { status: WAIT }, role }).code, "ORDER_STATUS_CREATE_FORBIDDEN");
assert.equal(enforceOrderStatusChange({ previous: { status: WAIT }, incoming: { status: "Новый" }, role: "client" }).status, WAIT);
assert.equal(enforceOrderStatusChange({ previous: { status: "Новый" }, incoming: { status: WAIT }, role: "guest" }).code, "ORDER_STATUS_ROLE_FORBIDDEN");
const previous = { id: "test-order", number: "TEST-1", clientId: "client-test", status: "Новый", history: [], items: [{ productId: "p1", quantity: 2, lineTotal: 200 }], total: 200 };
for (const status of ["not_sent", "ready", "sending", "sent", "draft", "error"]) {
  const order = { ...previous, exchange: { status, receipt: "TEST-receipt", remoteDocument: { id: "TEST-doc", number: "TEST-42" }, claimedBy: "TEST-worker", attempts: 3 } };
  const snapshot = JSON.stringify(order);
  const built = buildStatusUpdatedOrder(order, WAIT, { role: "manager", historyId: "test-history" });
  assert.equal(built.ok, true);
  assert.equal(built.order.status, WAIT);
  assert.equal(JSON.stringify(order), snapshot);
  assert.deepEqual(built.order.exchange, order.exchange);
  assert.deepEqual(built.order.items, order.items);
  assert.equal(built.order.total, order.total);
  assert.equal(built.order.history.length, 1);
  assert.equal(built.order.history[0].label, `Статус изменён: Новый → ${WAIT}`);
  const repeat = buildStatusUpdatedOrder(built.order, WAIT, { role: "admin" });
  assert.equal(repeat.unchanged, true);
  assert.equal(repeat.order, built.order);
  for (let attempt = 0; attempt < 2; attempt++) {
    const ack = applyOneCAcceptedStatus(built.order, { oneCState: "В работе", historyId: "test-ack" });
    assert.equal(ack.unchanged, true);
    assert.equal(ack.order, built.order);
  }
  assert.equal(canOrderAcceptAddendum(built.order, { allowClientEdit: true }), false);
  assert.equal(assertClientMayEditExistingOrder({ previous: built.order, incoming: { ...built.order, total: 999 }, settings: { allowClientEdit: true }, compositionChanged: true }).code, "CLIENT_ORDER_EDIT_LOCKED");
}
assert.equal(assertClientOrderOwnership({ orderId: previous.id, storedUserId: "other-client", clientUserId: previous.clientId }).code, "ORDER_OWNERSHIP_FORBIDDEN");
assert.equal(orderStatusLabel(WAIT, (key) => RU_DICTIONARY[key]), WAIT);
const helpers = readFileSync(new URL("../../src/shared/appHelpers.js", import.meta.url), "utf8");
const statusFunction = helpers.match(/export function statusClass\(status\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(statusFunction);
assert.equal(runInNewContext(statusFunction.replace("export ", "") + `\nstatusClass(${JSON.stringify(WAIT)})`), "status-work");
const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const notification = server.match(/function notifyClientOrderStatusChanged\(order, _previousStatus\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(notification);
const pushes = [];
const context = { sendOrderPush: (clientId, message) => { pushes.push({ clientId, message }); return Promise.resolve(); }, logCaughtError: () => assert.fail("Unexpected push failure") };
runInNewContext(notification + "\nnotifyClientOrderStatusChanged(order, 'Новый');", { ...context, order: { ...previous, status: WAIT } });
assert.equal(pushes.length, 1);
assert.equal(pushes[0].clientId, previous.clientId);
assert.equal(pushes[0].message.body, `статус: ${WAIT}`);
assert.equal(pushes[0].message.url, "/?order=test-order");
runInNewContext(notification + "\nnotifyClientOrderStatusChanged(order, 'Новый');", { ...context, order: { id: "no-recipient", status: WAIT } });
assert.equal(pushes.length, 1);
for (const [start, end] of [[ 'app.patch(\n  "/api/orders/:orderId/status"', 'app.post(\n  "/api/orders/status/bulk"' ], [ 'app.post(\n  "/api/orders/status/bulk"', 'app.' ]]) {
  const begin = server.indexOf(start);
  assert.ok(begin >= 0);
  const finish = server.indexOf(end, begin + start.length);
  const route = server.slice(begin, finish < 0 ? undefined : finish);
  assert.match(route, /roleRequired\("manager"\)/);
  assert.ok(route.indexOf("built.unchanged") < route.indexOf("notifyClientOrderStatusChanged(order, previousStatus)"));
  assert.match(route.slice(route.indexOf("built.unchanged"), route.indexOf("notifyClientOrderStatusChanged(order, previousStatus)")), /return res\.json|continue;/);
}
console.log("PASS verify-order-waiting-payment: FSM, roles, repeat update/accepted ACK, history, exchange/items invariance, edit/addendum lock, ownership, frontend parity, RU/badge, mocked notification and route no-op wiring");
console.log("NOT TESTED: live HTTP/GET, network outage/restart, environment/key rejection, real 1C document validation, persisted rollback, responsive/PWA, real push delivery");


// Execute actual route handlers in a mocked app; persistence and push stay in-memory.
for (const kind of ["patch", "bulk"]) {
  const start = kind === "patch" ? 'app.patch(\n  "/api/orders/:orderId/status"' : 'app.post(\n  "/api/orders/status/bulk"';
  const begin = server.indexOf(start);
  const finish = server.indexOf("\napp.", begin + start.length);
  const routeSource = server.slice(begin, finish < 0 ? undefined : finish);
  let handler;
  let stored = { id: previous.id, payload: structuredClone(previous) };
  let writes = 0;
  const notifications = [];
  const guards = [];
  const sentinel = () => {};
  runInNewContext(routeSource, {
    app: { [kind === "patch" ? "patch" : "post"]: (_path, auth, role, fn) => { assert.equal(auth, sentinel); assert.equal(role, sentinel); handler = fn; } },
    authRequired: sentinel,
    roleRequired: (role) => { guards.push(role); return sentinel; },
    getOrderById: (id) => id === stored.id ? stored : null,
    buildStatusUpdatedOrder,
    isStaffRole: (role) => role === "manager" || role === "admin",
    randomUUID: () => "route-history",
    updateOrderPayload: (id, payload) => { assert.equal(id, stored.id); writes++; stored = { id, payload }; return payload; },
    auditFromRequest: () => {},
    notifyClientOrderStatusChanged: (order) => notifications.push(order),
  });
  assert.deepEqual(guards, ["manager"]);
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    const res = { status: () => res, json: (value) => { response = value; return value; } };
    handler({ params: { orderId: stored.id }, body: kind === "patch" ? { status: WAIT } : { status: WAIT, orderIds: [stored.id] }, user: { role: "manager" } }, res);
    assert.equal(response.ok, true);
    if (kind === "patch") assert.equal(response.unchanged, attempt === 1);
    else assert.equal(response.updated.length, attempt === 0 ? 1 : 0);
    assert.equal(writes, 1);
    assert.equal(notifications.length, 1);
    assert.equal(stored.payload.status, WAIT);
  }
  assert.equal(stored.payload.history.length, 1);
}
console.log("PASS actual PATCH/bulk handlers in VM: manager middleware wiring, one in-memory write and notification, repeated request no write/no notification");
