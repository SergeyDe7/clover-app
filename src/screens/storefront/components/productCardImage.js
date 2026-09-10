/** Deterministic first-viewport product image loading attrs (global render order). */
export const STOREFRONT_PRIORITY_IMAGE_COUNT = 8;

function normalizePriorityLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return STOREFRONT_PRIORITY_IMAGE_COUNT;
  return Math.min(STOREFRONT_PRIORITY_IMAGE_COUNT, Math.floor(n));
}

export function productCardImageLoadingAttrs(
  imagePriorityIndex,
  limit = STOREFRONT_PRIORITY_IMAGE_COUNT
) {
  const index = Number(imagePriorityIndex);
  const safeLimit = normalizePriorityLimit(limit);
  if (Number.isFinite(index) && index >= 0 && index < safeLimit) {
    return { loading: "eager", fetchPriority: "high" };
  }
  return { loading: "lazy" };
}
