import { uniqueMatrixProductIds } from "./matrixIds.js";
import { normalizeProduct } from "../../shared/appHelpers";

/** Состав матрицы клиента: id товаров и oneCId, которые уже в матрице. */
export function getClientMatrixMembership(link, products) {
  const matrixIds = new Set(
    (Array.isArray(link?.matrixProductIds) ? link.matrixProductIds : []).map(String)
  );
  const oneCIdsInMatrix = new Set();
  const namesInMatrix = new Set();
  const codesInMatrix = new Set();
  const productIdByOneCId = new Map();

  for (const product of Array.isArray(products) ? products : []) {
    const productId = String(product.id);
    const oneCId = String(product.oneCId || "").trim();
    if (oneCId) productIdByOneCId.set(oneCId, productId);
    if (!matrixIds.has(productId)) continue;
    if (oneCId) oneCIdsInMatrix.add(oneCId);
    const nameKey = normalizeCatalogNameKey(product.name);
    if (nameKey) namesInMatrix.add(nameKey);
    const codeKey = String(product.oneCCode || product.code || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    if (codeKey && !/^cl-\d+$/i.test(codeKey)) codesInMatrix.add(codeKey);
  }

  return {
    matrixIds,
    oneCIdsInMatrix,
    namesInMatrix,
    codesInMatrix,
    productIdByOneCId,
  };
}

export function normalizeCatalogNameKey(name) {
  return String(name || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/g, "")
    .replace(/\s*\(\d+\s*(?:шт|штук)?\)\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Товар уже есть в каталоге Clover (не обязательно в матрице клиента).
 * Совпадение: oneCId → код → имя Excel/1С.
 */
export function findCloverCatalogProduct(
  products,
  { oneCId = "", code = "", name = "", excelName = "" } = {}
) {
  const source = Array.isArray(products) ? products : [];
  const oid = String(oneCId || "").trim();
  if (oid) {
    const byOneC = source.find((item) => String(item.oneCId || "").trim() === oid);
    if (byOneC) return byOneC;
  }

  const codeKey = String(code || "")
    .trim()
    .toLocaleLowerCase("ru-RU");
  if (codeKey && !/^cl-\d+$/i.test(codeKey)) {
    const byCode = source.find((item) => {
      const codes = [item.oneCCode, item.code, item.oneCMatchCode]
        .map((value) => String(value || "").trim().toLocaleLowerCase("ru-RU"))
        .filter((value) => value && !/^cl-\d+$/i.test(value));
      if (!codes.includes(codeKey)) return false;
      const linked = String(item.oneCId || "").trim();
      // Код совпал, но oneCId уже другой — чужой SKU.
      return !linked || !oid || linked === oid;
    });
    if (byCode) return byCode;
  }

  const nameKeys = new Set(
    [excelName, name]
      .map((value) => normalizeCatalogNameKey(value))
      .filter(Boolean)
  );
  if (nameKeys.size) {
    // Только свободные или с тем же oneCId — не переиспользовать чужой linked SKU.
    const ranked = source
      .map((item, index) => {
        const keys = [item.name, item.oneCName, item.oneCMatchName]
          .map((value) => normalizeCatalogNameKey(value))
          .filter(Boolean);
        if (!keys.some((key) => nameKeys.has(key))) return null;
        const linked = String(item.oneCId || "").trim();
        if (linked && oid && linked !== oid) return null;
        if (linked && !oid) return null;
        return { item, index };
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);
    if (ranked[0]) return ranked[0].item;
  }

  return null;
}

/** Позиция 1С уже представлена в матрице этого клиента. */
export function isOneCItemInClientMatrix(item, membership) {
  if (!membership) return false;
  const oneCId = String(item?.id || item?.oneCId || "").trim();
  const linkedProductId =
    item?.cloverLink?.productId != null ? String(item.cloverLink.productId) : "";
  const nameKey = normalizeCatalogNameKey(item?.name || "");
  const codeKey = String(item?.code || item?.oneCCode || "")
    .trim()
    .toLocaleLowerCase("ru-RU");

  if (linkedProductId && membership.matrixIds.has(linkedProductId)) return true;
  if (oneCId && membership.oneCIdsInMatrix.has(oneCId)) return true;
  if (oneCId) {
    const productId = membership.productIdByOneCId.get(oneCId);
    if (productId && membership.matrixIds.has(productId)) return true;
  }
  if (codeKey && membership.codesInMatrix?.has(codeKey)) return true;
  if (nameKey && membership.namesInMatrix?.has(nameKey)) return true;
  return false;
}

/**
 * Уникальные id для матрицы: один товар на oneCId / артикул / точное имя.
 * Предпочитает id, которые уже были в матрице (preferredIds).
 */
export function pickUniqueMatrixProductIds(productList, preferredIds = []) {
  const preferred = new Set(
    (Array.isArray(preferredIds) ? preferredIds : []).map(String)
  );
  const seenOneC = new Set();
  const seenCode = new Set();
  const seenName = new Set();
  const picked = [];

  const ordered = (Array.isArray(productList) ? productList : [])
    .filter((product) => product && product.active !== false)
    .sort((a, b) => {
      const ap = preferred.has(String(a.id)) ? 0 : 1;
      const bp = preferred.has(String(b.id)) ? 0 : 1;
      return ap - bp;
    });

  for (const product of ordered) {
    const oneCId = String(product.oneCId || "").trim();
    const codeKey = String(product.oneCCode || product.code || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    const nameKey = String(product.name || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    const safeCode = codeKey && !/^cl-\d+$/i.test(codeKey) ? codeKey : "";

    if (oneCId) {
      if (seenOneC.has(oneCId)) continue;
      seenOneC.add(oneCId);
    }
    if (safeCode) {
      if (seenCode.has(safeCode)) continue;
      seenCode.add(safeCode);
    }
    if (nameKey) {
      if (seenName.has(nameKey)) continue;
      seenName.add(nameKey);
    }

    picked.push(product.id);
  }

  return picked;
}

export { uniqueMatrixProductIds };

/**
 * Все id в matrixProductIds, связанные с выбранными товарами
 * (тот же oneCId / артикул / имя) — чтобы удаление убирало и скрытые дубли.
 */
export function expandMatrixRemovalIds(
  selectedProducts,
  matrixProductIds,
  allProducts
) {
  const removeIds = new Set(
    (Array.isArray(selectedProducts) ? selectedProducts : []).map((product) =>
      String(product.id)
    )
  );
  const removeOneC = new Set();
  const removeCodes = new Set();
  const removeNames = new Set();

  for (const product of Array.isArray(selectedProducts) ? selectedProducts : []) {
    const oneCId = String(product.oneCId || "").trim();
    if (oneCId) removeOneC.add(oneCId);
    const codeKey = String(product.oneCCode || product.code || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    if (codeKey && !/^cl-\d+$/i.test(codeKey)) removeCodes.add(codeKey);
    const nameKey = String(product.name || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    if (nameKey) removeNames.add(nameKey);
  }

  const byId = new Map(
    (Array.isArray(allProducts) ? allProducts : []).map((product) => [
      String(product.id),
      product,
    ])
  );

  for (const rawId of Array.isArray(matrixProductIds) ? matrixProductIds : []) {
    const id = String(rawId);
    if (removeIds.has(id)) continue;
    const product = byId.get(id);
    if (!product) continue;
    const oneCId = String(product.oneCId || "").trim();
    if (oneCId && removeOneC.has(oneCId)) {
      removeIds.add(id);
      continue;
    }
    const codeKey = String(product.oneCCode || product.code || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    if (codeKey && removeCodes.has(codeKey)) {
      removeIds.add(id);
      continue;
    }
    const nameKey = String(product.name || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    if (nameKey && removeNames.has(nameKey)) {
      removeIds.add(id);
    }
  }

  return removeIds;
}

function hasTypedPrices(value) {
  return Boolean(
    value && typeof value === "object" && Object.keys(value).length > 0
  );
}

function hasPurchasePrices(value) {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(
    (price) => price != null && Number.isFinite(Number(price))
  );
}

/**
 * Подмена каталога после from-catalog: сохраняем уже подтянутые цены,
 * если в ответе пришёл «голый» товар без salePricesByType.
 */
export function mergeProductsFromCatalogResponse(previous, incoming) {
  const prevList = Array.isArray(previous) ? previous : [];
  const nextById = new Map(
    prevList.map((product) => [String(product.id), product])
  );
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const next = normalizeProduct(raw);
    const id = String(next.id);
    const prev = nextById.get(id);
    if (!prev) {
      nextById.set(id, next);
      continue;
    }
    nextById.set(id, {
      ...next,
      salePricesByType: hasTypedPrices(next.salePricesByType)
        ? next.salePricesByType
        : prev.salePricesByType || {},
      purchasePrices: hasPurchasePrices(next.purchasePrices)
        ? next.purchasePrices
        : prev.purchasePrices || next.purchasePrices,
      salePriceReceivedAt:
        next.salePriceReceivedAt || prev.salePriceReceivedAt || "",
      purchasePriceUpdatedAt:
        next.purchasePriceUpdatedAt || prev.purchasePriceUpdatedAt || "",
      purchasePriceReceivedAt:
        next.purchasePriceReceivedAt || prev.purchasePriceReceivedAt || "",
    });
  }
  return [...nextById.values()];
}
