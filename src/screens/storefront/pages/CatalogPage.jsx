import { useEffect, useMemo, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { navigateStorefront } from "../components/StoreHeader.jsx";
import { ProductCard } from "../components/ProductCard.jsx";
import { groupProductsByCloverGroup } from "../productGroups.js";

export function CatalogPage({ category = "" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    storefrontApi
      .catalog({ category: category || undefined })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Не удалось загрузить каталог.");
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  const products = useMemo(() => {
    const list = data?.products || [];
    const q = query.trim().toLocaleLowerCase("ru-RU");
    if (!q) return list;
    return list.filter((product) =>
      `${product.name} ${product.code} ${product.category}`
        .toLocaleLowerCase("ru-RU")
        .includes(q)
    );
  }, [data, query]);

  const sections = useMemo(() => {
    if (category) {
      return products.length
        ? [{ name: category, products, count: products.length }]
        : [];
    }
    return groupProductsByCloverGroup(products);
  }, [category, products]);

  return (
    <div className="sf-catalog">
      <div className="sf-section-head">
        <h1>{category || "Каталог"}</h1>
        <p>
          {category
            ? "Группа из номенклатуры Clover."
            : "Товары по группам — как в личном кабинете."}
        </p>
      </div>

      <div className="sf-catalog-toolbar">
        <input
          className="sf-input"
          type="search"
          placeholder="Поиск по названию или артикулу"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="sf-category-chips" aria-label="Группы товаров">
        <button
          type="button"
          className={`sf-chip${!category ? " is-active" : ""}`}
          onClick={() => navigateStorefront({ name: "catalog" })}
        >
          Все группы
        </button>
        {(data?.categories || []).map((item) => (
          <button
            key={item.name}
            type="button"
            className={`sf-chip${category === item.name ? " is-active" : ""}`}
            onClick={() =>
              navigateStorefront({ name: "catalog", category: item.name })
            }
          >
            {item.name}
          </button>
        ))}
      </div>

      {error ? <p className="sf-error">{error}</p> : null}

      {sections.map((section) => (
        <section className="sf-group-block" key={section.name}>
          {!category ? (
            <div className="sf-group-head">
              <h2>{section.name}</h2>
              <span className="sf-muted">{section.count}</span>
            </div>
          ) : null}
          <div className="sf-product-grid">
            {section.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ))}

      {!error && data && !products.length ? (
        <p className="sf-muted">В этой группе пока нет товаров.</p>
      ) : null}
    </div>
  );
}
