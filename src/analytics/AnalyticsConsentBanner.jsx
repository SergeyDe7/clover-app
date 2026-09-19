import { useLocalization } from "../shared/i18n/LocalizationProvider";
import { storefrontHref } from "../screens/storefront/mode.js";
import { ANALYTICS_CONSENT_GRANTED } from "./metrikaConfig.js";

function goPrivacy(event) {
  event.preventDefault();
  window.history.pushState({}, "", storefrontHref({ name: "info", slug: "privacy-policy" }));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AnalyticsConsentBanner({
  mode = "prompt",
  currentStatus,
  onAllow,
  onDeny,
  onClose,
}) {
  const { t } = useLocalization();
  const settings = mode === "settings";
  const title = settings
    ? t("storefront.analytics.settingsTitle")
    : t("storefront.analytics.bannerTitle");
  const text = settings
    ? t("storefront.analytics.settingsText")
    : t("storefront.analytics.bannerText");

  return (
    <div
      className={`sf-analytics-consent${settings ? " is-settings" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="sf-analytics-consent-title"
      data-analytics-consent={settings ? "settings" : "prompt"}
    >
      <div className="sf-analytics-consent-card">
        <h2 id="sf-analytics-consent-title" className="sf-analytics-consent-title">
          {title}
        </h2>
        <p className="sf-analytics-consent-text">{text}</p>
        <p className="sf-analytics-consent-note">{t("storefront.analytics.revokeNote")}</p>
        <a
          className="sf-analytics-consent-privacy"
          href={storefrontHref({ name: "info", slug: "privacy-policy" })}
          onClick={goPrivacy}
        >
          {t("storefront.analytics.privacyLink")}
        </a>
        <div className="sf-analytics-consent-actions">
          <button
            type="button"
            className="sf-btn sf-btn-ghost sf-analytics-consent-btn"
            data-analytics-action="allow"
            onClick={onAllow}
          >
            {t("storefront.analytics.allow")}
          </button>
          <button
            type="button"
            className="sf-btn sf-btn-ghost sf-analytics-consent-btn"
            data-analytics-action={settings && currentStatus === ANALYTICS_CONSENT_GRANTED ? "revoke" : "deny"}
            onClick={onDeny}
          >
            {settings && currentStatus === ANALYTICS_CONSENT_GRANTED
              ? t("storefront.analytics.revoke")
              : t("storefront.analytics.deny")}
          </button>
        </div>
        {settings ? (
          <button
            type="button"
            className="sf-analytics-consent-close"
            onClick={onClose}
          >
            {t("storefront.analytics.close")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
