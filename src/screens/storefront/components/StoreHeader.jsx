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

export function StoreHeader({ current }) {
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
        aria-label="Clover — на главную"
      >
        <img src="/clover-logo.png" alt="Clover" width="160" height="108" />
      </a>
      <nav className="sf-nav" aria-label="Навигация">
        {link("home", "Главная", "home")}
        {link({ name: "catalog" }, "Каталог", "catalog")}
        {link({ name: "contacts" }, "Контакты", "contacts")}
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
          aria-label="Каталог"
          onClick={(e) => {
            e.preventDefault();
            go({ name: "catalog" });
          }}
        >
          <IconCatalog />
          <span className="sf-header-tool-label">Каталог</span>
        </a>
        <StorefrontContacts />
        <a
          className="sf-header-tool sf-cart-mobile"
          href={storefrontHref({ name: "cart" })}
          aria-label={count ? `Корзина: ${count} поз.` : "Корзина"}
          onClick={(e) => {
            e.preventDefault();
            go({ name: "cart" });
          }}
        >
          <IconCart />
          <span className="sf-header-tool-label">Корзина</span>
          {count > 0 ? <span className="sf-header-badge">{count > 99 ? "99+" : count}</span> : null}
        </a>
        <a
          className="sf-header-tool sf-login-mobile"
          href={cabinetLoginUrl("/")}
          aria-label="Личный кабинет"
          onClick={navigateToCabinetLogin}
        >
          <IconUser />
          <span className="sf-header-tool-label">ЛК</span>
        </a>
        <a
          className="sf-btn sf-btn-ghost sf-login sf-login-desktop"
          href={cabinetLoginUrl("/")}
          onClick={navigateToCabinetLogin}
        >
          Войти в ЛК
        </a>
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

export function navigateStorefront(route) {
  window.history.pushState({}, "", storefrontHref(route));
  window.dispatchEvent(new PopStateEvent("popstate"));
}
