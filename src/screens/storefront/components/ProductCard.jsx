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

export function ProductCard({ product }) {
  const units = useMemo(() => orderedSaleUnits(product), [product]);
  const [unit, setUnit] = useState(() => units[0] || "piece");

  useEffect(() => {
    setUnit(units[0] || "piece");
  }, [product.id, units]);

  const price = Number(product.prices?.[unit]) || 0;
  const orderStep = getUnitOrderStep(product, unit);
  const unitSize = getUnitMultiplier(product, unit);
  const unitLabel = storefrontUnitLabel(unit);
  const hasUnitChoice = units.length > 1;

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
          <img src={product.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="sf-product-placeholder" aria-hidden="true" />
        )}
      </button>
      <div className="sf-product-body">
        <p className="sf-product-cat">{product.category}</p>
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
        <p className="sf-product-code">Арт. {product.code}</p>
        <strong className="sf-product-price">
          {price > 0 ? formatMoney(price) : "Цена по запросу"}
          {price > 0 && hasUnitChoice ? (
            <span className="sf-unit"> / {unitLabel}</span>
          ) : null}
        </strong>
        <div className="sf-product-units">
          {hasUnitChoice ? (
            <StorefrontUnitChoice
              compact
              product={product}
              unit={unit}
              onChange={setUnit}
            />
          ) : (
            <span className="sf-unit-single">{unitLabel}</span>
          )}
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
