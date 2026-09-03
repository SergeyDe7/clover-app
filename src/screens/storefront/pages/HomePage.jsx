import { useEffect, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { GroupTile } from "../components/GroupTile.jsx";
import { HeroSlides } from "../components/HeroSlides.jsx";
import { CLOVER_PRODUCT_GROUPS } from "../productGroups.js";
import {
  STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
  STOREFRONT_DEFAULT_HERO_SLIDES,
  STOREFRONT_HERO_LEAD,
  STOREFRONT_HERO_TITLE,
  isStorefrontAppHeroSlide,
} from "../siteCopy.js";

export function HomePage() {
  const [error, setError] = useState("");
  const [hero, setHero] = useState({
    title: "",
    lead: "",
    // null until API: avoid starting 2.2MB default PNG before real first slide.
    slides: null,
    intervalSec: STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
  });
  const [ready, setReady] = useState(false);
  const [appHeroActive, setAppHeroActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Lightweight /api/public/site (hero settings) — not full catalog (~1.5MB).
    storefrontApi
      .site()
      .then((payload) => {
        if (cancelled) return;
        const site = payload?.site || {};
        setHero({
          title: site.heroTitle || "",
          lead: site.heroLead || "",
          slides:
            Array.isArray(site.heroSlides) && site.heroSlides.length
              ? site.heroSlides
              : STOREFRONT_DEFAULT_HERO_SLIDES,
          intervalSec:
            site.heroIntervalSec || STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
        });
        const nextSlides =
          Array.isArray(site.heroSlides) && site.heroSlides.length
            ? site.heroSlides
            : STOREFRONT_DEFAULT_HERO_SLIDES;
        setAppHeroActive(isStorefrontAppHeroSlide(nextSlides[0], 0));
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Не удалось загрузить витрину.");
          setHero((prev) => ({
            ...prev,
            slides: STOREFRONT_DEFAULT_HERO_SLIDES,
          }));
          setAppHeroActive(
            isStorefrontAppHeroSlide(STOREFRONT_DEFAULT_HERO_SLIDES[0], 0)
          );
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="sf-home">
      <section
        className={`sf-hero sf-hero-compact${appHeroActive ? " sf-hero--app" : ""}`}
        aria-label="Компания КЛЕВЕР"
      >
        {appHeroActive ? null : (
          <div className="sf-hero-copy">
            <p className="sf-hero-brand">КЛЕВЕР</p>
            <h1>
              {hero.title || STOREFRONT_HERO_TITLE}
            </h1>
            <p className="sf-hero-lead">
              {hero.lead || STOREFRONT_HERO_LEAD}
            </p>
          </div>
        )}
        {Array.isArray(hero.slides) ? (
          <HeroSlides
            slides={hero.slides}
            intervalSec={hero.intervalSec}
            onActiveAppChange={setAppHeroActive}
          />
        ) : (
          <div className="sf-hero-visual" aria-hidden="true" />
        )}
      </section>

      <section className="sf-section sf-groups-section">
        <div className="sf-section-head">
          <h2>Популярные категории</h2>
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
