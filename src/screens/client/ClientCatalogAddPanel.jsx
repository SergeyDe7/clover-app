// Каталог ЛК: только добавление товара в свою матрицу, без корзины.
import { useMemo, useRef, useState } from "react";
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
import {
  buildGroupNav,
  canonicalizeProductCategory,
  canonicalizeProductSubcategory,
  categoryMatchesFilter,
  getGroupChildren,
  subcategoryMatchesFilter,
} from "../storefront/productGroups.js";
import { productImageSrc } from "../../shared/productPhoto";
import { CatalogSearchInput } from "./CatalogSearchInput";
import { EmptyState } from "../../shared/uxFeedback";
import { useMobileFixedChromeHeight } from "./useMobileFixedChromeHeight";

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

function NavChevron() {
  return (
    <svg
      className="client-catalog-add-cat-chevron"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.2 4.2 L6 8 L9.8 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClientCatalogAddPanel({
  products = [],
  matrixProductIds = [],
  matrixMode: _matrixMode = "pending",
  settings,
  busyId = "",
  onAdd,
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [openParents, setOpenParents] = useState(() => new Set());
  const stickyChromeRef = useRef(null);

  useMobileFixedChromeHeight(
    stickyChromeRef,
    ".client-catalog-add-panel",
    "--catalog-add-mobile-chrome-h"
  );

  const matrixIdSet = useMemo(() => {
    const ids = new Set((Array.isArray(matrixProductIds) ? matrixProductIds : []).map(String));
    return ids;
  }, [matrixProductIds]);

  const activeProducts = useMemo(
    () => (Array.isArray(products) ? products : []).filter((item) => item.active !== false),
    [products]
  );

  const groups = useMemo(
    () =>
      buildGroupNav(
        activeProducts.map((item) => canonicalizeProductCategory(item.category || "Прочее"))
      ),
    [activeProducts]
  );

  const activeCategory = String(category || "").trim()
    ? canonicalizeProductCategory(category)
    : "";
  const activeSubcategory = canonicalizeProductSubcategory(subcategory);
  const activeChildren = activeCategory ? getGroupChildren(activeCategory) : [];

  const filtered = useMemo(() => {
    return activeProducts.filter((item) => {
      const byCategory = categoryMatchesFilter(item.category, activeCategory);
      const bySubcategory =
        !activeSubcategory ||
        subcategoryMatchesFilter(item.subcategory, activeSubcategory);
      const bySearch = matchesCatalogPrefixSearch(
        productCatalogSearchHaystack(item),
        search
      );
      return byCategory && bySubcategory && bySearch;
    });
  }, [activeProducts, activeCategory, activeSubcategory, search]);

  const inMatrix = (product) => matrixIdSet.has(String(product.id));

  const selectAll = () => {
    setCategory("");
    setSubcategory("");
  };

  const selectGroup = (name) => {
    setCategory(name);
    setSubcategory("");
    if (getGroupChildren(name).length) {
      setOpenParents((prev) => {
        const next = new Set(prev);
        // Повторный клик по названию сворачивает подкатегории.
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    }
  };

  const selectSub = (parent, child) => {
    setCategory(parent);
    setSubcategory(child);
    setOpenParents((prev) => {
      const next = new Set(prev);
      next.add(parent);
      return next;
    });
  };

  const toggleParent = (name) => {
    setOpenParents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <section className="panel client-catalog-add-panel">
      <div className="client-catalog-add-shell">
        <div className="client-catalog-add-sticky-chrome" ref={stickyChromeRef}>
          <div className="client-catalog-add-search">
            <CatalogSearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <aside className="client-catalog-add-side">
            <nav
              className="category-list client-catalog-add-categories"
              aria-label="Категории каталога"
            >
              <button
                className={!activeCategory ? "category-button active" : "category-button"}
                type="button"
                onClick={selectAll}
              >
                Все
              </button>

              {groups.map((group) => {
                const hasChildren = group.children.length > 0;
                const isOpen = openParents.has(group.name);
                const isActiveParent = activeCategory === group.name;

                return (
                  <div key={group.name} className="client-catalog-add-cat-block">
                    <div className="client-catalog-add-cat-row">
                      <button
                        className={
                          isActiveParent ? "category-button active" : "category-button"
                        }
                        type="button"
                        onClick={() => selectGroup(group.name)}
                      >
                        {group.name}
                      </button>
                      {hasChildren ? (
                        <button
                          type="button"
                          className={`client-catalog-add-cat-toggle${isOpen ? " is-open" : ""}`}
                          aria-expanded={isOpen}
                          aria-label={
                            isOpen
                              ? `Скрыть подкатегории: ${group.name}`
                              : `Показать подкатегории: ${group.name}`
                          }
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleParent(group.name);
                          }}
                        >
                          <NavChevron />
                        </button>
                      ) : null}
                    </div>
                    {hasChildren && isOpen ? (
                      <div className="client-catalog-add-cat-children">
                        {group.children.map((child) => (
                          <button
                            key={child.name}
                            type="button"
                            className={
                              activeCategory === group.name &&
                              activeSubcategory === child.name
                                ? "category-button active is-child"
                                : "category-button is-child"
                            }
                            onClick={() => selectSub(group.name, child.name)}
                          >
                            {child.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>

            {activeChildren.length > 0 ? (
              <div
                className="client-catalog-add-subcats-mobile"
                aria-label="Подкатегории"
              >
                <button
                  type="button"
                  className={
                    activeCategory && !activeSubcategory
                      ? "category-button active"
                      : "category-button"
                  }
                  onClick={() => selectGroup(activeCategory)}
                >
                  Все в категории
                </button>
                {activeChildren.map((child) => (
                  <button
                    key={child.name}
                    type="button"
                    className={
                      activeSubcategory === child.name
                        ? "category-button active"
                        : "category-button"
                    }
                    onClick={() => selectSub(activeCategory, child.name)}
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            ) : null}
          </aside>
        </div>

        <div className="client-catalog-add-intro panel-heading">
          <div>
            <p className="eyebrow">Каталог Clover</p>
            <h2>Добавить товары из каталога</h2>
            <p>
              Здесь можно только добавить позицию в свою матрицу. Заказ оформляется
              во вкладке «Моя матрица».
            </p>
          </div>
        </div>

        <div className="client-catalog-add-main">
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
                      <img
                        className="product-image"
                        src={productImageSrc(product)}
                        alt={product.name}
                        loading="lazy"
                      />
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
                    ? "Попробуйте другую категорию, подкатегорию или другой запрос."
                    : "Каталог пока пуст. Обратитесь к менеджеру."
                }
              />
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}
