import { useEffect, useMemo, useState } from "react";
import { cabinetLoginUrl } from "../../../config/urls.js";
import { storefrontApi } from "../publicApi.js";
import { navigateStorefront } from "../components/StoreHeader.jsx";
import { ProductCard } from "../components/ProductCard.jsx";
import { groupProductsByCloverGroup } from "../productGroups.js";

export function HomePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    storefrontApi
      .catalog()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Не удалось загрузить каталог.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(
    () => data?.categories || [],
    [data]
  );

  const groupedPreview = useMemo(() => {
    const sections = groupProductsByCloverGroup(data?.products || []);
    return sections.map((section) => ({
      ...section,
      products: section.products.slice(0, 4),
    }));
  }, [data]);

  return (
    <div className="sf-home">
      <section className="sf-hero" aria-label="Clover">
        <div className="sf-hero-copy">
          <p className="sf-hero-brand">Clover</p>
          <h1>
            {data?.site?.heroTitle ||
              "Оптовые поставки для HoReCa и бизнеса"}
          </h1>
          <p className="sf-hero-lead">
            {data?.site?.heroLead ||
              "Каталог с артикулами из 1С. Заказ с сайта без регистрации — или войдите в личный кабинет за персональными условиями."}
          </p>
          <div className="sf-hero-actions">
            <button
              type="button"
              className="sf-btn sf-btn-primary"
              onClick={() => navigateStorefront({ name: "catalog" })}
            >
              Смотреть каталог
            </button>
            <a className="sf-btn sf-btn-ghost" href={cabinetLoginUrl("/")}>
              Войти в ЛК
            </a>
          </div>
        </div>
      </section>

      <section className="sf-section">
        <div className="sf-section-head">
          <h2>Группы товаров</h2>
          <p>Те же группы, что в личном кабинете Clover.</p>
        </div>
        {error ? <p className="sf-error">{error}</p> : null}
        <div className="sf-category-grid">
          {groups.map((group) => (
            <button
              key={group.name}
              type="button"
              className="sf-category-tile"
              onClick={() =>
                navigateStorefront({
                  name: "catalog",
                  category: group.name,
                })
              }
            >
              <span>{group.name}</span>
              <strong>{group.count}</strong>
            </button>
          ))}
          {!groups.length && !error ? (
            <p className="sf-muted">Группы загружаются…</p>
          ) : null}
        </div>
      </section>

      {groupedPreview.map((section) => (
        <section className="sf-section" key={section.name}>
          <div className="sf-section-head sf-group-head">
            <div>
              <h2>{section.name}</h2>
              <p>
                {section.count}{" "}
                {section.count === 1
                  ? "товар"
                  : section.count < 5
                    ? "товара"
                    : "товаров"}
              </p>
            </div>
            <button
              type="button"
              className="sf-btn sf-btn-ghost sf-btn-sm"
              onClick={() =>
                navigateStorefront({
                  name: "catalog",
                  category: section.name,
                })
              }
            >
              Все в группе
            </button>
          </div>
          <div className="sf-product-grid">
            {section.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
