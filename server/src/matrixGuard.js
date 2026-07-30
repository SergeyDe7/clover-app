/**
 * Server-side guard: client may only save catalog line items allowed by matrix policy.
 * customItems are intentionally out-of-matrix and are not checked here.
 */

function cleanId(value) {
  return String(value ?? "").trim();
}

export function clientMayOrderCatalogProduct(rawLink = {}, productId, products = []) {
  const matrixMode = String(rawLink?.matrixMode || "pending");
  const allowFullCatalog = Boolean(rawLink?.allowFullCatalog);
  const id = cleanId(productId);
  if (!id) return false;

  if (matrixMode === "all") return true;

  if (allowFullCatalog) {
    return (Array.isArray(products) ? products : []).some(
      (product) => String(product.id) === id && product.active !== false
    );
  }

  if (matrixMode === "selected") {
    const ids = Array.isArray(rawLink?.matrixProductIds)
      ? rawLink.matrixProductIds
      : [];
    return ids.map(String).includes(id);
  }

  return false;
}

export function findClientOrderMatrixViolations(orders, rawLink = {}, products = []) {
  const violations = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    for (const item of Array.isArray(order?.items) ? order.items : []) {
      const productId = item?.productId ?? item?.id;
      if (!clientMayOrderCatalogProduct(rawLink, productId, products)) {
        violations.push({
          orderId: cleanId(order?.id),
          productId: cleanId(productId),
          name: String(item?.name || ""),
        });
      }
    }
  }
  return violations;
}

export function isMatrixProductForLink(rawLink = {}, productId) {
  const matrixMode = String(rawLink?.matrixMode || "pending");
  if (matrixMode === "all") return true;
  if (matrixMode !== "selected") return false;
  const ids = Array.isArray(rawLink?.matrixProductIds)
    ? rawLink.matrixProductIds
    : [];
  return ids.map(String).includes(String(productId));
}
