import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { categoryDisplayNameFromCanonical } from "../../../shared/i18n/categoryDisplayProjection.js";
import { storefrontCategoryDisplayOptions } from "../../../shared/i18n/storefrontCategoryDisplay.js";
import { useEffect, useMemo, useState } from "react";
import { formatMoney, navigateStorefront } from "./StoreHeader.jsx";
import {
  getUnitMultiplier,
  getUnitOrderStep,
  orderedSaleUnits,
} from "../../../shared/appHelpers.js";
import { StorefrontQtyControl } from "./StorefrontQtyControl.jsx";
import {
  StorefrontUnitChoice,
  storefrontUnitLabel,
} from "./StorefrontUnitChoice.jsx";
import { productCardImageLoadingAttrs } from "./productCardImage.js";

export function ProductCard({ product, imagePriorityIndex = Number.POSITIVE_INFINITY }) {
  const { t, locale } = useLocalization();
  const categoryLabel = categoryDisplayNameFromCanonical(
    product.category,
    "",
    storefrontCategoryDisplayOptions(locale)
  );
  const units = useMemo(() => orderedSaleUnits(product), [product]);
  const [unit, setUnit] = useState(() => units[0] || "piece");

  useEffect(() => {
    setUnit(units[0] || "piece");
  }, [product.id, units]);

  const price = Number(product.prices?.[unit]) || 0;
  const orderStep = getUnitOrderStep(product, unit);
  const unitSize = getUnitMultiplier(product, unit);
  const unitLabel = storefrontUnitLabel(unit, t);
  const imageAttrs = productCardImageLoadingAttrs(imagePriorityIndex);

  return (
    <article className="sf-product-card">
      <button
        type="button"
        className="sf-product-media"
        onClick={() =>
          navigateStorefront({ name: "product", code: product.code })
        }
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            loading={imageAttrs.loading}
            {...(imageAttrs.fetchPriority ? { fetchPriority: imageAttrs.fetchPriority } : {})}
          />
        ) : (
          <div className="sf-product-placeholder" aria-hidden="true" />
        )}
      </button>
      <div className="sf-product-body has-units">
        <p className="sf-product-cat">{categoryLabel}</p>
        <h3>
          <button
            type="button"
            className="sf-product-title"
            onClick={() =>
              navigateStorefront({ name: "product", code: product.code })
            }
          >
            {product.name}
          </button>
        </h3>
        {product.code ? (
          <p className="sf-product-code">{t("shared.article.prefix", { article: product.code })}</p>
        ) : null}
        <strong className="sf-product-price">
          <span className="sf-product-price-value">
            {price > 0 ? formatMoney(price) : t("storefront.price.onRequest")}
          </span>
          <span className="sf-unit"> / {unitLabel}</span>
        </strong>
        <div className="sf-product-units">
          <StorefrontUnitChoice
            compact
            product={product}
            unit={unit}
            onChange={setUnit}
          />
        </div>
        <div className="sf-product-actions">
          <StorefrontQtyControl
            key={`${product.id}::${unit}`}
            compact
            productId={product.id}
            code={product.code}
            name={product.name}
            unit={unit}
            unitLabel={unitLabel}
            price={price}
            imageUrl={product.imageUrl}
            orderStep={orderStep}
            unitSize={unitSize}
          />
        </div>
      </div>
    </article>
  );
}
