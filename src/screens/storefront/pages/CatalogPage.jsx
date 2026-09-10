import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../../shared/i18n/errorDisplay.js";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import {
  catalogScrollRouteKey,
  navigateStorefront,
  resetCatalogScrollOnRouteIdentity,
} from "../components/StoreHeader.jsx";
import { ProductCard } from "../components/ProductCard.jsx";
import { CatalogGroupNav } from "../components/CatalogGroupNav.jsx";
import { GroupIcon } from "../components/GroupIcon.jsx";
import {
  getGroupMeta,
  getGroupChildren,
  getSubgroupFacets,
  groupProductsByCloverGroup,
} from "../productGroups.js";
import {
  matchesCatalogPrefixSearch,
  productCatalogSearchHaystack,
} from "../../../shared/appHelpers.js";
import { sortProductsWithLidsGrouped } from "../../../shared/productCatalogOrder.js";

export function CatalogPage({
  category = "",
  subcategory = "",
  facet = "",
}) {
  const { t } = useLocalization();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // Mobile: каталог открывается со свёрнутыми категориями; раскрытие — только тапом «Категории».
  const [treeOpen, setTreeOpen] = useState(false);
  // Mobile + category: search after chips so products start higher; desktop keeps top search.
  const [inlineSearch, setInlineSearch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError("");
    storefrontApi
      .catalog({
        category: category || undefined,
        subcategory: subcategory || undefined,
        facet: facet || undefined,
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(errorDisplayMessage(err, t, "storefront.error.catalogLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [category, subcategory, facet, t]);

  const routeKey = catalogScrollRouteKey(category, subcategory, facet);
  const prevRouteKeyRef = useRef(null);
  useLayoutEffect(() => {
    resetCatalogScrollOnRouteIdentity(prevRouteKeyRef.current, routeKey);
    prevRouteKeyRef.current = routeKey;
  }, [routeKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      setTreeOpen(false);
    }
  }, [category, subcategory]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 900px)");
    const syncMobileChrome = () => {
      if (mq.matches) setTreeOpen(false);
      setInlineSearch(mq.matches && Boolean(category));
    };
    syncMobileChrome();
    mq.addEventListener?.("change", syncMobileChrome);
    return () => mq.removeEventListener?.("change", syncMobileChrome);
  }, [category]);

  const products = useMemo(() => {
    const list = data?.products || [];
    return list.filter((product) =>
      matchesCatalogPrefixSearch(productCatalogSearchHaystack(product), query)
    );
  }, [data, query]);

  const activeMeta = category ? getGroupMeta(category) : null;
  const subgroups = category ? getGroupChildren(category) : [];
  const facets = subcategory ? getSubgroupFacets(category, subcategory) : [];

  // Родительская категория: все товары группы (включая подкатегории).
  // Подкатегория/facet сужают выборку на API.
  const sections = useMemo(() => {
    if (category) {
      const sorted = sortProductsWithLidsGrouped(products);
      return sorted.length
        ? [{ name: subcategory || category, products: sorted, count: sorted.length }]
        : [];
    }
    return groupProductsByCloverGroup(products);
  }, [category, subcategory, products]);

  const imagePriorityById = useMemo(() => {
    const map = new Map();
    let index = 0;
    for (const section of sections) {
      for (const product of section.products || []) {
        map.set(product.id, index);
        index += 1;
      }
    }
    return map;
  }, [sections]);

  const title = category || t("storefront.nav.catalog");

  const searchToolbar = (
    <div className="sf-catalog-toolbar">
      <input
        className="sf-input sf-catalog-search"
        type="search"
        placeholder={t("storefront.searchByNameOrSku")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );

  return (
    <div className={`sf-catalog${category ? " has-category" : ""}`}>
      {!inlineSearch ? searchToolbar : null}

      <div className="sf-catalog-layout">
        <aside className={`sf-catalog-side${treeOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="sf-catalog-tree-toggle"
            aria-expanded={treeOpen}
            onClick={() => setTreeOpen((open) => !open)}
          >
            <span>{category || t("client.catalog.categories")}</span>
            <svg
              className="sf-catalog-tree-toggle-icon"
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
          </button>
          <p className="sf-catalog-side-title">{t("storefront.nav.catalog")}</p>
          <div className="sf-catalog-tree-body">
            <CatalogGroupNav
              categories={data?.categories || []}
              activeCategory={category}
              activeSubcategory={subcategory}
              variant="side"
            />
          </div>
        </aside>

        <div className="sf-catalog-main">
          {category && activeMeta ? (
            <header className="sf-group-landing">
              <div className="sf-group-landing-icon" aria-hidden="true">
                <GroupIcon name={activeMeta.icon} />
              </div>
              <div className="sf-group-landing-copy">
                <nav className="sf-crumb sf-group-landing-crumb" aria-label={t("storefront.nav.aria")}>
                  <button
                    type="button"
                    className="sf-back"
                    onClick={() => navigateStorefront({ name: "catalog" })}
                  >{
                    t("storefront.nav.catalog")
                  }</button>
                  {category ? (
                    <>
                      <span className="sf-crumb-sep">/</span>
                      <button
                        type="button"
                        className="sf-back"
                        onClick={() =>
                          navigateStorefront({ name: "catalog", category })
                        }
                      >
                        {category}
                      </button>
                    </>
                  ) : null}
                  {facet ? (
                    <>
                      <span className="sf-crumb-sep">/</span>
                      <span className="sf-crumb-current">{facet}</span>
                    </>
                  ) : null}
                </nav>
                <h1>{title}</h1>
              </div>
            </header>
          ) : (
            <div className="sf-section-head">
              <h1>{t("storefront.nav.catalog")}</h1>
            </div>
          )}

          {subgroups.length > 0 ? (
            <div className="sf-subcat-chips" aria-label={t("storefront.subgroups")}>
              {subgroups.map((child) => (
                <button
                  key={child.name}
                  type="button"
                  className={`sf-chip${
                    subcategory === child.name ? " is-active" : ""
                  }`}
                  onClick={() =>
                    navigateStorefront({
                      name: "catalog",
                      category,
                      subcategory: child.name,
                    })
                  }
                >
                  {child.name}
                </button>
              ))}
            </div>
          ) : null}

          {subcategory && facets.length > 0 ? (
            <section className="sf-subgroup-strip" aria-label={t("storefront.clarification")}>
              <div className="sf-facet-tree" role="list">
                <button
                  type="button"
                  className={`sf-facet-item${!facet ? " is-active" : ""}`}
                  onClick={() =>
                    navigateStorefront({
                      name: "catalog",
                      category,
                      subcategory,
                    })
                  }
                >{
                  t("shared.filter.all")
                }</button>
                {facets.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className={`sf-facet-item${
                      facet === item.name ? " is-active" : ""
                    }`}
                    role="listitem"
                    onClick={() =>
                      navigateStorefront({
                        name: "catalog",
                        category,
                        subcategory,
                        facet: item.name,
                      })
                    }
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {inlineSearch ? searchToolbar : null}

          {error ? <p className="sf-error">{error}</p> : null}

          {sections.map((section) => (
            <section className="sf-group-block" key={section.name}>
              {!category ? (
                <div className="sf-group-head">
                  <h2>{section.name}</h2>
                </div>
              ) : null}
              <div className="sf-product-grid">
                {section.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    imagePriorityIndex={imagePriorityById.get(product.id)}
                  />
                ))}
              </div>
            </section>
          ))}

          {!error && data && !products.length ? (
            <p className="sf-muted">
              {category
                ? t("storefront.thereAreNoProductsInThis")
                : t("storefront.thereAreNoProductsInThe")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
