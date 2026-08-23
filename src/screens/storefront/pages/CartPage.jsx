import { useEffect, useState } from "react";
import {
  cartTotal,
  clearCart,
  getCartItems,
  removeFromCart,
  setCartQty,
  subscribeCart,
} from "../cartStorage.js";
import { formatMoney, navigateStorefront } from "../components/StoreHeader.jsx";

export function CartPage() {
  const [items, setItems] = useState(getCartItems);
  useEffect(() => subscribeCart(() => setItems(getCartItems())), []);
  const total = cartTotal(items);

  if (!items.length) {
    return (
      <div className="sf-cart sf-empty">
        <h1>Корзина</h1>
        <p className="sf-muted">Пока пусто — добавьте товары из каталога.</p>
        <button
          type="button"
          className="sf-btn sf-btn-primary"
          onClick={() => navigateStorefront({ name: "catalog" })}
        >
          В каталог
        </button>
      </div>
    );
  }

  return (
    <div className="sf-cart">
      <div className="sf-section-head">
        <h1>Корзина</h1>
        <p>Цены сайта — без персональных условий ЛК.</p>
      </div>
      <ul className="sf-cart-list">
        {items.map((item) => (
          <li key={`${item.productId}::${item.unit}`} className="sf-cart-item">
            <button
              type="button"
              className="sf-cart-thumb"
              onClick={() =>
                navigateStorefront({ name: "product", code: item.code })
              }
            >
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" />
              ) : (
                <div className="sf-product-placeholder" />
              )}
            </button>
            <div className="sf-cart-meta">
              <strong>{item.name}</strong>
              <p className="sf-muted">
                Арт. {item.code} · {item.unitLabel || item.unit}
              </p>
              <p>{formatMoney(item.price)}</p>
            </div>
            <div className="sf-cart-qty">
              <input
                className="sf-input"
                type="number"
                min={Math.max(1, Number(item.orderStep) || 1)}
                step={Math.max(1, Number(item.orderStep) || 1)}
                value={item.qty}
                onChange={(e) =>
                  setCartQty(
                    item.productId,
                    item.unit,
                    Math.floor(Number(e.target.value) || 0)
                  )
                }
              />
              <button
                type="button"
                className="sf-btn sf-btn-ghost sf-btn-sm"
                onClick={() => removeFromCart(item.productId, item.unit)}
              >
                Удалить
              </button>
            </div>
            <strong className="sf-cart-line-total">
              {formatMoney((Number(item.price) || 0) * (Number(item.qty) || 0))}
            </strong>
          </li>
        ))}
      </ul>
      <div className="sf-cart-summary">
        <div>
          <p className="sf-muted">Итого</p>
          <strong className="sf-cart-total">{formatMoney(total)}</strong>
        </div>
        <div className="sf-cart-actions">
          <button
            type="button"
            className="sf-btn sf-btn-ghost"
            onClick={() => clearCart()}
          >
            Очистить
          </button>
          <button
            type="button"
            className="sf-btn sf-btn-primary"
            onClick={() => navigateStorefront({ name: "checkout" })}
          >
            Оформить заказ
          </button>
        </div>
      </div>
    </div>
  );
}
