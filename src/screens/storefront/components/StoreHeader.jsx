import { useEffect, useState } from "react";
import { cabinetLoginUrl } from "../../../config/urls.js";
import { getCartCount, subscribeCart } from "../cartStorage.js";
import { storefrontHref } from "../mode.js";

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
        {link(
          { name: "cart" },
          `Корзина${count ? ` (${count})` : ""}`,
          "cart"
        )}
      </nav>
      <div className="sf-header-actions">
        <a className="sf-btn sf-btn-ghost" href={cabinetLoginUrl("/")}>
          Войти в ЛК
        </a>
        <a
          className="sf-btn sf-btn-primary sf-cart-mobile"
          href={storefrontHref({ name: "cart" })}
          onClick={(e) => {
            e.preventDefault();
            go({ name: "cart" });
          }}
        >
          Корзина{count ? ` · ${count}` : ""}
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
