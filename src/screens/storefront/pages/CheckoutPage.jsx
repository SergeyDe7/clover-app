import { useEffect, useState } from "react";
import {
  cartDeliveryFee,
  cartGoodsTotal,
  cartGrandTotal,
  clearCart,
  FREE_DELIVERY_MIN_TOTAL,
  getCartItems,
  PAID_DELIVERY_FEE,
  subscribeCart,
} from "../cartStorage.js";
import { storefrontApi } from "../publicApi.js";
import { formatMoney, navigateStorefront } from "../components/StoreHeader.jsx";

const EMPTY = {
  contactName: "",
  companyName: "",
  phone: "",
  email: "",
  address: "",
  comment: "",
};

export function CheckoutPage() {
  const [items, setItems] = useState(getCartItems);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => subscribeCart(() => setItems(getCartItems())), []);

  if (done) {
    return (
      <div className="sf-checkout">
        <h1>Заказ принят</h1>
        <p>
          Номер заказа <strong>{done.number}</strong>. Мы свяжемся с вами для
          подтверждения.
        </p>
        <button
          type="button"
          className="sf-btn sf-btn-primary"
          onClick={() => navigateStorefront({ name: "catalog" })}
        >
          Вернуться в каталог
        </button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="sf-checkout sf-empty">
        <h1>Оформление</h1>
        <p className="sf-muted">Корзина пуста.</p>
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

  const goodsTotal = cartGoodsTotal(items);
  const deliveryFee = cartDeliveryFee(items);
  const grandTotal = cartGrandTotal(items);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await storefrontApi.placeOrder({
        ...form,
        items: items.map((item) => ({
          productId: item.productId,
          code: item.code,
          unit: item.unit,
          qty: item.qty,
        })),
      });
      clearCart();
      setDone(result.order || result);
    } catch (err) {
      setError(err.message || "Не удалось оформить заказ.");
    } finally {
      setBusy(false);
    }
  }

  const setField = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="sf-checkout">
      <div className="sf-section-head">
        <h1>Оформление заказа</h1>
        <p>Регистрация не нужна — укажите контакты для связи.</p>
      </div>
      <form className="sf-checkout-form" onSubmit={onSubmit}>
        <label className="sf-field">
          <span>Контактное лицо *</span>
          <input
            className="sf-input"
            required
            minLength={2}
            value={form.contactName}
            onChange={setField("contactName")}
          />
        </label>
        <label className="sf-field">
          <span>Компания</span>
          <input
            className="sf-input"
            value={form.companyName}
            onChange={setField("companyName")}
          />
        </label>
        <label className="sf-field">
          <span>Телефон *</span>
          <input
            className="sf-input"
            required
            minLength={6}
            value={form.phone}
            onChange={setField("phone")}
          />
        </label>
        <label className="sf-field">
          <span>Email</span>
          <input
            className="sf-input"
            type="email"
            value={form.email}
            onChange={setField("email")}
          />
        </label>
        <label className="sf-field sf-field-wide">
          <span>Адрес доставки *</span>
          <input
            className="sf-input"
            required
            minLength={5}
            value={form.address}
            onChange={setField("address")}
          />
        </label>
        <label className="sf-field sf-field-wide">
          <span>Комментарий</span>
          <textarea
            className="sf-input"
            rows={3}
            value={form.comment}
            onChange={setField("comment")}
          />
        </label>
        <div className="sf-checkout-summary sf-field-wide">
          <p>
            Товары: {items.length} поз. · {formatMoney(goodsTotal)}
          </p>
          <p
            className={`sf-delivery-note${
              deliveryFee > 0 ? " is-paid" : " is-free"
            }`}
          >
            {deliveryFee > 0
              ? `Доставка по СПб — ${formatMoney(PAID_DELIVERY_FEE)} (заказ менее ${formatMoney(FREE_DELIVERY_MIN_TOTAL)})`
              : "Доставка по СПб — бесплатно"}
          </p>
          <p>
            Итого: <strong>{formatMoney(grandTotal)}</strong>
          </p>
          <p className="sf-muted">
            Заказ уйдёт менеджеру и может быть передан в 1С из ЛК.
          </p>
        </div>
        {error ? <p className="sf-error sf-field-wide">{error}</p> : null}
        <div className="sf-checkout-actions sf-field-wide">
          <button
            type="button"
            className="sf-btn sf-btn-ghost"
            onClick={() => navigateStorefront({ name: "cart" })}
          >
            Назад в корзину
          </button>
          <button type="submit" className="sf-btn sf-btn-primary" disabled={busy}>
            {busy ? "Отправка…" : "Отправить заказ"}
          </button>
        </div>
      </form>
    </div>
  );
}
