import { Suspense, lazy, useEffect, useState } from "react";
import { StoreHeader } from "./components/StoreHeader.jsx";
import {
  clientLegacyRedirectTarget,
  normalizeStorefrontPath,
  parseStorefrontRoute,
  storefrontHref,
} from "./mode.js";
import { HomePage } from "./pages/HomePage.jsx";
import {
  applyStorefrontDocumentMeta,
  storefrontRouteDocumentMeta,
} from "./seo.js";
import "./storefront.css";

const CatalogPage = lazy(() =>
  import("./pages/CatalogPage.jsx").then((m) => ({ default: m.CatalogPage }))
);
const ProductPage = lazy(() =>
  import("./pages/ProductPage.jsx").then((m) => ({ default: m.ProductPage }))
);
const CartPage = lazy(() =>
  import("./pages/CartPage.jsx").then((m) => ({ default: m.CartPage }))
);
const CheckoutPage = lazy(() =>
  import("./pages/CheckoutPage.jsx").then((m) => ({ default: m.CheckoutPage }))
);
const ContactsPage = lazy(() =>
  import("./pages/ContactsPage.jsx").then((m) => ({ default: m.ContactsPage }))
);
const InstallAppPage = lazy(() =>
  import("./pages/InstallAppPage.jsx").then((m) => ({ default: m.InstallAppPage }))
);

export default function StorefrontApp() {
  const [route, setRoute] = useState(() =>
    parseStorefrontRoute(window.location.pathname)
  );

  useEffect(() => {
    const onPop = () =>
      setRoute(parseStorefrontRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    document.body.classList.add("sf-body");
    document.documentElement.classList.add("sf-root");
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const previousTheme = themeMeta?.getAttribute("content") || "";
    const previousHtmlBg = document.documentElement.style.backgroundColor;
    const previousBodyBg = document.body.style.backgroundColor;
    document.documentElement.style.colorScheme = "light";
    document.body.style.colorScheme = "light";
    if (themeMeta) themeMeta.setAttribute("content", "#f3f2ee");
    document.documentElement.style.backgroundColor = "#f3f2ee";
    document.body.style.backgroundColor = "#f3f2ee";
    return () => {
      window.removeEventListener("popstate", onPop);
      document.body.classList.remove("sf-body");
      document.documentElement.classList.remove("sf-root");
      if (themeMeta) themeMeta.setAttribute("content", previousTheme || "#f4f8f2");
      document.documentElement.style.backgroundColor = previousHtmlBg;
      document.body.style.backgroundColor = previousBodyBg;
    };
  }, []);

  // Legacy / кириллические URL → канон (клиентский fallback к 301).
  useEffect(() => {
    const redirectTo = clientLegacyRedirectTarget(window.location.pathname);
    if (!redirectTo || redirectTo === window.location.pathname) return;
    window.location.replace(redirectTo);
  }, []);

  // Поддерживаем канонический path после разбора slug (без лишнего reload).
  useEffect(() => {
    if (route.name !== "catalog") return;
    const canonicalPath = storefrontHref(route);
    const current = window.location.pathname;
    if (current === canonicalPath) return;
    if (clientLegacyRedirectTarget(current)) return;
    const logical = normalizeStorefrontPath(current);
    const want = normalizeStorefrontPath(canonicalPath);
    if (logical === want) return;
    window.history.replaceState(window.history.state, "", canonicalPath);
  }, [route]);

  useEffect(() => {
    const lock = route.name === "catalog";
    document.documentElement.classList.toggle("sf-catalog-lock", lock);
    document.body.classList.toggle("sf-catalog-lock", lock);
    return () => {
      document.documentElement.classList.remove("sf-catalog-lock");
      document.body.classList.remove("sf-catalog-lock");
    };
  }, [route.name]);

  useEffect(() => {
    if (route.name === "product") return;
    applyStorefrontDocumentMeta(storefrontRouteDocumentMeta(route));
  }, [route]);

  let page;
  let current = "home";
  if (route.name === "catalog") {
    page = (
      <CatalogPage
        category={route.category || ""}
        subcategory={route.subcategory || ""}
        facet={route.facet || ""}
      />
    );
    current = "catalog";
  } else if (route.name === "product") {
    page = <ProductPage code={route.code} />;
    current = "catalog";
  } else if (route.name === "cart") {
    page = <CartPage />;
    current = "cart";
  } else if (route.name === "checkout") {
    page = <CheckoutPage />;
    current = "cart";
  } else if (route.name === "contacts") {
    page = <ContactsPage />;
    current = "contacts";
  } else if (route.name === "install-app") {
    page = <InstallAppPage />;
    current = "home";
  } else if (route.name === "not-found") {
    page = (
      <div className="sf-not-found">
        <h1>Страница не найдена</h1>
        <p>Запрашиваемая страница не существует.</p>
        <p>
          <a href="/catalog">В каталог</a>
          {" · "}
          <a href="/">На главную</a>
        </p>
      </div>
    );
    current = "home";
  } else {
    page = <HomePage />;
  }

  return (
    <div className={`sf-app${route.name === "catalog" ? " is-catalog" : ""}`}>
      <StoreHeader current={current} />
      <main className="sf-main">
        <Suspense fallback={null}>{page}</Suspense>
      </main>
    </div>
  );
}
