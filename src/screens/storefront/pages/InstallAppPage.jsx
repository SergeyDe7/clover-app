import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import {
  cabinetLoginUrl,
  navigateToCabinetLogin,
} from "../../../config/urls.js";
import { storefrontHref } from "../mode.js";
import { navigateStorefront } from "../components/StoreHeader.jsx";

function Step({ n, title, children }) {
  return (
    <li className="sf-install-step">
      <span className="sf-install-step-num" aria-hidden="true">
        {n}
      </span>
      <div className="sf-install-step-body">
        <h3>{title}</h3>
        {children}
      </div>
    </li>
  );
}

function PlatformCard({ title, badge, children }) {
  return (
    <section className="sf-install-platform" aria-labelledby={`sf-install-${badge}`}>
      <div className="sf-install-platform-head">
        <h2 id={`sf-install-${badge}`}>{title}</h2>
        <span className="sf-install-badge">{badge}</span>
      </div>
      <ol className="sf-install-steps">{children}</ol>
    </section>
  );
}

export function InstallAppPage() {
  const { t } = useLocalization();
  return (
    <div className="sf-install-page">
      <header className="sf-section-head">
        <p className="sf-install-eyebrow">{t("storefront.cloverMobileApp")}</p>
        <h1>{t("storefront.howToInstallOnAPhone")}</h1>
        <p className="sf-muted sf-install-lead">{
          t("storefront.cloverWorksAsAPwaNo")
        }</p>
      </header>

      <div className="sf-install-grid">
        <PlatformCard title={t("storefront.iphoneAndIpad")} badge="iOS">
          <Step n="1" title={t("storefront.openSafari")}>
            <p>
              Перейдите на{" "}
              <a href="/" onClick={(e) => { e.preventDefault(); navigateStorefront("home"); }}>
                clover-spb.ru
              </a>{" "}
              в браузере Safari. В Chrome и других браузерах на iOS установка на экран
              недоступна.
            </p>
          </Step>
          <Step n="2" title={t("storefront.tapShare")}>
            <p>{
              t("storefront.atTheBottomOfTheScreen")
            }</p>
          </Step>
          <Step n="3" title={t("storefront.addToHomeScreen")}>
            <p>{
              t("storefront.scrollTheMenuAndChooseAdd")
            }</p>
          </Step>
        </PlatformCard>

        <PlatformCard title="Android" badge="Android">
          <Step n="1" title={t("storefront.openChrome")}>
            <p>
              Зайдите на{" "}
              <a href="/" onClick={(e) => { e.preventDefault(); navigateStorefront("home"); }}>
                clover-spb.ru
              </a>{" "}
              в Google Chrome (желательно последняя версия из Play Store). Samsung Internet
              тоже подойдёт: меню → «Добавить на главный экран».
            </p>
          </Step>
          <Step n="2" title={t("storefront.browserMenu")}>
            <p>{
              t("storefront.tapInTheTopRightAnd")
            }</p>
          </Step>
          <Step n="3" title={t("storefront.confirmInstallation")}>
            <p>{t("storefront.tapInstallOrAddTheClover")}</p>
          </Step>
          <Step n="4" title={t("storefront.ifYouSeeGooglePlayProtect")}>
            <p>{
              t("storefront.onSamsungAndOtherPhonesAn") }<strong>{t("storefront.notAVirus")}</strong>{ t("storefront.howAndroidChecksSitesInstalledOutside")
            }</p>
            <p className="sf-install-step-gap">{
              t("storefront.tap") }<strong>{t("storefront.moreDetails")}</strong> → <strong>{t("storefront.installAnyway")}</strong>{t("storefront.ifYouOnlySeeOkUpdate")
            }</p>
          </Step>
        </PlatformCard>

        <PlatformCard title={t("storefront.computer")} badge="Windows / macOS">
          <Step n="1" title={t("storefront.chromeOrEdge")}>
            <p>{t("storefront.openCloverSpbRuInChrome")}</p>
          </Step>
          <Step n="2" title={t("storefront.installIcon")}>
            <p>{
              t("storefront.anInstallOrIconAppearsOn")
            }</p>
          </Step>
          <Step n="3" title={t("storefront.separateWindow")}>
            <p>{
              t("storefront.cloverOpensAsASeparateApp")
            }</p>
          </Step>
        </PlatformCard>
      </div>

      <aside className="sf-install-alert" role="note">
        <h2>{t("storefront.installSafety")}</h2>
        <p>{
          t("storefront.cloverIsYourPersonalCabinetOn") }<strong>clover-spb.ru</strong>{t("storefront.notAnAppFromGooglePlay")
        }</p>
      </aside>

      <aside className="sf-install-note">
        <h2>{t("storefront.afterInstallation")}</h2>
        <p>{
          t("storefront.signInToTheCabinetOrders")
        }</p>
        <div className="sf-install-actions">
          <a
            className="sf-btn sf-btn-primary"
            href={cabinetLoginUrl("/")}
            onClick={navigateToCabinetLogin}
          >{
            t("storefront.signInToCabinet")
          }</a>
          <a
            className="sf-btn sf-btn-ghost"
            href={storefrontHref("home")}
            onClick={(e) => {
              e.preventDefault();
              navigateStorefront("home");
            }}
          >{
            t("storefront.nav.homeLink")
          }</a>
        </div>
      </aside>
    </div>
  );
}
