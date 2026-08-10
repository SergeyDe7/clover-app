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

export function CatalogPage({
  category = "",
  subcategory = "",
  facet = "",
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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

  const products = useMemo(() => {
    const list = data?.products || [];
    const q = query.trim().toLocaleLowerCase("ru-RU");
    if (!q) return list;
    return list.filter((product) =>
      `${product.name} ${product.code} ${product.category} ${product.subcategory || ""} ${product.facet || ""}`
        .toLocaleLowerCase("ru-RU")
        .includes(q)
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

  const title = facet || subcategory || category || "Каталог";

  return (
    <div className="sf-catalog">
      <div className="sf-catalog-layout">
        <aside className="sf-catalog-side">
          <p className="sf-catalog-side-title">Каталог</p>
          <CatalogGroupNav
            categories={data?.categories || []}
            activeCategory={category}
            activeSubcategory={subcategory}
            variant="side"
          />
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
                  {subcategory ? (
                    <>
                      <span className="sf-crumb-sep">/</span>
                      <button
                        type="button"
                        className="sf-back"
                        onClick={() =>
                          navigateStorefront({
                            name: "catalog",
                            category,
                            subcategory,
                          })
                        }
                      >
                        {subcategory}
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
              <p>Выберите группу в дереве слева.</p>
            </div>
          )}

          {atParentOnly ? (
            <section className="sf-subgroup-strip" aria-label="Подгруппы">
              <div className="sf-facet-tree" role="list">
                {subgroups.map((child) => (
                  <button
                    key={child.name}
                    type="button"
                    className="sf-facet-item"
                    role="listitem"
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
            </section>
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

          {!category ? (
            <div className="sf-category-chips" aria-label="Быстрый фильтр групп">
              <button
                type="button"
                className="sf-chip is-active"
                onClick={() => navigateStorefront({ name: "catalog" })}
              >
                Все группы
              </button>
              {(data?.categories || []).map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="sf-chip"
                  onClick={() =>
                    navigateStorefront({
                      name: "catalog",
                      category: item.name,
                    })
                  }
                >
                  {item.name}
                </button>
              ))}
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
