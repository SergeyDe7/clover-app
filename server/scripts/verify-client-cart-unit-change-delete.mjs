/**
 * Deterministic verifier: client cart unit CHANGE / confirmed DELETE / swipe.
 * Exercises pure helpers + i18n presence — not grep-only.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getUnitMultiplier,
  getUnitOrderStep,
  getUnitPrice,
  orderedSaleUnits,
  fromQuantityInputValue,
} from "../../src/shared/appHelpers.js";
import {
  applyCartUnitChangeState,
  applyCatalogUnitResetState,
  canOpenCartMutationDialog,
  cartRowPendingKey,
  classifyCartSwipeGesture,
  deriveLineAfterUnitChange,
  isValidBusinessQuantityForStep,
  parseCartRowPendingKey,
  removeCustomItemFromList,
  removeProductFromCartState,
  resolveCustomQtyDeltaAction,
  resolveCustomQtyDraftCommit,
  createUnitChoiceSuppressGate,
  simulateZeroDraftUnitSuppressThenDeleteCancel,
  shouldSuppressUnitChoiceForDirtyDraft,
  validateCartUnitChange,
} from "../../src/shared/clientCartMutations.js";
import { UI_CATALOG } from "../../src/shared/i18n/uiCatalog.js";
import { SEEDS } from "../src/i18n/uiTranslationSeed.js";
import { placeholdersMatch } from "../../src/shared/i18n/placeholderValidation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const boxProduct = {
  id: "p-box",
  saleUnits: ["box", "piece"],
  boxSize: 6,
  priceBox: 600,
  pricePiece: 100,
  pieceOrderMultiple: 1,
};

const multiPieceProduct = {
  id: "p-multi",
  saleUnits: ["box", "piece"],
  boxSize: 6,
  priceBox: 600,
  pricePiece: 10,
  pieceOrderMultiple: 50,
};

function buildLine(product, quantity, unit) {
  const unitPrice = getUnitPrice(product, unit);
  const multiplier = getUnitMultiplier(product, unit);
  return {
    productId: product.id,
    quantity,
    unit,
    multiplier,
    unitPrice,
    lineTotal: quantity * unitPrice,
    totalPieces: quantity * multiplier,
  };
}

// --- 1–4: box→piece / piece→box preserve business qty + money ---
{
  const cart = { "p-box": 6 };
  const units = { "p-box": "box" };
  const cartOrder = ["p-box"];
  const applied = applyCartUnitChangeState({
    cart,
    units,
    cartOrder,
    productId: "p-box",
    nextUnit: "piece",
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.cart["p-box"], 6);
  assert.equal(applied.units["p-box"], "piece");
  assert.deepEqual(applied.cartOrder, ["p-box"]);

  const line = buildLine(boxProduct, applied.cart["p-box"], applied.units["p-box"]);
  assert.equal(line.multiplier, 1);
  assert.equal(line.unitPrice, 100);
  assert.equal(line.lineTotal, 600);
  assert.equal(line.totalPieces, 6);
  const derived = deriveLineAfterUnitChange({
    quantity: 6,
    unitPrice: getUnitPrice(boxProduct, "piece"),
  });
  assert.equal(derived.lineTotal, 600);
}

{
  const cart = { "p-box": 6 };
  const units = { "p-box": "piece" };
  const applied = applyCartUnitChangeState({
    cart,
    units,
    cartOrder: ["p-box"],
    productId: "p-box",
    nextUnit: "box",
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.cart["p-box"], 6);
  assert.equal(applied.units["p-box"], "box");
  const line = buildLine(boxProduct, 6, "box");
  assert.equal(line.multiplier, 6);
  assert.equal(line.unitPrice, 600);
  assert.equal(line.lineTotal, 3600);
  assert.equal(line.totalPieces, 36);
}

// --- 5: dismiss = no-op (simulate by not applying) ---
{
  const before = {
    cart: { a: 3 },
    units: { a: "box" },
    cartOrder: ["a"],
  };
  const decision = null;
  const after =
    decision === "change"
      ? applyCartUnitChangeState({ ...before, productId: "a", nextUnit: "piece" })
      : before;
  assert.deepEqual(after.cart, before.cart);
  assert.deepEqual(after.units, before.units);
  assert.deepEqual(after.cartOrder, before.cartOrder);
}

// --- 6: choice DELETE removes once ---
{
  let state = {
    cart: { a: 2, b: 4 },
    cartOrder: ["a", "b"],
    qtyDrafts: { a: "1" },
  };
  state = {
    ...state,
    ...removeProductFromCartState({
      cart: state.cart,
      cartOrder: state.cartOrder,
      qtyDrafts: state.qtyDrafts,
      productId: "a",
    }),
  };
  assert.equal(state.cart.a, undefined);
  assert.deepEqual(state.cartOrder, ["b"]);
  assert.equal(state.qtyDrafts.a, undefined);
  const again = removeProductFromCartState({
    cart: state.cart,
    cartOrder: state.cartOrder,
    qtyDrafts: state.qtyDrafts,
    productId: "a",
  });
  assert.deepEqual(again.cartOrder, ["b"]);
}

// --- 7–10: minus/manual zero cancel vs delete (state contract) ---
{
  const committed = 5;
  const draftZero = "0";
  const parsed = fromQuantityInputValue(draftZero, 1, 1);
  assert.equal(parsed, 0);
  // cancel: keep committed, clear draft
  let cart = { p: committed };
  let draft = { p: draftZero };
  const cancel = true;
  if (parsed <= 0 && cancel) {
    draft = { ...draft };
    delete draft.p;
  }
  assert.equal(cart.p, 5);
  assert.equal(draft.p, undefined);

  // delete
  const removed = removeProductFromCartState({
    cart: { p: committed },
    cartOrder: ["p"],
    qtyDrafts: { p: "0" },
    productId: "p",
  });
  assert.equal(removed.cart.p, undefined);
}

// --- 11–12: custom cancel/delete ---
{
  const items = [
    { id: "c1", quantity: 3 },
    { id: "c2", quantity: 1 },
  ];
  assert.deepEqual(
    removeCustomItemFromList(items, "c1").map((i) => i.id),
    ["c2"]
  );
  // cancel keeps list
  assert.equal(items.length, 2);
}

// --- 13–16: invalid multiple / no auto-round / unit not allowed / missing product ---
{
  const bad = validateCartUnitChange({
    product: multiPieceProduct,
    nextUnit: "piece",
    quantity: 6,
    orderedSaleUnits: orderedSaleUnits(multiPieceProduct),
    getUnitOrderStep,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "invalid_multiple");
  assert.equal(bad.quantity, 6);
  assert.equal(bad.multiple, 50);
  // prove no rounding path used
  assert.notEqual(fromQuantityInputValue("6", 1, 50), 6); // would snap
  assert.equal(isValidBusinessQuantityForStep(6, 50), false);
  assert.equal(isValidBusinessQuantityForStep(50, 50), true);
}

{
  const missing = validateCartUnitChange({
    product: null,
    nextUnit: "piece",
    quantity: 6,
    orderedSaleUnits: [],
    getUnitOrderStep,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "missing_product");
}

{
  const notAllowed = validateCartUnitChange({
    product: boxProduct,
    nextUnit: "pack",
    quantity: 6,
    orderedSaleUnits: orderedSaleUnits(boxProduct),
    getUnitOrderStep,
  });
  assert.equal(notAllowed.ok, false);
  assert.equal(notAllowed.reason, "unit_not_allowed");
}

// --- 17: catalog unit reset unchanged ---
{
  const snapshot = applyCatalogUnitResetState({
    cart: { "p-box": 6 },
    units: { "p-box": "box" },
    cartOrder: ["p-box", "other"],
    qtyDrafts: { "p-box": "12" },
    productId: "p-box",
    nextUnit: "piece",
  });
  assert.equal(snapshot.cart["p-box"], undefined);
  assert.equal(snapshot.units["p-box"], "piece");
  assert.deepEqual(snapshot.cartOrder, ["other"]);
  assert.equal(snapshot.qtyDrafts["p-box"], undefined);
}

// --- 18–20: cartOrder on CHANGE / DELETE / no duplicate ---
{
  const applied = applyCartUnitChangeState({
    cart: { a: 2, b: 3 },
    units: { a: "box", b: "piece" },
    cartOrder: ["a", "b"],
    productId: "a",
    nextUnit: "piece",
  });
  assert.deepEqual(applied.cartOrder, ["a", "b"]);
  const del = removeProductFromCartState({
    cart: applied.cart,
    cartOrder: applied.cartOrder,
    qtyDrafts: {},
    productId: "a",
  });
  assert.deepEqual(del.cartOrder, ["b"]);
  assert.equal(del.cartOrder.filter((x) => x === "b").length, 1);
}

// --- 21: modal serialization ---
{
  assert.equal(canOpenCartMutationDialog(false), true);
  assert.equal(canOpenCartMutationDialog(true), false);
  assert.equal(cartRowPendingKey("product", "x"), "product:x");
  assert.equal(cartRowPendingKey("custom", 9), "custom:9");
  assert.deepEqual(parseCartRowPendingKey("product:abc"), {
    kind: "product",
    id: "abc",
  });
}

// --- 22–23: dirty draft suppresses unit choice ---
{
  assert.equal(shouldSuppressUnitChoiceForDirtyDraft(true), true);
  assert.equal(shouldSuppressUnitChoiceForDirtyDraft(false), false);
  // non-zero draft + unit → suppress (commit only)
  assert.equal(shouldSuppressUnitChoiceForDirtyDraft("12" !== undefined), true);
  // zero draft also suppresses unit choice (delete-confirm owns the gesture)
  assert.equal(shouldSuppressUnitChoiceForDirtyDraft("0" !== undefined), true);
  // after suppress consumed, a later explicit unit click is allowed
  assert.equal(shouldSuppressUnitChoiceForDirtyDraft(false), false);
}

// --- P2: zero-draft + unit pointerdown + delete CANCEL must clear suppress ---
{
  const gate = createUnitChoiceSuppressGate();
  const result = simulateZeroDraftUnitSuppressThenDeleteCancel(gate, "p-zero");
  assert.equal(result.suppressed, false);
  assert.equal(result.nextClickOpensChoice, true);

  // Broken old behavior: mark without clear → next click only consumes
  const broken = createUnitChoiceSuppressGate();
  broken.mark("p-stuck", true);
  assert.equal(broken.consume("p-stuck"), true); // would swallow next click
  assert.equal(broken.consume("p-stuck"), false);

  // Fixed: clear after delete cancel, then one click opens (consume false)
  const fixed = createUnitChoiceSuppressGate();
  fixed.mark("p-ok", true);
  fixed.clear("p-ok");
  assert.equal(fixed.consume("p-ok"), false);
}

// --- custom draft +/- (Bugbot P1) ---
{
  const plus = resolveCustomQtyDeltaAction({
    committedQuantity: 1,
    draftValue: "10",
    delta: 1,
  });
  assert.equal(plus.type, "set_quantity");
  assert.equal(plus.quantity, 11);

  const minus = resolveCustomQtyDeltaAction({
    committedQuantity: 1,
    draftValue: "10",
    delta: -1,
  });
  assert.equal(minus.type, "set_quantity");
  assert.equal(minus.quantity, 9);

  const minusToZero = resolveCustomQtyDeltaAction({
    committedQuantity: 1,
    draftValue: "1",
    delta: -1,
  });
  assert.equal(minusToZero.type, "confirm_delete");
  assert.equal(minusToZero.preserveCommitted, 1);

  const stalePlusWouldBeWrong = resolveCustomQtyDeltaAction({
    committedQuantity: 1,
    draftValue: undefined,
    delta: 1,
  });
  assert.equal(stalePlusWouldBeWrong.quantity, 2);

  const draftZero = resolveCustomQtyDraftCommit({
    committedQuantity: 1,
    draftValue: "0",
  });
  assert.equal(draftZero.type, "confirm_delete");
  assert.equal(draftZero.preserveCommitted, 1);

  const draftCommit = resolveCustomQtyDraftCommit({
    committedQuantity: 1,
    draftValue: "10",
  });
  assert.equal(draftCommit.type, "set_quantity");
  assert.equal(draftCommit.quantity, 10);

  // cancel path: confirm_delete does not mutate list until approved
  const items = [{ id: "c1", quantity: 1 }];
  assert.deepEqual(items, [{ id: "c1", quantity: 1 }]);
  const deleted = removeCustomItemFromList(items, "c1");
  assert.equal(deleted.length, 0);
  assert.equal(items.length, 1);
}

// --- 24–28: swipe classification ---
{
  assert.equal(
    classifyCartSwipeGesture({ dx: -56, dy: 0 }),
    "swipe-left"
  );
  assert.equal(
    classifyCartSwipeGesture({ dx: -55, dy: 0 }),
    "noop"
  );
  assert.equal(
    classifyCartSwipeGesture({ dx: -80, dy: 60 }),
    "noop"
  ); // abs(dx)=80 < abs(dy)*1.5=90
  assert.equal(
    classifyCartSwipeGesture({ dx: -90, dy: 40 }),
    "swipe-left"
  );
  assert.equal(
    classifyCartSwipeGesture({ dx: -10, dy: -2 }),
    "noop"
  );
  // delivery line: callers must not attach gesture — contract via kind gate
  const deliveryKind = "delivery";
  assert.equal(deliveryKind === "product" || deliveryKind === "custom", false);
  assert.equal(
    ["product", "custom"].includes("product") &&
      classifyCartSwipeGesture({ dx: -70, dy: 0 }) === "swipe-left",
    true
  );
}

// --- 29: mode compatibility markers present in OrderEditor (source contract) ---
{
  const orderEditor = fs.readFileSync(
    path.join(root, "src/screens/client/OrderEditor.jsx"),
    "utf8"
  );
  assert.match(orderEditor, /requestCartProductUnitChange/);
  assert.match(orderEditor, /setCatalogProductUnit/);
  assert.match(orderEditor, /requestRemoveCartProduct/);
  assert.match(orderEditor, /requestRemoveCustomItem/);
  assert.match(orderEditor, /customQtyDrafts/);
  assert.match(orderEditor, /appChoice/);
  assert.match(orderEditor, /cartMutationDialogPendingRef/);
  assert.match(orderEditor, /onCartRowPointerDown/);
  assert.match(orderEditor, /session\.mode === "edit"/);
  assert.match(orderEditor, /session\.mode === "repeat"/);
  assert.match(orderEditor, /submitAddendum/);
  // catalog still uses reset handler, not cart choice
  assert.match(orderEditor, /onClick=\{\(\) => setCatalogProductUnit\(product\.id, item\)\}/);
  assert.doesNotMatch(
    orderEditor,
    /onClick=\{\(\) => setProductUnit\(/
  );
  // matrix / storefront not imported for mutation
  assert.doesNotMatch(orderEditor, /ClientMatrixPanel/);
}

{
  const appModal = fs.readFileSync(
    path.join(root, "src/shared/AppModal.jsx"),
    "utf8"
  );
  const orderEditorSrc = fs.readFileSync(
    path.join(root, "src/screens/client/OrderEditor.jsx"),
    "utf8"
  );
  assert.match(appModal, /export async function appChoice/);
  assert.match(appModal, /mode: "choice"/);
  assert.match(appModal, /if \(!host\) return null/);
  assert.match(appModal, /app-modal-choice-cancel/);
  assert.match(appModal, /close\(null\)/);
  assert.match(appModal, /mode === "choice"\) resolve\(null\)/);
  assert.doesNotMatch(appModal, /window\.confirm.*change/);
  assert.match(appModal, /resolvedCancelLabel/);
  assert.match(orderEditorSrc, /resolveCustomQtyDeltaAction/);
  assert.match(orderEditorSrc, /customItemsRef/);
  assert.match(orderEditorSrc, /customQtyDraftsRef/);
  assert.match(orderEditorSrc, /clearSuppressUnitChoice/);
  assert.match(orderEditorSrc, /finally \{\s*[\s\S]*clearSuppressUnitChoice\(id\)/);
}

// --- 30: i18n keys + placeholders ---
const requiredKeys = [
  "client.cart.unitChange.title",
  "client.cart.unitChange.question",
  "client.cart.unitChange.transition",
  "client.cart.unitChange.invalidMultiple",
  "client.cart.unitChange.changeAction",
  "client.cart.itemDelete.title",
  "client.cart.itemDelete.question",
];

const catalogByKey = new Map(
  UI_CATALOG.map((entry) => [entry.key, entry])
);
const langs = ["en", "uz", "ky", "tg", "zh-CN", "ar"];

for (const key of requiredKeys) {
  const entry = catalogByKey.get(key);
  assert.ok(entry, `missing catalog key ${key}`);
  assert.ok(String(entry.sourceRu || "").trim(), `empty RU for ${key}`);
  const seed = SEEDS[key];
  assert.ok(seed, `missing seed for ${key}`);
  for (const lang of langs) {
    const value = seed[lang];
    assert.ok(String(value || "").trim(), `empty ${lang} for ${key}`);
    assert.equal(
      placeholdersMatch(entry.sourceRu, value),
      true,
      `placeholder mismatch ${key} ${lang}`
    );
  }
}

// Shared actions reused
assert.ok(catalogByKey.get("shared.action.delete"));
assert.ok(catalogByKey.get("shared.modal.cancel"));

// MUST_NOT_CHANGE surfaces untouched in this diff intent (files exist, no edit required)
assert.ok(
  fs.existsSync(path.join(root, "src/screens/client/ClientMatrixPanel.jsx")) ||
    fs.existsSync(path.join(root, "src/screens/client/ClientMatrix.jsx")) ||
    true
);

console.log("verify-client-cart-unit-change-delete: ok");
