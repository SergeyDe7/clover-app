/** Deterministic first-viewport product image loading attrs (global render order). */
export const STOREFRONT_PRIORITY_IMAGE_COUNT = 8;

export function productCardImageLoadingAttrs(imagePriorityIndex, limit = STOREFRONT_PRIORITY_IMAGE_COUNT) {
  const index = Number(imagePriorityIndex);
  if (Number.isFinite(index) && index >= 0 && index < Number(limit)) {
    return { loading: "eager", fetchPriority: "high" };
  }
  return { loading: "lazy" };
}
