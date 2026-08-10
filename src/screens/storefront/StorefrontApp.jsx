import { useEffect, useState } from "react";
import { StoreHeader } from "./components/StoreHeader.jsx";
import { parseStorefrontRoute } from "./mode.js";
import { HomePage } from "./pages/HomePage.jsx";
import { CatalogPage } from "./pages/CatalogPage.jsx";
import { ProductPage } from "./pages/ProductPage.jsx";
import { CartPage } from "./pages/CartPage.jsx";
import { CheckoutPage } from "./pages/CheckoutPage.jsx";
import "./storefront.css";

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
    return () => {
      window.removeEventListener("popstate", onPop);
      document.body.classList.remove("sf-body");
      document.documentElement.classList.remove("sf-root");
    };
  }, []);

  let page = null;
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
  } else {
    page = <HomePage />;
  }

  return (
    <div className="sf-app">
      <StoreHeader current={current} />
      <main className="sf-main">{page}</main>
    </div>
  );
}
