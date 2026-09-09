import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { useEffect, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { GroupTile } from "../components/GroupTile.jsx";
import { HeroSlides } from "../components/HeroSlides.jsx";
import { CLOVER_PRODUCT_GROUPS } from "../productGroups.js";
import { storefrontHref } from "../mode.js";
import {
  STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
  STOREFRONT_DEFAULT_HERO_SLIDES,
  STOREFRONT_HERO_LEAD,
  STOREFRONT_HERO_TITLE,
} from "../siteCopy.js";

function navigatePromoLink(link) {
  const href = String(link || "").trim();
  if (!href) return;
  if (/^https:\/\//i.test(href)) {
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  const path = href.startsWith("/") ? href : `/${href}`;
  window.history.pushState({}, "", storefrontHref(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function HomePage() {
  const { t } = useLocalization();
  const [error, setError] = useState("");
  const [hero, setHero] = useState({
    title: "",
    lead: "",
    // null until API: avoid starting 2.2MB default PNG before real first slide.
    slides: null,
    intervalSec: STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
  });
  const [homePromotions, setHomePromotions] = useState([]);
  const [ready, setReady] = useState(false);

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
        setHomePromotions(
          Array.isArray(site.homePromotions) ? site.homePromotions : []
        );
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Не удалось загрузить витрину.");
          setHero((prev) => ({
            ...prev,
            slides: STOREFRONT_DEFAULT_HERO_SLIDES,
          }));
          setHomePromotions([]);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="sf-home">
      <section className="sf-hero sf-hero-compact" aria-label={t("storefront.cloverCompany")}>
        <div className="sf-hero-copy">
          <p className="sf-hero-brand">{t("storefront.brand.wordmark")}</p>
          <h1>{hero.title || STOREFRONT_HERO_TITLE}</h1>
          <p className="sf-hero-lead">{hero.lead || STOREFRONT_HERO_LEAD}</p>
        </div>
        {Array.isArray(hero.slides) ? (
          <HeroSlides slides={hero.slides} intervalSec={hero.intervalSec} />
        ) : (
          <div className="sf-hero-visual" aria-hidden="true" />
        )}
      </section>

      {homePromotions.length > 0 ? (
        <section className="sf-section sf-home-promos" aria-label={t("storefront.nav.promos")}>
          <div className="sf-section-head">
            <h2>{t("storefront.nav.promos")}</h2>
            <a
              className="sf-section-more"
              href={storefrontHref({ name: "aktsii" })}
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, "", storefrontHref({ name: "aktsii" }));
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
            >{
              t("storefront.allPromos")
            }</a>
          </div>
          <ul className="sf-home-promo-list">
            {homePromotions.map((promo) => (
              <li key={promo.id} className="sf-home-promo-card">
                {promo.imageUrl ? (
                  <img src={promo.imageUrl} alt="" loading="lazy" />
                ) : null}
                <div className="sf-home-promo-copy">
                  <h3>{promo.title}</h3>
                  {promo.shortText ? <p>{promo.shortText}</p> : null}
                  {promo.link ? (
                    <button
                      type="button"
                      className="sf-btn sf-btn-ghost sf-btn-sm"
                      onClick={() => navigatePromoLink(promo.link)}
                    >
                      {promo.buttonText || t("storefront.more")}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="sf-section sf-groups-section">
        <div className="sf-section-head">
          <h2>{t("storefront.popularCategories")}</h2>
        </div>
        {error ? <p className="sf-error">{error}</p> : null}
        <div className="sf-group-grid">
          {CLOVER_PRODUCT_GROUPS.map((name) => (
            <GroupTile key={name} name={name} />
          ))}
          {!ready && !error ? (
            <p className="sf-muted">{t("storefront.loadingCategories")}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
