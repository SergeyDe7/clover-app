// Панель персональной матрицы товаров клиента.
import { useEffect, useMemo, useState } from "react";
import {
  UNIT_CONFIG,
  UNIT_ORDER,
  formatMoney,
  getUnitMultiplier,
  getUnitPrice,
} from "../../shared/appHelpers";

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

  const activeProducts = useMemo(
    () => (Array.isArray(products) ? products : []).filter((item) => item.active !== false),
    [products]
  );

  const categories = useMemo(
    () => ["Все", ...new Set(activeProducts.map((item) => item.category).filter(Boolean))],
    [activeProducts]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return activeProducts.filter((item) => {
      const byCategory = category === "Все" || item.category === category;
      const bySearch =
        !needle ||
        String(item.name || "").toLowerCase().includes(needle) ||
        String(item.code || "").toLowerCase().includes(needle);
      const byFavorite = !favoritesOnly || favorites.includes(item.id);
      return byCategory && bySearch && byFavorite;
    });
  }, [activeProducts, search, category, favoritesOnly, favorites]);

  useEffect(() => {
    if (category !== "Все" && !categories.includes(category)) {
      setCategory("Все");
    }
  }, [categories, category]);

  return (
    <section className="panel">
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
          {category !== "Все" ? ` · категория «${category}»: ${filtered.length}` : ""}
        </p>
      )}

      {catalogPolicy?.matrixMode !== "pending" && (
      <div className="client-matrix-toolbar">
        <div className="catalog-filter-row">
          <input
            className="catalog-search"
            type="search"
            placeholder="Поиск по названию или коду"
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
              className={category === item ? "category-button active" : "category-button"}
              type="button"
              key={item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      )}

      <section className="product-grid">
        {filtered.map((product) => {
          const allowedUnits = UNIT_ORDER.filter((item) =>
            (product.saleUnits || []).includes(item)
          );
          const unit = allowedUnits[0] || "piece";
          const unitMeta = UNIT_CONFIG[unit] || UNIT_CONFIG.piece;
          const price = getUnitPrice(product, unit);
          const multiplier = getUnitMultiplier(product, unit);
          return (
            <article className="product-card" key={product.id}>
              <div className="product-card-top">
                <span className="product-category">{product.category || "Без категории"}</span>
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
                  <img className="product-image" src={product.imageUrl} alt={product.name} />
                ) : (
                  <span className="product-image-placeholder">Фото товара пока не загружено</span>
                )}
              </div>
              <h2>{product.name}</h2>
              <p className="product-code">Код: {product.code || "—"}</p>
              <p className="product-price">
                {settings?.showPrices && price > 0 ? (
                  <>
                    {formatMoney(price)} <small>/ {unitMeta.shortLabel || unit}</small>
                  </>
                ) : (
                  "Цена уточняется"
                )}
              </p>
              <div className="unit-choice">
                {allowedUnits.map((item) => (
                  <span className="category-button" key={item} style={{ cursor: "default" }}>
                    {(UNIT_CONFIG[item] || UNIT_CONFIG.piece).label}
                  </span>
                ))}
              </div>
              <p className="unit-hint">
                {multiplier > 1
                  ? `1 ${unitMeta.label.toLowerCase()} = ${multiplier} шт.`
                  : "Количество считается поштучно"}
              </p>
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
