import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../../shared/i18n/errorDisplay.js";
import { useEffect, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { storefrontHref } from "../mode.js";

function navigatePromoLink(link) {
  const href = String(link || "").trim();
  if (!href) return;
  if (/^https:\/\//i.test(href)) {
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  const path = href.startsWith("/") ? href : `/${href}`;
  const target = storefrontHref(path);
  window.history.pushState({}, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AktsiiPage() {
  const { t } = useLocalization();
  const [promotions, setPromotions] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    storefrontApi
      .site()
      .then((payload) => {
        if (cancelled) return;
        const list = Array.isArray(payload?.site?.promotions)
          ? payload.site.promotions
          : [];
        setPromotions(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorDisplayMessage(err, t, "storefront.error.promosLoadFailed"));
          setPromotions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const list = Array.isArray(promotions) ? promotions : null;
  const empty = list && list.length === 0;

  return (
    <div className="sf-aktsii-page">
      <header className="sf-aktsii-head">
        <h1>{t("storefront.nav.promos")}</h1>
        <p className="sf-muted">{
          t("storefront.specialOffersFromInformationalMaterialsNo")
        }</p>
      </header>

      {error ? <p className="sf-error">{error}</p> : null}

      {list === null ? (
        <p className="sf-muted">{t("shared.status.loadingEllipsis")}</p>
      ) : empty ? (
        <div className="sf-aktsii-empty" role="status">
          <p>{t("storefront.thereAreNoSpecialOffersRight")}</p>
          <p>{t("storefront.stayTunedNewPromotionsWillAppear")}</p>
        </div>
      ) : (
        <ul className="sf-aktsii-list">
          {list.map((promo) => (
            <li key={promo.id} className="sf-aktsii-item">
              {promo.imageUrl ? (
                <div className="sf-aktsii-media">
                  <img src={promo.imageUrl} alt="" loading="lazy" />
                </div>
              ) : null}
              <div className="sf-aktsii-body">
                <h2>{promo.title}</h2>
                {promo.shortText ? (
                  <p className="sf-aktsii-short">{promo.shortText}</p>
                ) : null}
                {promo.fullDescription ? (
                  <div className="sf-aktsii-full">
                    {promo.fullDescription.split(/\n+/).map((paragraph, idx) => (
                      <p key={`${promo.id}-p-${idx}`}>{paragraph}</p>
                    ))}
                  </div>
                ) : null}
                {promo.link ? (
                  <button
                    type="button"
                    className="sf-btn sf-btn-primary"
                    onClick={() => navigatePromoLink(promo.link)}
                  >
                    {promo.buttonText || t("storefront.more")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
