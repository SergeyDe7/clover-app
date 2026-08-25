import { formatMoney, navigateStorefront } from "./StoreHeader.jsx";
import { addToCart } from "../cartStorage.js";
import { getUnitOrderStep } from "../../../shared/appHelpers.js";
import { productImageSrc } from "../../../shared/productPhoto.js";

const UNIT_LABEL = {
  piece: "шт",
  pair: "пара",
  meter: "м",
  roll: "рулон",
  pack: "уп",
  bundle: "пачка",
  box: "кор",
};

export function ProductCard({ product }) {
  const units = Array.isArray(product.saleUnits) ? product.saleUnits : ["piece"];
  const unit = units[0] || "piece";
  const price = Number(product.prices?.[unit]) || 0;
  const orderStep = getUnitOrderStep(product, unit);

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
          <img src={productImageSrc(product)} alt="" loading="lazy" />
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
        <div className="sf-product-row">
          <strong className="sf-product-price">
            {price > 0 ? formatMoney(price) : "Цена по запросу"}
            {price > 0 ? (
              <span className="sf-unit"> / {UNIT_LABEL[unit] || unit}</span>
            ) : null}
          </strong>
          <button
            type="button"
            className="sf-btn sf-btn-primary sf-btn-sm"
            onClick={() =>
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
                orderStep
              )
            }
          >
            В корзину
          </button>
        </div>
      </div>
    </article>
  );
}
