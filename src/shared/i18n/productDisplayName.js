/** Display-only product title for LK. Order lines keep canonical product.name. */
export function productDisplayName(product) {
  if (!product || typeof product !== "object") return "";
  const display = String(product.displayName || "").trim();
  if (display) return display;
  return String(product.name || "").trim();
}

/**
 * Merge id→displayName map onto product lists without mutating canonical name.
 */
export function applyProductDisplayNameMap(products, displays) {
  const list = Array.isArray(products) ? products : [];
  const map = displays && typeof displays === "object" ? displays : {};
  return list.map((product) => {
    if (!product || typeof product !== "object") return product;
    const id = String(product.id ?? "");
    const displayName = id && typeof map[id] === "string" ? map[id].trim() : "";
    if (!displayName) {
      if (!product.displayName) return product;
      const { displayName: _drop, ...rest } = product;
      return rest;
    }
    return { ...product, displayName };
  });
}
