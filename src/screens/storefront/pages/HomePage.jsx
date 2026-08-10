import { useEffect, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { GroupTile } from "../components/GroupTile.jsx";
import { CLOVER_PRODUCT_GROUPS } from "../productGroups.js";

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
      <section className="sf-hero sf-hero-compact" aria-label="Clover">
        <div className="sf-hero-copy">
          <p className="sf-hero-brand">Clover</p>
          <h1>
            {hero.title || "Оптовые поставки для HoReCa и бизнеса"}
          </h1>
          <p className="sf-hero-lead">
            {hero.lead ||
              "Каталог с артикулами из 1С. Заказ с сайта без регистрации — или войдите в личный кабинет за персональными условиями."}
          </p>
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
