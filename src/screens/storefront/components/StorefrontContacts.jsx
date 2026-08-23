import { storefrontHref } from "../mode.js";

export function StorefrontContacts() {
  return (
    <a
      className="sf-btn sf-btn-ghost sf-contacts-btn"
      href={storefrontHref({ name: "contacts" })}
      onClick={(event) => {
        event.preventDefault();
        window.history.pushState({}, "", storefrontHref({ name: "contacts" }));
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
    >
      Контакты
    </a>
  );
}
