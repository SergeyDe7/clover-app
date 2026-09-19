import { Suspense, lazy, useEffect, useState } from "react";
import { StoreHeader } from "./components/StoreHeader.jsx";
import { StoreFooter } from "./components/StoreFooter.jsx";
import { parseStorefrontRoute } from "./mode.js";
import { isCabinetPath } from "../../config/urls.js";
import { HomePage } from "./pages/HomePage.jsx";
import { loadPublicSite, peekPublicSite } from "./publicSite.js";
import {
  applyStorefrontDocumentMeta,
  storefrontRouteDocumentMeta,
} from "./seo.js";
import { isIndexablePublicSearch } from "../../shared/i18n/publicLocaleRouting.js";
import { trackStorefrontPageview } from "../../analytics/metrikaBrowser.js";
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
const AktsiiPage = lazy(() =>
  import("./pages/AktsiiPage.jsx").then((m) => ({ default: m.AktsiiPage }))
);
const InstallAppPage = lazy(() =>
  import("./pages/InstallAppPage.jsx").then((m) => ({
    default: m.InstallAppPage,
  }))
);
const InfoPage = lazy(() =>
  import("./pages/InfoPage.jsx").then((m) => ({ default: m.InfoPage }))
);

export default function StorefrontApp({ localization }) {
  const {
    enabledLanguages = ["ru"],
    locale = "ru",
    t = (key) => key,
  } = localization || {};
  const [route, setRoute] = useState(() =>
    parseStorefrontRoute(window.location.pathname)
  );
  const routeLocale = route.locale || locale;
  // Cart/checkout URLs are unprefixed; keep chrome + CMS info pages on the
  // sticky UI locale instead of falling back to RU registry headings.
  const contentLocale = ["cart", "checkout"].includes(route.name)
    ? locale
    : routeLocale;
  const [site, setSite] = useState(() => peekPublicSite(contentLocale));

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
      // Leaving to /lk via SPA: keep LK shell color (do not restore storefront beige).
      if (isCabinetPath(window.location.pathname)) {
        if (themeMeta) themeMeta.setAttribute("content", "#f4f8f2");
        document.documentElement.style.backgroundColor = "#f4f8f2";
        document.body.style.backgroundColor = "#f4f8f2";
        return;
      }
      if (themeMeta) themeMeta.setAttribute("content", previousTheme || "#f4f8f2");
      document.documentElement.style.backgroundColor = previousHtmlBg;
      document.body.style.backgroundColor = previousBodyBg;
    };
  }, []);

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
    let cancelled = false;
    loadPublicSite(contentLocale)
      .then((next) => {
        if (!cancelled) setSite(next);
      })
      .catch(() => {
        if (!cancelled) setSite(null);
      });
    return () => {
      cancelled = true;
    };
  }, [contentLocale]);

  useEffect(() => {
    if (route.name !== "product" && (site || contentLocale === "ru")) {
      applyStorefrontDocumentMeta(
        storefrontRouteDocumentMeta(route, site, {
          locale: contentLocale,
          enabledLanguages,
          indexable: isIndexablePublicSearch(window.location.search),
        })
      );
    }
    trackStorefrontPageview();
  }, [enabledLanguages, route, contentLocale, site]);

  let page;
  let current = "home";
  if (route.name === "catalog") {
    page = (
      <CatalogPage
        category={route.category || ""}
        subcategory={route.subcategory || ""}
        facet={route.facet || ""}
        routeLocale={routeLocale}
      />
    );
    current = "catalog";
  } else if (route.name === "product") {
    page = (
      <ProductPage code={route.code} routeLocale={routeLocale} site={site} />
    );
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
  } else if (route.name === "aktsii") {
    page = <AktsiiPage />;
    current = "aktsii";
  } else if (route.name === "install-app") {
    page = <InstallAppPage />;
    current = "home";
  } else if (route.name === "info") {
    page =
      contentLocale !== "ru" && !site ? (
        <div className="sf-info-page" aria-busy="true" role="status">
          <p className="sf-muted">{t("storefront.loadingCategories")}</p>
        </div>
      ) : (
        <InfoPage slug={route.slug} infoPages={site?.infoPages} />
      );
    current = `info:${route.slug}`;
  } else if (route.name === "notFound") {
    page = (
      <div className="sf-info-page sf-not-found" role="status">
        <h1>{t("shared.empty.notFound")}</h1>
      </div>
    );
    current = "";
  } else {
    page = <HomePage />;
  }

  return (
    <div className={`sf-app${route.name === "catalog" ? " is-catalog" : ""}`}>
      <StoreHeader current={current} route={route} />
      <main className="sf-main">
        <Suspense fallback={null}>{page}</Suspense>
      </main>
      {route.name === "catalog" ? null : contentLocale !== "ru" && !site ? (
        <footer className="sf-footer" aria-busy="true">
          <div className="sf-footer-primary">
            <p className="sf-footer-copy">{t("storefront.footer.copyright")}</p>
          </div>
        </footer>
      ) : (
        <StoreFooter current={current} infoPages={site?.infoPages} />
      )}
    </div>
  );
}
