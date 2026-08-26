import { useEffect, useState } from "react";
import {
  addToCart,
  getCartItems,
  setCartQty,
  snapCartQty,
  subscribeCart,
} from "../cartStorage.js";

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

export function StorefrontQtyControl({
  productId,
  code = "",
  name = "",
  unit,
  unitLabel = "",
  price = 0,
  imageUrl = "",
  orderStep = 1,
  compact = false,
}) {
  const step = Math.max(1, Math.floor(Number(orderStep) || 1));
  const lineKey = cartLineKey(productId, unit);
  const [cartQty, setCartQtyState] = useState(() => findCartQty(productId, unit));
  const [draft, setDraft] = useState(() => String(step));

  useEffect(() => {
    const sync = () => {
      const qty = findCartQty(productId, unit);
      setCartQtyState(qty);
      setDraft(String(qty > 0 ? qty : step));
    };
    sync();
    return subscribeCart(sync);
  }, [lineKey, productId, unit, step]);

  const payload = {
    productId,
    code,
    name,
    unit,
    unitLabel: unitLabel || unit,
    price,
    imageUrl,
    orderStep: step,
  };

  const applyQty = (rawQty) => {
    const next = snapCartQty(rawQty, step);
    if (next <= 0) {
      setCartQty(productId, unit, 0);
      setDraft(String(step));
      return;
    }
    if (cartQty <= 0) {
      addToCart(payload, next);
    } else {
      setCartQty(productId, unit, next);
    }
    setDraft(String(next));
  };

  const bump = (delta) => {
    if (cartQty > 0) {
      applyQty(cartQty + delta * step);
      return;
    }
    const current = snapCartQty(Number(draft) || step, step);
    if (delta < 0) {
      const next = Math.max(step, current - step);
      setDraft(String(next));
      return;
    }
    applyQty(current);
  };

  const commitDraft = () => {
    applyQty(Number(draft) || 0);
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
        disabled={cartQty <= 0 && (Number(draft) || step) <= step}
        onClick={() => bump(-1)}
      >
        −
      </button>
      <input
        className="sf-qty-input"
        type="number"
        min={step}
        step={step}
        inputMode="numeric"
        aria-label="Количество"
        title={step > 1 ? `Кратно ${step}` : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        className="sf-qty-btn"
        aria-label="Увеличить"
        onClick={() => bump(1)}
      >
        +
      </button>
      {!compact && unitLabel ? (
        <span className="sf-qty-unit">{unitLabel}</span>
      ) : null}
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
    />
  );
}
