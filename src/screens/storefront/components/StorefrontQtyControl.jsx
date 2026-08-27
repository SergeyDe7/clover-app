import { useEffect, useState } from "react";
import {
  fromQuantityInputValue,
  quantityInputStep,
  quantityInputUnitLabel,
  toQuantityInputValue,
} from "../../../shared/appHelpers.js";
import {
  addToCart,
  getCartItems,
  setCartQty,
  snapCartQty,
  subscribeCart,
} from "../cartStorage.js";
import { storefrontUnitLabel } from "./StorefrontUnitChoice.jsx";

function cartLineKey(productId, unit) {
  return `${productId}::${unit}`;
}

function findCartQty(productId, unit) {
  const item = getCartItems().find(
    (row) =>
      String(row.productId) === String(productId) && row.unit === unit
  );
  return item ? Number(item.qty) || 0 : 0;
}

function displayUnitLabel(unit, multiplier) {
  const raw = quantityInputUnitLabel(unit, multiplier);
  if (Math.max(1, Number(multiplier) || 1) > 1) {
    return storefrontUnitLabel("piece") || "шт";
  }
  return storefrontUnitLabel(unit) || String(raw).replace(/\.$/, "");
}

export function StorefrontQtyControl({
  productId,
  code = "",
  name = "",
  unit,
  unitLabel = "",
  price = 0,
  imageUrl = "",
  orderStep = 1,
  unitSize = 1,
  compact = false,
}) {
  const step = Math.max(1, Math.floor(Number(orderStep) || 1));
  const multiplier = Math.max(1, Math.floor(Number(unitSize) || 1));
  const inputStep = quantityInputStep(multiplier, step);
  const qtyUnitLabel = displayUnitLabel(unit, multiplier);
  const lineKey = cartLineKey(productId, unit);
  const [cartQty, setCartQtyState] = useState(() => findCartQty(productId, unit));
  const [draft, setDraft] = useState(() =>
    String(toQuantityInputValue(step, multiplier))
  );

  useEffect(() => {
    const sync = () => {
      const qty = findCartQty(productId, unit);
      setCartQtyState(qty);
      setDraft(
        String(toQuantityInputValue(qty > 0 ? qty : step, multiplier))
      );
    };
    sync();
    return subscribeCart(sync);
  }, [lineKey, productId, unit, step, multiplier]);

  const payload = {
    productId,
    code,
    name,
    unit,
    unitLabel: unitLabel || unit,
    price,
    imageUrl,
    orderStep: step,
    unitSize: multiplier,
  };

  const applySaleQty = (saleQty) => {
    const next = snapCartQty(saleQty, step);
    if (next <= 0) {
      setCartQty(productId, unit, 0);
      setDraft(String(toQuantityInputValue(step, multiplier)));
      return;
    }
    if (cartQty <= 0) {
      addToCart(payload, next);
    } else {
      setCartQty(productId, unit, next, {
        unitSize: multiplier,
        unitLabel: unitLabel || unit,
        price,
        orderStep: step,
      });
    }
    setDraft(String(toQuantityInputValue(next, multiplier)));
  };

  const bump = (delta) => {
    if (cartQty > 0) {
      applySaleQty(cartQty + delta * step);
      return;
    }
    const currentSale = fromQuantityInputValue(draft, multiplier, step) || step;
    if (delta < 0) {
      const next = Math.max(step, currentSale - step);
      setDraft(String(toQuantityInputValue(next, multiplier)));
      return;
    }
    applySaleQty(currentSale);
  };

  const commitDraft = () => {
    const saleQty = fromQuantityInputValue(draft, multiplier, step);
    applySaleQty(saleQty);
  };

  return (
    <div
      className={`sf-qty-control${compact ? " is-compact" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="sf-qty-btn"
        aria-label="Уменьшить"
        disabled={cartQty <= 0 && (fromQuantityInputValue(draft, multiplier, step) || step) <= step}
        onClick={() => bump(-1)}
      >
        −
      </button>
      <div className="sf-qty-field">
        <input
          className="sf-qty-input"
          type="number"
          min={inputStep}
          step={inputStep}
          inputMode="numeric"
          aria-label={`Количество, ${qtyUnitLabel}`}
          title={
            multiplier > 1
              ? `В ${storefrontUnitLabel(unit)}: ${multiplier} шт`
              : step > 1
                ? `Кратно ${step}`
                : undefined
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        <span className="sf-qty-unit">{qtyUnitLabel}</span>
      </div>
      <button
        type="button"
        className="sf-qty-btn"
        aria-label="Увеличить"
        onClick={() => bump(1)}
      >
        +
      </button>
    </div>
  );
}

/** Управление количеством строки корзины (те же шаги, что при добавлении). */
export function StorefrontCartQtyControl({ item }) {
  return (
    <StorefrontQtyControl
      compact
      productId={item.productId}
      code={item.code}
      name={item.name}
      unit={item.unit}
      unitLabel={item.unitLabel}
      price={item.price}
      imageUrl={item.imageUrl}
      orderStep={item.orderStep}
      unitSize={item.unitSize}
    />
  );
}
