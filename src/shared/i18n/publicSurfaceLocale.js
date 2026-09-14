import { extractPublicLanguagePrefix } from "./languageResolver.js";
import { publicLocaleInfrastructureEnabledFromDocument } from "./publicLocaleRouting.js";

const STOREFRONT_PREVIEW_PREFIX = "/vitrina";

/**
 * Resolve public surface + optional URL locale prefix.
 * Cabinet (/lk) never carries a URL locale. Unprefixed storefront has urlLocale=null
 * (compatibility route is always Russian per resolveLocale).
 */
export function resolvePublicSurfaceLocale(
  pathnameInput,
  { infrastructureEnabled } = {}
) {
  const pathname = String(pathnameInput || "/");
  if (pathname === "/lk" || pathname.startsWith("/lk/")) {
    return { surface: "cabinet", urlLocale: null, pathname };
  }
  let path = pathname;
  if (
    path === STOREFRONT_PREVIEW_PREFIX ||
    path === `${STOREFRONT_PREVIEW_PREFIX}/`
  ) {
    path = "/";
  } else if (path.startsWith(`${STOREFRONT_PREVIEW_PREFIX}/`)) {
    path = path.slice(STOREFRONT_PREVIEW_PREFIX.length) || "/";
  }
  const enabled =
    typeof infrastructureEnabled === "boolean"
      ? infrastructureEnabled
      : typeof document !== "undefined" &&
        publicLocaleInfrastructureEnabledFromDocument(document);
  if (!enabled) {
    return { surface: "storefront", urlLocale: null, pathname: path };
  }
  const parsed = extractPublicLanguagePrefix(path, {
    infrastructureEnabled: true,
  });
  return {
    surface: "storefront",
    urlLocale: parsed.locale || null,
    pathname: parsed.pathname || path,
  };
}
