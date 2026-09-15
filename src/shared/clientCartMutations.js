/**
 * Pure helpers for client cart unit-change / delete / swipe.
 * Kept free of React so Node verifiers can exercise transitions.
 */

/** Business quantity must be >0 and a multiple of target unit order step (no rounding). */
export function isValidBusinessQuantityForStep(quantity, orderStep) {
  const q = Number(quantity);
  const step = Math.max(1, Math.floor(Number(orderStep) || 1));
  if (!Number.isFinite(q) || q <= 0) return false;
  if (!Number.isInteger(q) && Math.floor(q) !== q) return false;
  return q % step === 0;
}

/**
 * Fail-closed validation before applying cart unit CHANGE.
 * Does not round via fromQuantityInputValue / snapQuantityToStep.
 */
export function validateCartUnitChange({
  product,
  nextUnit,
  quantity,
  orderedSaleUnits: saleUnitsList,
  getUnitOrderStep: orderStepFn,
}) {
  if (!product) {
    return { ok: false, reason: "missing_product" };
  }
  const allowed = Array.isArray(saleUnitsList) ? saleUnitsList : [];
  if (!allowed.includes(nextUnit)) {
    return { ok: false, reason: "unit_not_allowed", quantity: Number(quantity) || 0 };
  }
  const step = Math.max(1, Math.floor(Number(orderStepFn?.(product, nextUnit)) || 1));
  const q = Number(quantity);
  if (!isValidBusinessQuantityForStep(q, step)) {
    return {
      ok: false,
      reason: "invalid_multiple",
      quantity: q,
      multiple: step,
      unit: nextUnit,
    };
  }
  return { ok: true, quantity: q, multiple: step, unit: nextUnit };
}

/**
 * Apply CHANGE of sale unit while preserving business quantity and cartOrder index.
 * Does not convert through toQuantityInputValue / fromQuantityInputValue.
 */
export function applyCartUnitChangeState({
  cart,
  units,
  cartOrder,
  productId,
  nextUnit,
}) {
  const sid = String(productId);
  const quantity = Number(cart?.[productId] ?? cart?.[sid]);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: "missing_quantity", cart, units, cartOrder };
  }
  const nextUnits = { ...units };
  if (productId in nextUnits || !(sid in nextUnits)) {
    nextUnits[productId] = nextUnit;
  } else {
    nextUnits[sid] = nextUnit;
  }
  // Prefer original key shape used in cart
  const nextCart = { ...cart };
  if (productId in nextCart) nextCart[productId] = quantity;
  else nextCart[sid] = quantity;
  return {
    ok: true,
    cart: nextCart,
    units: nextUnits,
    cartOrder: Array.isArray(cartOrder) ? [...cartOrder] : cartOrder,
    quantity,
  };
}

/** Catalog-card unit switch: reset quantity / remove line (legacy semantics). */
export function applyCatalogUnitResetState({ cart, units, cartOrder, qtyDrafts, productId, nextUnit }) {
  const sid = String(productId);
  const nextUnits = { ...units, [productId]: nextUnit };
  const nextCart = { ...cart };
  delete nextCart[productId];
  delete nextCart[sid];
  const nextOrder = (cartOrder || []).filter((item) => String(item) !== sid);
  const nextDrafts = { ...(qtyDrafts || {}) };
  delete nextDrafts[productId];
  delete nextDrafts[sid];
  return { cart: nextCart, units: nextUnits, cartOrder: nextOrder, qtyDrafts: nextDrafts };
}

/** Low-level removal of a catalog product line (no confirm). */
export function removeProductFromCartState({ cart, cartOrder, qtyDrafts, productId }) {
  const sid = String(productId);
  const nextCart = { ...cart };
  delete nextCart[productId];
  delete nextCart[sid];
  const nextOrder = (cartOrder || []).filter((item) => String(item) !== sid);
  const nextDrafts = { ...(qtyDrafts || {}) };
  delete nextDrafts[productId];
  delete nextDrafts[sid];
  return { cart: nextCart, cartOrder: nextOrder, qtyDrafts: nextDrafts };
}

/** Custom-item list after confirmed delete. */
export function removeCustomItemFromList(customItems, id) {
  return (customItems || []).filter((item) => String(item.id) !== String(id));
}

/**
 * Classify a finished pointer gesture for swipe-left delete.
 * Returns "swipe-left" | "noop".
 */
