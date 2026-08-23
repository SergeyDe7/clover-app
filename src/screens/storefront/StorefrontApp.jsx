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
