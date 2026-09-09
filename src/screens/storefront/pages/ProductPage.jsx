import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { useEffect, useMemo, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { addToCart } from "../cartStorage.js";
import { formatMoney, navigateStorefront } from "../components/StoreHeader.jsx";
import {
  fromQuantityInputValue,
  getUnitMultiplier,
  getUnitOrderStep,
  orderedSaleUnits,
  quantityInputStep,
  toQuantityInputValue,
} from "../../../shared/appHelpers.js";
import { applyStorefrontDocumentMeta } from "../seo.js";
import { storefrontHref } from "../mode.js";
import {
  StorefrontUnitChoice,
  storefrontUnitLabel,
} from "../components/StorefrontUnitChoice.jsx";

export function ProductPage({ code }) {
  const { t } = useLocalization();
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
        const units = orderedSaleUnits(next);
        const nextUnit = units[0] || "piece";
        setUnit(nextUnit);
        setQty(getUnitOrderStep(next, nextUnit));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || t("storefront.productNotFound"));
      });
    return () => {
      cancelled = true;
    };
  }, [code, t]);

  useEffect(() => {
    if (!product) return;
    const summary = String(product.description || product.shortDescription || "").trim();
    applyStorefrontDocumentMeta({
      title: `${product.name} | КЛЕВЕР`,
      description: summary.slice(0, 160) || `Купить «${product.name}» в каталоге компании КЛЕВЕР.`,
      path: storefrontHref({ name: "product", code: product.code || code }),
      image: product.imageUrl || undefined,
      type: "product",
    });
  }, [product, code]);

  const units = useMemo(
    () => (product ? orderedSaleUnits(product) : ["piece"]),
    [product]
  );
  const orderStep = getUnitOrderStep(product, unit);
  const unitSize = getUnitMultiplier(product, unit);
  const inputStep = quantityInputStep(unitSize, orderStep);
  const displayQty = toQuantityInputValue(qty, unitSize);
  const qtyHint =
    unitSize > 1
      ? t("storefront.qty.inUnitPieces", {
          unit: storefrontUnitLabel(unit),
          count: unitSize,
        })
      : orderStep > 1
        ? t("storefront.qty.multipleOfLower", { step: orderStep })
        : "";
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
        >{
          t("storefront.nav.toCatalog")
        }</button>
      </div>
    );
  }

  if (!product) return <p className="sf-muted">{t("storefront.loadingTheCard")}</p>;

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
        ← {product.category || t("storefront.nav.catalog")}
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
          <p className="sf-product-code">{t("storefront.product.articleCode", { code: product.code })}</p>

          <div className="sf-price-block">
            <strong>{price > 0 ? formatMoney(price) : t("storefront.price.onRequest")}</strong>
            <span className="sf-unit"> / {storefrontUnitLabel(unit)}</span>
          </div>

          <div className="sf-buy-row">
            {units.length > 1 ? (
              <div className="sf-field sf-field-units">
                <span>{t("shared.field.unit")}</span>
                <StorefrontUnitChoice
                  product={product}
                  unit={unit}
                  onChange={(nextUnit) => {
                    setUnit(nextUnit);
                    setQty(getUnitOrderStep(product, nextUnit));
                  }}
                />
              </div>
            ) : null}
            <label className="sf-field">
              <span>
                {t("storefront.product.quantity")}
                {qtyHint ? ` (${qtyHint})` : ""}
                {unitSize > 1 ? t("storefront.product.pieceSuffix") : t("storefront.product.unitSuffix", { unit: storefrontUnitLabel(unit) })}
              </span>
              <input
                className="sf-input"
                type="number"
                min={inputStep}
                step={inputStep}
                value={displayQty}
                onChange={(e) =>
                  setQty(
                    Math.max(
                      orderStep,
                      fromQuantityInputValue(
                        e.target.value,
                        unitSize,
                        orderStep
                      ) || orderStep
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
                    unitLabel: storefrontUnitLabel(unit),
                    price,
                    imageUrl: product.imageUrl,
                    orderStep,
                    unitSize,
                  },
                  qty
                );
                navigateStorefront({ name: "cart" });
              }}
            >{
              t("checkout.addToCart")
            }</button>
          </div>

          {(details.description ||
            details.composition ||
            details.characteristics) && (
            <div className="sf-details">
              {details.description ? (
                <>
                  <h2>{t("shared.field.description")}</h2>
                  <p>{details.description}</p>
                </>
              ) : null}
              {details.composition ? (
                <>
                  <h2>{t("manager.contents")}</h2>
                  <p>{details.composition}</p>
                </>
              ) : null}
              {details.characteristics ? (
                <>
                  <h2>{t("manager.specifications")}</h2>
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
              >{
                t("shared.media.certificate")
              }</a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
