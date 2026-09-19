/**
 * Paths that must never fall through to SPA index.html.
 * Missing files here are a broken UI, not a client-side route.
 */
export const STATIC_ASSET_PREFIXES = ["/assets/", "/fonts/", "/storefront/"];

export function requestPath(url) {
  return String(url || "/").split("?")[0];
}

export function staticAssetRelativePath(url) {
  const pathname = requestPath(url);
  for (const prefix of STATIC_ASSET_PREFIXES) {
    if (pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)) {
      return pathname.replace(/^\/+/, "");
    }
  }
  return "";
}

export function isGuardedStaticAssetPath(url) {
  return Boolean(staticAssetRelativePath(url));
}
