/** Уникальные id матрицы без отбрасывания по имени. */
export function uniqueMatrixProductIds(ids) {
  const seen = new Set();
  const unique = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const key = String(raw ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(raw);
  }
  return unique;
}

/** Снимок списка матрицы только растёт: снятая галочка не прячет строку до сохранения. */
export function growMatrixIdList(existing, incoming) {
  return uniqueMatrixProductIds([
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]).map((id) => String(id));
}

/** Галочка в списке матрицы — выбор для удаления, не членство. */
export function toggleMatrixProductId(ids, productId, checked) {
  const current = uniqueMatrixProductIds(ids);
  const key = String(productId ?? "").trim();
  if (!key) return current;
  if (checked) {
    if (current.some((id) => String(id) === key)) return current;
    return [...current, productId];
  }
  return current.filter((id) => String(id) !== key);
}

/** Убрать выбранные id из матрицы: только явные id, без схлопывания по имени. */
export function idsWithout(ids, removeIds) {
  const remove = new Set(
    (Array.isArray(removeIds) ? removeIds : []).map((id) => String(id ?? "").trim()).filter(Boolean)
  );
  return uniqueMatrixProductIds(ids).filter((id) => !remove.has(String(id)));
}

/**
 * Список матрицы показывает один товар на oneCId.
 * При удалении убираем и скрытые дубли с тем же oneCId — иначе позиция
 * «возвращается» со второго id и кажется, что удаление не сработало с первого раза.
 * По имени не схлопываем.
 */
export function expandMatrixRemovalByOneCId(
  selectedProducts,
  matrixProductIds,
  allProducts
) {
  const removeIds = new Set(
    (Array.isArray(selectedProducts) ? selectedProducts : []).map((product) =>
      String(product?.id ?? "").trim()
    ).filter(Boolean)
  );
  const removeOneC = new Set();
  for (const product of Array.isArray(selectedProducts) ? selectedProducts : []) {
    const oneCId = String(product?.oneCId || "").trim();
    if (oneCId) removeOneC.add(oneCId);
  }
  if (!removeOneC.size) return removeIds;

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
    if (oneCId && removeOneC.has(oneCId)) removeIds.add(id);
  }
  return removeIds;
}
