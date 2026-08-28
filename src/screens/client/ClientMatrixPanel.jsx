// Панель персональной матрицы товаров клиента.
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  UNIT_CONFIG,
  formatMoney,
  getUnitMultiplier,
  getUnitPrice,
  orderedSaleUnits,
  productArticle,
  matchesCatalogPrefixSearch,
  productCatalogSearchHaystack,
} from "../../shared/appHelpers";
import { sortProductsWithLidsGrouped } from "../../shared/productCatalogOrder.js";
import { productImageSrc } from "../../shared/productPhoto";
import { CatalogSearchInput } from "./CatalogSearchInput";
import { useFixedChromeHeight } from "./useMobileFixedChromeHeight";

export function ClientMatrixPanel({
  products = [],
  settings,
  catalogPolicy,
  favorites = [],
  setFavorites,
  onCreateOrder,
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [units, setUnits] = useState({});
  const panelRef = useRef(null);
  const stickyChromeRef = useRef(null);
  const portalHost =
    typeof document !== "undefined"
      ? document.querySelector("main.clover-app") || document.body
      : null;

  useFixedChromeHeight(
    stickyChromeRef,
    panelRef,
    "--matrix-chrome-h",
    Boolean(portalHost)
  );

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
    const items = activeProducts.filter((item) => {
      const byCategory = activeCategory === "Все" || item.category === activeCategory;
      const bySearch = matchesCatalogPrefixSearch(
        productCatalogSearchHaystack(item),
        search
      );
      const byFavorite = !favoritesOnly || favorites.includes(item.id);
      return byCategory && bySearch && byFavorite;
    });
    return sortProductsWithLidsGrouped(items);
  }, [activeProducts, search, activeCategory, favoritesOnly, favorites]);

  const showToolbar = catalogPolicy?.matrixMode !== "pending";

  const toolbar = showToolbar ? (
    <div className="client-matrix-sticky-chrome" ref={stickyChromeRef}>
      <div className="client-matrix-toolbar">
        <div className="catalog-filter-row">
          <CatalogSearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {settings?.showFavorites && (
            <button
              className={favoritesOnly ? "category-button active" : "category-button"}
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
            >
              ★ Избранное
            </button>
          )}
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
    </div>
  ) : null;

  return (
    <section className="panel client-matrix-panel" ref={panelRef}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Персональный каталог</p>
          <h2>Матрица товаров</h2>
          <p>Товары, закреплённые за вами менеджером. Категории — как при оформлении заказа.</p>
        </div>
        <button className="primary-button" type="button" onClick={onCreateOrder}>
          + Новый заказ
        </button>
      </div>

      {catalogPolicy?.matrixMode === "pending" ? (
        <div className="matrix-catalog-note pending">
          <strong>Матрица ещё готовится</strong>
          <br />
          Менеджер закрепит постоянные товары и цены. Пока список может быть пустым.
        </div>
      ) : (
        <p className="client-matrix-meta">
          В матрице: <strong>{activeProducts.length}</strong> поз.
          {activeCategory !== "Все" ? ` · категория «${activeCategory}»: ${filtered.length}` : ""}
        </p>
      )}

      {showToolbar ? (
        <>
          {portalHost ? createPortal(toolbar, portalHost) : null}
          <div className="client-matrix-sticky-chrome-spacer" aria-hidden="true" />
        </>
      ) : null}

      <section className="product-grid client-matrix-grid">
        {filtered.map((product) => {
          const allowedUnits = orderedSaleUnits(product);
          const unit = units[product.id] || allowedUnits[0] || "piece";
          const unitMeta = UNIT_CONFIG[unit] || UNIT_CONFIG.piece;
          const price = getUnitPrice(product, unit);
          const multiplier = getUnitMultiplier(product, unit);
          const soleUnit = allowedUnits.length === 1;
          return (
            <article className="product-card client-matrix-card" key={product.id}>
              <div className="product-card-top">
                {product.certificateUrl ? (
                  <a
                    className="product-cert-link product-cert-link-top"
                    href={product.certificateUrl}
                    target="_blank"
                    rel="noreferrer"
                    download={product.certificateName || undefined}
                  >
                    Сертификат
                  </a>
                ) : (
                  <span className="product-card-top-spacer" aria-hidden="true" />
                )}
                {settings?.showFavorites && (
                  <button
                    className={favorites.includes(product.id) ? "favorite-button active" : "favorite-button"}
                    type="button"
                    onClick={() =>
                      setFavorites((current) =>
                        current.includes(product.id)
                          ? current.filter((id) => id !== product.id)
                          : [...current, product.id]
                      )
                    }
                  >
                    ★
                  </button>
                )}
              </div>
              <div className="product-image-wrap">
                {product.imageUrl ? (
                  <img className="product-image" src={productImageSrc(product)} alt={product.name} loading="lazy" />
                ) : (
                  <span className="product-image-placeholder">Нет фото</span>
                )}
              </div>
              <h2>{product.name}</h2>
              <p className="product-code">Код: {productArticle(product) || "—"}</p>
              <p className="product-price">
                {settings?.showPrices && price > 0 ? (
                  <>
                    {formatMoney(price)} <small>/ {unitMeta.shortLabel || unit}</small>
                  </>
                ) : (
                  "Цена уточняется"
                )}
              </p>
              <div className="product-card-controls">
                <div className={`unit-choice${soleUnit ? " unit-choice-single" : ""}`}>
                  {allowedUnits.map((item) => (
                    <button
                      className={soleUnit || unit === item ? "active" : ""}
                      type="button"
                      key={item}
                      onClick={() =>
                        setUnits((current) => ({ ...current, [product.id]: item }))
                      }
                    >
                      {(UNIT_CONFIG[item] || UNIT_CONFIG.piece).shortLabel ||
                        (UNIT_CONFIG[item] || UNIT_CONFIG.piece).label}
                    </button>
                  ))}
                </div>
                <p className="unit-hint">
                  {multiplier > 1
                    ? `1 ${unitMeta.label.toLowerCase()} = ${multiplier} шт.`
                    : "Количество считается поштучно"}
                </p>
              </div>
            </article>
          );
        })}
        {!filtered.length && (
          <div className="empty-box">
            {catalogPolicy?.matrixMode === "pending"
              ? "Менеджер ещё не закрепил товары в вашей матрице. Когда матрица будет готова, позиции появятся здесь."
              : activeProducts.length
                ? "В этой категории товаров нет."
                : "В вашей матрице пока нет товаров. Попросите менеджера добавить позиции."}
          </div>
        )}
      </section>
    </section>
  );
}
