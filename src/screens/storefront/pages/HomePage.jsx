import { useEffect, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { GroupTile } from "../components/GroupTile.jsx";
import { CLOVER_PRODUCT_GROUPS } from "../productGroups.js";
import { STOREFRONT_HERO_LEAD, STOREFRONT_HERO_TITLE } from "../siteCopy.js";

export function HomePage() {
  const [error, setError] = useState("");
  const [hero, setHero] = useState({ title: "", lead: "" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storefrontApi
      .catalog()
      .then((payload) => {
        if (cancelled) return;
        setHero({
          title: payload?.site?.heroTitle || "",
          lead: payload?.site?.heroLead || "",
        });
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Не удалось загрузить каталог.");
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="sf-home">
      <section className="sf-hero sf-hero-compact" aria-label="Компания КЛЕВЕР">
        <div className="sf-hero-copy">
          <p className="sf-hero-brand">КЛЕВЕР</p>
          <h1>
            {hero.title || STOREFRONT_HERO_TITLE}
          </h1>
          <p className="sf-hero-lead">
            {hero.lead || STOREFRONT_HERO_LEAD}
          </p>
        </div>
        <div className="sf-hero-visual" aria-hidden="true">
          <img
            src="/storefront/hero-horeca.png"
            alt=""
            width="1280"
            height="720"
          />
        </div>
      </section>

      <section className="sf-section sf-groups-section">
        <div className="sf-section-head">
          <h2>Популярные категории</h2>
          <p>Выберите категорию — откроется страница с товарами.</p>
        </div>
        {error ? <p className="sf-error">{error}</p> : null}
        <div className="sf-group-grid">
          {CLOVER_PRODUCT_GROUPS.map((name) => (
            <GroupTile key={name} name={name} />
          ))}
          {!ready && !error ? (
            <p className="sf-muted">Категории загружаются…</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
