/**
 * Route-owned storefront catalog snapshot selection.
 * Browser-safe. Keeps product grid tied to the requesting route identity.
 */

/** @typedef {{ routeKey: string, payload: object }} CatalogRouteSnapshot */

export function makeCatalogRouteSnapshot(routeKey, payload) {
  return { routeKey: String(routeKey || ""), payload };
}

/**
 * Synchronously resolve what the catalog may render for the current route.
 * Category nav may reuse the latest known categories corpus.
 * Route-specific products come only from a matching snapshot.routeKey.
 */
export function resolveStorefrontCatalogView(routeKey, snapshot) {
  const key = String(routeKey || "");
  const categories = Array.isArray(snapshot?.payload?.categories)
    ? snapshot.payload.categories
    : [];
  const currentPayload =
    snapshot && snapshot.routeKey === key ? snapshot.payload : null;
  return { categories, currentPayload };
}
