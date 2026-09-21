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
  const denyAction =
    settings && currentStatus === ANALYTICS_CONSENT_GRANTED ? "revoke" : "deny";
  const denyLabel =
    denyAction === "revoke"
      ? t("storefront.analytics.revoke")
      : t("storefront.analytics.deny");

  return (
    <div
      className={`sf-analytics-consent${settings ? " is-settings" : " is-prompt"}`}
      role="dialog"
      aria-modal="false"
      aria-label={
        settings
          ? t("storefront.analytics.settingsTitle")
          : t("storefront.analytics.bannerText")
      }
      data-analytics-consent={settings ? "settings" : "prompt"}
    >
      <div className="sf-analytics-consent-card">
        {settings ? (
          <>
            <h2 id="sf-analytics-consent-title" className="sf-analytics-consent-title">
              {t("storefront.analytics.settingsTitle")}
            </h2>
            <p className="sf-analytics-consent-text">{t("storefront.analytics.settingsText")}</p>
            <p className="sf-analytics-consent-note">{t("storefront.analytics.revokeNote")}</p>
          </>
        ) : (
          <p className="sf-analytics-consent-text">
            {t("storefront.analytics.bannerText")}{" "}
            <a
              className="sf-analytics-consent-privacy"
              href={storefrontHref({ name: "info", slug: "privacy-policy" })}
              onClick={goPrivacy}
            >
              {t("storefront.analytics.privacyLink")}
            </a>
          </p>
        )}
        {settings ? (
          <a
            className="sf-analytics-consent-privacy"
            href={storefrontHref({ name: "info", slug: "privacy-policy" })}
            onClick={goPrivacy}
          >
            {t("storefront.analytics.privacyLink")}
          </a>
        ) : null}
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
            data-analytics-action={denyAction}
            onClick={onDeny}
          >
            {denyLabel}
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
