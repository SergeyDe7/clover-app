import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { useEffect, useState } from "react";
import {
  cabinetLoginUrl,
  navigateToCabinetLogin,
} from "../../../config/urls.js";
import { getCartCount, subscribeCart } from "../cartStorage.js";
import { storefrontHref } from "../mode.js";
import { StorefrontContacts } from "./StorefrontContacts.jsx";

/** Compact mobile tools — known-good from 055c69f. */
function IconCatalog() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconCart() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M4.5 5h16l-1.4 8.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L4.5 5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 10h8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="19" r="1.2" fill="currentColor" />
      <circle cx="17" cy="19" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 19.5c.6-3 3-4.5 6.5-4.5s6 1.5 6.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPromo() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M5 8.5 12 4l7 4.5v7L12 20l-7-4.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 12v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 8.5 12 12l7-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function StoreHeader({ current }) {
  const { t } = useLocalization();
  const [count, setCount] = useState(getCartCount);
  useEffect(() => subscribeCart(() => setCount(getCartCount())), []);

  function go(route) {
    window.history.pushState({}, "", storefrontHref(route));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  const link = (route, label, match) => (
    <a
      className={`sf-nav-link${current === match ? " is-active" : ""}`}
      href={storefrontHref(route)}
      onClick={(e) => {
        e.preventDefault();
        go(route);
      }}
    >
      {label}
    </a>
  );

  return (
    <header className="sf-header">
      <a
        className="sf-brand"
        href="/"
        onClick={(e) => {
          e.preventDefault();
          go("home");
        }}
        aria-label={t("storefront.cloverHome")}
      >
        <img src="/clover-logo.png" alt="Clover" width="160" height="108" />
      </a>
      <nav className="sf-nav" aria-label={t("storefront.nav.aria")}>
        {link("home", t("storefront.nav.home"), "home")}
        {link({ name: "catalog" }, t("storefront.nav.catalog"), "catalog")}
        {link({ name: "aktsii" }, t("storefront.nav.promos"), "aktsii")}
        {link({ name: "contacts" }, t("storefront.nav.contacts"), "contacts")}
        {link(
          { name: "cart" },
          `Корзина${count ? ` (${count})` : ""}`,
          "cart"
        )}
      </nav>
      <div className="sf-header-actions">
        <a
          className="sf-header-tool sf-catalog-mobile"
          href={storefrontHref({ name: "catalog" })}
          aria-label={t("storefront.nav.catalog")}
          onClick={(e) => {
            e.preventDefault();
            go({ name: "catalog" });
          }}
        >
          <IconCatalog />
          <span className="sf-header-tool-label">{t("storefront.nav.catalog")}</span>
        </a>
        <a
          className="sf-header-tool sf-aktsii-mobile"
          href={storefrontHref({ name: "aktsii" })}
          aria-label={t("storefront.nav.promos")}
          onClick={(e) => {
            e.preventDefault();
            go({ name: "aktsii" });
          }}
        >
          <IconPromo />
          <span className="sf-header-tool-label">{t("storefront.nav.promos")}</span>
        </a>
        <a
          className="sf-header-tool sf-cart-mobile"
          href={storefrontHref({ name: "cart" })}
          aria-label={count ? `Корзина: ${count} поз.` : t("storefront.nav.cart")}
          onClick={(e) => {
            e.preventDefault();
            go({ name: "cart" });
          }}
        >
          <IconCart />
          <span className="sf-header-tool-label">{t("storefront.nav.cart")}</span>
          {count > 0 ? <span className="sf-header-badge">{count > 99 ? "99+" : count}</span> : null}
        </a>
        <StorefrontContacts />
        <a
          className="sf-header-tool sf-login-mobile"
          href={cabinetLoginUrl("/")}
          aria-label={t("auth.login.title")}
          onClick={navigateToCabinetLogin}
        >
          <IconUser />
          <span className="sf-header-tool-label">{t("storefront.cabinet")}</span>
        </a>
        <a
          className="sf-btn sf-btn-ghost sf-login sf-login-desktop"
          href={cabinetLoginUrl("/")}
          onClick={navigateToCabinetLogin}
        >{
          t("storefront.signInToCabinet")
        }</a>
      </div>
    </header>
  );
}

export function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function scrollStorefrontCatalogToTop() {
  const scrollOptions = { top: 0, left: 0, behavior: "auto" };
  document.querySelector(".sf-catalog-main")?.scrollTo(scrollOptions);
  window.scrollTo(scrollOptions);
}

export function catalogScrollRouteKey(category = "", subcategory = "", facet = "") {
  return `${String(category || "")}\0${String(subcategory || "")}\0${String(facet || "")}`;
}

/** Scrolls only when category/subcategory/facet identity actually changes. */
export function resetCatalogScrollOnRouteIdentity(previousKey, nextKey) {
  if (previousKey === nextKey) return false;
  scrollStorefrontCatalogToTop();
  return true;
}

export function navigateStorefront(route) {
  window.history.pushState({}, "", storefrontHref(route));
  window.dispatchEvent(new PopStateEvent("popstate"));
}
