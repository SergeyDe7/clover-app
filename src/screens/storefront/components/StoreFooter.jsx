import { storefrontHref } from "../mode.js";
import { STOREFRONT_INFO_PAGES } from "../pages/infoPages.js";

export function StoreFooter({ current }) {
  function go(route) {
    window.history.pushState({}, "", storefrontHref(route));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  const link = (route, label, match) => (
    <a
      key={match}
      className={`sf-footer-link${current === match ? " is-active" : ""}`}
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
    <footer className="sf-footer">
      <nav className="sf-footer-nav" aria-label="Ссылки в подвале">
        {link("home", "Главная", "home")}
        {link({ name: "catalog" }, "Каталог", "catalog")}
        {link({ name: "aktsii" }, "Акции", "aktsii")}
        {link({ name: "contacts" }, "Контакты", "contacts")}
      </nav>
      <nav className="sf-footer-nav sf-footer-info" aria-label="Информация">
        {STOREFRONT_INFO_PAGES.map((page) =>
          link(
            { name: "info", slug: page.slug },
            page.heading,
            `info:${page.slug}`
          )
        )}
      </nav>
      <p className="sf-footer-copy">© КЛЕВЕР</p>
    </footer>
  );
}
