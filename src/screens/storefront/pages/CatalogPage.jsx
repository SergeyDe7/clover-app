import { useEffect, useMemo, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { navigateStorefront } from "../components/StoreHeader.jsx";
import { ProductCard } from "../components/ProductCard.jsx";
import { CatalogGroupNav } from "../components/CatalogGroupNav.jsx";
import { GroupIcon } from "../components/GroupIcon.jsx";
import {
  getGroupMeta,
  getGroupChildren,
  getSubgroupFacets,
  groupProductsByCloverGroup,
  groupRequiresSubgroup,
} from "../productGroups.js";
import {
  matchesCatalogPrefixSearch,
  productCatalogSearchHaystack,
} from "../../../shared/appHelpers.js";

export function CatalogPage({
  category = "",
  subcategory = "",
  facet = "",
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [treeOpen, setTreeOpen] = useState(() => !category);

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
        if (!cancelled) setError(err.message || "Не удалось загрузить каталог.");
      });
    return () => {
      cancelled = true;
    };
  }, [category, subcategory, facet]);

  useEffect(() => {
    if (!category) return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      setTreeOpen(false);
    }
  }, [category, subcategory]);

  const products = useMemo(() => {
    const list = data?.products || [];
    return list.filter((product) =>
      matchesCatalogPrefixSearch(productCatalogSearchHaystack(product), query)
    );
  }, [data, query]);

  const activeMeta = category ? getGroupMeta(category) : null;
  const subgroups = category ? getGroupChildren(category) : [];
  const facets = subcategory ? getSubgroupFacets(category, subcategory) : [];
  const needsSubgroup = category && groupRequiresSubgroup(category);
  const atParentOnly = Boolean(category && !subcategory && needsSubgroup);

  const sections = useMemo(() => {
    if (atParentOnly) {
      const hasQuery = Boolean(query.trim());
      if (hasQuery) {
        return products.length
          ? [
              {
                name: "Найдено",
                products,
                count: products.length,
              },
            ]
          : [];
      }
      const orphans = products.filter(
        (product) => !String(product.subcategory || "").trim()
      );
      return orphans.length
        ? [
            {
              name: "Без подгруппы",
              products: orphans,
              count: orphans.length,
            },
          ]
        : [];
    }
    const canShow = Boolean(!category || subcategory || !needsSubgroup);
    if (!canShow) return [];
    if (category) {
      return products.length
        ? [{ name: subcategory || category, products, count: products.length }]
        : [];
    }
    return groupProductsByCloverGroup(products);
  }, [
    atParentOnly,
    category,
    subcategory,
    products,
    needsSubgroup,
    query,
  ]);

  const showProducts = sections.length > 0 || Boolean(
    !category || subcategory || !needsSubgroup
  );

  const title = category || "Каталог";

  return (
    <div className="sf-catalog">
      <div className="sf-catalog-layout">
        <aside className={`sf-catalog-side${treeOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="sf-catalog-tree-toggle"
            aria-expanded={treeOpen}
            onClick={() => setTreeOpen((open) => !open)}
          >
            <span>{category || "Категории"}</span>
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
          <p className="sf-catalog-side-title">Каталог</p>
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
                <nav className="sf-crumb" aria-label="Навигация">
                  <button
                    type="button"
                    className="sf-back"
                    onClick={() => navigateStorefront({ name: "catalog" })}
                  >
                    Каталог
                  </button>
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
                <p>{activeMeta.lead}</p>
              </div>
            </header>
          ) : (
            <div className="sf-section-head">
              <h1>Каталог</h1>
              <p>Выберите категорию.</p>
            </div>
          )}

          {subgroups.length > 0 ? (
            <div className="sf-subcat-chips" aria-label="Подгруппы">
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
            <section className="sf-subgroup-strip" aria-label="Уточнение">
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
                >
                  Все
                </button>
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

          {showProducts ? (
            <div className="sf-catalog-toolbar">
              <input
                className="sf-input"
                type="search"
                placeholder="Поиск по названию или артикулу"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ) : null}

          {error ? <p className="sf-error">{error}</p> : null}

          {sections.map((section) => (
            <section className="sf-group-block" key={section.name}>
              {!category || atParentOnly ? (
                <div className="sf-group-head">
                  <div>
                    <h2>{section.name}</h2>
                    {!atParentOnly ? (
                      <p className="sf-muted">{getGroupMeta(section.name).lead}</p>
                    ) : (
                      <p className="sf-muted">
                        Товары без выбранной подгруппы — укажите подкатегорию в
                        карточке, чтобы они попали в меню.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
              <div className="sf-product-grid">
                {section.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          ))}

          {showProducts && !error && data && !products.length ? (
            <p className="sf-muted">
              {category
                ? "В этой группе пока нет товаров."
                : "В каталоге пока нет товаров."}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
