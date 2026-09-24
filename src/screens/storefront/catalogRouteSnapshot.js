/**
 * Route-owned storefront catalog snapshot selection.
 * Browser-safe. Keeps product grid tied to the requesting route identity.
 */

/** @typedef {{ routeKey: string, payload: object }} CatalogRouteSnapshot */

export function makeCatalogRouteSnapshot(routeKey, payload) {
  return { routeKey: String(routeKey || ""), payload };
}

export function advanceCatalogRequestGeneration(current, routeKey) {
  const key = String(routeKey || "");
  const previous = current && typeof current === "object"
    ? current
    : { key: "", generation: 0 };
  if (previous.key === key) return previous;
  return { key, generation: Number(previous.generation || 0) + 1 };
}

export function isCatalogRequestGenerationCurrent(current, generation) {
  return Number(current?.generation) === Number(generation);
}

export function mergeCatalogRoutePage(snapshot, routeKey, payload) {
  const key = String(routeKey || "");
  const offset = Number(payload?.pagination?.offset) || 0;
  if (offset === 0) {
    return makeCatalogRouteSnapshot(key, payload);
  }
  if (!snapshot || snapshot.routeKey !== key) return snapshot;
  const previous = Array.isArray(snapshot.payload?.products)
    ? snapshot.payload.products
    : [];
  const incoming = Array.isArray(payload?.products) ? payload.products : [];
  const products = [...previous];
  const seen = new Set(previous.map((product) => String(product?.id ?? product?.code ?? "")));
  for (const product of incoming) {
    const identity = String(product?.id ?? product?.code ?? "");
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    products.push(product);
  }
  return {
    routeKey: key,
    payload: {
      ...snapshot.payload,
      ...payload,
      products,
    },
  };
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
