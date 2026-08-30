import { storefrontHref } from "../mode.js";

/** Compact contacts tool — known-good presentation from 055c69f. */
function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M8.2 4.8c.4-.9 1.3-1.3 2.2-1.1l1.8.4c.8.2 1.4.8 1.5 1.6l.3 2.1c.1.7-.2 1.4-.8 1.8l-1.2.8c1 2 2.6 3.6 4.6 4.6l.8-1.2c.4-.6 1.1-.9 1.8-.8l2.1.3c.8.1 1.4.7 1.6 1.5l.4 1.8c.2.9-.2 1.8-1.1 2.2l-1.9.8c-1.2.5-2.6.2-3.7-.5-2.3-1.5-4.2-3.4-5.7-5.7-.7-1.1-1-2.5-.5-3.7l.8-1.9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StorefrontContacts() {
  const href = storefrontHref({ name: "contacts" });

  return (
    <a
      className="sf-header-tool sf-contacts-mobile"
      href={href}
      aria-label="Контакты"
      onClick={(event) => {
        event.preventDefault();
        window.history.pushState({}, "", href);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
    >
      <IconPhone />
      <span className="sf-header-tool-label">Контакты</span>
    </a>
  );
}
