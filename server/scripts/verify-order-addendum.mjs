import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canOrderAcceptAddendum,
  findLatestAddendumOrder,
  mergeOrderCatalogItems,
  mergeOrderCustomItems,
  orderGoodsMoneyTotal,
} from "../../src/shared/orderAddendum.js";
import {
  assertClientMayEditExistingOrder,
  assertClientOrderOwnership,
} from "../src/orderClientEdit.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverSource = readFileSync(path.join(root, "server/src/server.js"), "utf8");
const orderEditorSource = readFileSync(
  path.join(root, "src/screens/client/OrderEditor.jsx"),
  "utf8"
);
const appSource = readFileSync(path.join(root, "src/App.jsx"), "utf8");

const settings = { allowClientEdit: true };
const openOrder = {
  id: "o1",
  number: "CL-1",
  status: "Новый",
  createdAt: "2026-08-31T10:00:00.000Z",
  exchange: { status: "not_sent" },
  items: [{ productId: "p1", unit: "piece", quantity: 1, unitPrice: 100, lineTotal: 100 }],
  customItems: [],
  deliveryFee: 500,
};

assert.equal(canOrderAcceptAddendum(openOrder, settings), true);
assert.equal(canOrderAcceptAddendum({ ...openOrder, status: "Принят" }, settings), false);
assert.equal(
  canOrderAcceptAddendum({ ...openOrder, exchange: { status: "ready" } }, settings),
  false
);
assert.equal(canOrderAcceptAddendum(openOrder, { allowClientEdit: false }), false);

const older = {
  ...openOrder,
  id: "o0",
  number: "CL-0",
  createdAt: "2026-08-30T10:00:00.000Z",
};
assert.equal(findLatestAddendumOrder([older, openOrder], settings)?.id, "o1");
assert.equal(findLatestAddendumOrder([{ ...openOrder, status: "Принят" }], settings), null);

const merged = mergeOrderCatalogItems(openOrder.items, [
  { productId: "p1", unit: "piece", quantity: 2, unitPrice: 100, lineTotal: 200 },
  { productId: "p2", unit: "pack", quantity: 1, unitPrice: 50, lineTotal: 50 },
]);
assert.equal(merged.length, 2);
assert.equal(merged.find((i) => i.productId === "p1").quantity, 3);
assert.equal(orderGoodsMoneyTotal({ items: merged, customItems: [] }), 350);

const customs = mergeOrderCustomItems([{ id: "c1", name: "A" }], [{ id: "c2", name: "B" }]);
assert.equal(customs.length, 2);

assert.equal(
  assertClientMayEditExistingOrder({
    previous: openOrder,
    incoming: { ...openOrder, items: merged },
    settings,
    compositionChanged: true,
  }).ok,
  true
);
assert.equal(
  assertClientMayEditExistingOrder({
    previous: { ...openOrder, status: "Принят" },
    incoming: { ...openOrder, status: "Принят", items: merged },
    settings,
    compositionChanged: true,
  }).code,
  "CLIENT_ORDER_EDIT_LOCKED"
);

// Merge must not invent a new order id — callers keep order.id.
const afterMerge = {
  ...openOrder,
  items: merged,
};
assert.equal(afterMerge.id, openOrder.id);

assert.equal(
  assertClientOrderOwnership({
    orderId: "b-order",
    storedUserId: "client-b",
    clientUserId: "client-a",
  }).code,
  "ORDER_OWNERSHIP_FORBIDDEN"
);
assert.equal(
  assertClientOrderOwnership({
    orderId: "a-order",
    storedUserId: "client-a",
    clientUserId: "client-a",
  }).ok,
  true
);

const orderClientEditSource = readFileSync(
  path.join(root, "server/src/orderClientEdit.js"),
  "utf8"
);

assert.ok(
  serverSource.includes("assertClientOrderOwnership"),
  "PUT /api/state/orders должен проверять ownership"
);
assert.ok(
  orderClientEditSource.includes("ORDER_OWNERSHIP_FORBIDDEN"),
  "ownership отказ должен иметь явный code"
);

// Addendum path must not add paid-delivery UI/fee overrides.
const submitAddendumIdx = orderEditorSource.indexOf("const submitAddendum");
assert.ok(submitAddendumIdx > 0, "submitAddendum должен существовать");
const submitAddendumSlice = orderEditorSource.slice(
  submitAddendumIdx,
  submitAddendumIdx + 2200
);
assert.ok(
  !submitAddendumSlice.includes("Платная доставка"),
  "дозаказ не должен показывать confirm платной доставки"
);
assert.ok(
  !submitAddendumSlice.includes("combinedDeliveryFee"),
  "дозаказ не должен считать combinedDeliveryFee"
);
assert.ok(
  !submitAddendumSlice.includes("deliveryFee:"),
  "дозаказ не должен передавать deliveryFee"
);
assert.ok(
  !submitAddendumSlice.includes("deliveryNote:"),
  "дозаказ не должен передавать deliveryNote"
);

const addendumMergeIdx = appSource.indexOf("addendumToOrderId");
assert.ok(addendumMergeIdx > 0, "App addendum merge должен существовать");
const addendumMergeSlice = appSource.slice(addendumMergeIdx, addendumMergeIdx + 1600);
assert.ok(
  !addendumMergeSlice.includes("deliveryFee: addendumPayload"),
  "App addendum merge не должен override deliveryFee"
);
assert.ok(
  !addendumMergeSlice.includes("deliveryNote: addendumPayload"),
  "App addendum merge не должен override deliveryNote"
);

console.log("verify-order-addendum: ok");
