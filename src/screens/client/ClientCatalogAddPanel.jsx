import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Каталог ЛК: только добавление товара в свою матрицу, без корзины.
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { sortProductsWithLidsGrouped } from "../../shared/productCatalogOrder.js";
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
  const mode = String(
    product?.clientPriceMode || product?.defaultPricingMode || "base"
  );
  const categoryMode =
    mode === "one_c_price_type" || mode === "purchase_markup";
  const seen = new Set();
  const candidates = [];
  for (const unit of [...units, ...UNIT_ORDER]) {
    if (seen.has(unit)) continue;
    seen.add(unit);
    const price = getUnitPrice(product, unit);
    if (!(price > 0)) continue;
    const source = String(product?.priceSources?.[unit] || "");
    // При категории цен не показываем «базовый» fallback каталога.
    if (categoryMode && source === "base_fallback") continue;
    candidates.push({ price, unit, source });
  }
  if (!candidates.length) {
    return { price: 0, unit: units[0] || "piece" };
  }
  const preferred =
    candidates.find((item) =>
      /one_c_price_type|purchase_markup|manual/.test(item.source)
    ) || candidates[0];
  return { price: preferred.price, unit: preferred.unit };
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

/** Stable identity for client LK catalog category / subcategory navigation. */
export function clientCatalogNavKey(category = "", subcategory = "") {
  return `${String(category || "")}\0${String(subcategory || "")}`;
}

/** Window is the product-list scrollport in client LK catalog (not an inner overflow pane). */
export function resetClientCatalogScrollOnNavIdentity(previousKey, nextKey) {
  if (previousKey === nextKey) return false;
  if (typeof window === "undefined") return false;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  return true;
}

export function ClientCatalogAddPanel({
  products = [],
  matrixProductIds = [],
  matrixMode = "pending",
  settings,
  busyId = "",
  onAdd,
  onRemove,
}) {
  const { t } = useLocalization();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [openParents, setOpenParents] = useState(() => new Set());
  // Телефон: категории свёрнуты до явного тапа; desktop всегда показывает список.
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const stickyChromeRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 820px)");
    const collapseOnMobile = () => {
      if (mq.matches) setCategoriesOpen(false);
    };
    collapseOnMobile();
    mq.addEventListener?.("change", collapseOnMobile);
    return () => mq.removeEventListener?.("change", collapseOnMobile);
  }, []);

  const navKey = clientCatalogNavKey(category, subcategory);
  const prevNavKeyRef = useRef(null);
  useLayoutEffect(() => {
    resetClientCatalogScrollOnNavIdentity(prevNavKeyRef.current, navKey);
    prevNavKeyRef.current = navKey;
  }, [navKey]);

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
        activeProducts.map((item) => canonicalizeProductCategory(item.category || t("client.other")))
      ),
    [activeProducts]
  );

  const activeCategory = String(category || "").trim()
    ? canonicalizeProductCategory(category)
    : "";
  const activeSubcategory = canonicalizeProductSubcategory(subcategory);
  const activeChildren = activeCategory ? getGroupChildren(activeCategory) : [];

  const sortedProducts = useMemo(
    () => activeProducts,
    [activeProducts]
  );
  const searchEntries = useMemo(
    () =>
      sortedProducts.map((product) => ({
        product,
        haystack: productCatalogSearchHaystack(product),
      })),
    [sortedProducts]
  );
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => {
    const filterCategory = String(category || "").trim()
      ? canonicalizeProductCategory(category)
      : "";
    const filterSubcategory = canonicalizeProductSubcategory(subcategory);
    return sortProductsWithLidsGrouped(
      searchEntries
        .filter(({ product, haystack }) => {
          const byCategory = categoryMatchesFilter(product.category, filterCategory);
          const bySubcategory =
            !filterSubcategory ||
            subcategoryMatchesFilter(product.subcategory, filterSubcategory);
          const bySearch = matchesCatalogPrefixSearch(haystack, deferredSearch);
          return byCategory && bySubcategory && bySearch;
        })
        .map(({ product }) => product)
    );
  }, [searchEntries, category, subcategory, deferredSearch]);

  const inMatrix = (product) =>
    matrixMode === "all" || matrixIdSet.has(String(product.id));

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

          <aside
            className={
              categoriesOpen
                ? "client-catalog-add-side is-categories-open"
                : "client-catalog-add-side"
            }
          >
            <button
              type="button"
              className="client-catalog-add-cats-toggle"
              aria-expanded={categoriesOpen}
              onClick={() => setCategoriesOpen((open) => !open)}
            >
              <span>
                {activeSubcategory || activeCategory || t("client.catalog.categories")}
              </span>
              <NavChevron />
            </button>
            <nav
              className="category-list client-catalog-add-categories"
              aria-label={t("client.catalogCategories")}
            >
              <button
                className={!activeCategory ? "category-button active" : "category-button"}
                type="button"
                onClick={selectAll}
              >{
                t("shared.filter.all")
              }</button>

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
                aria-label={t("client.subcategories")}
              >
                <button
                  type="button"
                  className={
                    activeCategory && !activeSubcategory
                      ? "category-button active"
                      : "category-button"
                  }
                  onClick={() => selectGroup(activeCategory)}
                >{
                  t("client.allInCategory")
                }</button>
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
            <p className="eyebrow">{t("client.cloverCatalog")}</p>
            <h2>{t("client.nav.catalog")}</h2>
            <p>{
              t("client.addItemsToTheMatrixOr")
            }</p>
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
                      <span className="product-image-placeholder">{t("shared.media.noPhoto")}</span>
                    )}
                  </div>
                  <h2>{product.name}</h2>
                  <p className="product-code">Арт. {productArticle(product) || "—"}</p>
                  <p className="product-price client-catalog-add-price">
                    {showPrices && price > 0 ? (
                      <>
                        {formatMoney(price)}{" "}
                        <small>/ {(UNIT_CONFIG[unit] || UNIT_CONFIG.piece).shortLabel}</small>
                      </>
                    ) : (
                      t("shared.price.pending")
                    )}
                  </p>
                  <div className="product-card-controls">
                    {added ? (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busy || !onRemove}
                        onClick={() => onRemove?.(product)}
                      >
                        {busy ? t("client.removing") : t("client.removeFromMatrix")}
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        type="button"
                        disabled={busy}
                        onClick={() => onAdd?.(product)}
                      >
                        {busy ? t("client.adding") : t("client.matrix.add")}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {!filtered.length ? (
              <EmptyState
                title={t("client.productsNotFound")}
                message={
                  activeProducts.length
                    ? t("client.tryAnotherCategorySubcategoryOrQuery")
                    : t("client.theCatalogIsEmptyForNow")
                }
              />
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}
