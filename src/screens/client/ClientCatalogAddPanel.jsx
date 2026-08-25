// Каталог ЛК: только добавление товара в свою матрицу, без корзины.
import { useMemo, useState } from "react";
import {
  UNIT_CONFIG,
  UNIT_ORDER,
  formatMoney,
  getUnitPrice,
  orderedSaleUnits,
  productArticle,
  matchesCatalogPrefixSearch,
  productCatalogSearchHaystack,
} from "../../shared/appHelpers";

function catalogAddPrice(product) {
  const units = orderedSaleUnits(product);
  const seen = new Set();
  for (const unit of [...units, ...UNIT_ORDER]) {
    if (seen.has(unit)) continue;
    seen.add(unit);
    const price = getUnitPrice(product, unit);
    if (price > 0) return { price, unit };
  }
  return { price: 0, unit: units[0] || "piece" };
}
import { productImageSrc } from "../../shared/productPhoto";
import { CatalogSearchInput } from "./CatalogSearchInput";
import { EmptyState } from "../../shared/uxFeedback";

export function ClientCatalogAddPanel({
  products = [],
  matrixProductIds = [],
  matrixMode: _matrixMode = "pending",
  settings,
  busyId = "",
  onAdd,
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");

  const matrixIdSet = useMemo(() => {
    const ids = new Set((Array.isArray(matrixProductIds) ? matrixProductIds : []).map(String));
    return ids;
  }, [matrixProductIds]);

  const activeProducts = useMemo(
    () => (Array.isArray(products) ? products : []).filter((item) => item.active !== false),
    [products]
  );

  const categories = useMemo(
    () => ["Все", ...new Set(activeProducts.map((item) => item.category).filter(Boolean))],
    [activeProducts]
  );
  const activeCategory = categories.includes(category) ? category : "Все";

  const filtered = useMemo(() => {
    return activeProducts.filter((item) => {
      const byCategory = activeCategory === "Все" || item.category === activeCategory;
      const bySearch = matchesCatalogPrefixSearch(
        productCatalogSearchHaystack(item),
        search
      );
      return byCategory && bySearch;
    });
  }, [activeProducts, activeCategory, search]);

  const inMatrix = (product) => matrixIdSet.has(String(product.id));

  return (
    <section className="panel client-catalog-add-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Каталог Clover</p>
          <h2>Добавить товары из каталога</h2>
          <p>
            Здесь можно только добавить позицию в свою матрицу. Заказ оформляется
            во вкладке «Моя матрица». Цена — ваша: наценка или вид цен клиента,
            не витрина.
          </p>
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="catalog-filter-row">
          <CatalogSearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="category-list">
          {categories.map((item) => (
            <button
              className={activeCategory === item ? "category-button active" : "category-button"}
              type="button"
              key={item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <section className="product-grid client-matrix-grid">
        {filtered.map((product) => {
          const { price, unit } = catalogAddPrice(product);
          const added = inMatrix(product);
          const busy = String(busyId) === String(product.id);
          const showPrices = settings?.showPrices !== false;
          return (
            <article
              className={
                added
                  ? "product-card client-matrix-card product-card-in-matrix"
                  : "product-card client-matrix-card"
              }
              key={product.id}
            >
              <div className="product-image-wrap">
                {product.imageUrl ? (
                  <img className="product-image" src={productImageSrc(product)} alt={product.name} />
                ) : (
                  <span className="product-image-placeholder">Нет фото</span>
                )}
              </div>
              <h2>{product.name}</h2>
              <p className="product-code">Код: {productArticle(product) || "—"}</p>
              <p className="product-price client-catalog-add-price">
                {showPrices && price > 0 ? (
                  <>
                    {formatMoney(price)}{" "}
                    <small>/ {(UNIT_CONFIG[unit] || UNIT_CONFIG.piece).shortLabel}</small>
                  </>
                ) : (
                  "Цена уточняется"
                )}
              </p>
              <div className="product-card-controls">
                {added ? (
                  <button className="secondary-button" type="button" disabled>
                    В матрице
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => onAdd?.(product)}
                  >
                    {busy ? "Добавляем…" : "В матрицу"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!filtered.length ? (
          <EmptyState
            title="Товары не найдены"
            message={
              activeProducts.length
                ? "Попробуйте другую категорию или другой запрос."
                : "Каталог пока пуст. Обратитесь к менеджеру."
            }
          />
        ) : null}
      </section>
    </section>
  );
}