export function classifyCartSwipeGesture({
  dx,
  dy,
  thresholdPx = 56,
  axisRatio = 1.5,
} = {}) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (x > -thresholdPx) return "noop";
  if (Math.abs(x) < Math.abs(y) * axisRatio) return "noop";
  return "swipe-left";
}

/**
 * Dirty qty draft + unit click: this gesture must only finish the draft commit;
 * unit choice opens only on a later explicit unit tap.
 */
export function shouldSuppressUnitChoiceForDirtyDraft(hasDirtyDraft) {
  return Boolean(hasDirtyDraft);
}

/**
 * Pure suppress-token gate for cart unit-choice.
 * Models pointerdown mark + optional missed click + mandatory clear after
 * zero-draft delete confirm completes.
 */
export function createUnitChoiceSuppressGate() {
  const ids = new Set();
  return {
    mark(productId, hasDirtyDraft) {
      if (hasDirtyDraft) ids.add(String(productId));
    },
    consume(productId) {
      const sid = String(productId);
      if (!ids.has(sid)) return false;
      ids.delete(sid);
      return true;
    },
    clear(productId) {
      ids.delete(String(productId));
    },
    has(productId) {
      return ids.has(String(productId));
    },
  };
}

/**
 * After zero-draft delete confirm (CANCEL or DELETE), suppression must be
 * cleared even when the originating unit click never ran (button disabled).
 * Next explicit unit click must open choice (consume returns false).
 */
export function simulateZeroDraftUnitSuppressThenDeleteCancel(gate, productId) {
  gate.mark(productId, true);
  // click never arrives (disabled while dialog open)
  gate.clear(productId);
  return {
    suppressed: gate.has(productId),
    nextClickOpensChoice: !gate.consume(productId),
  };
}

/** Typed pending keys for row busy UI / serialization. */
export function cartRowPendingKey(kind, id) {
  return `${kind}:${String(id)}`;
}

export function parseCartRowPendingKey(key) {
  if (typeof key !== "string" || !key.includes(":")) return null;
  const idx = key.indexOf(":");
  return { kind: key.slice(0, idx), id: key.slice(idx + 1) };
}

/** Whether a second cart destructive dialog may open. */
export function canOpenCartMutationDialog(pending) {
  return !pending;
}

/**
 * Resolve +/- for a custom cart line when a qty draft may be dirty.
 * Uses draft as the base when present so blur/click ordering cannot
 * apply delta against a stale committed quantity.
 *
 * @returns {{ type: 'set_quantity', quantity: number, clearDraft: true }
 *         | { type: 'confirm_delete', clearDraft: true, preserveCommitted: number }}
 */
export function resolveCustomQtyDeltaAction({
  committedQuantity,
  draftValue,
  delta,
} = {}) {
  const committed = Math.max(0, Number(committedQuantity) || 0);
  const hasDraft = draftValue !== undefined && draftValue !== null;
  const base = hasDraft
    ? Math.max(0, Number.parseInt(String(draftValue), 10) || 0)
    : committed;
  const step = Number(delta);
  const next = Math.max(0, base + (Number.isFinite(step) ? step : 0));
  if (next <= 0) {
    return {
      type: "confirm_delete",
      clearDraft: true,
      preserveCommitted: committed > 0 ? committed : 1,
    };
  }
  return { type: "set_quantity", quantity: next, clearDraft: true };
}

/**
 * Resolve blur/commit of a custom qty draft (no delta).
 */
export function resolveCustomQtyDraftCommit({
  committedQuantity,
  draftValue,
} = {}) {
  if (draftValue === undefined || draftValue === null) {
    return { type: "noop" };
  }
  const committed = Math.max(0, Number(committedQuantity) || 0);
  const next = Math.max(0, Number.parseInt(String(draftValue), 10) || 0);
  if (next <= 0) {
    return {
      type: "confirm_delete",
      clearDraft: true,
      preserveCommitted: committed > 0 ? committed : 1,
    };
  }
  return { type: "set_quantity", quantity: next, clearDraft: true };
}

/**
 * Derive line money after unit CHANGE (same business qty, new unit).
 */
export function deriveLineAfterUnitChange({ quantity, unitPrice }) {
  const q = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  return { quantity: q, unitPrice: price, lineTotal: q * price };
}
