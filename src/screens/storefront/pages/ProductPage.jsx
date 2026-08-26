import { useEffect, useMemo, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { addToCart, snapCartQty } from "../cartStorage.js";
import { formatMoney, navigateStorefront } from "../components/StoreHeader.jsx";
import { getUnitOrderStep } from "../../../shared/appHelpers.js";

const UNIT_LABEL = {
  piece: "шт",
  pair: "пара",
  meter: "м",
  roll: "рулон",
  pack: "уп",
  bundle: "пачка",
  box: "кор",
};

export function ProductPage({ code }) {
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState("piece");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setProduct(null);
    storefrontApi
      .product(code)
      .then((payload) => {
        if (cancelled) return;
        const next = payload.product;
        setProduct(next);
        const units = Array.isArray(next?.saleUnits) ? next.saleUnits : ["piece"];
        const nextUnit = units[0] || "piece";
        setUnit(nextUnit);
        setQty(getUnitOrderStep(next, nextUnit));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Товар не найден.");
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const units = useMemo(
    () => (Array.isArray(product?.saleUnits) ? product.saleUnits : ["piece"]),
    [product]
  );
  const orderStep = getUnitOrderStep(product, unit);
  const price = Number(product?.prices?.[unit]) || 0;
  const details = product?.details || {};

  if (error) {
    return (
      <div className="sf-product-page">
        <p className="sf-error">{error}</p>
        <button
          type="button"
          className="sf-btn sf-btn-ghost"
          onClick={() => navigateStorefront({ name: "catalog" })}
        >
          В каталог
        </button>
      </div>
    );
  }

  if (!product) return <p className="sf-muted">Загрузка карточки…</p>;

  return (
    <div className="sf-product-page">
      <button
        type="button"
        className="sf-back"
        onClick={() =>
          navigateStorefront({
            name: "catalog",
            category: product.category || "",
          })
        }
      >
        ← {product.category || "Каталог"}
      </button>

      <div className="sf-product-layout">
        <div className="sf-product-gallery">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} loading="lazy" />
          ) : (
            <div className="sf-product-placeholder is-large" />
          )}
        </div>
        <div className="sf-product-info">
          <p className="sf-product-cat">{product.category}</p>
          <h1>{product.name}</h1>
          <p className="sf-product-code">Артикул {product.code}</p>

          <div className="sf-price-block">
            <strong>{price > 0 ? formatMoney(price) : "Цена по запросу"}</strong>
            {price > 0 ? (
              <span className="sf-unit"> / {UNIT_LABEL[unit] || unit}</span>
            ) : null}
          </div>

          <div className="sf-buy-row">
            <label className="sf-field">
              <span>Единица</span>
              <select
                className="sf-input"
                value={unit}
                onChange={(e) => {
                  const nextUnit = e.target.value;
                  setUnit(nextUnit);
                  setQty(getUnitOrderStep(product, nextUnit));
                }}
              >
                {units.map((item) => (
                  <option key={item} value={item}>
                    {UNIT_LABEL[item] || item}
                  </option>
                ))}
              </select>
            </label>
            <label className="sf-field">
              <span>
                Количество
                {orderStep > 1 ? ` (кратно ${orderStep})` : ""}
              </span>
              <input
                className="sf-input"
                type="number"
                min={orderStep}
                step={orderStep}
                value={qty}
                onChange={(e) =>
                  setQty(
                    snapCartQty(
                      Math.floor(Number(e.target.value) || orderStep),
                      orderStep
                    )
                  )
                }
              />
            </label>
            <button
              type="button"
              className="sf-btn sf-btn-primary"
              onClick={() => {
                addToCart(
                  {
                    productId: product.id,
                    code: product.code,
                    name: product.name,
                    unit,
                    unitLabel: UNIT_LABEL[unit] || unit,
                    price,
                    imageUrl: product.imageUrl,
                    orderStep,
                  },
                  qty
                );
                navigateStorefront({ name: "cart" });
              }}
            >
              В корзину
            </button>
          </div>

          {(details.description ||
            details.composition ||
            details.characteristics) && (
            <div className="sf-details">
              {details.description ? (
                <>
                  <h2>Описание</h2>
                  <p>{details.description}</p>
                </>
              ) : null}
              {details.composition ? (
                <>
                  <h2>Состав</h2>
                  <p>{details.composition}</p>
                </>
              ) : null}
              {details.characteristics ? (
                <>
                  <h2>Характеристики</h2>
                  <p>{details.characteristics}</p>
                </>
              ) : null}
            </div>
          )}

          {product.certificateUrl ? (
            <p>
              <a
                className="sf-link"
                href={product.certificateUrl}
                target="_blank"
                rel="noreferrer"
              >
                Сертификат
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
