import { storefrontHref } from "../mode.js";
import {
  STOREFRONT_INFO_PAGES,
  resolveStorefrontInfoPage,
} from "../../../shared/storefrontInfoPages.js";

export function StoreFooter({ current, infoPages }) {
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
      <div className="sf-footer-primary">
        <p className="sf-footer-copy">© КЛЕВЕР</p>
      </div>
      <nav className="sf-footer-nav sf-footer-info" aria-label="Информация">
        {STOREFRONT_INFO_PAGES.map((page) => {
          const resolved = resolveStorefrontInfoPage(page.slug, infoPages);
          return link(
            { name: "info", slug: page.slug },
            resolved?.heading || page.heading,
            `info:${page.slug}`
          );
        })}
      </nav>
    </footer>
  );
}
