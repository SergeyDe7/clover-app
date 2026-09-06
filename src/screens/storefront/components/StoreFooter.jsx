import { storefrontHref } from "../mode.js";

export function StoreFooter({ current }) {
  function go(route) {
    window.history.pushState({}, "", storefrontHref(route));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  const link = (route, label, match) => (
    <a
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
      <p className="sf-footer-copy">© КЛЕВЕР</p>
    </footer>
  );
}
