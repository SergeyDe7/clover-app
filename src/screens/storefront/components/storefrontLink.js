import { navigateStorefront } from "./StoreHeader.jsx";

/** Keep native open-in-new-tab/download behavior; intercept only a plain left click. */
export function handleStorefrontLinkClick(event, route) {
  if (
    !event ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.currentTarget?.hasAttribute?.("download") ||
    (event.currentTarget?.target && event.currentTarget.target !== "_self")
  ) {
    return false;
  }
  event.preventDefault();
  navigateStorefront(route);
  return true;
}
