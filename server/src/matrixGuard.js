/**
 * Server-side guard: client may only save catalog line items allowed by matrix policy.
 * customItems are intentionally out-of-matrix and are not checked here.
 */

function cleanId(value) {
  return String(value ?? "").trim();
}

export function clientMayOrderCatalogProduct(rawLink = {}, productId, products = []) {
  const matrixMode = String(rawLink?.matrixMode || "pending");
  const id = cleanId(productId);
  if (!id) return false;

  if (matrixMode === "all" || matrixMode === "selected") {
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

function itemsFingerprint(order) {
  return JSON.stringify(
    (Array.isArray(order?.items) ? order.items : [])
      .map((item) => ({
        productId: cleanId(item?.productId ?? item?.id),
        quantity: Number(item?.quantity) || 0,
        unit: String(item?.unit || ""),
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId))
  );
}

/**
 * Матрицу проверяем только у новых заказов и у тех, где изменился состав items.
 * Старые неизменённые заказы не должны блокировать сохранение нового.
 */
export function ordersRequiringMatrixCheck(orders, previousById) {
  const map =
    previousById instanceof Map
      ? previousById
      : new Map(
          (Array.isArray(previousById) ? previousById : []).map((order) => [
            String(order?.id || ""),
            order,
          ])
        );

  return (Array.isArray(orders) ? orders : []).filter((order) => {
    const id = cleanId(order?.id);
    if (!id) return true;
    if (String(order?.deletedAt || "").trim()) return false;
    const previous = map.get(id);
    if (!previous) return true;
    return itemsFingerprint(order) !== itemsFingerprint(previous);
  });
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
