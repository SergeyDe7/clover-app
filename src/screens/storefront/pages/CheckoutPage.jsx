import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../../shared/i18n/errorDisplay.js";
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
  const { t } = useLocalization();
  const [items, setItems] = useState(getCartItems);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => subscribeCart(() => setItems(getCartItems())), []);

  if (done) {
    return (
      <div className="sf-checkout">
        <h1>{t("checkout.accepted")}</h1>
        <p>{
          t("storefront.orderNumber") }<strong>{done.number}</strong>{t("storefront.weWillContactYouToConfirm")
        }</p>
        <button
          type="button"
          className="sf-btn sf-btn-primary"
          onClick={() => navigateStorefront({ name: "catalog" })}
        >{
          t("checkout.backToCatalog")
        }</button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="sf-checkout sf-empty">
        <h1>{t("checkout.titleShort")}</h1>
        <p className="sf-muted">{t("storefront.theCartIsEmpty")}</p>
        <button
          type="button"
          className="sf-btn sf-btn-primary"
          onClick={() => navigateStorefront({ name: "catalog" })}
        >{
          t("storefront.nav.toCatalog")
        }</button>
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
      setError(errorDisplayMessage(err, t, "storefront.error.checkoutFailed"));
    } finally {
      setBusy(false);
    }
  }

  const setField = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="sf-checkout">
      <div className="sf-section-head">
        <h1>{t("checkout.title")}</h1>
        <p>{t("storefront.noRegistrationNeededEnterContactDetails")}</p>
      </div>
      <form className="sf-checkout-form" onSubmit={onSubmit}>
        <label className="sf-field">
          <span>{t("checkout.contactRequired")}</span>
          <input
            className="sf-input"
            required
            minLength={2}
            value={form.contactName}
            onChange={setField("contactName")}
          />
        </label>
        <label className="sf-field">
          <span>{t("checkout.company")}</span>
          <input
            className="sf-input"
            value={form.companyName}
            onChange={setField("companyName")}
          />
        </label>
        <label className="sf-field">
          <span>{t("checkout.phoneRequired")}</span>
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
          <span>{t("checkout.address")}</span>
          <input
            className="sf-input"
            required
            minLength={5}
            value={form.address}
            onChange={setField("address")}
          />
        </label>
        <label className="sf-field sf-field-wide">
          <span>{t("checkout.comment")}</span>
          <textarea
            className="sf-input"
            rows={3}
            value={form.comment}
            onChange={setField("comment")}
          />
        </label>
        <div className="sf-checkout-summary sf-field-wide">
          <p>
            {t("checkout.summary.goodsCountAmount", {
              count: items.length,
              amount: formatMoney(goodsTotal),
            })}
          </p>
          <p
            className={`sf-delivery-note${
              deliveryFee > 0 ? " is-paid" : " is-free"
            }`}
          >
            {deliveryFee > 0
              ? t("storefront.checkout.paidDeliverySpb", {
                  fee: formatMoney(PAID_DELIVERY_FEE),
                  freeFrom: formatMoney(FREE_DELIVERY_MIN_TOTAL),
                })
              : t("storefront.deliveryInSpbIsFree")}
          </p>
          <p>{
            t("storefront.total") }<strong>{formatMoney(grandTotal)}</strong>
          </p>
          <p className="sf-muted">{
            t("storefront.theOrderGoesToTheManager")
          }</p>
        </div>
        {error ? <p className="sf-error sf-field-wide">{error}</p> : null}
        <div className="sf-checkout-actions sf-field-wide">
          <button
            type="button"
            className="sf-btn sf-btn-ghost"
            onClick={() => navigateStorefront({ name: "cart" })}
          >{
            t("checkout.backToCart")
          }</button>
          <button type="submit" className="sf-btn sf-btn-primary" disabled={busy}>
            {busy ? t("shared.status.sending") : t("checkout.submitOrder")}
          </button>
        </div>
      </form>
    </div>
  );
}
